import { Router } from 'express';
import { supabase } from '../supabase.js';
import { toProgress, unwrap, type ModuleRow, type ProgressRow, type UserRow } from '../rows.js';
import type {
  GetStudentProgressResponse,
  ProgressStatus,
  UpsertProgressRequest,
  UpsertProgressResponse,
} from '../../../shared/types.js';

const STATUSES: ProgressStatus[] = ['not_started', 'in_progress', 'completed'];

// Mounted at /api (paths are /students/:id/progress and /progress).
export const progressRouter = Router();

/** Students may act on themselves; teachers on any student in their classroom. */
async function canActOnStudent(user: NonNullable<Express.Request['user']>, studentId: string): Promise<UserRow | null> {
  if (user.role === 'student' && user.userId !== studentId) return null;
  const student = unwrap(
    await supabase.from('users').select('*').eq('id', studentId).eq('role', 'student').maybeSingle(),
  ) as UserRow | null;
  return student && student.classroom_id === user.classroomId ? student : null;
}

progressRouter.get('/students/:id/progress', async (req, res) => {
  if (!(await canActOnStudent(req.user!, req.params.id))) {
    res.status(404).json({ error: 'Student not found' });
    return;
  }
  const rows = unwrap(await supabase.from('progress').select('*').eq('student_id', req.params.id)) as ProgressRow[];
  const body: GetStudentProgressResponse = rows.map(toProgress);
  res.json(body);
});

progressRouter.put('/progress', async (req, res) => {
  const { studentId, moduleId, status } = (req.body ?? {}) as Partial<UpsertProgressRequest>;
  if (typeof studentId !== 'string' || typeof moduleId !== 'string' || !STATUSES.includes(status as ProgressStatus)) {
    res.status(400).json({ error: `studentId, moduleId and status (${STATUSES.join('|')}) are required` });
    return;
  }
  if (!(await canActOnStudent(req.user!, studentId))) {
    res.status(404).json({ error: 'Student not found' });
    return;
  }
  const mod = unwrap(
    await supabase.from('modules').select('*').eq('id', moduleId).maybeSingle(),
  ) as ModuleRow | null;
  if (!mod || mod.classroom_id !== req.user!.classroomId) {
    res.status(404).json({ error: 'Module not found' });
    return;
  }

  // Atomic upsert on (student_id, module_id); the id is derived so it stays stable across updates.
  const row = unwrap(
    await supabase
      .from('progress')
      .upsert({ id: `${studentId}:${moduleId}`, student_id: studentId, module_id: moduleId, status }, {
        onConflict: 'student_id,module_id',
      })
      .select('*')
      .single(),
  ) as ProgressRow;
  const body: UpsertProgressResponse = toProgress(row);
  res.json(body);
});

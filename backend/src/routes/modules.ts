import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { requireRole } from '../auth.js';
import { supabase } from '../supabase.js';
import { toComment, toModule, unwrap, type CommentRow, type ModuleRow } from '../rows.js';
import type {
  CreateModuleRequest,
  GetModuleResponse,
  ListCommentsResponse,
  UpdateModuleRequest,
} from '../../../shared/types.js';

// Mounted behind requireMember. Modules are scoped to the caller's classroom.
export const modulesRouter = Router();

async function findModule(id: string, classroomId: string): Promise<ModuleRow | null> {
  const row = unwrap(await supabase.from('modules').select('*').eq('id', id).maybeSingle()) as ModuleRow | null;
  // Treat other classrooms' modules as nonexistent rather than leaking their existence.
  return row && row.classroom_id === classroomId ? row : null;
}

modulesRouter.get('/:id', async (req, res) => {
  const row = await findModule(req.params.id, req.user!.classroomId);
  if (!row) {
    res.status(404).json({ error: 'Module not found' });
    return;
  }
  const body: GetModuleResponse = toModule(row);
  res.json(body);
});

modulesRouter.post('/', requireRole('teacher'), async (req, res) => {
  const { title, content } = (req.body ?? {}) as Partial<CreateModuleRequest>;
  if (typeof title !== 'string' || !title.trim() || typeof content !== 'string') {
    res.status(400).json({ error: 'title and content are required' });
    return;
  }
  const row = unwrap(
    await supabase
      .from('modules')
      .insert({ id: randomUUID(), classroom_id: req.user!.classroomId, title: title.trim(), content })
      .select('*')
      .single(),
  ) as ModuleRow;
  res.status(201).json(toModule(row));
});

modulesRouter.patch('/:id', requireRole('teacher'), async (req, res) => {
  const id = String(req.params.id); // requireRole() erases route-param inference
  const existing = await findModule(id, req.user!.classroomId);
  if (!existing) {
    res.status(404).json({ error: 'Module not found' });
    return;
  }
  const { title, content } = (req.body ?? {}) as UpdateModuleRequest;
  if ((title !== undefined && (typeof title !== 'string' || !title.trim())) ||
      (content !== undefined && typeof content !== 'string')) {
    res.status(400).json({ error: 'title must be a non-empty string and content a string' });
    return;
  }
  const row = unwrap(
    await supabase
      .from('modules')
      .update({
        title: title !== undefined ? title.trim() : existing.title,
        content: content !== undefined ? content : existing.content,
      })
      .eq('id', id)
      .select('*')
      .single(),
  ) as ModuleRow;
  res.json(toModule(row));
});

modulesRouter.delete('/:id', requireRole('teacher'), async (req, res) => {
  const id = String(req.params.id); // requireRole() erases route-param inference
  if (!(await findModule(id, req.user!.classroomId))) {
    res.status(404).json({ error: 'Module not found' });
    return;
  }
  unwrap(await supabase.from('modules').delete().eq('id', id)); // progress/comments cascade
  res.status(204).end();
});

modulesRouter.get('/:id/comments', async (req, res) => {
  if (!(await findModule(req.params.id, req.user!.classroomId))) {
    res.status(404).json({ error: 'Module not found' });
    return;
  }
  // Teachers see every comment on the module; students only their own.
  let query = supabase.from('comments').select('*').eq('module_id', req.params.id);
  if (req.user!.role === 'student') query = query.eq('student_id', req.user!.userId);
  const rows = unwrap(await query.order('created_at')) as CommentRow[];
  const body: ListCommentsResponse = rows.map(toComment);
  res.json(body);
});

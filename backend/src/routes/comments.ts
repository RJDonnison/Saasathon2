import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { supabase } from '../supabase.js';
import { toComment, unwrap, type CommentRow, type ModuleRow, type UserRow } from '../rows.js';
import type { CreateCommentRequest, CreateCommentResponse } from '../../../shared/types.js';

export const commentsRouter = Router();

commentsRouter.post('/', async (req, res) => {
  const { studentId, moduleId, text } = (req.body ?? {}) as Partial<CreateCommentRequest>;
  if (typeof studentId !== 'string' || typeof moduleId !== 'string' || typeof text !== 'string' || !text.trim()) {
    res.status(400).json({ error: 'studentId, moduleId and non-empty text are required' });
    return;
  }

  const { userId, role, classroomId } = req.user!;
  // A student may only comment as themself; a teacher may comment on behalf of a student.
  if (role === 'student' && studentId !== userId) {
    res.status(403).json({ error: 'Students can only post comments as themselves' });
    return;
  }

  const [student, mod] = (await Promise.all([
    supabase.from('users').select('*').eq('id', studentId).eq('role', 'student').maybeSingle(),
    supabase.from('modules').select('*').eq('id', moduleId).maybeSingle(),
  ]).then((rs) => rs.map(unwrap))) as [UserRow | null, ModuleRow | null];
  if (!student || student.classroom_id !== classroomId || !mod || mod.classroom_id !== classroomId) {
    res.status(404).json({ error: 'Student or module not found in your classroom' });
    return;
  }

  const row = unwrap(
    await supabase
      .from('comments')
      .insert({ id: randomUUID(), student_id: studentId, module_id: moduleId, text: text.trim() })
      .select('*')
      .single(),
  ) as CommentRow;
  const body: CreateCommentResponse = toComment(row);
  res.status(201).json(body);
});

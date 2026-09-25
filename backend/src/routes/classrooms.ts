import { Router } from 'express';
import { supabase } from '../supabase.js';
import {
  toClassroom,
  toModule,
  toUser,
  unwrap,
  type ClassroomRow,
  type ModuleRow,
  type UserRow,
} from '../rows.js';
import type {
  GetClassroomResponse,
  GetClassroomStudentsResponse,
  ListModulesResponse,
} from '../../../shared/types.js';

// Mounted behind requireMember. A user can only see their own classroom.
export const classroomsRouter = Router();

classroomsRouter.use('/:id', (req, res, next) => {
  if (req.params.id !== req.user!.classroomId) {
    res.status(403).json({ error: 'Not a member of this classroom' });
    return;
  }
  next();
});

classroomsRouter.get('/:id', async (req, res) => {
  const row = unwrap(
    await supabase.from('classrooms').select('*').eq('id', req.params.id).maybeSingle(),
  ) as ClassroomRow | null;
  if (!row) {
    res.status(404).json({ error: 'Classroom not found' });
    return;
  }
  const body: GetClassroomResponse = toClassroom(row);
  res.json(body);
});

classroomsRouter.get('/:id/students', async (req, res) => {
  const rows = unwrap(
    await supabase.from('users').select('*').eq('classroom_id', req.params.id).eq('role', 'student').order('name'),
  ) as UserRow[];
  const body: GetClassroomStudentsResponse = rows.map(toUser);
  res.json(body);
});

classroomsRouter.get('/:id/modules', async (req, res) => {
  const rows = unwrap(
    await supabase
      .from('modules')
      .select('*')
      .eq('classroom_id', req.params.id)
      .order('created_at')
      .order('id'),
  ) as ModuleRow[];
  const body: ListModulesResponse = rows.map(toModule);
  res.json(body);
});

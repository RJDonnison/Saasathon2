import type { PostgrestError } from '@supabase/supabase-js';
import type { Classroom, Comment, Module, ProgressRecord, User } from '../../shared/types.js';

// Row shapes as stored in Supabase (snake_case) and mappers to the shared camelCase entities.

export interface ClassroomRow { id: string; name: string; room_code: string }
export interface UserRow { id: string; name: string; role: User['role']; classroom_id: string }
export interface ModuleRow { id: string; classroom_id: string; title: string; content: string }
export interface ProgressRow { id: string; student_id: string; module_id: string; status: ProgressRecord['status'] }
export interface CommentRow { id: string; student_id: string; module_id: string; text: string; created_at: string }

export const toClassroom = (r: ClassroomRow): Classroom => ({ id: r.id, name: r.name, roomCode: r.room_code });
export const toUser = (r: UserRow): User => ({ id: r.id, name: r.name, role: r.role, classroomId: r.classroom_id });
export const toModule = (r: ModuleRow): Module => ({
  id: r.id,
  classroomId: r.classroom_id,
  title: r.title,
  content: r.content,
});
export const toProgress = (r: ProgressRow): ProgressRecord => ({
  id: r.id,
  studentId: r.student_id,
  moduleId: r.module_id,
  status: r.status,
});
export const toComment = (r: CommentRow): Comment => ({
  id: r.id,
  studentId: r.student_id,
  moduleId: r.module_id,
  text: r.text,
  createdAt: new Date(r.created_at).toISOString(), // Postgres timestamptz -> ISO 8601 (Z)
});

/** Return `data`, or throw the Supabase error (Express 5 forwards it to the JSON error handler -> 500). */
export function unwrap<T>(res: { data: T; error: PostgrestError | null }): T {
  if (res.error) throw res.error;
  return res.data;
}

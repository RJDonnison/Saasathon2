import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { supabase } from '../supabase.js';
import { toUser, unwrap, type ClassroomRow, type UserRow } from '../rows.js';
import { requireAuth, signToken } from '../auth.js';
import type { JoinRequest, JoinResponse, MeResponse } from '../../../shared/types.js';

/** Escape LIKE wildcards so a name is matched literally by ilike (case-insensitive equality). */
const escapeLike = (s: string) => s.replace(/[\\%_]/g, '\\$&');

/** Public: POST /api/auth/join */
export const publicAuthRouter = Router();

publicAuthRouter.post('/join', async (req, res) => {
  const { roomCode, name, role } = (req.body ?? {}) as Partial<JoinRequest>;
  const cleanName = typeof name === 'string' ? name.trim() : '';
  const cleanCode = typeof roomCode === 'string' ? roomCode.trim().toUpperCase() : '';

  if (!cleanName || !cleanCode || (role !== 'student' && role !== 'teacher')) {
    res.status(400).json({ error: 'roomCode, name and role (student|teacher) are required' });
    return;
  }

  const classroom = unwrap(
    await supabase.from('classrooms').select('*').eq('room_code', cleanCode).maybeSingle(),
  ) as ClassroomRow | null;
  if (!classroom) {
    res.status(404).json({ error: 'Unknown room code' });
    return;
  }

  // Reuse an existing user with the same (classroom, name, role); otherwise create one.
  const findUser = async () =>
    unwrap(
      await supabase
        .from('users')
        .select('*')
        .eq('classroom_id', classroom.id)
        .eq('role', role)
        .ilike('name', escapeLike(cleanName))
        .maybeSingle(),
    ) as UserRow | null;

  let row = await findUser();
  if (!row) {
    const created = await supabase
      .from('users')
      .insert({ id: randomUUID(), name: cleanName, role, classroom_id: classroom.id })
      .select('*')
      .single();
    if (created.error?.code === '23505') {
      // Lost a race with a concurrent join of the same name: use the row that won.
      row = await findUser();
    } else {
      row = unwrap(created) as UserRow;
    }
  }
  if (!row) throw new Error('Could not create or find user');

  const user = toUser(row);
  const body: JoinResponse = {
    token: signToken({ userId: user.id, role: user.role, classroomId: user.classroomId }),
    user,
  };
  res.json(body);
});

/** Protected: GET /api/auth/me */
export const meRouter = Router();

meRouter.get('/me', requireAuth, async (req, res) => {
  const row = unwrap(
    await supabase.from('users').select('*').eq('id', req.user!.userId).maybeSingle(),
  ) as UserRow | null;
  if (!row) {
    res.status(401).json({ error: 'User no longer exists' });
    return;
  }
  const body: MeResponse = { user: toUser(row) };
  res.json(body);
});

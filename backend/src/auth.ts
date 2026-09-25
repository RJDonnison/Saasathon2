import jwt from 'jsonwebtoken';
import type { NextFunction, Request, Response } from 'express';
import { JWT_SECRET } from './config.js';
import type { Role } from '../../shared/types.js';

/** Claims carried in the JWT: { userId, role, classroomId } */
export interface AuthUser {
  userId: string;
  role: Role;
  classroomId: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function signToken(user: AuthUser): string {
  const claims: AuthUser = { userId: user.userId, role: user.role, classroomId: user.classroomId };
  return jwt.sign(claims, JWT_SECRET, { expiresIn: '7d' });
}

export function verifyToken(token: string): AuthUser | null {
  try {
    const p = jwt.verify(token, JWT_SECRET) as Partial<AuthUser>;
    if (!p.userId || !p.classroomId || (p.role !== 'student' && p.role !== 'teacher')) return null;
    return { userId: p.userId, role: p.role, classroomId: p.classroomId };
  } catch {
    return null;
  }
}

/** Reads `Authorization: Bearer <token>` and attaches req.user, or responds 401. */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization ?? '';
  const [scheme, token] = header.split(' ');
  const user = scheme === 'Bearer' && token ? verifyToken(token) : null;
  if (!user) {
    res.status(401).json({ error: 'Missing or invalid token' });
    return;
  }
  req.user = user;
  next();
}

export function requireRole(role: Role) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.user?.role !== role) {
      res.status(403).json({ error: `Requires ${role} role` });
      return;
    }
    next();
  };
}

import { randomBytes, timingSafeEqual } from 'crypto';
import type { Request, Response, NextFunction } from 'express';

const COOKIE_NAME = 'mos_local_operator';
const localToken = randomBytes(32).toString('base64url');

function isLoopback(address?: string): boolean {
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}

export function establishLocalOperatorSession(req: Request, res: Response): void {
  if (!isLoopback(req.socket.remoteAddress)) {
    res.status(403).json({ error: 'Local operator session is only available on this device' });
    return;
  }
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${localToken}; HttpOnly; SameSite=Strict; Path=/api/business-sources`);
  res.json({ authenticated: true, mode: 'LOCAL_OPERATOR' });
}

export function requireLocalOperatorSession(req: Request, res: Response, next: NextFunction): void {
  if (!isLoopback(req.socket.remoteAddress)) {
    res.status(403).json({ error: 'Business sources require an authenticated operator session' });
    return;
  }
  const cookie = (req.headers.cookie ?? '').split(';').map(v => v.trim()).find(v => v.startsWith(`${COOKIE_NAME}=`));
  const supplied = cookie?.slice(COOKIE_NAME.length + 1) ?? '';
  const actual = Buffer.from(localToken);
  const candidate = Buffer.from(supplied);
  if (candidate.length !== actual.length || !timingSafeEqual(candidate, actual)) {
    res.status(401).json({ error: 'Operator session required' });
    return;
  }
  next();
}

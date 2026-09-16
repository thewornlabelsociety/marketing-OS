import { randomBytes, timingSafeEqual } from 'crypto';
import type { Request, Response, NextFunction } from 'express';

const COOKIE_NAME = 'mos_local_operator';
const localToken = randomBytes(32).toString('base64url');

// On Replit all traffic is proxied so req.socket.remoteAddress is never
// 127.0.0.1 — detect Replit via its env vars and skip the loopback guard.
const ON_REPLIT = Boolean(process.env.REPL_SLUG || process.env.REPL_HOME);

function isLoopback(address?: string): boolean {
  if (ON_REPLIT) return true;
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}

// Cookie needs Secure on HTTPS (Replit deployed URLs are always HTTPS).
const COOKIE_FLAGS = ON_REPLIT
  ? `HttpOnly; SameSite=Strict; Secure; Path=/api/business-sources`
  : `HttpOnly; SameSite=Strict; Path=/api/business-sources`;

export function establishLocalOperatorSession(req: Request, res: Response): void {
  if (!isLoopback(req.socket.remoteAddress)) {
    res.status(403).json({ error: 'Local operator session is only available on this device' });
    return;
  }
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${localToken}; ${COOKIE_FLAGS}`);
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

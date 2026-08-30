import type { Request } from 'express';

export function queryEntityId(req: Request): string | undefined {
  const q = req.query as Record<string, string | string[] | undefined>;
  const raw = q.entityId ?? q.entity_id;
  return Array.isArray(raw) ? raw[0] : raw;
}

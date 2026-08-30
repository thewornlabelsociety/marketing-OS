import { Router } from 'express';
import { LOCAL_TENANT_ID } from '../config/constants';
import { db } from '../db/database';
import { queryEntityId } from '../utils/params';

export const sopsRouter = Router();

sopsRouter.get('/', (req, res) => {
  const entity_id = queryEntityId(req);
  const rows = entity_id
    ? (db
        .prepare('SELECT * FROM sops WHERE entity_id = ? AND is_archived = 0')
        .all(entity_id) as Array<Record<string, unknown>>)
    : (db
        .prepare('SELECT * FROM sops WHERE is_archived = 0')
        .all() as Array<Record<string, unknown>>);

  res.json(rows.map((r) => ({ ...r, steps: JSON.parse(String(r.steps || '[]')) })));
});

sopsRouter.post('/', (req, res) => {
  const body = req.body as Record<string, unknown>;
  const {
    id = `sop_${Date.now()}`,
    tenant_id = LOCAL_TENANT_ID,
    entity_id,
    title,
    category,
    description,
    recurrence,
    steps,
  } = body;

  db.prepare(`
    INSERT INTO sops (id, tenant_id, entity_id, title, category, description, recurrence, steps)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      description = excluded.description,
      steps = excluded.steps
  `).run(id, tenant_id, entity_id, title, category, description, recurrence, JSON.stringify(steps));

  res.json({ success: true, id });
});

import { Router } from 'express';
import { LOCAL_TENANT_ID } from '../config/constants';
import { db } from '../db/database';
import { queryEntityId } from '../utils/params';

// GET /api/intake — native Marketing OS intake queue endpoint.
// Returns pending intake items, optionally filtered by entity_id.
export const intakeRouter = Router();

intakeRouter.get('/', (req, res) => {
  const entity_id = queryEntityId(req);
  let query = 'SELECT * FROM intake_queue WHERE status = ?';
  const params: unknown[] = ['pending'];

  if (entity_id) {
    query += ' AND entity_id = ?';
    params.push(entity_id);
  }

  query += ' ORDER BY created_at DESC';
  const rows = db.prepare(query).all(...params) as Array<Record<string, unknown>>;
  res.json(rows.map((r) => ({ ...r, photos: JSON.parse(String(r.photos || '[]')) })));
});

// POST /api/bridge/intake — external application/inventory integration endpoint.
// Accepts intake records from external admin tools or inventory systems.
// Integrations must be brand-agnostic: entity_id identifies the target workspace
// and must reference a user-created entity. No brand-specific assumptions belong here.
export const bridgeIntakeRouter = Router();

bridgeIntakeRouter.post('/', (req, res) => {
  const body = req.body as Record<string, unknown>;
  const id = (body.id ?? `intake_${Date.now()}`) as string;
  const entity_id = body.entity_id as string;
  const brand = body.brand as string | undefined;
  const title = body.title as string | undefined;
  const fabric = body.fabric as string | undefined;
  const price = body.price as number | undefined;
  const photos = (body.photos ?? []) as unknown[];

  db.prepare(`
    INSERT INTO intake_queue (id, tenant_id, entity_id, brand, title, fabric, price, photos, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
  `).run(id, LOCAL_TENANT_ID, entity_id, brand, title, fabric, price, JSON.stringify(photos));

  res.json({ success: true, intakeId: id });
});

import { Router } from 'express';
import { LOCAL_TENANT_ID } from '../config/constants';
import { db } from '../db/database';
import type { EntityRow } from '../types';
import { deepMerge, mapEntityRow } from '../utils/mappers';

export const entitiesRouter = Router();

entitiesRouter.get('/', (_req, res) => {
  const rows = db
    .prepare('SELECT * FROM entities WHERE is_archived = 0 ORDER BY name ASC')
    .all() as EntityRow[];
  res.json(rows.map(mapEntityRow));
});

entitiesRouter.post('/', (req, res) => {
  const {
    id,
    tenant_id = LOCAL_TENANT_ID,
    name,
    slug,
    brand_kit,
    api_keys = {},
  } = req.body as Record<string, unknown>;

  db.prepare(`
    INSERT INTO entities (id, tenant_id, name, slug, brand_kit, api_keys, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      slug = excluded.slug,
      brand_kit = excluded.brand_kit,
      api_keys = excluded.api_keys,
      updated_at = CURRENT_TIMESTAMP
  `).run(
    id,
    tenant_id,
    name,
    slug,
    JSON.stringify(brand_kit),
    JSON.stringify(api_keys)
  );

  res.json({ success: true, id });
});

entitiesRouter.patch('/:id/brand-kit', (req, res) => {
  const { id } = req.params;
  const patch = (req.body.brand_kit ?? req.body.brandKit ?? req.body) as Record<string, unknown>;

  const row = db
    .prepare('SELECT brand_kit FROM entities WHERE id = ?')
    .get(id) as { brand_kit: string } | undefined;

  if (!row) {
    res.status(404).json({ error: 'Entity not found' });
    return;
  }

  const current = JSON.parse(row.brand_kit || '{}') as Record<string, unknown>;
  const merged = deepMerge(current, patch);

  db.prepare(
    'UPDATE entities SET brand_kit = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
  ).run(JSON.stringify(merged), id);

  const updated = db
    .prepare('SELECT * FROM entities WHERE id = ?')
    .get(id) as EntityRow;
  res.json(mapEntityRow(updated));
});

entitiesRouter.delete('/:id', (req, res) => {
  const { id } = req.params;
  db.prepare('DELETE FROM entities WHERE id = ?').run(id);
  res.json({ success: true, deletedId: id });
});

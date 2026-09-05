import { Router } from 'express';
import { LOCAL_TENANT_ID } from '../config/constants';
import { sanitizeCoreDbError } from '../config/coreDbConfig';
import { getCoreRepositories } from '../db/core/createCoreRepositories';
import { deepMerge, mapEntityRow } from '../utils/mappers';

export const entitiesRouter = Router();

entitiesRouter.get('/', async (_req, res) => {
  try {
    const rows = await getCoreRepositories().workspace.listActive();
    res.json(rows.map(mapEntityRow));
  } catch (err) {
    res.status(503).json({ error: sanitizeCoreDbError(err) });
  }
});

entitiesRouter.post('/', async (req, res) => {
  try {
    const {
      id,
      tenant_id = LOCAL_TENANT_ID,
      name,
      slug,
      brand_kit,
      api_keys = {},
    } = req.body as Record<string, unknown>;

    await getCoreRepositories().workspace.upsert({
      id: id as string,
      tenantId: tenant_id as string,
      name,
      slug,
      brandKit: brand_kit,
      apiKeys: api_keys,
    });

    res.json({ success: true, id });
  } catch (err) {
    res.status(503).json({ error: sanitizeCoreDbError(err) });
  }
});

entitiesRouter.patch('/:id/brand-kit', async (req, res) => {
  try {
    const { id } = req.params;
    const patch = (req.body.brand_kit ?? req.body.brandKit ?? req.body) as Record<string, unknown>;

    const brandKitRaw = await getCoreRepositories().workspace.findBrandKit(id);
    if (brandKitRaw === null) {
      res.status(404).json({ error: 'Entity not found' });
      return;
    }

    const current = JSON.parse(brandKitRaw || '{}') as Record<string, unknown>;
    const merged = deepMerge(current, patch);

    const updated = await getCoreRepositories().workspace.patchBrandKit(id, JSON.stringify(merged));
    if (!updated) {
      res.status(404).json({ error: 'Entity not found' });
      return;
    }
    res.json(mapEntityRow(updated));
  } catch (err) {
    res.status(503).json({ error: sanitizeCoreDbError(err) });
  }
});

entitiesRouter.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await getCoreRepositories().workspace.deleteById(id);
    res.json({ success: true, deletedId: id });
  } catch (err) {
    res.status(503).json({ error: sanitizeCoreDbError(err) });
  }
});

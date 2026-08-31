import { Router, Request, Response } from 'express';
import { MediaDimensionAdapter } from '../services/MediaDimensionAdapter';
import { mediaDeliveryService } from '../services/media/MediaDeliveryService';
import { mediaAssetService } from '../services/media/MediaAssetService';
import { db } from '../db/database';

export const mediaRouter = Router();

mediaRouter.get('/hosted/:token', (req, res) => {
  const resolved = mediaDeliveryService.resolveHostedFile(req.params.token);
  if (!resolved) {
    res.status(404).json({ error: 'Hosted asset not found or expired' });
    return;
  }
  res.setHeader('Content-Type', resolved.mimeType);
  res.setHeader('Content-Disposition', 'inline');
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.sendFile(resolved.absolutePath);
});

mediaRouter.post('/assets', (req: Request, res: Response) => {
  const body = req.body as {
    workspaceId?: string;
    fileBase64?: string;
    mimeType?: string;
    filename?: string;
    campaignId?: string;
    contentKey?: string;
    creativeArtifactId?: string;
    creativeVersion?: number;
  };
  const workspaceId = body.workspaceId;
  if (!workspaceId) {
    res.status(400).json({ error: 'workspaceId is required' });
    return;
  }
  const workspace = db.prepare('SELECT id FROM entities WHERE id = ?').get(workspaceId);
  if (!workspace) {
    res.status(404).json({ error: 'Workspace not found' });
    return;
  }
  if (!body.fileBase64) {
    res.status(400).json({ error: 'fileBase64 is required' });
    return;
  }
  try {
    const buffer = Buffer.from(body.fileBase64.replace(/^data:[^;]+;base64,/, ''), 'base64');
    const record = mediaAssetService.registerFromBuffer({
      workspaceId,
      buffer,
      mimeType: body.mimeType,
      originalFilename: body.filename,
      campaignId: body.campaignId,
      contentKey: body.contentKey,
      creativeArtifactId: body.creativeArtifactId,
      creativeVersion: body.creativeVersion,
    });
    res.status(201).json({
      asset: mediaAssetService.toPublishableAsset(record),
      checksum: record.checksum,
      creativeArtifactId: record.creativeArtifactId,
      creativeVersion: record.creativeVersion,
    });
  } catch (err) {
    res.status(422).json({ error: err instanceof Error ? err.message : 'Upload failed' });
  }
});

mediaRouter.get('/assets/:assetId', (req: Request, res: Response) => {
  const workspaceId = typeof req.query.workspaceId === 'string' ? req.query.workspaceId : undefined;
  if (!workspaceId) {
    res.status(400).json({ error: 'workspaceId is required' });
    return;
  }
  const record = mediaAssetService.getById(req.params.assetId, workspaceId);
  if (!record) {
    res.status(404).json({ error: 'Asset not found' });
    return;
  }
  res.json({ asset: mediaAssetService.toPublishableAsset(record), checksum: record.checksum, status: record.status });
});

mediaRouter.get('/preview-url', (req: Request, res: Response) => {
  const assetId = typeof req.query.assetId === 'string' ? req.query.assetId : undefined;
  const workspaceId = typeof req.query.workspaceId === 'string' ? req.query.workspaceId : undefined;
  if (!assetId || !workspaceId) {
    res.status(400).json({ error: 'assetId and workspaceId are required' });
    return;
  }
  const record = mediaAssetService.getById(assetId, workspaceId);
  if (!record) {
    res.status(404).json({ error: 'Asset not found' });
    return;
  }
  const token = mediaDeliveryService.createHostedToken(record.id, workspaceId);
  const baseUrl = process.env.MEDIA_PUBLIC_BASE_URL ?? `http://localhost:${process.env.PORT ?? 4100}`;
  res.json({ url: `${baseUrl}/api/media/hosted/${token}` });
});

mediaRouter.get('/assets', (req: Request, res: Response) => {
  const workspaceId = typeof req.query.workspaceId === 'string' ? req.query.workspaceId : undefined;
  const creativeArtifactId = typeof req.query.creativeArtifactId === 'string' ? req.query.creativeArtifactId : undefined;
  if (!workspaceId) {
    res.status(400).json({ error: 'workspaceId is required' });
    return;
  }
  interface AssetListRow {
    id: string; workspace_id: string; campaign_id: string | null; content_key: string | null;
    creative_artifact_id: string | null; creative_version: number | null;
    storage_key: string; mime_type: string; file_size: number; width: number | null; height: number | null;
    checksum: string; original_filename: string | null; status: string; created_at: string; updated_at: string;
  }
  let rows: AssetListRow[];
  if (creativeArtifactId) {
    rows = db.prepare(
      'SELECT * FROM media_assets WHERE workspace_id = ? AND creative_artifact_id = ? AND status = ? ORDER BY created_at DESC'
    ).all(workspaceId, creativeArtifactId, 'ACTIVE') as AssetListRow[];
  } else {
    rows = db.prepare(
      'SELECT * FROM media_assets WHERE workspace_id = ? AND status = ? ORDER BY created_at DESC LIMIT 50'
    ).all(workspaceId, 'ACTIVE') as AssetListRow[];
  }
  const assets = rows.map(r => ({
    id: r.id,
    workspaceId: r.workspace_id,
    campaignId: r.campaign_id ?? undefined,
    contentKey: r.content_key ?? undefined,
    creativeArtifactId: r.creative_artifact_id ?? undefined,
    creativeVersion: r.creative_version ?? undefined,
    storageKey: r.storage_key,
    mimeType: r.mime_type,
    fileSize: r.file_size,
    width: r.width ?? undefined,
    height: r.height ?? undefined,
    checksum: r.checksum,
    originalFilename: r.original_filename ?? undefined,
    status: r.status,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
  res.json({ assets });
});

// Image → multi-ratio renditions (4:5, 1:1, 9:16, 16:9)
mediaRouter.post('/adapt-dimensions', async (req, res) => {
  try {
    const { imageBase64, backgroundColorHex = '#F8FAFC' } = req.body as {
      imageBase64: string;
      backgroundColorHex?: string;
    };
    const buffer = Buffer.from(
      imageBase64.replace(/^data:image\/\w+;base64,/, ''),
      'base64',
    );
    const renditions = await MediaDimensionAdapter.adaptImage(buffer, backgroundColorHex);
    res.json({ success: true, renditions });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
});

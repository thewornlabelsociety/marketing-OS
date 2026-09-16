import { createHash, randomUUID } from 'crypto';
import { db } from '../../db/database';
import { aiOrchestrator } from '../intelligence/AIOrchestrator';
import { aiEnv } from '../../config/aiEnvironment';
import { CREATIVE_DESTINATIONS } from '../../types/studioDestinations';
import type { MarketingScope } from '../../types/marketing';
import { getCoreRepositories } from '../../db/core/createCoreRepositories';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RepurposeDestinationInput {
  label: string; // must match a CREATIVE_DESTINATIONS entry
}

export interface RepurposeParams {
  workspaceId: string;
  sourceArtifactId: string;
  destinations: string[]; // labels from CREATIVE_DESTINATIONS
  idempotencyKey: string;
}

type DestinationResult =
  | { destination: string; status: 'SUCCEEDED';         artifactId: string; contentKey: string }
  | { destination: string; status: 'ALREADY_COMPLETED'; artifactId: string; contentKey: string }
  | { destination: string; status: 'AI_FAILED';          error: string }
  | { destination: string; status: 'VALIDATION_FAILED';  error: string }
  | { destination: string; status: 'PERSISTENCE_FAILED'; error: string };

export interface RepurposeResult {
  requestId: string;
  sourceArtifactId: string;
  status: 'COMPLETED' | 'PARTIAL' | 'FAILED' | 'IN_PROGRESS';
  results: DestinationResult[];
}

interface RepurposeRequestRow {
  id: string;
  workspace_id: string;
  source_artifact_id: string;
  idempotency_key: string;
  request_hash: string;
  status: string;
  created_at: string;
  updated_at: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildRequestHash(sourceArtifactId: string, destinations: string[]): string {
  const sorted = [...destinations].sort();
  return createHash('sha256').update(JSON.stringify({ sourceArtifactId, destinations: sorted })).digest('hex');
}

function contentKeyAbbrev(channel: string, contentType: string): string {
  const map: Record<string, string> = {
    'INSTAGRAM/STATIC_POST':    'ig-post',
    'INSTAGRAM/CAROUSEL':       'ig-car',
    'INSTAGRAM/STORY':          'ig-str',
    'FACEBOOK/STATIC_POST':     'fb-post',
    'FACEBOOK/CAROUSEL':        'fb-car',
    'EMAIL/EMAIL':              'em-email',
    'TIKTOK/TALKING_POINTS':    'tk-reel',
  };
  return map[`${channel}/${contentType}`] ?? `${channel.toLowerCase()}-${contentType.toLowerCase()}`;
}

// Accepts pre-fetched recommendationId and artifact's marketing scope
function resolveScopes(
  recommendationId: string | null | undefined,
  artifactMarketingScope: string | null | undefined,
): MarketingScope[] {
  if (recommendationId) {
    const rec = db.prepare('SELECT marketing_scopes_json FROM marketing_recommendations WHERE id = ?').get(recommendationId) as { marketing_scopes_json: string } | undefined;
    if (rec?.marketing_scopes_json) {
      try {
        const parsed = JSON.parse(rec.marketing_scopes_json) as string[];
        if (parsed.length > 0) return parsed as MarketingScope[];
      } catch { /* ignore */ }
    }
  }
  if (artifactMarketingScope) return [artifactMarketingScope as MarketingScope];
  return [];
}

// ─── Bounded source summary ───────────────────────────────────────────────────

interface BoundedSummary {
  sourceLabel: string;
  campaignName: string;
  hook: string | null;
  caption: string | null;
  headline: string | null;
  contentElements: string[];
  cta: string | null;
}

// Accepts pre-fetched campaignName and content as string
function buildBoundedSummary(
  channel: string,
  contentType: string,
  contentJson: string,
  campaignName: string,
): BoundedSummary {
  const channelLabel: Record<string, string> = {
    INSTAGRAM: 'Instagram', FACEBOOK: 'Facebook', EMAIL: 'Email', TIKTOK: 'TikTok',
  };
  const typeLabel: Record<string, string> = {
    STATIC_POST: 'Post', CAROUSEL: 'Carousel', STORY: 'Story', EMAIL: 'Email', TALKING_POINTS: 'Concept',
  };
  const sourceLabel = `${channelLabel[channel] ?? channel} ${typeLabel[contentType] ?? contentType}`;

  let parsed: Record<string, unknown>;
  try { parsed = JSON.parse(contentJson) as Record<string, unknown>; }
  catch { return { sourceLabel, campaignName, hook: null, caption: null, headline: null, contentElements: [], cta: null }; }

  const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

  switch (parsed.kind) {
    case 'STATIC_POST':
      return {
        sourceLabel, campaignName,
        hook: str(parsed.hook),
        caption: str(parsed.caption),
        headline: null,
        contentElements: [],
        cta: str(parsed.cta),
      };
    case 'CAROUSEL': {
      const slides = Array.isArray(parsed.slides) ? parsed.slides as Record<string, unknown>[] : [];
      return {
        sourceLabel, campaignName,
        hook: null,
        caption: str(parsed.caption),
        headline: null,
        contentElements: slides.map(s => [str(s.headline), str(s.body)].filter(Boolean).join(' — ')).filter(Boolean) as string[],
        cta: str(parsed.cta),
      };
    }
    case 'STORY': {
      const frames = Array.isArray(parsed.frames) ? parsed.frames as Record<string, unknown>[] : [];
      return {
        sourceLabel, campaignName,
        hook: str(frames[0]?.headline as unknown) ?? null,
        caption: null,
        headline: null,
        contentElements: frames.map(f => [str(f.headline), str(f.body)].filter(Boolean).join(' ')).filter(Boolean) as string[],
        cta: null,
      };
    }
    case 'EMAIL':
      return {
        sourceLabel, campaignName,
        hook: str(parsed.preheader),
        caption: typeof parsed.body === 'string' ? (parsed.body as string).slice(0, 300) : null,
        headline: str(parsed.headline),
        contentElements: [],
        cta: (parsed.cta && typeof parsed.cta === 'object') ? str((parsed.cta as Record<string, unknown>).label) : null,
      };
    default:
      return { sourceLabel, campaignName, hook: null, caption: null, headline: null, contentElements: [], cta: null };
  }
}

// ─── Per-destination prompt builders ─────────────────────────────────────────

const REPURPOSE_SYSTEM = `You are a content adaptation specialist for a marketing team. Your job is to adapt existing marketing content for a new channel and format, preserving the core message and brand voice while optimising for the target format's conventions and audience expectations. Return ONLY valid JSON matching the schema provided.`;

function buildRepurposePrompt(summary: BoundedSummary, channel: string, contentType: string): string {
  const srcLines = [
    `Original content type: ${summary.sourceLabel}`,
    `Campaign: ${summary.campaignName}`,
    summary.hook ? `Hook / opening: ${summary.hook}` : null,
    summary.headline ? `Headline: ${summary.headline}` : null,
    summary.caption ? `Main copy: ${summary.caption}` : null,
    summary.contentElements.length ? `Content elements:\n${summary.contentElements.map(e => `  • ${e}`).join('\n')}` : null,
    summary.cta ? `Call to action: ${summary.cta}` : null,
  ].filter(Boolean).join('\n');

  const schemas: Record<string, string> = {
    'INSTAGRAM/STATIC_POST': `{ "kind": "STATIC_POST", "caption": "string (Instagram caption, authentic tone, 2-4 sentences with hashtags)", "hook": "string (first line that stops the scroll)", "cta": "string (specific CTA)" }`,
    'INSTAGRAM/CAROUSEL':    `{ "kind": "CAROUSEL", "caption": "string (opening Instagram caption with hashtags)", "slides": [{ "slideNumber": 1, "headline": "string (max 6 words)", "body": "string (1-2 sentences)" }], "cta": "string" }`,
    'INSTAGRAM/STORY':       `{ "kind": "STORY", "frames": [{ "frameNumber": 1, "headline": "string (punchy, max 5 words)", "body": "string (optional, 1 sentence)", "cta": "string (optional)" }] }`,
    'FACEBOOK/STATIC_POST':  `{ "kind": "STATIC_POST", "caption": "string (Facebook caption, slightly more conversational, 2-4 sentences, can include a question)", "hook": "string (engaging opening line)", "cta": "string" }`,
    'EMAIL/EMAIL':           `{ "kind": "EMAIL", "subject": "string (compelling subject line)", "preheader": "string (40-60 chars)", "headline": "string", "body": "string (2-3 paragraphs)", "cta": { "label": "string", "destinationDescription": "string" } }`,
    'TIKTOK/TALKING_POINTS': `{ "kind": "TALKING_POINTS", "hook": "string (first 3 seconds — must stop the scroll)", "points": ["string", "string", "string"], "closingCta": "string", "visualNotes": "string (optional direction for visuals/b-roll)" }`,
  };

  const instructions: Record<string, string> = {
    'INSTAGRAM/STATIC_POST': 'Write authentic Instagram copy. Single image, native feel, hashtags at the end.',
    'INSTAGRAM/CAROUSEL':    'Write copy for a swipeable carousel. Create 3-5 slides covering the key points. Each slide headline should work on its own.',
    'INSTAGRAM/STORY':       'Write copy for vertical story frames. Create 3-4 frames. Keep each frame minimal — the image does most of the work.',
    'FACEBOOK/STATIC_POST':  'Adapt for Facebook. Slightly longer copy is fine. A conversational question can boost engagement. Less hashtag-heavy than Instagram.',
    'EMAIL/EMAIL':           'Write a full email. Subject line is critical — make it compelling. Body should tell a story. CTA should be clear.',
    'TIKTOK/TALKING_POINTS': 'Write talking points for a TikTok-style short video. The hook must be attention-grabbing in the first 3 seconds. 3-5 concise talking points. No script — just the key beats the creator will say naturally.',
  };

  const key = `${channel}/${contentType}`;
  const schema = schemas[key] ?? `{ "kind": "${contentType}" }`;
  const instruction = instructions[key] ?? `Adapt the content for ${channel} ${contentType} format.`;

  return [
    '=== SOURCE CONTENT ===',
    srcLines,
    '',
    `=== ADAPT FOR: ${channel} — ${contentType} ===`,
    instruction,
    '',
    '=== REQUIRED JSON SCHEMA ===',
    schema,
    '',
    'Return only the JSON object. No markdown, no explanation.',
  ].join('\n');
}

function validateContent(parsed: unknown, contentType: string): string | null {
  if (!parsed || typeof parsed !== 'object') return 'AI response is not a valid object';
  const c = parsed as Record<string, unknown>;
  switch (contentType) {
    case 'STATIC_POST':    return c.caption ? null : 'Missing required field: caption';
    case 'CAROUSEL':       return (c.caption && Array.isArray(c.slides) && (c.slides as unknown[]).length > 0) ? null : 'Missing caption or slides';
    case 'STORY':          return (Array.isArray(c.frames) && (c.frames as unknown[]).length > 0) ? null : 'Missing frames';
    case 'EMAIL':          return (c.subject && c.body) ? null : 'Missing subject or body';
    case 'TALKING_POINTS': return (c.hook && Array.isArray(c.points)) ? null : 'Missing hook or points';
    default:               return null;
  }
}

// ─── RepurposeService ─────────────────────────────────────────────────────────

class RepurposeService {
  async repurpose(params: RepurposeParams): Promise<RepurposeResult | { error: string; code: string }> {
    const { workspaceId, sourceArtifactId, destinations, idempotencyKey } = params;

    if (!workspaceId) return { error: 'workspaceId is required', code: 'BAD_REQUEST' };
    if (!sourceArtifactId) return { error: 'sourceArtifactId is required', code: 'BAD_REQUEST' };
    if (!destinations?.length) return { error: 'At least one destination is required', code: 'BAD_REQUEST' };
    if (!idempotencyKey) return { error: 'idempotencyKey is required', code: 'BAD_REQUEST' };

    // Validate destinations
    const resolvedDests = destinations.map(label => {
      const d = CREATIVE_DESTINATIONS.find(x => x.label === label);
      return d ?? null;
    });
    const invalidLabels = destinations.filter((_, i) => !resolvedDests[i]);
    if (invalidLabels.length) return { error: `Unknown destination labels: ${invalidLabels.join(', ')}`, code: 'BAD_REQUEST' };

    const repos = getCoreRepositories();

    // Fetch source artifact via repository
    const sourceArtifact = await repos.creative.artifact.findByIdForWorkspace(sourceArtifactId, workspaceId);
    if (!sourceArtifact) return { error: 'Source artifact not found', code: 'NOT_FOUND' };

    // Fetch campaign for recommendation_id and name
    const campaign = await repos.campaign.findById(sourceArtifact.campaignId);
    const campaignName = campaign?.name ?? 'Unknown Campaign';
    const recommendationId = campaign?.recommendation_id ?? null;

    const requestHash = buildRequestHash(sourceArtifactId, destinations);
    const now = new Date().toISOString();
    const requestId = `rpr_${randomUUID()}`;

    // Atomic reservation — claim before any AI work (repurpose_requests is non-core)
    const insertStmt = db.prepare(`
      INSERT OR IGNORE INTO repurpose_requests
        (id, workspace_id, source_artifact_id, idempotency_key, request_hash, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'IN_PROGRESS', ?, ?)
    `);
    const insertInfo = insertStmt.run(requestId, workspaceId, sourceArtifactId, idempotencyKey, requestHash, now, now);

    if (insertInfo.changes === 0) {
      // Row already exists — read state
      const existing = db.prepare(
        'SELECT * FROM repurpose_requests WHERE workspace_id = ? AND source_artifact_id = ? AND idempotency_key = ?'
      ).get(workspaceId, sourceArtifactId, idempotencyKey) as RepurposeRequestRow | undefined;

      if (!existing) return { error: 'Concurrent reservation conflict', code: 'CONFLICT' };

      // Hash mismatch = different request under same key
      if (existing.request_hash !== requestHash) {
        return { error: 'Idempotency key already used with a different request', code: 'CONFLICT' };
      }

      if (existing.status === 'IN_PROGRESS') {
        return { requestId: existing.id, sourceArtifactId, status: 'IN_PROGRESS', results: [] };
      }

      // COMPLETED or PARTIAL — return existing children via repository
      const childRows = await repos.creative.artifact.findByRepurposeRequestId(existing.id);
      const childMap = new Map<string, { artifactId: string; contentKey: string }>();
      for (const row of childRows) {
        const dest = CREATIVE_DESTINATIONS.find(d => d.channel === row.channel && d.contentType === row.contentType);
        if (dest) childMap.set(dest.label, { artifactId: row.id, contentKey: row.contentKey });
      }
      const results: DestinationResult[] = destinations.map(label => {
        const child = childMap.get(label);
        if (child) return { destination: label, status: 'ALREADY_COMPLETED', artifactId: child.artifactId, contentKey: child.contentKey };
        return { destination: label, status: 'AI_FAILED', error: 'Destination failed in original request' };
      });
      return { requestId: existing.id, sourceArtifactId, status: existing.status as RepurposeResult['status'], results };
    }

    // We are the claimant — proceed with generation
    const scopes = resolveScopes(recommendationId, sourceArtifact.marketingScope);
    const contentJson = JSON.stringify(sourceArtifact.content);
    const summary = buildBoundedSummary(sourceArtifact.channel, sourceArtifact.contentType, contentJson, campaignName);
    const results: DestinationResult[] = [];

    for (const dest of resolvedDests) {
      if (!dest) continue;
      const abbrev = contentKeyAbbrev(dest.channel, dest.contentType);
      const contentKey = `rp-${abbrev}-${idempotencyKey.slice(0, 8)}`;
      const childId = `cart_${randomUUID()}`;
      const deliverableId = `del_${randomUUID()}`;

      let rawContent: string;
      try {
        const aiResult = await aiOrchestrator.generate({
          workspaceId,
          taskType: 'CONTENT_REPURPOSE',
          marketingScopes: scopes.length ? scopes : undefined,
          knowledgeDomains: ['BRAND_CORE', 'VOICE'],
          systemPrompt: REPURPOSE_SYSTEM,
          userPrompt: buildRepurposePrompt(summary, dest.channel, dest.contentType),
          campaignId: sourceArtifact.campaignId,
          // artifactId omitted — child artifact is not yet persisted when this call is made;
          // passing childId here would cause a FK violation in the usage ledger.
        });
        rawContent = aiResult.content;
      } catch (err) {
        results.push({ destination: dest.label, status: 'AI_FAILED', error: (err as Error).message });
        continue;
      }

      // Parse AI response
      let parsed: unknown;
      try {
        const match = rawContent.match(/\{[\s\S]*\}/);
        parsed = JSON.parse(match ? match[0] : rawContent);
      } catch {
        results.push({ destination: dest.label, status: 'AI_FAILED', error: 'AI response is not valid JSON' });
        continue;
      }

      // Validate
      const validationError = validateContent(parsed, dest.contentType);
      if (validationError) {
        results.push({ destination: dest.label, status: 'VALIDATION_FAILED', error: validationError });
        continue;
      }

      // Persist via repository
      try {
        const childNow = new Date().toISOString();
        const quality = JSON.stringify({ passed: true, checks: [], warnings: [] });
        const usedProvider = aiEnv.provider ?? null;
        const usedModel = aiEnv.campaignModel || null;

        await repos.creative.artifact.insert({
          id: childId, workspaceId, campaignId: sourceArtifact.campaignId,
          sourceContentPlanId: sourceArtifact.sourceContentPlanId,
          sourceContentPlanVersion: sourceArtifact.sourceContentPlanVersion,
          contentKey, deliverableId, version: 1, status: 'READY_FOR_REVIEW',
          channel: dest.channel, contentType: dest.contentType, format: dest.format,
          title: dest.label,
          content: JSON.stringify(parsed), quality,
          repurposeRequestId: requestId,
          marketingScopesJson: scopes.length ? JSON.stringify(scopes) : null,
          aiGenerated: true,
          aiProvider: usedProvider,
          aiModel: usedModel,
          aiTaskType: 'CONTENT_REPURPOSE',
          createdAt: childNow, updatedAt: childNow,
        });

        await repos.creative.derivation.insert(sourceArtifact.id, childId, 'REPURPOSED_FROM', childNow);

        await repos.creative.sourceLink.copyFromParent(sourceArtifact.id, childId, childNow);

        results.push({ destination: dest.label, status: 'SUCCEEDED', artifactId: childId, contentKey });
      } catch (err) {
        results.push({ destination: dest.label, status: 'PERSISTENCE_FAILED', error: (err as Error).message });
      }
    }

    // Determine overall status and update reservation (repurpose_requests is non-core)
    const succeeded = results.filter(r => r.status === 'SUCCEEDED').length;
    const failed = results.filter(r => r.status !== 'SUCCEEDED').length;
    const overallStatus: RepurposeResult['status'] =
      succeeded === 0 ? 'FAILED' :
      failed > 0 ? 'PARTIAL' :
      'COMPLETED';

    db.prepare('UPDATE repurpose_requests SET status = ?, updated_at = ? WHERE id = ?')
      .run(overallStatus, new Date().toISOString(), requestId);

    return { requestId, sourceArtifactId, status: overallStatus, results };
  }

  async getSourceSummary(workspaceId: string, artifactId: string): Promise<{ artifact: { id: string; channel: string; contentType: string; content: unknown }; summary: BoundedSummary } | { error: string; code: string }> {
    const repos = getCoreRepositories();
    const artifact = await repos.creative.artifact.findByIdForWorkspace(artifactId, workspaceId);
    if (!artifact) return { error: 'Artifact not found', code: 'NOT_FOUND' };
    const campaign = await repos.campaign.findById(artifact.campaignId);
    const campaignName = campaign?.name ?? 'Unknown Campaign';
    const contentJson = JSON.stringify(artifact.content);
    const summary = buildBoundedSummary(artifact.channel, artifact.contentType, contentJson, campaignName);
    return {
      artifact: { id: artifact.id, channel: artifact.channel, contentType: artifact.contentType, content: artifact.content },
      summary,
    };
  }
}

export const repurposeService = new RepurposeService();

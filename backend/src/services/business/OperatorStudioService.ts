import { randomUUID } from 'crypto';
import { db } from '../../db/database';
import { aiEnv } from '../../config/aiEnvironment';
import { getAIProvider } from '../../integrations/adapters/AIProviderFactory';

export type StudioFormat = 'POST' | 'CAROUSEL' | 'STORY' | 'EMAIL';

interface StudioProduct {
  id: string;
  title: string;
  brand: string | null;
  price: number | null;
  currency: string | null;
  imageUrls: string[];
  availability: string;
  marketingBucket: 'NEW' | 'CURRENT' | 'SALE' | null;
  size: string | null;
  category: string | null;
  publicUrl: string | null;
}

export interface StudioSetupResult {
  campaignId: string;
  campaignName: string;
  contentKey: string;
  artifact: {
    id: string;
    workspaceId: string;
    campaignId: string;
    sourceContentPlanId: string;
    sourceContentPlanVersion: number;
    contentKey: string;
    deliverableId: string;
    version: number;
    channel: string;
    contentType: string;
    format: string;
    title: string | null;
    content: unknown;
    quality: unknown;
    status: string;
    isCurrent: boolean;
    createdAt: string;
    updatedAt: string;
  };
  products: StudioProduct[];
  aiGenerated: boolean;
}

type ServiceError = { error: string; code: string };

const FORMAT_META: Record<StudioFormat, { channel: string; contentType: string; format: string; contentKey: string; title: string }> = {
  POST:     { channel: 'INSTAGRAM', contentType: 'STATIC_POST',  format: 'PORTRAIT_4_5',  contentKey: 'new-arrivals-ig-post',     title: 'New Arrivals — Instagram Post' },
  CAROUSEL: { channel: 'INSTAGRAM', contentType: 'CAROUSEL',     format: 'PORTRAIT_4_5',  contentKey: 'new-arrivals-ig-carousel',  title: 'New Arrivals — Instagram Carousel' },
  STORY:    { channel: 'INSTAGRAM', contentType: 'STORY',         format: 'VERTICAL_9_16', contentKey: 'new-arrivals-ig-story',    title: 'New Arrivals — Instagram Story' },
  EMAIL:    { channel: 'EMAIL',     contentType: 'EMAIL',         format: 'NEWSLETTER',    contentKey: 'new-arrivals-email',       title: 'New Arrivals — Email' },
};

function buildSystemPrompt(): string {
  return `You are a marketing copywriter for Worn Label, a curated pre-loved fashion marketplace in New Zealand.

ROLE: Write authentic, editorial Instagram/email copy for specific products the operator has selected.

CRITICAL RULES:
1. Write copy based ONLY on the product details provided — never invent facts, prices, or details not given.
2. Match the Worn Label brand voice: editorial, considered, authentic, sustainability-conscious.
3. Instagram copy must feel human and native — not like an ad.
4. Never use banned words/phrases if provided.
5. Use product-specific CTAs ("Shop the [item]") not generic ones ("Click here").
6. Return VALID JSON ONLY matching the required schema exactly.
7. Do not include placeholder text or "[insert here]" style copy.`;
}

function buildUserPrompt(products: StudioProduct[], format: StudioFormat, brandBrain: Record<string, unknown>): string {
  const meta = FORMAT_META[format];
  const productLines = products.map((p, i) => {
    const parts = [
      `Product ${i + 1}: ${p.title}`,
      p.brand ? `  Brand: ${p.brand}` : null,
      p.price != null ? `  Price: ${new Intl.NumberFormat('en-NZ', { style: 'currency', currency: p.currency ?? 'NZD', maximumFractionDigits: 0 }).format(p.price)}` : null,
      p.size ? `  Size: ${p.size}` : null,
      p.category ? `  Category: ${p.category}` : null,
      p.marketingBucket === 'NEW' ? '  Status: New arrival' : p.marketingBucket === 'SALE' ? '  Status: On sale' : null,
    ].filter(Boolean);
    return parts.join('\n');
  }).join('\n\n');

  const bb = brandBrain as { personality?: { traits?: string[]; archetype?: string }; language?: { preferredWords?: string[]; bannedWords?: string[]; ctaStyle?: string; exampleCopy?: string }; audience?: { primaryAudience?: string } };

  const brandLines = [
    bb.personality?.archetype ? `Brand archetype: ${bb.personality.archetype}` : null,
    bb.personality?.traits?.length ? `Brand traits: ${bb.personality.traits.join(', ')}` : null,
    bb.audience?.primaryAudience ? `Primary audience: ${bb.audience.primaryAudience}` : null,
    bb.language?.preferredWords?.length ? `Preferred language: ${bb.language.preferredWords.join(', ')}` : null,
    bb.language?.bannedWords?.length ? `NEVER USE: ${bb.language.bannedWords.join(', ')}` : null,
    bb.language?.ctaStyle ? `CTA style: ${bb.language.ctaStyle}` : null,
    bb.language?.exampleCopy ? `Example copy: ${bb.language.exampleCopy}` : null,
  ].filter(Boolean).join('\n');

  const schemas: Record<StudioFormat, string> = {
    POST: `{ "kind": "STATIC_POST", "caption": "string (Instagram caption, 2-4 sentences, with hashtags)", "hook": "string (first line that stops the scroll)", "cta": "string (specific product CTA)" }`,
    CAROUSEL: `{ "kind": "CAROUSEL", "caption": "string (opening Instagram caption for the carousel, with hashtags)", "slides": [{ "slideNumber": 1, "headline": "string (brand + key detail, max 6 words)", "body": "string (1-2 sentences about this piece)" }, ...], "cta": "string" }`,
    STORY: `{ "kind": "STORY", "frames": [{ "frameNumber": 1, "headline": "string (punchy, max 5 words)", "body": "string (optional, 1 sentence)", "cta": "string (optional)" }] }`,
    EMAIL: `{ "kind": "EMAIL", "subject": "string", "preheader": "string (40-60 chars)", "headline": "string", "body": "string (2-3 paragraphs about the products)", "cta": { "label": "string", "destinationDescription": "string" } }`,
  };

  const slideNote = format === 'CAROUSEL' && products.length > 1
    ? `\nCreate ${products.length} slides, one per product, in the order listed.`
    : format === 'CAROUSEL' && products.length === 1
    ? '\nCreate 2-3 slides for this single product (different angles/details).'
    : '';

  const storyNote = format === 'STORY'
    ? `\nCreate ${Math.min(products.length + 1, 4)} frames: an opening frame then one per key product.`
    : '';

  return [
    '=== SELECTED PRODUCTS ===',
    productLines,
    '',
    '=== WORN LABEL BRAND BRAIN ===',
    brandLines || 'Editorial, curated fashion marketplace. Authentic, sustainable.',
    '',
    `=== FORMAT: ${meta.contentType} (${meta.channel}) ===`,
    slideNote,
    storyNote,
    '',
    '=== REQUIRED JSON SCHEMA ===',
    schemas[format],
    '',
    'Write as Worn Label — editorial, considered, human. Celebrate the specific items.',
  ].filter(s => s !== undefined).join('\n');
}

function templateContent(products: StudioProduct[], format: StudioFormat): unknown {
  const names = products.map(p => p.title).join(', ');
  switch (format) {
    case 'CAROUSEL':
      return {
        kind: 'CAROUSEL',
        caption: `New arrivals — ${names}. Now available on Worn Label. Shop via the link in bio. #wornlabel #sustainablefashion #preloved #newzealand`,
        slides: products.map((p, i) => ({
          slideNumber: i + 1,
          headline: `${p.brand ?? 'Worn Label'} · ${p.size ?? 'One size'}`,
          body: `${p.title}${p.price != null ? ` — ${new Intl.NumberFormat('en-NZ', { style: 'currency', currency: p.currency ?? 'NZD', maximumFractionDigits: 0 }).format(p.price)}` : ''}`,
        })),
        cta: 'Shop via link in bio',
      };
    case 'STORY':
      return {
        kind: 'STORY',
        frames: [
          { frameNumber: 1, headline: 'New arrivals', body: 'Just dropped on Worn Label.' },
          ...products.slice(0, 3).map((p, i) => ({
            frameNumber: i + 2,
            headline: p.title.slice(0, 30),
            cta: 'Shop now',
          })),
        ],
      };
    case 'EMAIL':
      return {
        kind: 'EMAIL',
        subject: `New arrivals: ${names.slice(0, 60)}`,
        preheader: 'Freshly curated pieces now available.',
        headline: 'New Arrivals',
        body: `We've just added some beautiful pieces to the shop. Discover ${names} — each carefully curated and ready to find its next owner.`,
        cta: { label: 'Shop now', destinationDescription: 'Worn Label marketplace' },
      };
    default:
      return {
        kind: 'STATIC_POST',
        caption: `New arrivals — ${names}. Available now on Worn Label. #wornlabel #sustainablefashion #preloved`,
        hook: `Just arrived: ${names.slice(0, 60)}`,
        cta: `Shop via link in bio`,
      };
  }
}

class OperatorStudioService {
  async setup(params: {
    workspaceId: string;
    sourceProductIds: string[];
    format: StudioFormat;
  }): Promise<StudioSetupResult | ServiceError> {
    const { workspaceId, sourceProductIds, format } = params;

    if (!workspaceId) return { error: 'workspaceId is required', code: 'BAD_REQUEST' };
    if (!sourceProductIds?.length) return { error: 'At least one product must be selected', code: 'BAD_REQUEST' };
    if (sourceProductIds.length > 6) return { error: 'Select up to 6 products at a time', code: 'BAD_REQUEST' };
    if (!FORMAT_META[format]) return { error: `Invalid format. Use: ${Object.keys(FORMAT_META).join(', ')}`, code: 'BAD_REQUEST' };

    const entity = db.prepare('SELECT id, name, brand_kit FROM entities WHERE id = ?').get(workspaceId) as
      | { id: string; name: string; brand_kit: string } | undefined;
    if (!entity) return { error: 'Workspace not found', code: 'NOT_FOUND' };

    const brandKit = JSON.parse(entity.brand_kit || '{}') as { brandBrain?: Record<string, unknown> };
    const brandBrain = brandKit.brandBrain ?? {};

    const objective = db.prepare("SELECT id FROM objectives WHERE id = 'obj_sys_sales' AND is_active = 1").get() as
      | { id: string } | undefined;
    if (!objective) return { error: 'System sales objective not found. Database may need seeding.', code: 'NOT_FOUND' };

    // Fetch source products in the specified order
    const sourceRows = sourceProductIds.map(id =>
      db.prepare('SELECT * FROM source_records WHERE id = ? AND workspace_id = ?').get(id, workspaceId) as
        | { id: string; title: string; image_urls: string; price_amount: number | null; price_currency: string | null; availability: string; payload: string; occurred_at: string | null } | undefined
    ).filter((r): r is NonNullable<typeof r> => r != null);

    if (sourceRows.length === 0) return { error: 'No matching products found', code: 'NOT_FOUND' };

    const products: StudioProduct[] = sourceRows.map(r => {
      const payload = JSON.parse(r.payload || '{}') as Record<string, unknown>;
      const imgUrls = JSON.parse(r.image_urls || '[]') as string[];
      const bucket: 'NEW' | 'CURRENT' | 'SALE' | null = (() => {
        if (r.occurred_at) {
          const age = (Date.now() - new Date(r.occurred_at).getTime()) / (1000 * 60 * 60 * 24);
          if (age <= 14) return 'NEW';
        }
        return null;
      })();
      return {
        id: r.id,
        title: r.title,
        brand: (payload.brand as string | null) ?? null,
        price: r.price_amount,
        currency: r.price_currency,
        imageUrls: imgUrls,
        availability: r.availability,
        marketingBucket: bucket,
        size: (payload.size as string | null) ?? null,
        category: (payload.category as string | null) ?? null,
        publicUrl: (payload.publicUrl as string | null) ?? null,
      };
    });

    const meta = FORMAT_META[format];
    const productTitles = products.map(p => p.title).slice(0, 2).join(' & ');
    const campaignName = products.length === 1 ? products[0].title : `New Arrivals — ${productTitles}`;

    const now = new Date().toISOString();
    const campaignId = `campaign_${randomUUID()}`;
    const planId = `plan_${randomUUID()}`;
    const planApprovalId = `plnapp_${randomUUID()}`;
    const contentPlanId = `cp_${randomUUID()}`;
    const contentPlanApprovalId = `cpapp_${randomUUID()}`;
    const deliverableId = `del_${randomUUID()}`;
    const conceptId = `con_${randomUUID()}`;
    const artifactId = `cart_${randomUUID()}`;

    const contentKey = meta.contentKey;

    // Build minimal content plan body
    const contentPlanBody = JSON.stringify({
      summary: {
        campaignNarrative: `${campaignName} — new stock ready to market via Worn Label`,
        contentStrategy: `Showcase the selected products with on-brand copy for ${meta.channel}`,
      },
      concepts: [{
        id: conceptId,
        contentKey: 'product-showcase',
        name: 'Product Showcase',
        strategicPurpose: 'Showcase curated new arrivals',
        coreMessage: 'Fresh finds at Worn Label',
        proofPoints: ['Curated pre-loved', 'Sustainable fashion'],
      }],
      deliverables: [{
        id: deliverableId,
        contentKey,
        title: meta.title,
        purpose: 'Drive product discovery and sales',
        campaignRole: 'Primary awareness',
        channel: meta.channel,
        contentType: meta.contentType,
        format: meta.format,
        objectiveRole: 'Drive product discovery and purchase intent',
        primaryMessage: `${campaignName} — now available`,
        supportingMessages: products.map(p => p.title),
        proofPoints: ['Curated pre-loved fashion', 'Free local pickup available'],
        creativeDirection: 'Editorial, clean product focus',
        assetRequirements: products.map((p, i) => ({ id: `req-${i + 1}`, type: 'IMAGE', description: `Product image for ${p.title}`, required: true })),
        sourceConceptId: conceptId,
      }],
      cadence: { phases: [] },
    });

    // Generate creative content
    let content: unknown;
    let aiGenerated = false;

    const ai = getAIProvider();
    if (ai && aiEnv.isConfigured) {
      try {
        const rawJson = await ai.generateStructured({
          systemPrompt: buildSystemPrompt(),
          userPrompt: buildUserPrompt(products, format, brandBrain),
          model: aiEnv.revisionModel,
          maxTokens: 4096,
        });
        content = JSON.parse(rawJson) as unknown;
        aiGenerated = true;
      } catch {
        content = templateContent(products, format);
      }
    } else {
      content = templateContent(products, format);
    }

    const quality = JSON.stringify({ passed: true, checks: [], warnings: [] });

    // Write all records in a single transaction
    db.transaction(() => {
      // Campaign
      db.prepare(`
        INSERT INTO campaigns (id, workspace_id, objective_id, name, status, source_type, source_title, channels, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'DRAFTING', 'INVENTORY_BATCH', ?, ?, ?, ?)
      `).run(campaignId, workspaceId, objective.id, campaignName, campaignName, JSON.stringify([meta.channel]), now, now);

      // Campaign plan (minimal strategy)
      db.prepare(`
        INSERT INTO campaign_plans
          (id, campaign_id, workspace_id, version, status, is_current,
           strategy_campaign_angle, strategy_core_message, strategy_proposition, strategy_audience_focus,
           hooks, proof_points, cta_primary, cta_alternatives,
           channels, content_mix, cadence_summary, cadence_duration,
           creative_visual_direction, creative_copy_direction,
           measurement_objective, measurement_primary_kpi, measurement_supporting_kpis,
           rationale_summary, created_at, updated_at)
        VALUES (?, ?, ?, 1, 'APPROVED', 1, ?, ?, ?, ?, ?, '[]', ?, '[]', '[]', '[]', ?, NULL, ?, ?, ?, ?, '[]', ?, ?, ?)
      `).run(
        planId, campaignId, workspaceId,
        'New Arrivals showcase',
        'Fresh curated finds ready to market',
        'Curated pre-loved fashion',
        'Fashion-conscious shoppers looking for unique pieces',
        JSON.stringify({ primary: `Shop ${campaignName}`, supporting: [] }),
        `Shop ${campaignName}`,
        'Immediate publishing',
        'Editorial, clean product focus',
        'Brand-authentic, product-specific',
        'Sales',
        'conversions',
        `Operator-selected new arrivals for immediate publishing`,
        now, now,
      );

      // Plan approval
      db.prepare(`
        INSERT INTO plan_approvals (id, campaign_id, workspace_id, approved_plan_id, approved_version, approved_at, created_at)
        VALUES (?, ?, ?, ?, 1, ?, ?)
      `).run(planApprovalId, campaignId, workspaceId, planId, now, now);

      // Content plan
      db.prepare(`
        INSERT INTO content_plans (id, workspace_id, campaign_id, source_plan_id, source_plan_version, version, status, is_current, body, created_at, updated_at)
        VALUES (?, ?, ?, ?, 1, 1, 'APPROVED', 1, ?, ?, ?)
      `).run(contentPlanId, workspaceId, campaignId, planId, contentPlanBody, now, now);

      // Content plan approval
      db.prepare(`
        INSERT INTO content_plan_approvals (id, campaign_id, workspace_id, content_plan_id, content_plan_version, approved_at, created_at)
        VALUES (?, ?, ?, ?, 1, ?, ?)
      `).run(contentPlanApprovalId, campaignId, workspaceId, contentPlanId, now, now);

      // Creative artifact
      db.prepare(`
        INSERT INTO creative_artifacts
          (id, workspace_id, campaign_id, source_content_plan_id, source_content_plan_version,
           content_key, deliverable_id, version, status, is_current, channel, content_type, format,
           title, content, quality, created_at, updated_at)
        VALUES (?, ?, ?, ?, 1, ?, ?, 1, 'READY_FOR_REVIEW', 1, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        artifactId, workspaceId, campaignId, contentPlanId,
        contentKey, deliverableId,
        meta.channel, meta.contentType, meta.format,
        meta.title, JSON.stringify(content), quality,
        now, now,
      );

      // Creative source links
      sourceRows.forEach((row, position) => {
        db.prepare(`
          INSERT OR IGNORE INTO creative_source_links (creative_artifact_id, source_record_id, position, created_at)
          VALUES (?, ?, ?, ?)
        `).run(artifactId, row.id, position, now);
      });
    })();

    const artifactRow = db.prepare('SELECT * FROM creative_artifacts WHERE id = ?').get(artifactId) as {
      id: string; workspace_id: string; campaign_id: string; source_content_plan_id: string;
      source_content_plan_version: number; content_key: string; deliverable_id: string; version: number;
      status: string; is_current: number; channel: string; content_type: string; format: string;
      title: string | null; content: string; quality: string; created_at: string; updated_at: string;
    };

    return {
      campaignId,
      campaignName,
      contentKey,
      artifact: {
        id: artifactRow.id,
        workspaceId: artifactRow.workspace_id,
        campaignId: artifactRow.campaign_id,
        sourceContentPlanId: artifactRow.source_content_plan_id,
        sourceContentPlanVersion: artifactRow.source_content_plan_version,
        contentKey: artifactRow.content_key,
        deliverableId: artifactRow.deliverable_id,
        version: artifactRow.version,
        channel: artifactRow.channel,
        contentType: artifactRow.content_type,
        format: artifactRow.format,
        title: artifactRow.title,
        content: JSON.parse(artifactRow.content) as unknown,
        quality: JSON.parse(artifactRow.quality) as unknown,
        status: artifactRow.status,
        isCurrent: artifactRow.is_current === 1,
        createdAt: artifactRow.created_at,
        updatedAt: artifactRow.updated_at,
      },
      products,
      aiGenerated,
    };
  }
}

export const operatorStudioService = new OperatorStudioService();

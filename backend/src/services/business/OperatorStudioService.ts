import { randomUUID } from 'crypto';
import { db } from '../../db/database';
import { aiEnv } from '../../config/aiEnvironment';
import { aiOrchestrator } from '../intelligence/AIOrchestrator';
import type { MarketingRecommendationRow } from '../../types/marketingRecommendations';

export type StudioFormat = 'POST' | 'CAROUSEL' | 'STORY' | 'EMAIL' | 'WHOLE_SET';
export type CreativeDirection = 'EDITORIAL' | 'PRODUCT_LED' | 'MINIMAL';

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

export interface WholeSetFormatResult {
  format: 'POST' | 'CAROUSEL' | 'STORY' | 'EMAIL';
  contentKey: string;
  artifact: StudioSetupResult['artifact'];
}

export interface WholeSetSetupResult {
  campaignId: string;
  campaignName: string;
  formats: WholeSetFormatResult[];
  products: StudioProduct[];
  aiGenerated: boolean;
  creativeDirection: CreativeDirection | null;
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
  creativeDirection: CreativeDirection | null;
}

type ServiceError = { error: string; code: string };

type SingleFormat = 'POST' | 'CAROUSEL' | 'STORY' | 'EMAIL';
const SINGLE_FORMATS: SingleFormat[] = ['POST', 'CAROUSEL', 'STORY', 'EMAIL'];

const FORMAT_META: Record<SingleFormat, { channel: string; contentType: string; format: string; contentKey: string; title: string }> = {
  POST:     { channel: 'INSTAGRAM', contentType: 'STATIC_POST',  format: 'PORTRAIT_4_5',  contentKey: 'new-arrivals-ig-post',     title: 'New Arrivals — Instagram Post' },
  CAROUSEL: { channel: 'INSTAGRAM', contentType: 'CAROUSEL',     format: 'PORTRAIT_4_5',  contentKey: 'new-arrivals-ig-carousel',  title: 'New Arrivals — Instagram Carousel' },
  STORY:    { channel: 'INSTAGRAM', contentType: 'STORY',         format: 'VERTICAL_9_16', contentKey: 'new-arrivals-ig-story',    title: 'New Arrivals — Instagram Story' },
  EMAIL:    { channel: 'EMAIL',     contentType: 'EMAIL',         format: 'NEWSLETTER',    contentKey: 'new-arrivals-email',       title: 'New Arrivals — Email' },
};

function directionSystemNote(direction: CreativeDirection | null): string {
  switch (direction) {
    case 'EDITORIAL':
      return '\n\nDIRECTION: EDITORIAL — Write narrative, mood-led copy focused on aesthetic and story. Do not mention prices. Write as if for a fashion editorial magazine. Prioritise feel over specification.';
    case 'PRODUCT_LED':
      return '\n\nDIRECTION: PRODUCT-LED — Lead with specific product details: name, brand, price, size. Be informative and direct so shoppers know exactly what they are buying. Include prices where provided.';
    case 'MINIMAL':
      return '\n\nDIRECTION: MINIMAL — Write exceptionally concise copy. Hooks must be 5-8 words maximum. Captions must be 1-2 sentences maximum. No hashtags unless essential. Powerful restraint over elaboration.';
    default:
      return '';
  }
}

function directionUserNote(direction: CreativeDirection | null): string {
  switch (direction) {
    case 'EDITORIAL':
      return '\nWRITING APPROACH: Editorial fashion copy — focus on mood, narrative, aesthetic. Avoid mentioning prices. Make it feel like a magazine editorial, not an advertisement.';
    case 'PRODUCT_LED':
      return '\nWRITING APPROACH: Product-forward — lead with item specifics (name, brand, price, size). Be clear and informative. Help shoppers understand exactly what they are looking at.';
    case 'MINIMAL':
      return '\nWRITING APPROACH: Extreme brevity. Hooks = 5 words max. Captions = 1 sentence. Cut every non-essential word. No hashtag blocks. Essential message only.';
    default:
      return '\nWrite authentic, human-feeling copy that celebrates the specific items.';
  }
}

function buildSystemPrompt(brandName: string, market: string | null, direction: CreativeDirection | null): string {
  return `You are a marketing copywriter for ${brandName}${market ? `, ${market}` : ''}.

ROLE: Write authentic, on-brand Instagram/email copy for specific products the operator has selected.

CRITICAL RULES:
1. Write copy based ONLY on the product details provided — never invent facts, prices, or details not given.
2. Match the brand voice from the Brand Brain provided.
3. Instagram copy must feel human and native — not like an ad.
4. Never use banned words/phrases if provided.
5. Use product-specific CTAs not generic ones ("Click here").
6. Return VALID JSON ONLY matching the required schema exactly.
7. Do not include placeholder text or "[insert here]" style copy.${directionSystemNote(direction)}`;
}

function buildUserPrompt(
  products: StudioProduct[],
  format: SingleFormat,
  brandBrain: Record<string, unknown>,
  brandName: string,
  direction: CreativeDirection | null,
): string {
  const meta = FORMAT_META[format];
  const productLines = products.map((p, i) => {
    const parts = [
      `Product ${i + 1}: ${p.title}`,
      p.brand ? `  Brand: ${p.brand}` : null,
      (direction !== 'EDITORIAL' && p.price != null)
        ? `  Price: ${new Intl.NumberFormat('en-NZ', { style: 'currency', currency: p.currency ?? 'NZD', maximumFractionDigits: 0 }).format(p.price)}`
        : null,
      p.size ? `  Size: ${p.size}` : null,
      p.category ? `  Category: ${p.category}` : null,
      p.marketingBucket === 'NEW' ? '  Status: New arrival' : p.marketingBucket === 'SALE' ? '  Status: On sale' : null,
    ].filter(Boolean);
    return parts.join('\n');
  }).join('\n\n');

  const bb = brandBrain as { personality?: { traits?: string[]; archetype?: string }; language?: { preferredWords?: string[]; bannedWords?: string[]; ctaStyle?: string; exampleCopy?: string }; audience?: { primaryAudience?: string }; identity?: { market?: string } };

  const brandLines = [
    bb.personality?.archetype ? `Brand archetype: ${bb.personality.archetype}` : null,
    bb.personality?.traits?.length ? `Brand traits: ${bb.personality.traits.join(', ')}` : null,
    bb.audience?.primaryAudience ? `Primary audience: ${bb.audience.primaryAudience}` : null,
    bb.language?.preferredWords?.length ? `Preferred language: ${bb.language.preferredWords.join(', ')}` : null,
    bb.language?.bannedWords?.length ? `NEVER USE: ${bb.language.bannedWords.join(', ')}` : null,
    bb.language?.ctaStyle ? `CTA style: ${bb.language.ctaStyle}` : null,
    bb.language?.exampleCopy ? `Example copy: ${bb.language.exampleCopy}` : null,
  ].filter(Boolean).join('\n');

  const schemas: Record<SingleFormat, string> = {
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
    `=== ${brandName.toUpperCase()} BRAND BRAIN ===`,
    brandLines || 'Match the existing brand personality and voice.',
    '',
    `=== FORMAT: ${meta.contentType} (${meta.channel}) ===`,
    slideNote,
    storyNote,
    '',
    '=== REQUIRED JSON SCHEMA ===',
    schemas[format],
    '',
    directionUserNote(direction),
  ].filter(s => s !== undefined).join('\n');
}

function templateContent(products: StudioProduct[], format: SingleFormat, direction: CreativeDirection | null): unknown {
  const names = products.map(p => p.title).join(', ');

  switch (format) {
    case 'CAROUSEL':
      return {
        kind: 'CAROUSEL',
        caption: direction === 'MINIMAL'
          ? `New arrivals. #preloved`
          : direction === 'EDITORIAL'
          ? `Thoughtfully curated — each piece with a story. Discover the latest edit. #preloved #sustainablefashion`
          : `New arrivals — ${names}. Now available. Shop via the link in bio. #sustainablefashion #preloved #newzealand`,
        slides: products.map((p, i) => ({
          slideNumber: i + 1,
          headline: direction === 'PRODUCT_LED'
            ? `${p.brand ?? 'Unknown'} · ${p.size ?? 'One size'}${p.price != null ? ` — ${new Intl.NumberFormat('en-NZ', { style: 'currency', currency: p.currency ?? 'NZD', maximumFractionDigits: 0 }).format(p.price)}` : ''}`
            : `${p.brand ?? ''} · ${p.title.slice(0, 30)}`,
          body: p.title,
        })),
        cta: direction === 'MINIMAL' ? 'Shop now' : 'Shop via link in bio',
      };
    case 'STORY':
      return {
        kind: 'STORY',
        frames: [
          {
            frameNumber: 1,
            headline: direction === 'EDITORIAL' ? 'The new edit' : direction === 'MINIMAL' ? 'Just arrived.' : 'New arrivals',
            body: direction === 'MINIMAL' ? null : direction === 'EDITORIAL' ? 'Thoughtfully chosen.' : 'Just dropped.',
          },
          ...products.slice(0, 3).map((p, i) => ({
            frameNumber: i + 2,
            headline: direction === 'MINIMAL' ? p.title.slice(0, 20) : p.title.slice(0, 30),
            cta: 'Shop now',
          })),
        ],
      };
    case 'EMAIL':
      return {
        kind: 'EMAIL',
        subject: direction === 'MINIMAL'
          ? `New: ${names.slice(0, 40)}`
          : direction === 'EDITORIAL'
          ? `The new edit — pieces worth finding`
          : `New arrivals: ${names.slice(0, 60)}`,
        preheader: direction === 'MINIMAL' ? 'Now available.' : 'Freshly curated pieces now available.',
        headline: direction === 'EDITORIAL' ? 'The New Edit' : direction === 'MINIMAL' ? 'Just In' : 'New Arrivals',
        body: direction === 'EDITORIAL'
          ? `Some pieces arrive with a quiet certainty. Each has been chosen with care — pre-loved, considered, ready for what comes next.\n\nDiscover ${names} in the shop.`
          : direction === 'MINIMAL'
          ? `${names}. Available now.`
          : `We've just added some beautiful pieces to the shop. Discover ${names} — each carefully curated and ready to find its next owner.`,
        cta: { label: direction === 'MINIMAL' ? 'Shop now' : 'Shop the new arrivals', destinationDescription: 'marketplace' },
      };
    default:
      return {
        kind: 'STATIC_POST',
        caption: direction === 'MINIMAL'
          ? `New arrival. Shop via link in bio.`
          : direction === 'EDITORIAL'
          ? `${names.slice(0, 60)}. Pre-loved and ready for its next chapter. #preloved #sustainablefashion`
          : `New arrivals — ${names}. Available now. #sustainablefashion #preloved`,
        hook: direction === 'MINIMAL'
          ? names.slice(0, 30)
          : direction === 'EDITORIAL'
          ? `The one you didn't know you needed.`
          : `Just arrived: ${names.slice(0, 60)}`,
        cta: 'Shop via link in bio',
      };
  }
}

class OperatorStudioService {
  async setup(params: {
    workspaceId: string;
    sourceProductIds: string[];
    format: SingleFormat;
    creativeDirection?: CreativeDirection | null;
    recommendationId?: string | null;
  }): Promise<StudioSetupResult | ServiceError> {
    const { workspaceId, sourceProductIds, format, creativeDirection = null, recommendationId = null } = params;

    if (!workspaceId) return { error: 'workspaceId is required', code: 'BAD_REQUEST' };
    if (!sourceProductIds?.length) return { error: 'At least one product must be selected', code: 'BAD_REQUEST' };
    if (sourceProductIds.length > 6) return { error: 'Select up to 6 products at a time', code: 'BAD_REQUEST' };
    if (!FORMAT_META[format]) return { error: `Invalid format. Use: ${SINGLE_FORMATS.join(', ')}`, code: 'BAD_REQUEST' };

    const entity = db.prepare('SELECT id, name, brand_kit FROM entities WHERE id = ?').get(workspaceId) as
      | { id: string; name: string; brand_kit: string } | undefined;
    if (!entity) return { error: 'Workspace not found', code: 'NOT_FOUND' };

    const brandKit = JSON.parse(entity.brand_kit || '{}') as { brandBrain?: Record<string, unknown>; identity?: { market?: string } };
    const brandBrain = brandKit.brandBrain ?? {};
    const market = (brandBrain as { identity?: { market?: string } }).identity?.market ?? null;

    // Resolve objective: from recommendation lineage if provided, else system default
    let objectiveId: string;
    let recRow: MarketingRecommendationRow | null = null;
    if (recommendationId) {
      recRow = db.prepare('SELECT * FROM marketing_recommendations WHERE id = ? AND workspace_id = ?').get(recommendationId, workspaceId) as MarketingRecommendationRow | null;
      if (!recRow) return { error: 'Recommendation not found', code: 'NOT_FOUND' };
      if (recRow.status !== 'NEW') return { error: 'Recommendation is no longer available', code: 'CONFLICT' };
      if (recRow.objective_id) {
        const validObjective = db.prepare(`SELECT id FROM objectives WHERE id = ? AND is_active = 1 AND (workspace_id = ? OR workspace_id IS NULL)`).get(recRow.objective_id, workspaceId) as { id: string } | undefined;
        if (!validObjective) return { error: 'Recommendation objective is not valid for this workspace', code: 'BAD_REQUEST' };
        objectiveId = recRow.objective_id;
      } else {
        const sysObj = db.prepare("SELECT id FROM objectives WHERE id = 'obj_sys_sales' AND is_active = 1").get() as { id: string } | undefined;
        if (!sysObj) return { error: 'System sales objective not found', code: 'NOT_FOUND' };
        objectiveId = sysObj.id;
      }
    } else {
      const objective = db.prepare("SELECT id FROM objectives WHERE id = 'obj_sys_sales' AND is_active = 1").get() as { id: string } | undefined;
      if (!objective) return { error: 'System sales objective not found. Database may need seeding.', code: 'NOT_FOUND' };
      objectiveId = objective.id;
    }

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

    const contentPlanBody = JSON.stringify({
      summary: {
        campaignNarrative: `${campaignName} — new stock ready to market`,
        contentStrategy: `Showcase the selected products with on-brand copy for ${meta.channel}`,
      },
      concepts: [{ id: conceptId, contentKey: 'product-showcase', name: 'Product Showcase', strategicPurpose: 'Showcase curated new arrivals', coreMessage: 'Fresh finds', proofPoints: ['Curated pre-loved', 'Sustainable fashion'] }],
      deliverables: [{
        id: deliverableId, contentKey, title: meta.title, purpose: 'Drive product discovery and sales',
        campaignRole: 'Primary awareness', channel: meta.channel, contentType: meta.contentType, format: meta.format,
        objectiveRole: 'Drive product discovery and purchase intent', primaryMessage: `${campaignName} — now available`,
        supportingMessages: products.map(p => p.title), proofPoints: ['Curated pre-loved fashion'],
        creativeDirection: creativeDirection ?? 'Editorial, clean product focus',
        assetRequirements: products.map((p, i) => ({ id: `req-${i + 1}`, type: 'IMAGE', description: `Product image for ${p.title}`, required: true })),
        sourceConceptId: conceptId,
      }],
      cadence: { phases: [] },
    });

    let content: unknown;
    let aiGenerated = false;
    if (aiOrchestrator.isAvailable()) {
      try {
        const result = await aiOrchestrator.generate({
          workspaceId,
          taskType: 'CREATIVE_COPY',
          scope: 'SHOP',
          knowledgeDomains: ['BRAND_CORE', 'VOICE'],
          systemPrompt: buildSystemPrompt(entity.name, market, creativeDirection),
          userPrompt: buildUserPrompt(products, format, brandBrain, entity.name, creativeDirection),
          model: aiEnv.revisionModel,
          maxTokens: 4096,
        });
        content = JSON.parse(result.content) as unknown;
        aiGenerated = true;
      } catch {
        content = templateContent(products, format, creativeDirection);
      }
    } else {
      content = templateContent(products, format, creativeDirection);
    }

    const quality = JSON.stringify({ passed: true, checks: [], warnings: [] });

    db.transaction(() => {
      db.prepare(`
        INSERT INTO campaigns (id, workspace_id, objective_id, recommendation_id, name, status, source_type, source_title, channels, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'DRAFTING', 'INVENTORY_BATCH', ?, ?, ?, ?)
      `).run(campaignId, workspaceId, objectiveId, recommendationId ?? null, campaignName, campaignName, JSON.stringify([meta.channel]), now, now);

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
        'New Arrivals showcase', 'Fresh curated finds ready to market',
        'Curated pre-loved fashion', 'Fashion-conscious shoppers',
        JSON.stringify({ primary: `Shop ${campaignName}`, supporting: [] }),
        `Shop ${campaignName}`, 'Immediate publishing',
        creativeDirection ? `${creativeDirection} direction — ${meta.channel}` : 'Editorial, clean product focus',
        'Brand-authentic, product-specific', 'Sales', 'conversions',
        `Operator-selected new arrivals for immediate publishing`,
        now, now,
      );

      db.prepare(`INSERT INTO plan_approvals (id, campaign_id, workspace_id, approved_plan_id, approved_version, approved_at, created_at) VALUES (?, ?, ?, ?, 1, ?, ?)`)
        .run(planApprovalId, campaignId, workspaceId, planId, now, now);

      db.prepare(`INSERT INTO content_plans (id, workspace_id, campaign_id, source_plan_id, source_plan_version, version, status, is_current, body, created_at, updated_at) VALUES (?, ?, ?, ?, 1, 1, 'APPROVED', 1, ?, ?, ?)`)
        .run(contentPlanId, workspaceId, campaignId, planId, contentPlanBody, now, now);

      db.prepare(`INSERT INTO content_plan_approvals (id, campaign_id, workspace_id, content_plan_id, content_plan_version, approved_at, created_at) VALUES (?, ?, ?, ?, 1, ?, ?)`)
        .run(contentPlanApprovalId, campaignId, workspaceId, contentPlanId, now, now);

      db.prepare(`
        INSERT INTO creative_artifacts
          (id, workspace_id, campaign_id, source_content_plan_id, source_content_plan_version,
           content_key, deliverable_id, version, status, is_current, channel, content_type, format,
           title, content, quality, creative_direction, ai_provider, ai_model, ai_generated, ai_task_type, created_at, updated_at)
        VALUES (?, ?, ?, ?, 1, ?, ?, 1, 'READY_FOR_REVIEW', 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        artifactId, workspaceId, campaignId, contentPlanId,
        contentKey, deliverableId,
        meta.channel, meta.contentType, meta.format,
        meta.title, JSON.stringify(content), quality, creativeDirection ?? null,
        aiGenerated ? (aiEnv.provider ?? null) : null,
        aiGenerated ? (aiEnv.revisionModel ?? null) : null,
        aiGenerated ? 1 : 0,
        aiGenerated ? 'CREATIVE_COPY' : null,
        now, now,
      );

      sourceRows.forEach((row, position) => {
        db.prepare(`INSERT OR IGNORE INTO creative_source_links (creative_artifact_id, source_record_id, position, created_at) VALUES (?, ?, ?, ?)`)
          .run(artifactId, row.id, position, now);
      });

      // Atomically accept recommendation
      if (recommendationId) {
        db.prepare(`UPDATE marketing_recommendations SET status = 'ACCEPTED', accepted_campaign_id = ?, accepted_artifact_id = ?, accepted_at = ?, updated_at = ? WHERE id = ? AND workspace_id = ? AND status = 'NEW'`)
          .run(campaignId, artifactId, now, now, recommendationId, workspaceId);
      }
    })();

    const artifactRow = db.prepare('SELECT * FROM creative_artifacts WHERE id = ?').get(artifactId) as {
      id: string; workspace_id: string; campaign_id: string; source_content_plan_id: string;
      source_content_plan_version: number; content_key: string; deliverable_id: string; version: number;
      status: string; is_current: number; channel: string; content_type: string; format: string;
      title: string | null; content: string; quality: string; created_at: string; updated_at: string;
    };

    return {
      campaignId, campaignName, contentKey,
      artifact: {
        id: artifactRow.id, workspaceId: artifactRow.workspace_id, campaignId: artifactRow.campaign_id,
        sourceContentPlanId: artifactRow.source_content_plan_id, sourceContentPlanVersion: artifactRow.source_content_plan_version,
        contentKey: artifactRow.content_key, deliverableId: artifactRow.deliverable_id, version: artifactRow.version,
        channel: artifactRow.channel, contentType: artifactRow.content_type, format: artifactRow.format,
        title: artifactRow.title, content: JSON.parse(artifactRow.content) as unknown, quality: JSON.parse(artifactRow.quality) as unknown,
        status: artifactRow.status, isCurrent: artifactRow.is_current === 1,
        createdAt: artifactRow.created_at, updatedAt: artifactRow.updated_at,
      },
      products,
      aiGenerated,
      creativeDirection,
    };
  }

  async setupWholeSet(params: {
    workspaceId: string;
    sourceProductIds: string[];
    creativeDirection?: CreativeDirection | null;
    recommendationId?: string | null;
  }): Promise<WholeSetSetupResult | ServiceError> {
    const { workspaceId, sourceProductIds, creativeDirection = null, recommendationId = null } = params;

    if (!workspaceId) return { error: 'workspaceId is required', code: 'BAD_REQUEST' };
    if (!sourceProductIds?.length) return { error: 'At least one product must be selected', code: 'BAD_REQUEST' };
    if (sourceProductIds.length > 6) return { error: 'Select up to 6 products at a time', code: 'BAD_REQUEST' };

    const entity = db.prepare('SELECT id, name, brand_kit FROM entities WHERE id = ?').get(workspaceId) as
      | { id: string; name: string; brand_kit: string } | undefined;
    if (!entity) return { error: 'Workspace not found', code: 'NOT_FOUND' };

    const brandKit = JSON.parse(entity.brand_kit || '{}') as { brandBrain?: Record<string, unknown> };
    const brandBrain = brandKit.brandBrain ?? {};
    const market = (brandBrain as { identity?: { market?: string } }).identity?.market ?? null;

    // Resolve objective: from recommendation lineage if provided, else system default
    let objectiveIdWS: string;
    let recRowWS: MarketingRecommendationRow | null = null;
    if (recommendationId) {
      recRowWS = db.prepare('SELECT * FROM marketing_recommendations WHERE id = ? AND workspace_id = ?').get(recommendationId, workspaceId) as MarketingRecommendationRow | null;
      if (!recRowWS) return { error: 'Recommendation not found', code: 'NOT_FOUND' };
      if (recRowWS.status !== 'NEW') return { error: 'Recommendation is no longer available', code: 'CONFLICT' };
      if (recRowWS.objective_id) {
        const validObj = db.prepare(`SELECT id FROM objectives WHERE id = ? AND is_active = 1 AND (workspace_id = ? OR workspace_id IS NULL)`).get(recRowWS.objective_id, workspaceId) as { id: string } | undefined;
        if (!validObj) return { error: 'Recommendation objective is not valid for this workspace', code: 'BAD_REQUEST' };
        objectiveIdWS = recRowWS.objective_id;
      } else {
        const sysObj = db.prepare("SELECT id FROM objectives WHERE id = 'obj_sys_sales' AND is_active = 1").get() as { id: string } | undefined;
        if (!sysObj) return { error: 'System sales objective not found', code: 'NOT_FOUND' };
        objectiveIdWS = sysObj.id;
      }
    } else {
      const objective = db.prepare("SELECT id FROM objectives WHERE id = 'obj_sys_sales' AND is_active = 1").get() as { id: string } | undefined;
      if (!objective) return { error: 'System sales objective not found.', code: 'NOT_FOUND' };
      objectiveIdWS = objective.id;
    }

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
        id: r.id, title: r.title,
        brand: (payload.brand as string | null) ?? null,
        price: r.price_amount, currency: r.price_currency,
        imageUrls: imgUrls, availability: r.availability, marketingBucket: bucket,
        size: (payload.size as string | null) ?? null,
        category: (payload.category as string | null) ?? null,
        publicUrl: (payload.publicUrl as string | null) ?? null,
      };
    });

    const productTitles = products.map(p => p.title).slice(0, 2).join(' & ');
    const campaignName = products.length === 1 ? products[0].title : `New Arrivals — ${productTitles}`;
    const now = new Date().toISOString();
    const campaignId = `campaign_${randomUUID()}`;
    const planId = `plan_${randomUUID()}`;
    const planApprovalId = `plnapp_${randomUUID()}`;
    const contentPlanId = `cp_${randomUUID()}`;
    const contentPlanApprovalId = `cpapp_${randomUUID()}`;
    const conceptId = `con_${randomUUID()}`;
    const quality = JSON.stringify({ passed: true, checks: [], warnings: [] });

    let aiGenerated = false;
    const formatContents: Record<SingleFormat, unknown> = {
      POST: templateContent(products, 'POST', creativeDirection),
      CAROUSEL: templateContent(products, 'CAROUSEL', creativeDirection),
      STORY: templateContent(products, 'STORY', creativeDirection),
      EMAIL: templateContent(products, 'EMAIL', creativeDirection),
    };

    for (const fmt of SINGLE_FORMATS) {
      if (aiOrchestrator.isAvailable()) {
        try {
          const result = await aiOrchestrator.generate({
            workspaceId,
            taskType: 'CREATIVE_WHOLE_SET',
            scope: 'SHOP',
            knowledgeDomains: ['BRAND_CORE', 'VOICE'],
            systemPrompt: buildSystemPrompt(entity.name, market, creativeDirection),
            userPrompt: buildUserPrompt(products, fmt, brandBrain, entity.name, creativeDirection),
            model: aiEnv.revisionModel,
            maxTokens: 4096,
          });
          formatContents[fmt] = JSON.parse(result.content) as unknown;
          aiGenerated = true;
        } catch {
          // keep template
        }
      }
    }

    const formatIds = SINGLE_FORMATS.map(fmt => ({
      fmt,
      deliverableId: `del_${randomUUID()}`,
      artifactId: `cart_${randomUUID()}`,
    }));

    const contentPlanBody = JSON.stringify({
      summary: {
        campaignNarrative: `${campaignName} — full content set for immediate publishing`,
        contentStrategy: 'Coordinated set across Instagram Post, Carousel, Stories, and Email',
      },
      concepts: [{ id: conceptId, contentKey: 'product-showcase', name: 'Product Showcase', strategicPurpose: 'Showcase curated new arrivals across all channels', coreMessage: 'Fresh finds', proofPoints: ['Curated pre-loved', 'Sustainable fashion'] }],
      deliverables: formatIds.map(({ fmt, deliverableId }) => {
        const meta = FORMAT_META[fmt];
        return {
          id: deliverableId, contentKey: meta.contentKey, title: meta.title,
          purpose: 'Drive product discovery and sales', campaignRole: 'Channel-specific awareness',
          channel: meta.channel, contentType: meta.contentType, format: meta.format,
          objectiveRole: 'Drive product discovery and purchase intent', primaryMessage: `${campaignName} — now available`,
          supportingMessages: products.map(p => p.title), proofPoints: ['Curated pre-loved fashion'],
          creativeDirection: creativeDirection ?? 'Editorial, clean product focus',
          assetRequirements: products.map((p, i) => ({ id: `req-${i + 1}`, type: 'IMAGE', description: `Product image for ${p.title}`, required: true })),
          sourceConceptId: conceptId,
        };
      }),
      cadence: { phases: [] },
    });

    db.transaction(() => {
      db.prepare(`
        INSERT INTO campaigns (id, workspace_id, objective_id, recommendation_id, name, status, source_type, source_title, channels, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'DRAFTING', 'INVENTORY_BATCH', ?, ?, ?, ?)
      `).run(campaignId, workspaceId, objectiveIdWS, recommendationId ?? null, campaignName, campaignName, JSON.stringify(['INSTAGRAM', 'EMAIL']), now, now);

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
        'New Arrivals full-set showcase', 'Fresh curated finds — full channel set',
        'Curated pre-loved fashion', 'Fashion-conscious shoppers',
        JSON.stringify({ primary: `Shop ${campaignName}`, supporting: [] }),
        `Shop ${campaignName}`, 'Immediate publishing across all channels',
        creativeDirection ? `${creativeDirection} direction` : 'Editorial, clean product focus',
        'Brand-authentic, product-specific', 'Sales', 'conversions',
        `Full-set new arrivals for immediate publishing`,
        now, now,
      );

      db.prepare(`INSERT INTO plan_approvals (id, campaign_id, workspace_id, approved_plan_id, approved_version, approved_at, created_at) VALUES (?, ?, ?, ?, 1, ?, ?)`)
        .run(planApprovalId, campaignId, workspaceId, planId, now, now);

      db.prepare(`INSERT INTO content_plans (id, workspace_id, campaign_id, source_plan_id, source_plan_version, version, status, is_current, body, created_at, updated_at) VALUES (?, ?, ?, ?, 1, 1, 'APPROVED', 1, ?, ?, ?)`)
        .run(contentPlanId, workspaceId, campaignId, planId, contentPlanBody, now, now);

      db.prepare(`INSERT INTO content_plan_approvals (id, campaign_id, workspace_id, content_plan_id, content_plan_version, approved_at, created_at) VALUES (?, ?, ?, ?, 1, ?, ?)`)
        .run(contentPlanApprovalId, campaignId, workspaceId, contentPlanId, now, now);

      for (const { fmt, deliverableId, artifactId } of formatIds) {
        const meta = FORMAT_META[fmt];
        db.prepare(`
          INSERT INTO creative_artifacts
            (id, workspace_id, campaign_id, source_content_plan_id, source_content_plan_version,
             content_key, deliverable_id, version, status, is_current, channel, content_type, format,
             title, content, quality, creative_direction, ai_provider, ai_model, ai_generated, ai_task_type, created_at, updated_at)
          VALUES (?, ?, ?, ?, 1, ?, ?, 1, 'READY_FOR_REVIEW', 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          artifactId, workspaceId, campaignId, contentPlanId,
          meta.contentKey, deliverableId,
          meta.channel, meta.contentType, meta.format,
          meta.title, JSON.stringify(formatContents[fmt]), quality, creativeDirection ?? null,
          aiGenerated ? (aiEnv.provider ?? null) : null,
          aiGenerated ? (aiEnv.revisionModel ?? null) : null,
          aiGenerated ? 1 : 0,
          aiGenerated ? 'CREATIVE_WHOLE_SET' : null,
          now, now,
        );

        sourceRows.forEach((row, position) => {
          db.prepare(`INSERT OR IGNORE INTO creative_source_links (creative_artifact_id, source_record_id, position, created_at) VALUES (?, ?, ?, ?)`)
            .run(artifactId, row.id, position, now);
        });
      }

      // Atomically accept recommendation (use first artifact as the accepted artifact)
      if (recommendationId) {
        const firstArtifactId = formatIds[0]?.artifactId ?? null;
        db.prepare(`UPDATE marketing_recommendations SET status = 'ACCEPTED', accepted_campaign_id = ?, accepted_artifact_id = ?, accepted_at = ?, updated_at = ? WHERE id = ? AND workspace_id = ? AND status = 'NEW'`)
          .run(campaignId, firstArtifactId, now, now, recommendationId, workspaceId);
      }
    })();

    const formats: WholeSetFormatResult[] = formatIds.map(({ fmt, artifactId }) => {
      const row = db.prepare('SELECT * FROM creative_artifacts WHERE id = ?').get(artifactId) as {
        id: string; workspace_id: string; campaign_id: string; source_content_plan_id: string;
        source_content_plan_version: number; content_key: string; deliverable_id: string; version: number;
        status: string; is_current: number; channel: string; content_type: string; format: string;
        title: string | null; content: string; quality: string; created_at: string; updated_at: string;
      };
      return {
        format: fmt,
        contentKey: row.content_key,
        artifact: {
          id: row.id, workspaceId: row.workspace_id, campaignId: row.campaign_id,
          sourceContentPlanId: row.source_content_plan_id, sourceContentPlanVersion: row.source_content_plan_version,
          contentKey: row.content_key, deliverableId: row.deliverable_id, version: row.version,
          channel: row.channel, contentType: row.content_type, format: row.format,
          title: row.title, content: JSON.parse(row.content) as unknown, quality: JSON.parse(row.quality) as unknown,
          status: row.status, isCurrent: row.is_current === 1,
          createdAt: row.created_at, updatedAt: row.updated_at,
        },
      };
    });

    return { campaignId, campaignName, formats, products, aiGenerated, creativeDirection };
  }

  async setupFounderContent(params: {
    workspaceId: string;
    recommendationId: string;
  }): Promise<StudioSetupResult | ServiceError> {
    const { workspaceId, recommendationId } = params;
    if (!workspaceId) return { error: 'workspaceId is required', code: 'BAD_REQUEST' };
    if (!recommendationId) return { error: 'recommendationId is required for founder content', code: 'BAD_REQUEST' };

    const entity = db.prepare('SELECT id, name, brand_kit FROM entities WHERE id = ?').get(workspaceId) as
      | { id: string; name: string; brand_kit: string } | undefined;
    if (!entity) return { error: 'Workspace not found', code: 'NOT_FOUND' };

    const recRow = db.prepare('SELECT * FROM marketing_recommendations WHERE id = ? AND workspace_id = ?').get(recommendationId, workspaceId) as MarketingRecommendationRow | null;
    if (!recRow) return { error: 'Recommendation not found', code: 'NOT_FOUND' };
    if (recRow.status !== 'NEW') return { error: 'Recommendation is no longer available', code: 'CONFLICT' };

    // Resolve objective from recommendation lineage
    let objectiveId: string;
    if (recRow.objective_id) {
      const validObj = db.prepare(`SELECT id FROM objectives WHERE id = ? AND is_active = 1 AND (workspace_id = ? OR workspace_id IS NULL)`).get(recRow.objective_id, workspaceId) as { id: string } | undefined;
      if (!validObj) return { error: 'Recommendation objective is not valid for this workspace', code: 'BAD_REQUEST' };
      objectiveId = recRow.objective_id;
    } else {
      const sysObj = db.prepare("SELECT id FROM objectives WHERE id = 'obj_sys_sales' AND is_active = 1").get() as { id: string } | undefined;
      if (!sysObj) return { error: 'System sales objective not found', code: 'NOT_FOUND' };
      objectiveId = sysObj.id;
    }

    const talkingPoints = recRow.talking_points_json ? JSON.parse(recRow.talking_points_json) as string[] : [];
    const brandKit = JSON.parse(entity.brand_kit || '{}') as { brandBrain?: Record<string, unknown> };
    const brandBrain = brandKit.brandBrain ?? {};

    // Try to expand talking points via AI into a richer founder script
    let content: unknown;
    let aiGenerated = false;
    const founderContent = {
      kind: 'TALKING_POINTS',
      hook: recRow.hook ?? 'Start with something honest and personal',
      talkingPoints,
      angle: recRow.angle ?? null,
      cta: recRow.cta ?? null,
      suggestedDurationSeconds: recRow.suggested_duration_seconds ?? 45,
    };

    if (aiOrchestrator.isAvailable() && talkingPoints.length > 0) {
      try {
        const bb = brandBrain as { personality?: { traits?: string[] }; language?: { preferredWords?: string[]; bannedWords?: string[]; exampleCopy?: string }; audience?: { primaryAudience?: string } };
        const systemPrompt = `You are a brand voice coach for ${entity.name}. Expand founder talking points into a warm, authentic video script structure. Return ONLY valid JSON.`;
        const userPrompt = `Expand these talking points into a founder video script:
Hook: ${recRow.hook ?? 'Be authentic and personal'}
Angle: ${recRow.angle ?? 'Share a personal perspective on the shop'}
Talking points: ${talkingPoints.join('\n- ')}
Duration: ~${recRow.suggested_duration_seconds ?? 45} seconds
Brand traits: ${bb.personality?.traits?.join(', ') || 'authentic, warm, considered'}
Audience: ${bb.audience?.primaryAudience || 'fashion-conscious shoppers'}
${bb.language?.bannedWords?.length ? `Never use: ${bb.language.bannedWords.join(', ')}` : ''}

Return JSON:
{ "kind": "TALKING_POINTS", "hook": "string", "talkingPoints": ["string", ...], "angle": "string|null", "cta": "string|null", "suggestedDurationSeconds": number }`;

        const result = await aiOrchestrator.generate({
          workspaceId,
          taskType: 'CREATIVE_COPY',
          scope: 'FOUNDER',
          knowledgeDomains: ['BRAND_CORE', 'VOICE', 'CONTENT_PILLARS'],
          systemPrompt,
          userPrompt,
          model: aiEnv.revisionModel,
          maxTokens: 1000,
        });
        const parsed = JSON.parse(result.content) as Record<string, unknown>;
        if (parsed.kind === 'TALKING_POINTS' && Array.isArray(parsed.talkingPoints)) {
          content = parsed;
          aiGenerated = true;
        } else {
          content = founderContent;
        }
      } catch {
        content = founderContent;
      }
    } else {
      content = founderContent;
    }

    const now = new Date().toISOString();
    const campaignId = `campaign_${randomUUID()}`;
    const planId = `plan_${randomUUID()}`;
    const planApprovalId = `plnapp_${randomUUID()}`;
    const contentPlanId = `cp_${randomUUID()}`;
    const contentPlanApprovalId = `cpapp_${randomUUID()}`;
    const deliverableId = `del_${randomUUID()}`;
    const conceptId = `con_${randomUUID()}`;
    const artifactId = `cart_${randomUUID()}`;
    const contentKey = 'founder-talking-points';
    const campaignName = recRow.title;
    const quality = JSON.stringify({ passed: true, checks: [], warnings: [] });

    const contentPlanBody = JSON.stringify({
      summary: {
        campaignNarrative: campaignName,
        contentStrategy: 'Founder-voice talking points for video/story content',
      },
      concepts: [{ id: conceptId, contentKey, name: 'Founder Content', strategicPurpose: 'Build connection through founder voice', coreMessage: recRow.hook ?? 'A personal note', proofPoints: [] }],
      deliverables: [{
        id: deliverableId, contentKey, title: campaignName, purpose: 'Build audience connection',
        campaignRole: 'Brand voice', channel: 'INSTAGRAM', contentType: 'TALKING_POINTS', format: 'VERTICAL_9_16',
        objectiveRole: 'Build brand trust', primaryMessage: recRow.summary,
        supportingMessages: talkingPoints, proofPoints: [],
        creativeDirection: null,
        assetRequirements: [],
        sourceConceptId: conceptId,
      }],
      cadence: { phases: [] },
    });

    db.transaction(() => {
      db.prepare(`
        INSERT INTO campaigns (id, workspace_id, objective_id, recommendation_id, name, status, source_type, source_title, channels, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'DRAFTING', 'FOUNDER_CONTENT', ?, ?, ?, ?)
      `).run(campaignId, workspaceId, objectiveId, recommendationId, campaignName, campaignName, JSON.stringify(['INSTAGRAM']), now, now);

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
        'Founder content', recRow.hook ?? 'Personal connection',
        'Founder brand voice', 'Existing and potential customers',
        JSON.stringify({ primary: recRow.cta ?? 'Engage', supporting: [] }),
        recRow.cta ?? 'Engage', 'Short-form video or story',
        null, 'Authentic founder voice', 'Engagement', 'reach',
        recRow.rationale,
        now, now,
      );

      db.prepare(`INSERT INTO plan_approvals (id, campaign_id, workspace_id, approved_plan_id, approved_version, approved_at, created_at) VALUES (?, ?, ?, ?, 1, ?, ?)`)
        .run(planApprovalId, campaignId, workspaceId, planId, now, now);

      db.prepare(`INSERT INTO content_plans (id, workspace_id, campaign_id, source_plan_id, source_plan_version, version, status, is_current, body, created_at, updated_at) VALUES (?, ?, ?, ?, 1, 1, 'APPROVED', 1, ?, ?, ?)`)
        .run(contentPlanId, workspaceId, campaignId, planId, contentPlanBody, now, now);

      db.prepare(`INSERT INTO content_plan_approvals (id, campaign_id, workspace_id, content_plan_id, content_plan_version, approved_at, created_at) VALUES (?, ?, ?, ?, 1, ?, ?)`)
        .run(contentPlanApprovalId, campaignId, workspaceId, contentPlanId, now, now);

      db.prepare(`
        INSERT INTO creative_artifacts
          (id, workspace_id, campaign_id, source_content_plan_id, source_content_plan_version,
           content_key, deliverable_id, version, status, is_current, channel, content_type, format,
           title, content, quality, marketing_scope, creative_direction, ai_provider, ai_model, ai_generated, ai_task_type, created_at, updated_at)
        VALUES (?, ?, ?, ?, 1, ?, ?, 1, 'READY_FOR_REVIEW', 1, 'INSTAGRAM', 'TALKING_POINTS', 'VERTICAL_9_16', ?, ?, ?, 'FOUNDER', ?, ?, ?, ?, ?, ?, ?)
      `).run(
        artifactId, workspaceId, campaignId, contentPlanId,
        contentKey, deliverableId,
        campaignName, JSON.stringify(content), quality,
        null,
        aiGenerated ? (aiEnv.provider ?? null) : null,
        aiGenerated ? (aiEnv.revisionModel ?? null) : null,
        aiGenerated ? 1 : 0,
        aiGenerated ? 'CREATIVE_COPY' : null,
        now, now,
      );

      // Atomically accept the recommendation
      db.prepare(`UPDATE marketing_recommendations SET status = 'ACCEPTED', accepted_campaign_id = ?, accepted_artifact_id = ?, accepted_at = ?, updated_at = ? WHERE id = ? AND workspace_id = ? AND status = 'NEW'`)
        .run(campaignId, artifactId, now, now, recommendationId, workspaceId);
    })();

    const artifactRow = db.prepare('SELECT * FROM creative_artifacts WHERE id = ?').get(artifactId) as {
      id: string; workspace_id: string; campaign_id: string; source_content_plan_id: string;
      source_content_plan_version: number; content_key: string; deliverable_id: string; version: number;
      status: string; is_current: number; channel: string; content_type: string; format: string;
      title: string | null; content: string; quality: string; created_at: string; updated_at: string;
    };

    return {
      campaignId, campaignName, contentKey,
      artifact: {
        id: artifactRow.id, workspaceId: artifactRow.workspace_id, campaignId: artifactRow.campaign_id,
        sourceContentPlanId: artifactRow.source_content_plan_id, sourceContentPlanVersion: artifactRow.source_content_plan_version,
        contentKey: artifactRow.content_key, deliverableId: artifactRow.deliverable_id, version: artifactRow.version,
        channel: artifactRow.channel, contentType: artifactRow.content_type, format: artifactRow.format,
        title: artifactRow.title, content: JSON.parse(artifactRow.content) as unknown, quality: JSON.parse(artifactRow.quality) as unknown,
        status: artifactRow.status, isCurrent: artifactRow.is_current === 1,
        createdAt: artifactRow.created_at, updatedAt: artifactRow.updated_at,
      },
      products: [],
      aiGenerated,
      creativeDirection: null,
    };
  }
}

export const operatorStudioService = new OperatorStudioService();

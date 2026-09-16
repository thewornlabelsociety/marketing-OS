import { randomUUID } from 'crypto';
import { db } from '../../db/database';
import { aiEnv } from '../../config/aiEnvironment';
import { aiOrchestrator } from '../intelligence/AIOrchestrator';
import type { MarketingRecommendationRow } from '../../types/marketingRecommendations';
import { findDestination } from '../../types/studioDestinations';
import { getCoreRepositories } from '../../db/core/createCoreRepositories';

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

function destMeta(channel: string, contentType: string): { channel: string; contentType: string; format: string } {
  const d = findDestination(channel, contentType);
  if (!d) throw new Error(`No CREATIVE_DESTINATIONS entry for ${channel}/${contentType}`);
  return { channel: d.channel, contentType: d.contentType, format: d.format };
}

const FORMAT_META: Record<SingleFormat, { channel: string; contentType: string; format: string; contentKey: string; title: string }> = {
  POST:     { ...destMeta('INSTAGRAM', 'STATIC_POST'), contentKey: 'new-arrivals-ig-post',     title: 'New Arrivals — Instagram Post' },
  CAROUSEL: { ...destMeta('INSTAGRAM', 'CAROUSEL'),    contentKey: 'new-arrivals-ig-carousel',  title: 'New Arrivals — Instagram Carousel' },
  STORY:    { ...destMeta('INSTAGRAM', 'STORY'),        contentKey: 'new-arrivals-ig-story',    title: 'New Arrivals — Instagram Story' },
  EMAIL:    { ...destMeta('EMAIL',     'EMAIL'),         contentKey: 'new-arrivals-email',       title: 'New Arrivals — Email' },
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

    const repos = getCoreRepositories();

    const entity = await repos.workspace.findById(workspaceId);
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
        const validObjective = await repos.objective.findForCampaignValidation(recRow.objective_id);
        if (!validObjective || (validObjective.workspace_id !== null && validObjective.workspace_id !== workspaceId)) {
          return { error: 'Recommendation objective is not valid for this workspace', code: 'BAD_REQUEST' };
        }
        objectiveId = recRow.objective_id;
      } else {
        const sysObj = await repos.objective.findForCampaignValidation('obj_sys_sales');
        if (!sysObj) return { error: 'System sales objective not found', code: 'NOT_FOUND' };
        objectiveId = sysObj.id;
      }
    } else {
      const objective = await repos.objective.findForCampaignValidation('obj_sys_sales');
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
      } catch (err) {
        console.warn('[OperatorStudio] AI generation failed; deterministic fallback used', {
          task: 'CREATIVE_COPY', workspace: workspaceId, provider: aiEnv.provider,
          errorStatus: (err as { response?: { status?: number } })?.response?.status,
          errorMessage: (err as Error).message?.slice(0, 120),
        });
        content = templateContent(products, format, creativeDirection);
      }
    } else {
      content = templateContent(products, format, creativeDirection);
    }

    const quality = JSON.stringify({ passed: true, checks: [], warnings: [] });

    // Core writes via repository — no longer in a single transaction.
    // TRANSACTION BOUNDARY: marketing_recommendations update (below) is non-atomic with these core writes.
    await repos.campaign.create({
      id: campaignId, workspaceId, objectiveId, recommendationId,
      name: campaignName, sourceType: 'INVENTORY_BATCH', sourceId: null,
      sourceTitle: campaignName, sourceDescription: null, sourceMetadata: {},
      brief: null, channels: [meta.channel], createdAt: now, updatedAt: now,
    });

    await repos.planning.plan.insert({
      id: planId, campaignId, workspaceId, version: 1, status: 'APPROVED', isCurrent: true,
      data: {
        strategy: {
          campaignAngle: 'New Arrivals showcase',
          coreMessage: 'Fresh curated finds ready to market',
          proposition: 'Curated pre-loved fashion',
          audienceFocus: 'Fashion-conscious shoppers',
        },
        hooks: { primary: `Shop ${campaignName}`, supporting: [] },
        proofPoints: [],
        callToAction: { primary: `Shop ${campaignName}`, alternatives: [] },
        channels: [],
        contentMix: [],
        cadence: { summary: 'Immediate publishing', duration: null },
        creativeDirection: {
          visualDirection: creativeDirection ? `${creativeDirection} direction — ${meta.channel}` : 'Editorial, clean product focus',
          copyDirection: 'Brand-authentic, product-specific',
        },
        measurement: { objective: 'Sales', primaryKpi: 'conversions', supportingKpis: [] },
        rationale: { summary: 'Operator-selected new arrivals for immediate publishing' },
      },
      createdAt: now, updatedAt: now,
    });

    await repos.planning.approval.upsertByCampaignId({
      id: planApprovalId, campaignId, workspaceId,
      approvedPlanId: planId, approvedVersion: 1,
      approvedAt: now, createdAt: now,
    });

    await repos.contentPlanning.plan.insert({
      id: contentPlanId, workspaceId, campaignId,
      sourcePlanId: planId, sourcePlanVersion: 1,
      version: 1, status: 'APPROVED', body: contentPlanBody,
      createdAt: now, updatedAt: now,
    });

    await repos.contentPlanning.approval.upsertByCampaignId({
      id: contentPlanApprovalId, campaignId, workspaceId,
      contentPlanId, contentPlanVersion: 1,
      approvedAt: now, createdAt: now,
    });

    const artifact = await repos.creative.artifact.insert({
      id: artifactId, workspaceId, campaignId,
      sourceContentPlanId: contentPlanId, sourceContentPlanVersion: 1,
      contentKey, deliverableId, version: 1, status: 'READY_FOR_REVIEW',
      channel: meta.channel, contentType: meta.contentType, format: meta.format,
      title: meta.title, content: JSON.stringify(content), quality,
      creativeDirection: creativeDirection ?? null,
      aiProvider: aiGenerated ? (aiEnv.provider ?? null) : null,
      aiModel: aiGenerated ? (aiEnv.revisionModel ?? null) : null,
      aiGenerated,
      aiTaskType: aiGenerated ? 'CREATIVE_COPY' : null,
      createdAt: now, updatedAt: now,
    });

    for (let position = 0; position < sourceRows.length; position++) {
      await repos.creative.sourceLink.insert(artifactId, sourceRows[position].id, position, now);
    }

    // Non-core write: update marketing_recommendations (non-atomic with core writes above)
    if (recommendationId) {
      db.prepare(`UPDATE marketing_recommendations SET status = 'ACCEPTED', accepted_campaign_id = ?, accepted_artifact_id = ?, accepted_at = ?, updated_at = ? WHERE id = ? AND workspace_id = ? AND status = 'NEW'`)
        .run(campaignId, artifactId, now, now, recommendationId, workspaceId);
    }

    return {
      campaignId, campaignName, contentKey,
      artifact: {
        id: artifact.id, workspaceId: artifact.workspaceId, campaignId: artifact.campaignId,
        sourceContentPlanId: artifact.sourceContentPlanId, sourceContentPlanVersion: artifact.sourceContentPlanVersion,
        contentKey: artifact.contentKey, deliverableId: artifact.deliverableId, version: artifact.version,
        channel: artifact.channel, contentType: artifact.contentType, format: artifact.format,
        title: artifact.title ?? null, content: artifact.content, quality: artifact.quality,
        status: artifact.status, isCurrent: artifact.isCurrent,
        createdAt: artifact.createdAt, updatedAt: artifact.updatedAt,
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

    const repos = getCoreRepositories();

    const entity = await repos.workspace.findById(workspaceId);
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
        const validObj = await repos.objective.findForCampaignValidation(recRowWS.objective_id);
        if (!validObj || (validObj.workspace_id !== null && validObj.workspace_id !== workspaceId)) {
          return { error: 'Recommendation objective is not valid for this workspace', code: 'BAD_REQUEST' };
        }
        objectiveIdWS = recRowWS.objective_id;
      } else {
        const sysObj = await repos.objective.findForCampaignValidation('obj_sys_sales');
        if (!sysObj) return { error: 'System sales objective not found', code: 'NOT_FOUND' };
        objectiveIdWS = sysObj.id;
      }
    } else {
      const objective = await repos.objective.findForCampaignValidation('obj_sys_sales');
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
        } catch (err) {
          console.warn('[OperatorStudio] AI generation failed; deterministic fallback used', {
            task: 'CREATIVE_WHOLE_SET', format: fmt, workspace: workspaceId, provider: aiEnv.provider,
            errorStatus: (err as { response?: { status?: number } })?.response?.status,
            errorMessage: (err as Error).message?.slice(0, 120),
          });
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

    // Core writes via repository — no longer in a single transaction.
    // TRANSACTION BOUNDARY: marketing_recommendations update (below) is non-atomic with these core writes.
    await repos.campaign.create({
      id: campaignId, workspaceId, objectiveId: objectiveIdWS, recommendationId,
      name: campaignName, sourceType: 'INVENTORY_BATCH', sourceId: null,
      sourceTitle: campaignName, sourceDescription: null, sourceMetadata: {},
      brief: null, channels: ['INSTAGRAM', 'EMAIL'], createdAt: now, updatedAt: now,
    });

    await repos.planning.plan.insert({
      id: planId, campaignId, workspaceId, version: 1, status: 'APPROVED', isCurrent: true,
      data: {
        strategy: {
          campaignAngle: 'New Arrivals full-set showcase',
          coreMessage: 'Fresh curated finds — full channel set',
          proposition: 'Curated pre-loved fashion',
          audienceFocus: 'Fashion-conscious shoppers',
        },
        hooks: { primary: `Shop ${campaignName}`, supporting: [] },
        proofPoints: [],
        callToAction: { primary: `Shop ${campaignName}`, alternatives: [] },
        channels: [],
        contentMix: [],
        cadence: { summary: 'Immediate publishing across all channels', duration: null },
        creativeDirection: {
          visualDirection: creativeDirection ? `${creativeDirection} direction` : 'Editorial, clean product focus',
          copyDirection: 'Brand-authentic, product-specific',
        },
        measurement: { objective: 'Sales', primaryKpi: 'conversions', supportingKpis: [] },
        rationale: { summary: 'Full-set new arrivals for immediate publishing' },
      },
      createdAt: now, updatedAt: now,
    });

    await repos.planning.approval.upsertByCampaignId({
      id: planApprovalId, campaignId, workspaceId,
      approvedPlanId: planId, approvedVersion: 1,
      approvedAt: now, createdAt: now,
    });

    await repos.contentPlanning.plan.insert({
      id: contentPlanId, workspaceId, campaignId,
      sourcePlanId: planId, sourcePlanVersion: 1,
      version: 1, status: 'APPROVED', body: contentPlanBody,
      createdAt: now, updatedAt: now,
    });

    await repos.contentPlanning.approval.upsertByCampaignId({
      id: contentPlanApprovalId, campaignId, workspaceId,
      contentPlanId, contentPlanVersion: 1,
      approvedAt: now, createdAt: now,
    });

    const insertedArtifacts: Array<{ fmt: SingleFormat; contentKey: string; artifact: StudioSetupResult['artifact'] }> = [];
    for (const { fmt, deliverableId, artifactId } of formatIds) {
      const meta = FORMAT_META[fmt];
      const artifact = await repos.creative.artifact.insert({
        id: artifactId, workspaceId, campaignId,
        sourceContentPlanId: contentPlanId, sourceContentPlanVersion: 1,
        contentKey: meta.contentKey, deliverableId, version: 1, status: 'READY_FOR_REVIEW',
        channel: meta.channel, contentType: meta.contentType, format: meta.format,
        title: meta.title, content: JSON.stringify(formatContents[fmt]), quality,
        creativeDirection: creativeDirection ?? null,
        aiProvider: aiGenerated ? (aiEnv.provider ?? null) : null,
        aiModel: aiGenerated ? (aiEnv.revisionModel ?? null) : null,
        aiGenerated,
        aiTaskType: aiGenerated ? 'CREATIVE_WHOLE_SET' : null,
        createdAt: now, updatedAt: now,
      });

      for (let position = 0; position < sourceRows.length; position++) {
        await repos.creative.sourceLink.insert(artifactId, sourceRows[position].id, position, now);
      }

      insertedArtifacts.push({
        fmt,
        contentKey: meta.contentKey,
        artifact: {
          id: artifact.id, workspaceId: artifact.workspaceId, campaignId: artifact.campaignId,
          sourceContentPlanId: artifact.sourceContentPlanId, sourceContentPlanVersion: artifact.sourceContentPlanVersion,
          contentKey: artifact.contentKey, deliverableId: artifact.deliverableId, version: artifact.version,
          channel: artifact.channel, contentType: artifact.contentType, format: artifact.format,
          title: artifact.title ?? null, content: artifact.content, quality: artifact.quality,
          status: artifact.status, isCurrent: artifact.isCurrent,
          createdAt: artifact.createdAt, updatedAt: artifact.updatedAt,
        },
      });
    }

    // Non-core write: update marketing_recommendations (non-atomic with core writes above)
    if (recommendationId) {
      const firstArtifactId = formatIds[0]?.artifactId ?? null;
      db.prepare(`UPDATE marketing_recommendations SET status = 'ACCEPTED', accepted_campaign_id = ?, accepted_artifact_id = ?, accepted_at = ?, updated_at = ? WHERE id = ? AND workspace_id = ? AND status = 'NEW'`)
        .run(campaignId, firstArtifactId, now, now, recommendationId, workspaceId);
    }

    const formats: WholeSetFormatResult[] = insertedArtifacts.map(({ fmt, contentKey, artifact }) => ({
      format: fmt,
      contentKey,
      artifact,
    }));

    return { campaignId, campaignName, formats, products, aiGenerated, creativeDirection };
  }

  async setupFounderContent(params: {
    workspaceId: string;
    recommendationId: string;
  }): Promise<StudioSetupResult | ServiceError> {
    const { workspaceId, recommendationId } = params;
    if (!workspaceId) return { error: 'workspaceId is required', code: 'BAD_REQUEST' };
    if (!recommendationId) return { error: 'recommendationId is required for founder content', code: 'BAD_REQUEST' };

    const repos = getCoreRepositories();

    const entity = await repos.workspace.findById(workspaceId);
    if (!entity) return { error: 'Workspace not found', code: 'NOT_FOUND' };

    const recRow = db.prepare('SELECT * FROM marketing_recommendations WHERE id = ? AND workspace_id = ?').get(recommendationId, workspaceId) as MarketingRecommendationRow | null;
    if (!recRow) return { error: 'Recommendation not found', code: 'NOT_FOUND' };
    if (recRow.status !== 'NEW') return { error: 'Recommendation is no longer available', code: 'CONFLICT' };

    // Resolve objective from recommendation lineage
    let objectiveId: string;
    if (recRow.objective_id) {
      const validObj = await repos.objective.findForCampaignValidation(recRow.objective_id);
      if (!validObj || (validObj.workspace_id !== null && validObj.workspace_id !== workspaceId)) {
        return { error: 'Recommendation objective is not valid for this workspace', code: 'BAD_REQUEST' };
      }
      objectiveId = recRow.objective_id;
    } else {
      const sysObj = await repos.objective.findForCampaignValidation('obj_sys_sales');
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
      } catch (err) {
        console.warn('[OperatorStudio] AI generation failed; deterministic fallback used', {
          task: 'CREATIVE_COPY', scope: 'FOUNDER', workspace: workspaceId, provider: aiEnv.provider,
          errorStatus: (err as { response?: { status?: number } })?.response?.status,
          errorMessage: (err as Error).message?.slice(0, 120),
        });
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

    // Core writes via repository — no longer in a single transaction.
    // TRANSACTION BOUNDARY: marketing_recommendations update (below) is non-atomic with these core writes.
    await repos.campaign.create({
      id: campaignId, workspaceId, objectiveId, recommendationId,
      name: campaignName, sourceType: 'FOUNDER_CONTENT', sourceId: null,
      sourceTitle: campaignName, sourceDescription: null, sourceMetadata: {},
      brief: null, channels: ['INSTAGRAM'], createdAt: now, updatedAt: now,
    });

    await repos.planning.plan.insert({
      id: planId, campaignId, workspaceId, version: 1, status: 'APPROVED', isCurrent: true,
      data: {
        strategy: {
          campaignAngle: 'Founder content',
          coreMessage: recRow.hook ?? 'Personal connection',
          proposition: 'Founder brand voice',
          audienceFocus: 'Existing and potential customers',
        },
        hooks: { primary: recRow.cta ?? 'Engage', supporting: [] },
        proofPoints: [],
        callToAction: { primary: recRow.cta ?? 'Engage', alternatives: [] },
        channels: [],
        contentMix: [],
        cadence: { summary: 'Short-form video or story', duration: null },
        creativeDirection: {
          visualDirection: 'Authentic founder voice',
          copyDirection: 'Authentic founder voice',
        },
        measurement: { objective: 'Engagement', primaryKpi: 'reach', supportingKpis: [] },
        rationale: { summary: recRow.rationale },
      },
      createdAt: now, updatedAt: now,
    });

    await repos.planning.approval.upsertByCampaignId({
      id: planApprovalId, campaignId, workspaceId,
      approvedPlanId: planId, approvedVersion: 1,
      approvedAt: now, createdAt: now,
    });

    await repos.contentPlanning.plan.insert({
      id: contentPlanId, workspaceId, campaignId,
      sourcePlanId: planId, sourcePlanVersion: 1,
      version: 1, status: 'APPROVED', body: contentPlanBody,
      createdAt: now, updatedAt: now,
    });

    await repos.contentPlanning.approval.upsertByCampaignId({
      id: contentPlanApprovalId, campaignId, workspaceId,
      contentPlanId, contentPlanVersion: 1,
      approvedAt: now, createdAt: now,
    });

    const artifact = await repos.creative.artifact.insert({
      id: artifactId, workspaceId, campaignId,
      sourceContentPlanId: contentPlanId, sourceContentPlanVersion: 1,
      contentKey, deliverableId, version: 1, status: 'READY_FOR_REVIEW',
      channel: 'INSTAGRAM', contentType: 'TALKING_POINTS', format: 'VERTICAL_9_16',
      title: campaignName, content: JSON.stringify(content), quality,
      marketingScope: 'FOUNDER',
      creativeDirection: null,
      aiProvider: aiGenerated ? (aiEnv.provider ?? null) : null,
      aiModel: aiGenerated ? (aiEnv.revisionModel ?? null) : null,
      aiGenerated,
      aiTaskType: aiGenerated ? 'CREATIVE_COPY' : null,
      createdAt: now, updatedAt: now,
    });

    // Non-core write: update marketing_recommendations (non-atomic with core writes above)
    db.prepare(`UPDATE marketing_recommendations SET status = 'ACCEPTED', accepted_campaign_id = ?, accepted_artifact_id = ?, accepted_at = ?, updated_at = ? WHERE id = ? AND workspace_id = ? AND status = 'NEW'`)
      .run(campaignId, artifactId, now, now, recommendationId, workspaceId);

    return {
      campaignId, campaignName, contentKey,
      artifact: {
        id: artifact.id, workspaceId: artifact.workspaceId, campaignId: artifact.campaignId,
        sourceContentPlanId: artifact.sourceContentPlanId, sourceContentPlanVersion: artifact.sourceContentPlanVersion,
        contentKey: artifact.contentKey, deliverableId: artifact.deliverableId, version: artifact.version,
        channel: artifact.channel, contentType: artifact.contentType, format: artifact.format,
        title: artifact.title ?? null, content: artifact.content, quality: artifact.quality,
        status: artifact.status, isCurrent: artifact.isCurrent,
        createdAt: artifact.createdAt, updatedAt: artifact.updatedAt,
      },
      products: [],
      aiGenerated,
      creativeDirection: null,
    };
  }

  async setupFromMedia(params: {
    workspaceId: string;
    mediaAssetId: string;
    brief: string;
    format?: SingleFormat;
    creativeDirection?: CreativeDirection | null;
  }): Promise<StudioSetupResult | ServiceError> {
    const { workspaceId, mediaAssetId, brief, format = 'POST', creativeDirection = null } = params;

    if (!workspaceId) return { error: 'workspaceId is required', code: 'BAD_REQUEST' };
    if (!mediaAssetId) return { error: 'mediaAssetId is required', code: 'BAD_REQUEST' };
    if (!brief?.trim()) return { error: 'brief is required', code: 'BAD_REQUEST' };
    if (!FORMAT_META[format]) return { error: `Invalid format. Use: ${SINGLE_FORMATS.join(', ')}`, code: 'BAD_REQUEST' };

    const repos = getCoreRepositories();

    const entity = await repos.workspace.findById(workspaceId);
    if (!entity) return { error: 'Workspace not found', code: 'NOT_FOUND' };

    const asset = db.prepare("SELECT id FROM media_assets WHERE id = ? AND workspace_id = ? AND status = 'ACTIVE'").get(mediaAssetId, workspaceId) as
      | { id: string } | undefined;
    if (!asset) return { error: 'Media asset not found or inactive', code: 'NOT_FOUND' };

    const objective = await repos.objective.findForCampaignValidation('obj_sys_sales');
    if (!objective) return { error: 'System sales objective not found. Database may need seeding.', code: 'NOT_FOUND' };

    const brandKit = JSON.parse(entity.brand_kit || '{}') as { brandBrain?: Record<string, unknown> };
    const brandBrain = brandKit.brandBrain ?? {};
    const market = (brandBrain as { identity?: { market?: string } }).identity?.market ?? null;
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

    const meta = FORMAT_META[format];
    const campaignName = brief.length > 60 ? brief.slice(0, 57) + '…' : brief;

    const now = new Date().toISOString();
    const campaignId = `campaign_${randomUUID()}`;
    const planId = `plan_${randomUUID()}`;
    const planApprovalId = `plnapp_${randomUUID()}`;
    const contentPlanId = `cp_${randomUUID()}`;
    const contentPlanApprovalId = `cpapp_${randomUUID()}`;
    const deliverableId = `del_${randomUUID()}`;
    const conceptId = `con_${randomUUID()}`;
    const artifactId = `cart_${randomUUID()}`;
    const contentKey = `media-${format.toLowerCase()}-${randomUUID().slice(0, 8)}`;

    const schemas: Record<SingleFormat, string> = {
      POST: `{ "kind": "STATIC_POST", "caption": "string (2-4 sentences with hashtags)", "hook": "string (scroll-stopping first line)", "cta": "string" }`,
      CAROUSEL: `{ "kind": "CAROUSEL", "caption": "string (opening caption with hashtags)", "slides": [{ "slideNumber": 1, "headline": "string (max 6 words)", "body": "string (1-2 sentences)" }], "cta": "string" }`,
      STORY: `{ "kind": "STORY", "frames": [{ "frameNumber": 1, "headline": "string (max 5 words)", "body": "string (1 sentence, optional)", "cta": "string (optional)" }] }`,
      EMAIL: `{ "kind": "EMAIL", "subject": "string", "preheader": "string (40-60 chars)", "headline": "string", "body": "string (2-3 paragraphs)", "cta": { "label": "string", "destinationDescription": "string" } }`,
    };

    const systemPrompt = `You are a marketing copywriter for ${entity.name}${market ? `, ${market}` : ''}.

ROLE: Write authentic, on-brand copy for content the operator has described. The image has already been chosen — focus entirely on the copy.

CRITICAL RULES:
1. Write copy based ONLY on the brief provided — never invent facts not stated.
2. Match the brand voice from the Brand Brain.
3. Copy must feel human and native — not like a generic advertisement.
4. Never use banned words/phrases if provided.
5. Return VALID JSON ONLY matching the required schema exactly.${directionSystemNote(creativeDirection)}`;

    const userPrompt = [
      '=== CONTENT BRIEF ===',
      brief.trim(),
      '',
      `=== ${entity.name.toUpperCase()} BRAND BRAIN ===`,
      brandLines || 'Match the existing brand personality and voice.',
      '',
      `=== FORMAT: ${meta.contentType} (${meta.channel}) ===`,
      '',
      '=== REQUIRED JSON SCHEMA ===',
      schemas[format],
      '',
      directionUserNote(creativeDirection),
    ].join('\n');

    let content: unknown;
    let aiGenerated = false;

    const briefWords = brief.trim().split(/\s+/).slice(0, 6).join(' ');
    const fallback: Record<SingleFormat, unknown> = {
      POST: { kind: 'STATIC_POST', caption: brief.trim(), hook: briefWords, cta: 'See more via link in bio' },
      CAROUSEL: { kind: 'CAROUSEL', caption: brief.trim(), slides: [{ slideNumber: 1, headline: briefWords, body: brief.trim() }], cta: 'See more via link in bio' },
      STORY: { kind: 'STORY', frames: [{ frameNumber: 1, headline: briefWords, body: brief.trim() }] },
      EMAIL: { kind: 'EMAIL', subject: briefWords, preheader: brief.trim().slice(0, 60), headline: briefWords, body: brief.trim(), cta: { label: 'See more', destinationDescription: 'Website' } },
    };

    if (aiOrchestrator.isAvailable()) {
      try {
        const result = await aiOrchestrator.generate({
          workspaceId,
          taskType: 'CREATIVE_COPY',
          scope: 'SHOP',
          knowledgeDomains: ['BRAND_CORE', 'VOICE'],
          systemPrompt,
          userPrompt,
          model: aiEnv.revisionModel,
          maxTokens: 2048,
        });
        content = JSON.parse(result.content) as unknown;
        aiGenerated = true;
      } catch {
        content = fallback[format];
      }
    } else {
      content = fallback[format];
    }

    const quality = JSON.stringify({ passed: true, checks: [], warnings: [] });

    const contentPlanBody = JSON.stringify({
      summary: { campaignNarrative: campaignName, contentStrategy: `Media-first ${meta.channel} content` },
      concepts: [{ id: conceptId, contentKey, name: 'Media post', strategicPurpose: 'Publish operator-selected image with on-brand copy', coreMessage: briefWords, proofPoints: [] }],
      deliverables: [{
        id: deliverableId, contentKey, title: campaignName, purpose: 'Publish media with on-brand copy',
        campaignRole: 'Primary post', channel: meta.channel, contentType: meta.contentType, format: meta.format,
        objectiveRole: 'Drive engagement', primaryMessage: brief.trim(),
        supportingMessages: [], proofPoints: [],
        creativeDirection: creativeDirection ?? 'Brand-authentic',
        assetRequirements: [{ id: 'req-1', type: 'IMAGE', description: 'Operator-selected image', required: true }],
        sourceConceptId: conceptId,
      }],
      cadence: { phases: [] },
    });

    // Core writes via repository
    await repos.campaign.create({
      id: campaignId, workspaceId, objectiveId: objective.id, recommendationId: null,
      name: campaignName, sourceType: 'MEDIA_UPLOAD', sourceId: null,
      sourceTitle: campaignName, sourceDescription: null, sourceMetadata: {},
      brief: null, channels: [meta.channel], createdAt: now, updatedAt: now,
    });

    await repos.planning.plan.insert({
      id: planId, campaignId, workspaceId, version: 1, status: 'APPROVED', isCurrent: true,
      data: {
        strategy: {
          campaignAngle: 'Media-first content',
          coreMessage: brief.trim(),
          proposition: 'Brand-authentic content',
          audienceFocus: 'Existing audience',
        },
        hooks: { primary: 'See more via link in bio', supporting: [] },
        proofPoints: [],
        callToAction: { primary: 'Immediate publishing', alternatives: [] },
        channels: [],
        contentMix: [],
        cadence: { summary: 'Immediate publishing', duration: null },
        creativeDirection: {
          visualDirection: creativeDirection ? `${creativeDirection} direction` : 'Brand-authentic visual',
          copyDirection: 'Brand voice, human copy',
        },
        measurement: { objective: 'Engagement', primaryKpi: 'engagement', supportingKpis: [] },
        rationale: { summary: 'Operator-selected image with AI copy' },
      },
      createdAt: now, updatedAt: now,
    });

    await repos.planning.approval.upsertByCampaignId({
      id: planApprovalId, campaignId, workspaceId,
      approvedPlanId: planId, approvedVersion: 1,
      approvedAt: now, createdAt: now,
    });

    await repos.contentPlanning.plan.insert({
      id: contentPlanId, workspaceId, campaignId,
      sourcePlanId: planId, sourcePlanVersion: 1,
      version: 1, status: 'APPROVED', body: contentPlanBody,
      createdAt: now, updatedAt: now,
    });

    await repos.contentPlanning.approval.upsertByCampaignId({
      id: contentPlanApprovalId, campaignId, workspaceId,
      contentPlanId, contentPlanVersion: 1,
      approvedAt: now, createdAt: now,
    });

    const artifact = await repos.creative.artifact.insert({
      id: artifactId, workspaceId, campaignId,
      sourceContentPlanId: contentPlanId, sourceContentPlanVersion: 1,
      contentKey, deliverableId, version: 1, status: 'READY_FOR_REVIEW',
      channel: meta.channel, contentType: meta.contentType, format: meta.format,
      title: campaignName, content: JSON.stringify(content), quality,
      mediaAssetId,
      creativeDirection: creativeDirection ?? null,
      aiProvider: aiGenerated ? (aiEnv.provider ?? null) : null,
      aiModel: aiGenerated ? (aiEnv.revisionModel ?? null) : null,
      aiGenerated,
      aiTaskType: aiGenerated ? 'CREATIVE_COPY' : null,
      createdAt: now, updatedAt: now,
    });

    return {
      campaignId, campaignName, contentKey,
      artifact: {
        id: artifact.id, workspaceId: artifact.workspaceId, campaignId: artifact.campaignId,
        sourceContentPlanId: artifact.sourceContentPlanId, sourceContentPlanVersion: artifact.sourceContentPlanVersion,
        contentKey: artifact.contentKey, deliverableId: artifact.deliverableId, version: artifact.version,
        channel: artifact.channel, contentType: artifact.contentType, format: artifact.format,
        title: artifact.title ?? null, content: artifact.content, quality: artifact.quality,
        status: artifact.status, isCurrent: artifact.isCurrent,
        createdAt: artifact.createdAt, updatedAt: artifact.updatedAt,
      },
      products: [],
      aiGenerated,
      creativeDirection,
    };
  }
}

export const operatorStudioService = new OperatorStudioService();

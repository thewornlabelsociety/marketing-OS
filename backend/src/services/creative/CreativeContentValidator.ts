import type { CreativeContent, CreativeQualityResult } from '../../types/creativeArtifact';
import type { ContentDeliverable } from '../../types/contentPlan';
import type { CampaignContext } from '../campaigns/CampaignContextBuilder';
import { validateChannelCombo } from '../channels/ChannelCapabilityRegistry';

const MAX_CAROUSEL_SLIDES = 10;

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeSlides(raw: unknown): { slideNumber: number; headline?: string; body?: string; visualDirection?: string }[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item, index) => {
    const slide = item as Record<string, unknown>;
    return {
      slideNumber: typeof slide.slideNumber === 'number' ? slide.slideNumber : index + 1,
      headline: asString(slide.headline) || undefined,
      body: asString(slide.body) || undefined,
      visualDirection: asString(slide.visualDirection) || undefined,
    };
  });
}

function normalizeFrames(raw: unknown) {
  if (!Array.isArray(raw)) return [];
  return raw.map((item, index) => {
    const frame = item as Record<string, unknown>;
    return {
      frameNumber: typeof frame.frameNumber === 'number' ? frame.frameNumber : index + 1,
      headline: asString(frame.headline) || undefined,
      body: asString(frame.body) || undefined,
      cta: asString(frame.cta) || undefined,
      visualDirection: asString(frame.visualDirection) || undefined,
    };
  });
}

function normalizeScenes(raw: unknown) {
  if (!Array.isArray(raw)) return [];
  return raw.map((item, index) => {
    const scene = item as Record<string, unknown>;
    return {
      sceneNumber: typeof scene.sceneNumber === 'number' ? scene.sceneNumber : index + 1,
      durationSeconds: typeof scene.durationSeconds === 'number' ? scene.durationSeconds : undefined,
      visualDirection: asString(scene.visualDirection),
      spokenCopy: asString(scene.spokenCopy) || undefined,
      onScreenText: asString(scene.onScreenText) || undefined,
    };
  });
}

export function contentKindForDeliverable(contentType: string): CreativeContent['kind'] {
  switch (contentType) {
    case 'CAROUSEL': return 'CAROUSEL';
    case 'STORY': return 'STORY';
    case 'SHORT_VIDEO': return 'SHORT_VIDEO';
    case 'LONG_VIDEO': return 'LONG_VIDEO';
    case 'NEWSLETTER': return 'NEWSLETTER';
    case 'EMAIL': return 'EMAIL';
    case 'ARTICLE': return 'ARTICLE';
    case 'LANDING_PAGE': return 'LANDING_PAGE';
    case 'DOCUMENT':
    case 'OTHER':
      return 'TEXT_POST';
    default:
      return 'STATIC_POST';
  }
}

export function normalizeCreativeContent(
  deliverable: ContentDeliverable,
  raw: Record<string, unknown>,
): CreativeContent {
  const expectedKind = contentKindForDeliverable(deliverable.contentType);
  const kind = asString(raw.kind) || expectedKind;

  switch (expectedKind) {
    case 'CAROUSEL':
      return {
        kind: 'CAROUSEL',
        caption: asString(raw.caption),
        slides: normalizeSlides(raw.slides),
        cta: asString(raw.cta) || undefined,
        visualDirection: asString(raw.visualDirection) || undefined,
      };
    case 'STORY':
      return {
        kind: 'STORY',
        frames: normalizeFrames(raw.frames),
      };
    case 'SHORT_VIDEO':
      return {
        kind: 'SHORT_VIDEO',
        title: asString(raw.title) || undefined,
        hook: asString(raw.hook),
        durationTargetSeconds: typeof raw.durationTargetSeconds === 'number' ? raw.durationTargetSeconds : undefined,
        scenes: normalizeScenes(raw.scenes),
        voiceover: asString(raw.voiceover) || undefined,
        caption: asString(raw.caption) || undefined,
        cta: asString(raw.cta) || undefined,
        shotRequirements: Array.isArray(raw.shotRequirements)
          ? (raw.shotRequirements as string[]).filter(Boolean)
          : undefined,
      };
    case 'LONG_VIDEO':
      return {
        kind: 'LONG_VIDEO',
        title: asString(raw.title),
        hook: asString(raw.hook) || undefined,
        outline: Array.isArray(raw.outline)
          ? (raw.outline as Record<string, unknown>[]).map((s, i) => ({
              sectionNumber: typeof s.sectionNumber === 'number' ? s.sectionNumber : i + 1,
              heading: asString(s.heading) || undefined,
              body: asString(s.body),
            }))
          : [],
        cta: asString(raw.cta) || undefined,
      };
    case 'NEWSLETTER':
      return {
        kind: 'NEWSLETTER',
        subject: asString(raw.subject),
        preheader: asString(raw.preheader) || undefined,
        sections: Array.isArray(raw.sections)
          ? (raw.sections as Record<string, unknown>[]).map((s) => ({
              heading: asString(s.heading) || undefined,
              body: asString(s.body),
            }))
          : [],
        cta: raw.cta && typeof raw.cta === 'object'
          ? { label: asString((raw.cta as Record<string, unknown>).label), destinationDescription: asString((raw.cta as Record<string, unknown>).destinationDescription) || undefined }
          : undefined,
        footerNotes: asString(raw.footerNotes) || undefined,
      };
    case 'EMAIL':
      return {
        kind: 'EMAIL',
        subject: asString(raw.subject),
        preheader: asString(raw.preheader) || undefined,
        headline: asString(raw.headline) || undefined,
        body: typeof raw.body === 'string'
          ? raw.body
          : raw.body && typeof raw.body === 'object' && Array.isArray((raw.body as Record<string, unknown>).sections)
            ? { sections: ((raw.body as Record<string, unknown>).sections as Record<string, unknown>[]).map((s) => ({
                heading: asString(s.heading) || undefined,
                body: asString(s.body),
              })) }
            : asString(raw.body),
        cta: raw.cta && typeof raw.cta === 'object'
          ? { label: asString((raw.cta as Record<string, unknown>).label), destinationDescription: asString((raw.cta as Record<string, unknown>).destinationDescription) || undefined }
          : undefined,
        footerNotes: asString(raw.footerNotes) || undefined,
      };
    case 'TEXT_POST':
      return {
        kind: 'TEXT_POST',
        hook: asString(raw.hook) || undefined,
        body: asString(raw.body),
        cta: asString(raw.cta) || undefined,
      };
    case 'ARTICLE':
      return {
        kind: 'ARTICLE',
        title: asString(raw.title),
        excerpt: asString(raw.excerpt) || undefined,
        sections: Array.isArray(raw.sections)
          ? (raw.sections as Record<string, unknown>[]).map((s) => ({
              heading: asString(s.heading) || undefined,
              body: asString(s.body),
            }))
          : [],
        cta: asString(raw.cta) || undefined,
      };
    case 'LANDING_PAGE': {
      const hero = (raw.hero ?? {}) as Record<string, unknown>;
      return {
        kind: 'LANDING_PAGE',
        hero: {
          eyebrow: asString(hero.eyebrow) || undefined,
          headline: asString(hero.headline),
          supportingText: asString(hero.supportingText) || undefined,
          cta: asString(hero.cta) || undefined,
        },
        sections: Array.isArray(raw.sections)
          ? (raw.sections as Record<string, unknown>[]).map((s) => ({
              heading: asString(s.heading) || undefined,
              body: asString(s.body),
            }))
          : [],
        closingCta: asString(raw.closingCta) || undefined,
      };
    }
    default:
      return {
        kind: 'STATIC_POST',
        headline: asString(raw.headline) || undefined,
        caption: asString(raw.caption),
        hook: asString(raw.hook) || undefined,
        cta: asString(raw.cta) || undefined,
        hashtags: Array.isArray(raw.hashtags) ? (raw.hashtags as string[]).filter(Boolean) : undefined,
        visualDirection: asString(raw.visualDirection) || undefined,
      };
  }
}

export function validateCreativeStructure(
  deliverable: ContentDeliverable,
  content: CreativeContent,
): string[] {
  const errors: string[] = [];

  errors.push(
    ...validateChannelCombo({
      channel: deliverable.channel,
      contentType: deliverable.contentType,
      format: deliverable.format,
      deviceTargets: deliverable.deviceTargets,
    }),
  );

  switch (content.kind) {
    case 'CAROUSEL':
      if (!content.slides.length) errors.push('Carousel requires at least one slide');
      if (content.slides.length > MAX_CAROUSEL_SLIDES) errors.push('Carousel cannot exceed 10 slides');
      if (!content.caption.trim()) errors.push('Carousel caption is required');
      break;
    case 'STORY':
      if (!content.frames.length) errors.push('Story requires at least one frame');
      break;
    case 'SHORT_VIDEO':
      if (!content.hook.trim()) errors.push('Short video hook is required');
      if (!content.scenes.length) errors.push('Short video requires at least one scene');
      break;
    case 'EMAIL':
      if (!content.subject.trim()) errors.push('Email subject is required');
      if (!content.body || (typeof content.body === 'string' && !content.body.trim())) errors.push('Email body is required');
      break;
    case 'NEWSLETTER':
      if (!content.subject.trim()) errors.push('Newsletter subject is required');
      if (!content.sections.length) errors.push('Newsletter requires at least one section');
      break;
    case 'TEXT_POST':
      if (!content.body.trim()) errors.push('Text post body is required');
      break;
    case 'ARTICLE':
      if (!content.title.trim()) errors.push('Article title is required');
      if (!content.sections.length) errors.push('Article requires at least one section');
      break;
    case 'LANDING_PAGE':
      if (!content.hero.headline.trim()) errors.push('Landing page hero headline is required');
      break;
    case 'STATIC_POST':
      if (!content.caption.trim()) errors.push('Static post caption is required');
      break;
    case 'LONG_VIDEO':
      if (!content.title.trim()) errors.push('Long video title is required');
      if (!content.outline.length) errors.push('Long video outline is required');
      break;
  }

  return errors;
}

export function runBrandChecks(
  campaignContext: CampaignContext,
  content: CreativeContent,
): CreativeQualityResult['checks'] {
  const checks: CreativeQualityResult['checks'] = [];
  const banned = [
    ...(campaignContext.brand.language.bannedWords ?? []),
    ...(campaignContext.brand.language.bannedPhrases ?? []),
  ].filter(Boolean);

  const textBlob = JSON.stringify(content).toLowerCase();
  for (const term of banned) {
    if (term && textBlob.includes(term.toLowerCase())) {
      checks.push({ key: 'brand_banned_term', status: 'FAIL', message: `Contains banned term: ${term}` });
    }
  }

  if (checks.length === 0) {
    checks.push({ key: 'brand_banned_terms', status: 'PASS' });
  }

  return checks;
}

export function attemptAutoRepair(content: CreativeContent): { content: CreativeContent; repaired: boolean } {
  let repaired = false;

  if (content.kind === 'CAROUSEL') {
    const slides = content.slides.map((slide, index) => {
      if (slide.slideNumber !== index + 1) {
        repaired = true;
        return { ...slide, slideNumber: index + 1 };
      }
      return slide;
    });
    if (repaired) return { content: { ...content, slides }, repaired: true };
  }

  if (content.kind === 'STORY') {
    const frames = content.frames.map((frame, index) => {
      if (frame.frameNumber !== index + 1) {
        repaired = true;
        return { ...frame, frameNumber: index + 1 };
      }
      return frame;
    });
    if (repaired) return { content: { ...content, frames }, repaired: true };
  }

  if (content.kind === 'SHORT_VIDEO') {
    const scenes = content.scenes.map((scene, index) => {
      if (scene.sceneNumber !== index + 1) {
        repaired = true;
        return { ...scene, sceneNumber: index + 1 };
      }
      return scene;
    });
    if (repaired) return { content: { ...content, scenes }, repaired: true };
  }

  return { content, repaired: false };
}

export function buildQualityResult(
  deliverable: ContentDeliverable,
  content: CreativeContent,
  campaignContext: CampaignContext,
): CreativeQualityResult {
  const structuralErrors = validateCreativeStructure(deliverable, content);
  const checks: CreativeQualityResult['checks'] = structuralErrors.map((message) => ({
    key: 'structure',
    status: 'FAIL' as const,
    message,
  }));

  if (!structuralErrors.length) {
    checks.push({ key: 'structure', status: 'PASS' });
  }

  checks.push(...runBrandChecks(campaignContext, content));
  checks.push({ key: 'objective_alignment', status: 'PASS', message: `Supports ${deliverable.objectiveRole}` });
  checks.push({ key: 'channel_capability', status: 'PASS' });

  const failed = checks.some((c) => c.status === 'FAIL');
  const warnings = checks.filter((c) => c.status === 'WARNING').map((c) => c.message ?? c.key);

  return {
    passed: !failed,
    checks,
    warnings,
  };
}

export function detectPlanningChangeRequest(requestText: string): boolean {
  const patterns = [
    /remove\s+tiktok/i,
    /replace\s+.*\s+with\s+email/i,
    /change\s+(the\s+)?campaign\s+objective/i,
    /remove\s+.*\s+from\s+the\s+campaign/i,
    /add\s+.*\s+channel/i,
    /drop\s+tiktok/i,
  ];
  return patterns.some((pattern) => pattern.test(requestText));
}

export function preserveCreativeSections(
  previous: CreativeContent,
  next: CreativeContent,
  targetHint?: string,
): CreativeContent {
  if (!targetHint) return next;

  const hint = targetHint.toLowerCase();
  if (previous.kind === 'CAROUSEL' && next.kind === 'CAROUSEL' && hint.includes('slide')) {
    const match = hint.match(/slide\s*(\d+)/i);
    const targetIndex = match ? Number(match[1]) - 1 : -1;
    if (targetIndex >= 0 && targetIndex < previous.slides.length && targetIndex < next.slides.length) {
      const slides = next.slides.map((slide, index) => (index === targetIndex ? slide : previous.slides[index]));
      return { ...next, slides };
    }
  }

  if (previous.kind === 'SHORT_VIDEO' && next.kind === 'SHORT_VIDEO' && hint.includes('hook')) {
    return { ...next, hook: next.hook || previous.hook };
  }

  return next;
}

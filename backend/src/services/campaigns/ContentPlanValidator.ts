import { randomUUID } from 'crypto';
import type { ContentConcept, ContentDeliverable, ContentPlan, ContentPlanCadence, ContentPlanSummary } from '../../types/contentPlan';
import { isMarketingChannel, validateChannelCombo } from '../channels/ChannelCapabilityRegistry';

export interface IncomingContentPlanBody {
  summary?: Partial<ContentPlanSummary>;
  concepts?: Array<Partial<ContentConcept> & Record<string, unknown>>;
  deliverables?: Array<Partial<ContentDeliverable> & Record<string, unknown>>;
  cadence?: Partial<ContentPlanCadence>;
  sourcePlanId?: string;
  sourcePlanVersion?: number;
}

export function preserveStableIds(
  previous: { concepts: ContentConcept[]; deliverables: ContentDeliverable[] } | null,
  nextConcepts: ContentConcept[],
  nextDeliverables: ContentDeliverable[],
): { concepts: ContentConcept[]; deliverables: ContentDeliverable[] } {
  const prevConceptByKey = new Map((previous?.concepts ?? []).map((c) => [c.contentKey, c]));
  const prevDeliverableByKey = new Map((previous?.deliverables ?? []).map((d) => [d.contentKey, d]));

  const concepts = nextConcepts.map((concept) => {
    const prev = prevConceptByKey.get(concept.contentKey);
    return prev ? { ...concept, id: prev.id } : concept;
  });

  const deliverables = nextDeliverables.map((deliverable) => {
    const prev = prevDeliverableByKey.get(deliverable.contentKey);
    return prev ? { ...deliverable, id: prev.id } : deliverable;
  });

  return { concepts, deliverables };
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string');
}

function slugKey(value: string, fallback: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
  return slug || fallback;
}

function normalizeConcept(raw: Partial<ContentConcept> & Record<string, unknown>, index: number): ContentConcept {
  const contentKey = typeof raw.contentKey === 'string' && raw.contentKey.trim()
    ? raw.contentKey.trim()
    : slugKey(String(raw.name ?? ''), `concept-${index + 1}`);

  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : `concept_${randomUUID()}`,
    contentKey,
    name: String(raw.name ?? contentKey),
    strategicPurpose: String(raw.strategicPurpose ?? ''),
    coreMessage: String(raw.coreMessage ?? ''),
    audienceNeed: typeof raw.audienceNeed === 'string' ? raw.audienceNeed : undefined,
    desiredResponse: typeof raw.desiredResponse === 'string' ? raw.desiredResponse : undefined,
    proofPoints: asStringArray(raw.proofPoints),
    hookDirection: typeof raw.hookDirection === 'string' ? raw.hookDirection : undefined,
    ctaDirection: typeof raw.ctaDirection === 'string' ? raw.ctaDirection : undefined,
    creativeIdea: typeof raw.creativeIdea === 'string' ? raw.creativeIdea : undefined,
    sequenceRole: typeof raw.sequenceRole === 'string' ? raw.sequenceRole : undefined,
  };
}

function normalizeDeliverable(
  raw: Partial<ContentDeliverable> & Record<string, unknown>,
  index: number,
): ContentDeliverable {
  const contentKey = typeof raw.contentKey === 'string' && raw.contentKey.trim()
    ? raw.contentKey.trim()
    : slugKey(String(raw.title ?? ''), `deliverable-${index + 1}`);

  const timingRaw = (raw.timing ?? {}) as Record<string, unknown>;

  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : `deliv_${randomUUID()}`,
    contentKey,
    title: String(raw.title ?? contentKey),
    purpose: String(raw.purpose ?? ''),
    campaignRole: String(raw.campaignRole ?? ''),
    journeyStage: typeof raw.journeyStage === 'string' ? raw.journeyStage : undefined,
    channel: String(raw.channel ?? '').toUpperCase() as ContentDeliverable['channel'],
    contentType: String(raw.contentType ?? '').toUpperCase() as ContentDeliverable['contentType'],
    format: String(raw.format ?? '').toUpperCase() as ContentDeliverable['format'],
    deviceTargets: Array.isArray(raw.deviceTargets)
      ? (raw.deviceTargets as string[]).map((d) => d.toLowerCase() as 'mobile' | 'desktop')
      : undefined,
    objectiveRole: String(raw.objectiveRole ?? ''),
    primaryMessage: String(raw.primaryMessage ?? ''),
    supportingMessages: asStringArray(raw.supportingMessages),
    hookDirection: typeof raw.hookDirection === 'string' ? raw.hookDirection : undefined,
    ctaRole: typeof raw.ctaRole === 'string' ? raw.ctaRole : undefined,
    proofPoints: asStringArray(raw.proofPoints),
    creativeDirection: String(raw.creativeDirection ?? ''),
    assetRequirements: Array.isArray(raw.assetRequirements)
      ? (raw.assetRequirements as ContentDeliverable['assetRequirements'])
      : [],
    sourceConceptId: typeof raw.sourceConceptId === 'string' ? raw.sourceConceptId : undefined,
    adaptationOf: typeof raw.adaptationOf === 'string' ? raw.adaptationOf : undefined,
    adaptationNotes: typeof raw.adaptationNotes === 'string' ? raw.adaptationNotes : undefined,
    sequence: typeof raw.sequence === 'number' ? raw.sequence : undefined,
    timing: {
      phase: typeof timingRaw.phase === 'string' ? timingRaw.phase : undefined,
      relativeOrder: typeof timingRaw.relativeOrder === 'number' ? timingRaw.relativeOrder : undefined,
      preferredDate: typeof timingRaw.preferredDate === 'string' ? timingRaw.preferredDate : undefined,
    },
    status: typeof raw.status === 'string' ? raw.status : undefined,
  };
}

export function validateAndNormalizeContentPlan(input: {
  body: IncomingContentPlanBody;
  expectedSourcePlanId: string;
  expectedSourcePlanVersion: number;
  previous?: Pick<ContentPlan, 'concepts' | 'deliverables'> | null;
}): { plan: Omit<ContentPlan, 'id' | 'workspaceId' | 'campaignId' | 'version' | 'status' | 'isCurrent' | 'createdAt' | 'updatedAt'> } | { errors: string[] } {
  const errors: string[] = [];
  const { body, expectedSourcePlanId, expectedSourcePlanVersion, previous } = input;

  if (body.sourcePlanId && body.sourcePlanId !== expectedSourcePlanId) {
    errors.push('sourcePlanId does not match the approved CampaignPlan');
  }
  if (body.sourcePlanVersion != null && body.sourcePlanVersion !== expectedSourcePlanVersion) {
    errors.push('sourcePlanVersion does not match the approved CampaignPlan version');
  }

  const summary: ContentPlanSummary = {
    campaignNarrative: String(body.summary?.campaignNarrative ?? ''),
    customerJourney: body.summary?.customerJourney,
    contentStrategy: String(body.summary?.contentStrategy ?? ''),
  };

  if (!summary.campaignNarrative.trim()) errors.push('summary.campaignNarrative is required');
  if (!summary.contentStrategy.trim()) errors.push('summary.contentStrategy is required');

  const rawConcepts = Array.isArray(body.concepts) ? body.concepts : [];
  const rawDeliverables = Array.isArray(body.deliverables) ? body.deliverables : [];

  if (rawConcepts.length === 0) errors.push('At least one content concept is required');
  if (rawDeliverables.length === 0) errors.push('At least one deliverable is required');

  let concepts = rawConcepts.map((c, i) => normalizeConcept(c, i));
  let deliverables = rawDeliverables.map((d, i) => normalizeDeliverable(d, i));

  const preserved = preserveStableIds(previous ?? null, concepts, deliverables);
  concepts = preserved.concepts;
  deliverables = preserved.deliverables;

  const conceptKeys = new Set<string>();
  const conceptIds = new Set<string>();
  const conceptKeysById = new Map<string, string>();

  for (const concept of concepts) {
    if (!concept.strategicPurpose.trim() || !concept.coreMessage.trim()) {
      errors.push(`Concept ${concept.contentKey} is missing purpose or core message`);
    }
    if (conceptKeys.has(concept.contentKey)) {
      errors.push(`Duplicate concept contentKey: ${concept.contentKey}`);
    }
    conceptKeys.add(concept.contentKey);
    conceptIds.add(concept.id);
    conceptKeysById.set(concept.id, concept.contentKey);
    conceptKeysById.set(concept.contentKey, concept.contentKey);
  }

  const deliverableKeys = new Set<string>();
  const deliverableIds = new Set<string>();
  const deliverableKeysByRef = new Map<string, string>();

  for (const deliverable of deliverables) {
    if (deliverableKeys.has(deliverable.contentKey)) {
      errors.push(`Duplicate deliverable contentKey: ${deliverable.contentKey}`);
    }
    deliverableKeys.add(deliverable.contentKey);
    deliverableIds.add(deliverable.id);
    deliverableKeysByRef.set(deliverable.id, deliverable.contentKey);
    deliverableKeysByRef.set(deliverable.contentKey, deliverable.contentKey);

    if (!deliverable.purpose.trim()) errors.push(`Deliverable ${deliverable.contentKey} is missing purpose`);
    if (!deliverable.objectiveRole.trim()) errors.push(`Deliverable ${deliverable.contentKey} is missing objectiveRole`);
    if (!isMarketingChannel(deliverable.channel)) {
      errors.push(`Deliverable ${deliverable.contentKey} has unrecognized channel ${deliverable.channel}`);
    } else {
      errors.push(
        ...validateChannelCombo({
          channel: deliverable.channel,
          contentType: deliverable.contentType,
          format: deliverable.format,
          deviceTargets: deliverable.deviceTargets,
        }).map((e) => `${deliverable.contentKey}: ${e}`),
      );
    }

    if (deliverable.sourceConceptId) {
      const resolves = conceptIds.has(deliverable.sourceConceptId) || conceptKeys.has(deliverable.sourceConceptId);
      if (!resolves) {
        errors.push(`Deliverable ${deliverable.contentKey} references unknown sourceConceptId ${deliverable.sourceConceptId}`);
      }
    }

    if (deliverable.sequence != null && (deliverable.sequence < 1 || !Number.isFinite(deliverable.sequence))) {
      errors.push(`Deliverable ${deliverable.contentKey} has invalid sequence`);
    }
  }

  for (const deliverable of deliverables) {
    if (deliverable.adaptationOf) {
      const resolves = deliverableIds.has(deliverable.adaptationOf) || deliverableKeys.has(deliverable.adaptationOf);
      if (!resolves) {
        errors.push(`Deliverable ${deliverable.contentKey} references unknown adaptationOf ${deliverable.adaptationOf}`);
      }
    }
  }

  const cadence: ContentPlanCadence = {
    startDate: body.cadence?.startDate,
    endDate: body.cadence?.endDate,
    phases: Array.isArray(body.cadence?.phases) ? body.cadence!.phases : [],
    notes: body.cadence?.notes,
  };

  if (errors.length > 0) return { errors };

  return {
    plan: {
      sourcePlanId: expectedSourcePlanId,
      sourcePlanVersion: expectedSourcePlanVersion,
      summary,
      concepts,
      cadence,
      deliverables,
    },
  };
}

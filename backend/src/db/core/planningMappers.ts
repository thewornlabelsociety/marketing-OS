import type { AssembledBrief, CampaignPlan } from './planningDomainTypes';
export interface BriefRow {
  id: string;
  campaign_id: string;
  workspace_id: string;
  source_summary: string | null;
  objective_summary: string | null;
  audience_description: string | null;
  audience_segment: string | null;
  audience_problem: string | null;
  audience_desire: string | null;
  proposition: string | null;
  key_details: string;
  offer_description: string | null;
  offer_value: string | null;
  offer_urgency: string | null;
  offer_constraints: string;
  timing_start_date: string | null;
  timing_end_date: string | null;
  timing_important_dates: string;
  constraints: string;
  additional_context: string | null;
  completeness_status: string;
  completeness_missing_fields: string;
  created_at: string;
  updated_at: string;
}

export interface PlanRow {
  id: string;
  campaign_id: string;
  workspace_id: string;
  version: number;
  status: string;
  is_current: number;
  strategy_campaign_angle: string | null;
  strategy_core_message: string | null;
  strategy_proposition: string | null;
  strategy_audience_focus: string | null;
  hooks: string;
  proof_points: string;
  cta_primary: string | null;
  cta_alternatives: string;
  channels: string;
  content_mix: string;
  cadence_summary: string | null;
  cadence_duration: string | null;
  creative_visual_direction: string | null;
  creative_photography_direction: string | null;
  creative_video_direction: string | null;
  creative_copy_direction: string | null;
  measurement_objective: string | null;
  measurement_primary_kpi: string | null;
  measurement_supporting_kpis: string;
  measurement_conversion_event: string | null;
  rationale_summary: string | null;
  created_at: string;
  updated_at: string;
}

export function mapBriefRow(r: BriefRow): AssembledBrief {
  return {
    id: r.id,
    campaignId: r.campaign_id,
    workspaceId: r.workspace_id,
    sourceSummary: r.source_summary,
    objectiveSummary: r.objective_summary,
    audienceDescription: r.audience_description,
    audienceSegment: r.audience_segment,
    audienceProblem: r.audience_problem,
    audienceDesire: r.audience_desire,
    proposition: r.proposition,
    keyDetails: JSON.parse(r.key_details || '[]') as string[],
    offerDescription: r.offer_description,
    offerValue: r.offer_value,
    offerUrgency: r.offer_urgency,
    offerConstraints: JSON.parse(r.offer_constraints || '[]') as string[],
    timingStartDate: r.timing_start_date,
    timingEndDate: r.timing_end_date,
    timingImportantDates: JSON.parse(r.timing_important_dates || '[]') as string[],
    constraints: JSON.parse(r.constraints || '[]') as string[],
    additionalContext: r.additional_context,
    completenessStatus: r.completeness_status as AssembledBrief['completenessStatus'],
    completenessMissingFields: JSON.parse(r.completeness_missing_fields || '[]') as string[],
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function mapPlanRow(r: PlanRow): CampaignPlan {
  return {
    id: r.id,
    campaignId: r.campaign_id,
    workspaceId: r.workspace_id,
    version: r.version,
    status: r.status,
    isCurrent: r.is_current === 1,
    strategy: {
      campaignAngle: r.strategy_campaign_angle ?? '',
      coreMessage: r.strategy_core_message ?? '',
      proposition: r.strategy_proposition ?? '',
      audienceFocus: r.strategy_audience_focus ?? '',
    },
    hooks: JSON.parse(r.hooks || '{"primary":"","supporting":[]}') as CampaignPlan['hooks'],
    proofPoints: JSON.parse(r.proof_points || '[]') as string[],
    callToAction: {
      primary: r.cta_primary ?? '',
      alternatives: JSON.parse(r.cta_alternatives || '[]') as string[],
    },
    channels: JSON.parse(r.channels || '[]') as CampaignPlan['channels'],
    contentMix: JSON.parse(r.content_mix || '[]') as CampaignPlan['contentMix'],
    cadence: {
      summary: r.cadence_summary ?? '',
      duration: r.cadence_duration ?? null,
    },
    creativeDirection: {
      visualDirection: r.creative_visual_direction ?? '',
      photographyDirection: r.creative_photography_direction ?? null,
      videoDirection: r.creative_video_direction ?? null,
      copyDirection: r.creative_copy_direction ?? '',
    },
    measurement: {
      objective: r.measurement_objective ?? '',
      primaryKpi: r.measurement_primary_kpi ?? '',
      supportingKpis: JSON.parse(r.measurement_supporting_kpis || '[]') as string[],
      conversionEvent: r.measurement_conversion_event ?? null,
    },
    rationale: {
      summary: r.rationale_summary ?? '',
    },
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function planInsertParams(input: {
  id: string;
  campaignId: string;
  workspaceId: string;
  version: number;
  status: string;
  isCurrent: boolean;
  data: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}): unknown[] {
  const strategy = (input.data.strategy ?? {}) as Record<string, unknown>;
  const hooks = (input.data.hooks ?? { primary: '', supporting: [] }) as object;
  const cta = (input.data.callToAction ?? {}) as Record<string, unknown>;
  const cadence = (input.data.cadence ?? {}) as Record<string, unknown>;
  const creative = (input.data.creativeDirection ?? {}) as Record<string, unknown>;
  const measurement = (input.data.measurement ?? {}) as Record<string, unknown>;
  const rationale = (input.data.rationale ?? {}) as Record<string, unknown>;

  return [
    input.id,
    input.campaignId,
    input.workspaceId,
    input.version,
    input.status,
    input.isCurrent ? 1 : 0,
    (strategy.campaignAngle as string | null) ?? null,
    (strategy.coreMessage as string | null) ?? null,
    (strategy.proposition as string | null) ?? null,
    (strategy.audienceFocus as string | null) ?? null,
    JSON.stringify(hooks),
    JSON.stringify(input.data.proofPoints ?? []),
    (cta.primary as string | null) ?? null,
    JSON.stringify(cta.alternatives ?? []),
    JSON.stringify(input.data.channels ?? []),
    JSON.stringify(input.data.contentMix ?? []),
    (cadence.summary as string | null) ?? null,
    (cadence.duration as string | null) ?? null,
    (creative.visualDirection as string | null) ?? null,
    (creative.photographyDirection as string | null) ?? null,
    (creative.videoDirection as string | null) ?? null,
    (creative.copyDirection as string | null) ?? null,
    (measurement.objective as string | null) ?? null,
    (measurement.primaryKpi as string | null) ?? null,
    JSON.stringify(measurement.supportingKpis ?? []),
    (measurement.conversionEvent as string | null) ?? null,
    (rationale.summary as string | null) ?? null,
    input.createdAt,
    input.updatedAt,
  ];
}

export const PLAN_INSERT_COLUMNS = `
  id, campaign_id, workspace_id, version, status, is_current,
  strategy_campaign_angle, strategy_core_message, strategy_proposition, strategy_audience_focus,
  hooks, proof_points, cta_primary, cta_alternatives,
  channels, content_mix,
  cadence_summary, cadence_duration,
  creative_visual_direction, creative_photography_direction,
  creative_video_direction, creative_copy_direction,
  measurement_objective, measurement_primary_kpi, measurement_supporting_kpis, measurement_conversion_event,
  rationale_summary,
  created_at, updated_at
`;

export const PLAN_INSERT_PLACEHOLDERS_SQLITE = Array(29).fill('?').join(', ');
export const PLAN_INSERT_PLACEHOLDERS_POSTGRES = Array.from({ length: 29 }, (_, i) => `$${i + 1}`).join(', ');

import { randomUUID } from 'crypto';
import { db } from '../../db/database';
import type { CampaignRow, ObjectiveRow, EntityRow } from '../../types';

export type BriefCompletenessStatus = 'COMPLETE' | 'NEEDS_INPUT';

export interface AssembledBrief {
  id: string;
  campaignId: string;
  workspaceId: string;
  sourceSummary: string | null;
  objectiveSummary: string | null;
  audienceDescription: string | null;
  audienceSegment: string | null;
  audienceProblem: string | null;
  audienceDesire: string | null;
  proposition: string | null;
  keyDetails: string[];
  offerDescription: string | null;
  offerValue: string | null;
  offerUrgency: string | null;
  offerConstraints: string[];
  timingStartDate: string | null;
  timingEndDate: string | null;
  timingImportantDates: string[];
  constraints: string[];
  additionalContext: string | null;
  completenessStatus: BriefCompletenessStatus;
  completenessMissingFields: string[];
  createdAt: string;
  updatedAt: string;
}

interface BriefRow {
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

function mapBriefRow(r: BriefRow): AssembledBrief {
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
    completenessStatus: r.completeness_status as BriefCompletenessStatus,
    completenessMissingFields: JSON.parse(r.completeness_missing_fields || '[]') as string[],
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/**
 * Deterministic completeness check.
 * Does NOT call AI — checks whether materially important facts are missing.
 */
function checkCompleteness(
  sourceType: string,
  brief: Omit<AssembledBrief, 'id' | 'campaignId' | 'workspaceId' | 'completenessStatus' | 'completenessMissingFields' | 'createdAt' | 'updatedAt'>
): { status: BriefCompletenessStatus; missingFields: string[] } {
  const missing: string[] = [];

  // EVENT: date is material
  if (sourceType === 'EVENT' && !brief.timingStartDate) {
    missing.push('Event date');
  }

  // OFFER: enough information to understand the offer
  if (sourceType === 'OFFER' && !brief.offerDescription) {
    missing.push('Offer details');
  }

  // ANNOUNCEMENT: details about what is being announced
  if (sourceType === 'ANNOUNCEMENT' && !brief.sourceSummary && !brief.additionalContext) {
    missing.push('Announcement details');
  }

  return {
    status: missing.length === 0 ? 'COMPLETE' : 'NEEDS_INPUT',
    missingFields: missing,
  };
}

class CampaignBriefService {
  /**
   * Assemble (or re-assemble) the brief for a campaign from existing workspace/campaign/objective data.
   * Creates the brief row if it doesn't exist; updates if it does.
   * Does NOT ask the user for information — infers everything possible from stored data.
   */
  assemble(campaignId: string): AssembledBrief | null {
    const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(campaignId) as CampaignRow | undefined;
    if (!campaign) return null;

    const objective = db.prepare('SELECT * FROM objectives WHERE id = ?').get(campaign.objective_id) as ObjectiveRow | undefined;
    if (!objective) return null;

    const entity = db.prepare('SELECT * FROM entities WHERE id = ?').get(campaign.workspace_id) as EntityRow | undefined;
    if (!entity) return null;

    // Parse brand brain
    let brandKit: Record<string, unknown> = {};
    try { brandKit = JSON.parse(entity.brand_kit) as Record<string, unknown>; } catch { /* empty */ }
    const bb = (brandKit.brandBrain ?? {}) as Record<string, unknown>;
    const bbAudience   = (bb.audience    ?? {}) as Record<string, unknown>;
    const bbPersonality = (bb.personality ?? {}) as Record<string, unknown>;

    // Fetch existing brief (may have user-supplied overrides)
    const existing = db
      .prepare('SELECT * FROM campaign_briefs WHERE campaign_id = ?')
      .get(campaignId) as BriefRow | undefined;

    // Build source summary from campaign data
    const sourceSummary = [
      campaign.source_title,
      campaign.source_description,
    ].filter(Boolean).join(' — ') || null;

    // Build objective summary from objective data
    const objectiveSummary = [
      objective.name,
      objective.description,
      `Primary KPI: ${objective.primary_kpi}`,
    ].filter(Boolean).join('. ') || null;

    // Audience from brand brain (prefer existing if user set it)
    const audienceDescription = (existing?.audience_description) ??
      ((bbAudience.primaryAudience as string | undefined) ?? null);
    const audienceProblem = (existing?.audience_problem) ??
      ((bbAudience.problems as string[] | undefined)?.[0] ?? null);
    const audienceDesire = (existing?.audience_desire) ??
      ((bbAudience.desires as string[] | undefined)?.[0] ?? null);
    const audienceSegment = existing?.audience_segment ?? null;

    // Preserve user-supplied timing/offer fields; auto-set only if blank
    const timingStartDate = existing?.timing_start_date ?? null;
    const timingEndDate   = existing?.timing_end_date   ?? null;
    const timingImportantDates = existing
      ? (JSON.parse(existing.timing_important_dates || '[]') as string[])
      : [];

    const offerDescription = existing?.offer_description ?? null;
    const offerValue       = existing?.offer_value       ?? null;
    const offerUrgency     = existing?.offer_urgency     ?? null;
    const offerConstraints = existing
      ? (JSON.parse(existing.offer_constraints || '[]') as string[])
      : [];

    const keyDetails = existing
      ? (JSON.parse(existing.key_details || '[]') as string[])
      : [];

    const constraints = existing
      ? (JSON.parse(existing.constraints || '[]') as string[])
      : [];

    const additionalContext = existing?.additional_context ?? null;
    const proposition       = (existing?.proposition) ??
      ((bbPersonality.archetype as string | undefined) ? null : null);

    // Run completeness check
    const briefData = {
      sourceSummary, objectiveSummary,
      audienceDescription, audienceSegment, audienceProblem, audienceDesire,
      proposition, keyDetails,
      offerDescription, offerValue, offerUrgency, offerConstraints,
      timingStartDate, timingEndDate, timingImportantDates,
      constraints, additionalContext,
    };
    const completeness = checkCompleteness(campaign.source_type, briefData);

    const now = new Date().toISOString();

    if (existing) {
      db.prepare(`
        UPDATE campaign_briefs SET
          source_summary = ?, objective_summary = ?,
          audience_description = ?, audience_segment = ?,
          audience_problem = ?, audience_desire = ?,
          proposition = ?, key_details = ?,
          offer_description = ?, offer_value = ?, offer_urgency = ?, offer_constraints = ?,
          timing_start_date = ?, timing_end_date = ?, timing_important_dates = ?,
          constraints = ?, additional_context = ?,
          completeness_status = ?, completeness_missing_fields = ?,
          updated_at = ?
        WHERE campaign_id = ?
      `).run(
        sourceSummary, objectiveSummary,
        audienceDescription, audienceSegment, audienceProblem, audienceDesire,
        proposition, JSON.stringify(keyDetails),
        offerDescription, offerValue, offerUrgency, JSON.stringify(offerConstraints),
        timingStartDate, timingEndDate, JSON.stringify(timingImportantDates),
        JSON.stringify(constraints), additionalContext,
        completeness.status, JSON.stringify(completeness.missingFields),
        now,
        campaignId,
      );
    } else {
      const briefId = `brief_${randomUUID()}`;
      db.prepare(`
        INSERT INTO campaign_briefs
          (id, campaign_id, workspace_id,
           source_summary, objective_summary,
           audience_description, audience_segment, audience_problem, audience_desire,
           proposition, key_details,
           offer_description, offer_value, offer_urgency, offer_constraints,
           timing_start_date, timing_end_date, timing_important_dates,
           constraints, additional_context,
           completeness_status, completeness_missing_fields,
           created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        briefId, campaignId, campaign.workspace_id,
        sourceSummary, objectiveSummary,
        audienceDescription, audienceSegment, audienceProblem, audienceDesire,
        proposition, JSON.stringify(keyDetails),
        offerDescription, offerValue, offerUrgency, JSON.stringify(offerConstraints),
        timingStartDate, timingEndDate, JSON.stringify(timingImportantDates),
        JSON.stringify(constraints), additionalContext,
        completeness.status, JSON.stringify(completeness.missingFields),
        now, now,
      );
    }

    const row = db
      .prepare('SELECT * FROM campaign_briefs WHERE campaign_id = ?')
      .get(campaignId) as BriefRow;
    return mapBriefRow(row);
  }

  getForCampaign(campaignId: string): AssembledBrief | null {
    const row = db
      .prepare('SELECT * FROM campaign_briefs WHERE campaign_id = ?')
      .get(campaignId) as BriefRow | undefined;
    return row ? mapBriefRow(row) : null;
  }

  /** Patch user-supplied fields (e.g. event date, offer details). Then re-runs completeness. */
  patch(campaignId: string, fields: Partial<{
    timingStartDate: string | null;
    timingEndDate: string | null;
    offerDescription: string | null;
    offerValue: string | null;
    offerUrgency: string | null;
    additionalContext: string | null;
    proposition: string | null;
    audienceDescription: string | null;
  }>): AssembledBrief | null {
    const existing = db
      .prepare('SELECT * FROM campaign_briefs WHERE campaign_id = ?')
      .get(campaignId) as BriefRow | undefined;

    if (!existing) {
      // Auto-assemble first, then patch
      this.assemble(campaignId);
      return this.patch(campaignId, fields);
    }

    const sets: string[] = [];
    const vals: unknown[] = [];
    const fieldMap: Record<string, string> = {
      timingStartDate:    'timing_start_date',
      timingEndDate:      'timing_end_date',
      offerDescription:   'offer_description',
      offerValue:         'offer_value',
      offerUrgency:       'offer_urgency',
      additionalContext:  'additional_context',
      proposition:        'proposition',
      audienceDescription:'audience_description',
    };
    for (const [jsKey, dbCol] of Object.entries(fieldMap)) {
      if (jsKey in fields) {
        sets.push(`${dbCol} = ?`);
        vals.push(fields[jsKey as keyof typeof fields] ?? null);
      }
    }
    if (sets.length === 0) return mapBriefRow(existing);

    const now = new Date().toISOString();
    sets.push('updated_at = ?');
    vals.push(now);
    vals.push(campaignId);
    db.prepare(`UPDATE campaign_briefs SET ${sets.join(', ')} WHERE campaign_id = ?`).run(...vals);

    // Re-assemble to refresh completeness
    return this.assemble(campaignId);
  }
}

export const campaignBriefService = new CampaignBriefService();

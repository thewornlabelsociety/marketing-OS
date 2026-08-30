import { db } from '../../db/database';
import { learningService } from '../performance/LearningService';
import { campaignPerformanceService } from '../performance/CampaignPerformanceService';
import { objectiveEvaluationService } from '../performance/ObjectiveEvaluationService';
import type {
  BlueprintContentItem,
  BlueprintEvidenceSummary,
  BlueprintSourceExample,
  BlueprintStrategy,
} from '../../types/blueprint';
import { generalizeOfferText } from './BlueprintQualityGate';

interface PlanRow {
  strategy_campaign_angle: string;
  strategy_core_message: string;
  hooks: string;
  proof_points: string;
  cta_primary: string;
  channels: string;
  content_mix: string;
  cadence_summary: string;
}

interface ContentPlanRow {
  body: string;
}

export class BlueprintExtractionService {
  extract(sourceCampaignId: string, workspaceId: string): {
    strategicPattern: BlueprintStrategy;
    contentPattern: BlueprintContentItem[];
    channelPattern: string[];
    cadencePattern?: string;
    evidenceSummary: BlueprintEvidenceSummary;
    sourceExamples: BlueprintSourceExample[];
    learnedWhy: string[];
    objectiveType: string;
    name: string;
    description?: string;
  } | { error: string; code: string } {
    const campaign = db.prepare(`
      SELECT c.*, o.objective_type, o.name as objective_name, o.primary_kpi, o.success_criteria
      FROM campaigns c
      JOIN objectives o ON o.id = c.objective_id
      WHERE c.id = ?
    `).get(sourceCampaignId) as Record<string, unknown> | undefined;

    if (!campaign) return { error: 'Campaign not found', code: 'NOT_FOUND' };
    if (campaign.workspace_id !== workspaceId) return { error: 'Workspace mismatch', code: 'FORBIDDEN' };

    const plan = db.prepare(`
      SELECT * FROM campaign_plans WHERE campaign_id = ? AND is_current = 1 AND status = 'APPROVED'
    `).get(sourceCampaignId) as PlanRow | undefined;

    const contentPlan = db.prepare(`
      SELECT body FROM content_plans WHERE campaign_id = ? AND is_current = 1 AND status = 'APPROVED'
    `).get(sourceCampaignId) as ContentPlanRow | undefined;

    const perfSummary = campaignPerformanceService.getSummary(sourceCampaignId, workspaceId);
    const evaluation = objectiveEvaluationService.getLatestEvaluation(sourceCampaignId);
    const learnings = learningService.getActiveForContext(workspaceId, {
      objectiveType: campaign.objective_type as string,
      channels: JSON.parse((campaign.channels as string) || '[]') as string[],
    });

    const channels = plan
      ? (JSON.parse(plan.channels || '[]') as Array<{ channel: string; role?: string }>).map((c) => c.channel)
      : JSON.parse((campaign.channels as string) || '[]') as string[];

    const briefRow = db.prepare('SELECT offer_description FROM campaign_briefs WHERE campaign_id = ?').get(sourceCampaignId) as { offer_description?: string } | undefined;

    const strategicPattern: BlueprintStrategy = {
      objectiveRole: campaign.objective_name as string,
      positioning: plan?.strategy_campaign_angle,
      messageHierarchy: plan?.strategy_core_message,
      proofStrategy: plan ? JSON.parse(plan.proof_points || '[]').join('; ') : undefined,
      ctaStrategy: plan?.cta_primary,
      offerFraming: generalizeOfferText(briefRow?.offer_description),
      channelRoles: plan
        ? Object.fromEntries(
            (JSON.parse(plan.channels || '[]') as Array<{ channel: string; role: string }>).map((c) => [c.channel, c.role])
          )
        : undefined,
    };

    const contentPattern: BlueprintContentItem[] = [];
    const sourceExamples: BlueprintSourceExample[] = [];

    if (contentPlan) {
      const body = JSON.parse(contentPlan.body) as { deliverables?: Array<Record<string, unknown>> };
      const deliverables = body.deliverables ?? [];
      deliverables.forEach((d, idx) => {
        const contentKey = d.contentKey as string;
        contentPattern.push({
          sequence: idx + 1,
          purpose: (d.purpose as string) ?? 'Deliverable',
          contentType: (d.contentType as string) ?? (d.type as string) ?? 'POST',
          channel: (d.channel as string) ?? 'INSTAGRAM',
          format: d.format as string | undefined,
          objectiveRole: (d.objectiveRole as string) ?? undefined,
          messageRole: (d.messageRole as string) ?? undefined,
          ctaRole: (d.ctaRole as string) ?? undefined,
          relativeTiming: (d.relativeTiming as string) ?? `Phase ${idx + 1}`,
          creativeGuidance: (d.creativeGuidance as string) ?? undefined,
          sourceContentKey: contentKey,
        });
        sourceExamples.push({ contentKey, role: (d.purpose as string) ?? undefined });
      });
    } else if (plan) {
      const mix = JSON.parse(plan.content_mix || '[]') as Array<Record<string, unknown>>;
      mix.forEach((item, idx) => {
        contentPattern.push({
          sequence: idx + 1,
          purpose: (item.purpose as string) ?? 'Content',
          contentType: (item.contentType as string) ?? 'POST',
          channel: (item.channel as string) ?? 'INSTAGRAM',
          format: item.format as string | undefined,
          relativeTiming: `Step ${idx + 1}`,
        });
      });
    }

    const cadencePattern = plan?.cadence_summary ?? undefined;

    const evidenceSummary: BlueprintEvidenceSummary = {
      sourceCampaignId,
      classification: !('error' in perfSummary) ? perfSummary.classification : evaluation?.classification ?? 'INSUFFICIENT_DATA',
      confidence: !('error' in perfSummary) ? perfSummary.confidence : evaluation?.confidence ?? 'LOW',
      primaryKpi: !('error' in perfSummary) ? perfSummary.primaryKpi : (campaign.primary_kpi as string),
      primaryKpiValue: !('error' in perfSummary) ? perfSummary.primaryKpiValue : evaluation?.primaryKpiValue,
      target: campaign.success_criteria as string | null,
      targetResult: evaluation?.reasons?.[0],
      attributedConversions: !('error' in perfSummary) ? perfSummary.conversions.purchases + perfSummary.conversions.qualifiedLeads : undefined,
      attributedRevenue: !('error' in perfSummary) ? perfSummary.conversions.revenue : undefined,
      topContentKeys: !('error' in perfSummary) ? perfSummary.topContent.map((c) => c.contentKey) : [],
      channelContributions: !('error' in perfSummary)
        ? perfSummary.channelPerformance.map((ch) => ({
            channel: ch.channel,
            summary: ch.conversions.revenue > 0
              ? `$${ch.conversions.revenue} revenue`
              : `${ch.metrics.reach ?? ch.metrics.views ?? 0} reach`,
          }))
        : [],
      relevantLearnings: [...learnings.marketPerformance, ...learnings.userPreferences],
      evaluationId: evaluation?.id,
    };

    const learnedWhy: string[] = [];
    if (evaluation?.reasons) learnedWhy.push(...evaluation.reasons.slice(0, 5));
    if (evidenceSummary.topContentKeys.length > 0) {
      learnedWhy.push(`Top content: ${evidenceSummary.topContentKeys.join(', ')}`);
    }

    const objectiveType = campaign.objective_type as string;
    const name = `${objectiveType.replace(/_/g, ' ')} — ${(campaign.name as string).slice(0, 40)}`;

    return {
      strategicPattern,
      contentPattern,
      channelPattern: channels.length > 0 ? channels : ['INSTAGRAM'],
      cadencePattern,
      evidenceSummary,
      sourceExamples,
      learnedWhy,
      objectiveType,
      name,
      description: `Evidence-backed blueprint from ${campaign.name as string}`,
    };
  }
}

export const blueprintExtractionService = new BlueprintExtractionService();

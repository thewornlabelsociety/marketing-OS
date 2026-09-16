import { getCoreRepositories } from '../../db/core/createCoreRepositories';
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

export class BlueprintExtractionService {
  async extract(sourceCampaignId: string, workspaceId: string): Promise<{
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
  } | { error: string; code: string }> {
    const repos = getCoreRepositories();
    const campaign = await repos.campaign.findById(sourceCampaignId);
    if (!campaign) return { error: 'Campaign not found', code: 'NOT_FOUND' };
    if (campaign.workspace_id !== workspaceId) return { error: 'Workspace mismatch', code: 'FORBIDDEN' };

    const objective = await repos.objective.findById(campaign.objective_id);
    if (!objective) return { error: 'Objective not found', code: 'NOT_FOUND' };

    const planResult = await repos.planning.plan.getCurrent(sourceCampaignId);
    const plan = planResult?.status === 'APPROVED' ? planResult : undefined;

    const contentPlanResult = await repos.contentPlanning.plan.findCurrentByCampaignId(sourceCampaignId);
    const contentPlan = contentPlanResult?.status === 'APPROVED' ? contentPlanResult : undefined;

    const perfSummary = await campaignPerformanceService.getSummary(sourceCampaignId, workspaceId);
    const evaluation = objectiveEvaluationService.getLatestEvaluation(sourceCampaignId);
    const learnings = learningService.getActiveForContext(workspaceId, {
      objectiveType: objective.objective_type,
      channels: JSON.parse(campaign.channels || '[]') as string[],
    });

    const channels = plan
      ? plan.channels.map((c) => c.channel)
      : JSON.parse(campaign.channels || '[]') as string[];

    const briefRow = await repos.planning.brief.findByCampaignId(sourceCampaignId);

    const strategicPattern: BlueprintStrategy = {
      objectiveRole: objective.name,
      positioning: plan?.strategy.campaignAngle,
      messageHierarchy: plan?.strategy.coreMessage,
      proofStrategy: plan ? plan.proofPoints.join('; ') : undefined,
      ctaStrategy: plan?.callToAction.primary,
      offerFraming: generalizeOfferText(briefRow?.offerDescription ?? undefined),
      channelRoles: plan
        ? Object.fromEntries(plan.channels.map((c) => [c.channel, c.role]))
        : undefined,
    };

    const contentPattern: BlueprintContentItem[] = [];
    const sourceExamples: BlueprintSourceExample[] = [];

    if (contentPlan) {
      contentPlan.deliverables.forEach((d, idx) => {
        contentPattern.push({
          sequence: idx + 1,
          purpose: d.purpose ?? 'Deliverable',
          contentType: d.contentType ?? 'POST',
          channel: d.channel ?? 'INSTAGRAM',
          format: d.format,
          objectiveRole: d.objectiveRole ?? undefined,
          messageRole: undefined,
          ctaRole: d.ctaRole ?? undefined,
          relativeTiming: d.timing?.phase ?? `Phase ${idx + 1}`,
          creativeGuidance: d.creativeDirection ?? undefined,
          sourceContentKey: d.contentKey,
        });
        sourceExamples.push({ contentKey: d.contentKey, role: d.purpose ?? undefined });
      });
    } else if (plan) {
      plan.contentMix.forEach((item, idx) => {
        contentPattern.push({
          sequence: idx + 1,
          purpose: item.purpose ?? 'Content',
          contentType: item.contentType ?? 'POST',
          channel: item.channel ?? 'INSTAGRAM',
          format: item.format,
          relativeTiming: `Step ${idx + 1}`,
        });
      });
    }

    const cadencePattern = plan?.cadence.summary ?? undefined;

    const evidenceSummary: BlueprintEvidenceSummary = {
      sourceCampaignId,
      classification: !('error' in perfSummary) ? perfSummary.classification : evaluation?.classification ?? 'INSUFFICIENT_DATA',
      confidence: !('error' in perfSummary) ? perfSummary.confidence : evaluation?.confidence ?? 'LOW',
      primaryKpi: !('error' in perfSummary) ? perfSummary.primaryKpi : objective.primary_kpi,
      primaryKpiValue: !('error' in perfSummary) ? perfSummary.primaryKpiValue : evaluation?.primaryKpiValue,
      target: objective.success_criteria ?? null,
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

    const objectiveType = objective.objective_type;
    const name = `${objectiveType.replace(/_/g, ' ')} — ${campaign.name.slice(0, 40)}`;

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
      description: `Evidence-backed blueprint from ${campaign.name}`,
    };
  }
}

export const blueprintExtractionService = new BlueprintExtractionService();

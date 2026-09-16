import { db } from '../../db/database';
import type {
  DashboardCounts,
  DashboardExperimentItem,
  DashboardOpportunityItem,
  DashboardPerformanceItem,
  DashboardSnapshot,
  DashboardUpcomingItem,
} from '../../types/attention';
import { attentionSignalService, formatScheduleLocal } from '../attention/AttentionSignalService';
import { schedulingService } from '../publishing/SchedulingService';
import { campaignPerformanceService } from '../performance/CampaignPerformanceService';
import { objectiveEvaluationService } from '../performance/ObjectiveEvaluationService';
import { experimentAnalysisService } from '../experiments/ExperimentAnalysisService';
import { getCoreRepositories } from '../../db/core/createCoreRepositories';

const RECENT_DAYS = 30;
const UPCOMING_DAYS = 7;

export class DashboardService {
  async getDashboard(workspaceId: string): Promise<DashboardSnapshot> {
    const repos = getCoreRepositories();
    const openSignals = await attentionSignalService.reconcile(workspaceId);
    const ranked = attentionSignalService.rank(openSignals);

    const needsAttention = ranked.filter((s) => attentionSignalService.isNeedsAttention(s));
    const readyForYou = ranked.filter((s) => attentionSignalService.isReadyForYou(s) && !attentionSignalService.isNeedsAttention(s));

    const [upcoming, performance, experiments, activeCampaignCount] = await Promise.all([
      this.buildUpcoming(workspaceId),
      this.buildPerformance(workspaceId),
      this.buildExperiments(workspaceId, openSignals),
      repos.campaign.countActive(workspaceId, ['ARCHIVED', 'CANCELLED']),
    ]);
    const opportunities = this.buildOpportunities(openSignals);

    const counts: DashboardCounts = {
      needsAttention: needsAttention.length,
      readyForReview: openSignals.filter((s) => s.signalType.includes('READY_FOR_REVIEW') || s.signalType.includes('READY_FOR_APPROVAL')).length,
      scheduledThisWeek: upcoming.length,
      underperforming: openSignals.filter((s) => s.signalType === 'PERFORMANCE_UNDERPERFORMING').length,
      experimentsAwaitingDecision: openSignals.filter((s) => s.signalType === 'EXPERIMENT_DECISION_AVAILABLE').length,
    };

    return {
      workspaceId,
      generatedAt: new Date().toISOString(),
      counts,
      needsAttention,
      readyForYou,
      upcoming,
      performance,
      experiments,
      opportunities,
      empty: activeCampaignCount === 0,
    };
  }

  private async buildUpcoming(workspaceId: string): Promise<DashboardUpcomingItem[]> {
    const repos = getCoreRepositories();
    const now = Date.now();
    const end = now + UPCOMING_DAYS * 24 * 60 * 60 * 1000;
    const schedules = (await schedulingService.listForWorkspace(workspaceId))
      .filter((s) => ['SCHEDULED', 'READY', 'PUBLISHING', 'FAILED'].includes(s.status))
      .filter((s) => {
        const t = new Date(s.scheduledFor).getTime();
        return t >= now - 24 * 60 * 60 * 1000 && t <= end;
      })
      .sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor));

    const items: DashboardUpcomingItem[] = [];
    for (const s of schedules.slice(0, 20)) {
      const campaign = await repos.campaign.findById(s.campaignId);
      const { localDayLabel, localTimeLabel } = formatScheduleLocal(s.scheduledFor, s.timezone);
      items.push({
        scheduleId: s.id,
        campaignId: s.campaignId,
        campaignName: campaign?.name ?? s.campaignId,
        contentKey: s.contentKey,
        channel: s.channel,
        scheduledFor: s.scheduledFor,
        timezone: s.timezone,
        localDayLabel,
        localTimeLabel,
        status: s.status,
      });
    }
    return items;
  }

  private async buildPerformance(workspaceId: string): Promise<DashboardSnapshot['performance']> {
    const repos = getCoreRepositories();
    const cutoff = Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000;
    const campaigns = await repos.campaign.list({ workspaceId, statusIn: ['PUBLISHED', 'MEASURING', 'COMPLETE'] });

    const highPerforming: DashboardPerformanceItem[] = [];
    const underperforming: DashboardPerformanceItem[] = [];
    const insufficientData: DashboardPerformanceItem[] = [];

    for (const campaign of campaigns) {
      if (new Date(campaign.updated_at).getTime() < cutoff && campaign.status === 'COMPLETE') continue;
      const summary = await campaignPerformanceService.getSummary(campaign.id, workspaceId);
      if ('error' in summary) continue;
      const latest = objectiveEvaluationService.getLatestEvaluation(campaign.id);
      const item: DashboardPerformanceItem = {
        campaignId: campaign.id,
        campaignName: campaign.name,
        objectiveType: summary.objective.type,
        objectiveName: summary.objective.name,
        classification: summary.classification,
        primaryKpi: summary.primaryKpi,
        primaryKpiValue: summary.primaryKpiValue,
        confidence: summary.confidence,
        measurementWindow: latest?.measurementWindow,
        reasons: latest?.reasons ?? summary.evaluationReasons,
        actionTarget: `campaign:${campaign.id}:performance`,
      };

      if (summary.classification === 'HIGH_PERFORMING' || summary.classification === 'EXCEPTIONAL') {
        highPerforming.push(item);
      } else if (summary.classification === 'LOW_PERFORMING' || summary.classification === 'BELOW_AVERAGE') {
        underperforming.push(item);
      } else if (summary.classification === 'INSUFFICIENT_DATA') {
        insufficientData.push(item);
      }
    }

    return {
      highPerforming: highPerforming.slice(0, 5),
      underperforming: underperforming.slice(0, 5),
      insufficientData: insufficientData.slice(0, 3),
    };
  }

  private async buildExperiments(workspaceId: string, openSignals: ReturnType<typeof attentionSignalService.list>): Promise<DashboardExperimentItem[]> {
    const repos = getCoreRepositories();
    const experimentSignals = openSignals.filter((s) => s.entityType === 'EXPERIMENT');
    const items: DashboardExperimentItem[] = [];

    for (const signal of experimentSignals) {
      const expRow = db.prepare('SELECT * FROM experiments WHERE id = ?').get(signal.entityId) as {
        id: string; campaign_id: string; name: string; mode: string; primary_kpi: string;
      } | undefined;
      if (!expRow) continue;
      const campaign = await repos.campaign.findById(expRow.campaign_id);
      const analyses = experimentAnalysisService.listAnalyses(expRow.id, workspaceId);
      const latest = analyses[analyses.length - 1];
      items.push({
        experimentId: expRow.id,
        campaignId: expRow.campaign_id,
        campaignName: campaign?.name ?? expRow.campaign_id,
        name: expRow.name,
        signalType: signal.signalType,
        outcome: latest?.outcome,
        primaryKpi: latest?.primaryKpi ?? expRow.primary_kpi,
        confidence: latest?.confidence,
        measurementWindow: latest?.measurementWindow,
        mode: expRow.mode,
        warnings: latest?.warnings,
        actionTarget: signal.actionTarget ?? `campaign:${expRow.campaign_id}:experiments:${expRow.id}`,
      });
    }

    return items.slice(0, 8);
  }

  private buildOpportunities(openSignals: ReturnType<typeof attentionSignalService.list>): DashboardOpportunityItem[] {
    return openSignals
      .filter((s) => s.signalType === 'BLUEPRINT_CANDIDATE' || s.signalType === 'LEARNING_CANDIDATE')
      .map((s) => ({
        id: s.entityId,
        type: s.signalType as 'BLUEPRINT_CANDIDATE' | 'LEARNING_CANDIDATE',
        title: s.title,
        summary: s.summary,
        campaignId: s.campaignId,
        actionLabel: s.actionLabel ?? 'Review',
        actionTarget: s.actionTarget ?? '',
        signalId: s.id,
        dismissible: s.dismissible,
      }))
      .slice(0, 6);
  }
}

export const dashboardService = new DashboardService();

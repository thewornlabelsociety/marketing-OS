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

const RECENT_DAYS = 30;
const UPCOMING_DAYS = 7;

export class DashboardService {
  getDashboard(workspaceId: string): DashboardSnapshot {
    const openSignals = attentionSignalService.reconcile(workspaceId);
    const ranked = attentionSignalService.rank(openSignals);

    const needsAttention = ranked.filter((s) => attentionSignalService.isNeedsAttention(s));
    const readyForYou = ranked.filter((s) => attentionSignalService.isReadyForYou(s) && !attentionSignalService.isNeedsAttention(s));

    const upcoming = this.buildUpcoming(workspaceId);
    const performance = this.buildPerformance(workspaceId);
    const experiments = this.buildExperiments(workspaceId, openSignals);
    const opportunities = this.buildOpportunities(openSignals);

    const counts: DashboardCounts = {
      needsAttention: needsAttention.length,
      readyForReview: openSignals.filter((s) => s.signalType.includes('READY_FOR_REVIEW') || s.signalType.includes('READY_FOR_APPROVAL')).length,
      scheduledThisWeek: upcoming.length,
      underperforming: openSignals.filter((s) => s.signalType === 'PERFORMANCE_UNDERPERFORMING').length,
      experimentsAwaitingDecision: openSignals.filter((s) => s.signalType === 'EXPERIMENT_DECISION_AVAILABLE').length,
    };

    const campaignCount = db.prepare(
      'SELECT COUNT(*) as c FROM campaigns WHERE workspace_id = ? AND status NOT IN (\'ARCHIVED\', \'CANCELLED\')'
    ).get(workspaceId) as { c: number };

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
      empty: campaignCount.c === 0,
    };
  }

  private buildUpcoming(workspaceId: string): DashboardUpcomingItem[] {
    const now = Date.now();
    const end = now + UPCOMING_DAYS * 24 * 60 * 60 * 1000;
    const schedules = schedulingService.listForWorkspace(workspaceId)
      .filter((s) => ['SCHEDULED', 'READY', 'PUBLISHING', 'FAILED'].includes(s.status))
      .filter((s) => {
        const t = new Date(s.scheduledFor).getTime();
        return t >= now - 24 * 60 * 60 * 1000 && t <= end;
      })
      .sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor));

    return schedules.slice(0, 20).map((s) => {
      const campaign = db.prepare('SELECT name FROM campaigns WHERE id = ?').get(s.campaignId) as { name: string } | undefined;
      const { localDayLabel, localTimeLabel } = formatScheduleLocal(s.scheduledFor, s.timezone);
      return {
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
      };
    });
  }

  private buildPerformance(workspaceId: string): DashboardSnapshot['performance'] {
    const cutoff = Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000;
    const campaigns = db.prepare(`
      SELECT id, name, status, updated_at FROM campaigns
      WHERE workspace_id = ? AND status IN ('PUBLISHED', 'MEASURING', 'COMPLETE')
      ORDER BY updated_at DESC
    `).all(workspaceId) as Array<{ id: string; name: string; status: string; updated_at: string }>;

    const highPerforming: DashboardPerformanceItem[] = [];
    const underperforming: DashboardPerformanceItem[] = [];
    const insufficientData: DashboardPerformanceItem[] = [];

    for (const campaign of campaigns) {
      if (new Date(campaign.updated_at).getTime() < cutoff && campaign.status === 'COMPLETE') continue;
      const summary = campaignPerformanceService.getSummary(campaign.id, workspaceId);
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

  private buildExperiments(workspaceId: string, openSignals: ReturnType<typeof attentionSignalService.list>): DashboardExperimentItem[] {
    const experimentSignals = openSignals.filter((s) => s.entityType === 'EXPERIMENT');
    const items: DashboardExperimentItem[] = [];

    for (const signal of experimentSignals) {
      const expRow = db.prepare('SELECT * FROM experiments WHERE id = ?').get(signal.entityId) as {
        id: string; campaign_id: string; name: string; mode: string; primary_kpi: string;
      } | undefined;
      if (!expRow) continue;
      const campaign = db.prepare('SELECT name FROM campaigns WHERE id = ?').get(expRow.campaign_id) as { name: string } | undefined;
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

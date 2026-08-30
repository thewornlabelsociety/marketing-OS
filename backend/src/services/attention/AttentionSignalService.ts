import { randomUUID } from 'crypto';
import { db } from '../../db/database';
import type {
  AttentionEntityType,
  AttentionSeverity,
  AttentionSignal,
  AttentionSignalStatus,
  AttentionSignalType,
} from '../../types/attention';
import type { CampaignRow } from '../../types';
import { creativeGeneratorService } from '../creative/CreativeGeneratorService';
import { schedulingService } from '../publishing/SchedulingService';
import { publishingService } from '../publishing/PublishingService';
import { campaignPerformanceService } from '../performance/CampaignPerformanceService';
import { objectiveEvaluationService } from '../performance/ObjectiveEvaluationService';
import { learningService } from '../performance/LearningService';
import { experimentService } from '../experiments/ExperimentService';
import { experimentAnalysisService } from '../experiments/ExperimentAnalysisService';
import { DEFAULT_SCHEDULE_TIMEZONE } from '../publishing/publishingUtils';

interface AttentionRow {
  id: string;
  workspace_id: string;
  signal_key: string;
  signal_type: string;
  severity: string;
  entity_type: string;
  entity_id: string;
  campaign_id: string | null;
  source_type: string;
  source_id: string;
  source_version: string;
  title: string;
  summary: string | null;
  action_label: string | null;
  action_target: string | null;
  dismissible: number;
  status: string;
  detected_at: string;
  resolved_at: string | null;
  dismissed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface DerivedSignal {
  signalKey: string;
  signalType: AttentionSignalType;
  severity: AttentionSeverity;
  entityType: AttentionEntityType;
  entityId: string;
  campaignId?: string;
  sourceType: string;
  sourceId: string;
  sourceVersion: string;
  title: string;
  summary?: string;
  actionLabel?: string;
  actionTarget?: string;
  dismissible: boolean;
}

const SEVERITY_RANK: Record<AttentionSeverity, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
  INFO: 4,
};

const DISMISSIBLE_TYPES = new Set<AttentionSignalType>([
  'BLUEPRINT_CANDIDATE',
  'LEARNING_CANDIDATE',
  'PERFORMANCE_HIGH_PERFORMING',
]);

const NEEDS_ATTENTION_TYPES = new Set<AttentionSignalType>([
  'CAMPAIGN_CHANGES_REQUESTED',
  'CONTENT_CHANGES_REQUESTED',
  'PUBLISHING_FAILED',
  'PUBLISHING_RETRY_REQUIRED',
  'PERFORMANCE_UNDERPERFORMING',
  'EXPERIMENT_CONFLICT_WARNING',
  'INTEGRATION_ATTENTION',
]);

const READY_FOR_YOU_TYPES = new Set<AttentionSignalType>([
  'CAMPAIGN_READY_FOR_REVIEW',
  'CAMPAIGN_READY_FOR_APPROVAL',
  'CONTENT_READY_FOR_REVIEW',
  'CONTENT_READY_FOR_APPROVAL',
  'READY_TO_SCHEDULE',
  'UNSCHEDULED_APPROVED_CONTENT',
  'EXPERIMENT_READY_TO_START',
  'EXPERIMENT_READY_FOR_ANALYSIS',
  'EXPERIMENT_DECISION_AVAILABLE',
  'EXPERIMENT_INCONCLUSIVE',
  'EXPERIMENT_INSUFFICIENT_DATA',
  'BLUEPRINT_CANDIDATE',
  'LEARNING_CANDIDATE',
]);

function buildSignalKey(input: {
  workspaceId: string;
  signalType: string;
  entityType: string;
  entityId: string;
  sourceType: string;
  sourceId: string;
  sourceVersion: string;
}): string {
  return [
    input.workspaceId,
    input.signalType,
    input.entityType,
    input.entityId,
    input.sourceType,
    input.sourceId,
    input.sourceVersion,
  ].join('|');
}

function mapRow(row: AttentionRow): AttentionSignal {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    signalKey: row.signal_key,
    signalType: row.signal_type as AttentionSignalType,
    severity: row.severity as AttentionSeverity,
    entityType: row.entity_type as AttentionEntityType,
    entityId: row.entity_id,
    campaignId: row.campaign_id ?? undefined,
    sourceType: row.source_type,
    sourceId: row.source_id,
    sourceVersion: row.source_version,
    title: row.title,
    summary: row.summary ?? undefined,
    actionLabel: row.action_label ?? undefined,
    actionTarget: row.action_target ?? undefined,
    dismissible: row.dismissible === 1,
    status: row.status as AttentionSignalStatus,
    detectedAt: row.detected_at,
    resolvedAt: row.resolved_at ?? undefined,
    dismissedAt: row.dismissed_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class AttentionSignalService {
  reconcile(workspaceId: string): AttentionSignal[] {
    const derived = this.deriveSignals(workspaceId);
    const now = new Date().toISOString();
    const derivedKeys = new Set(derived.map((d) => d.signalKey));

    const openRows = db.prepare(`
      SELECT * FROM attention_signals WHERE workspace_id = ? AND status = 'OPEN'
    `).all(workspaceId) as AttentionRow[];

    for (const row of openRows) {
      if (!derivedKeys.has(row.signal_key)) {
        db.prepare(`
          UPDATE attention_signals SET status = 'RESOLVED', resolved_at = ?, updated_at = ? WHERE id = ?
        `).run(now, now, row.id);
      }
    }

    for (const signal of derived) {
      const existing = db.prepare(`
        SELECT * FROM attention_signals WHERE workspace_id = ? AND signal_key = ?
      `).get(workspaceId, signal.signalKey) as AttentionRow | undefined;

      if (existing?.status === 'DISMISSED') continue;

      if (existing) {
        db.prepare(`
          UPDATE attention_signals
          SET signal_type = ?, severity = ?, entity_type = ?, entity_id = ?, campaign_id = ?,
              source_type = ?, source_id = ?, source_version = ?, title = ?, summary = ?,
              action_label = ?, action_target = ?, dismissible = ?, status = 'OPEN',
              resolved_at = NULL, updated_at = ?
          WHERE id = ?
        `).run(
          signal.signalType,
          signal.severity,
          signal.entityType,
          signal.entityId,
          signal.campaignId ?? null,
          signal.sourceType,
          signal.sourceId,
          signal.sourceVersion,
          signal.title,
          signal.summary ?? null,
          signal.actionLabel ?? null,
          signal.actionTarget ?? null,
          signal.dismissible ? 1 : 0,
          now,
          existing.id,
        );
      } else {
        const id = randomUUID();
        db.prepare(`
          INSERT INTO attention_signals
            (id, workspace_id, signal_key, signal_type, severity, entity_type, entity_id, campaign_id,
             source_type, source_id, source_version, title, summary, action_label, action_target,
             dismissible, status, detected_at, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', ?, ?, ?)
        `).run(
          id,
          workspaceId,
          signal.signalKey,
          signal.signalType,
          signal.severity,
          signal.entityType,
          signal.entityId,
          signal.campaignId ?? null,
          signal.sourceType,
          signal.sourceId,
          signal.sourceVersion,
          signal.title,
          signal.summary ?? null,
          signal.actionLabel ?? null,
          signal.actionTarget ?? null,
          signal.dismissible ? 1 : 0,
          now,
          now,
          now,
        );
      }
    }

    return this.list(workspaceId, 'OPEN');
  }

  list(workspaceId: string, status: 'OPEN' | 'ALL' = 'OPEN'): AttentionSignal[] {
    const rows = status === 'OPEN'
      ? db.prepare(`SELECT * FROM attention_signals WHERE workspace_id = ? AND status = 'OPEN' ORDER BY detected_at DESC`).all(workspaceId)
      : db.prepare(`SELECT * FROM attention_signals WHERE workspace_id = ? ORDER BY detected_at DESC`).all(workspaceId);
    return (rows as AttentionRow[]).map(mapRow);
  }

  get(id: string, workspaceId: string): AttentionSignal | null {
    const row = db.prepare('SELECT * FROM attention_signals WHERE id = ?').get(id) as AttentionRow | undefined;
    if (!row || row.workspace_id !== workspaceId) return null;
    return mapRow(row);
  }

  dismiss(id: string, workspaceId: string): AttentionSignal | { error: string; code: string } {
    const row = db.prepare('SELECT * FROM attention_signals WHERE id = ?').get(id) as AttentionRow | undefined;
    if (!row) return { error: 'Signal not found', code: 'NOT_FOUND' };
    if (row.workspace_id !== workspaceId) return { error: 'Workspace mismatch', code: 'FORBIDDEN' };
    if (row.dismissible !== 1) return { error: 'Signal cannot be dismissed', code: 'NOT_DISMISSIBLE' };
    const now = new Date().toISOString();
    db.prepare(`
      UPDATE attention_signals SET status = 'DISMISSED', dismissed_at = ?, updated_at = ? WHERE id = ?
    `).run(now, now, id);
    return mapRow(db.prepare('SELECT * FROM attention_signals WHERE id = ?').get(id) as AttentionRow);
  }

  rank(signals: AttentionSignal[]): AttentionSignal[] {
    return [...signals].sort((a, b) => {
      const sev = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
      if (sev !== 0) return sev;
      return b.detectedAt.localeCompare(a.detectedAt);
    });
  }

  isNeedsAttention(signal: AttentionSignal): boolean {
    return NEEDS_ATTENTION_TYPES.has(signal.signalType)
      || signal.severity === 'CRITICAL'
      || signal.severity === 'HIGH';
  }

  isReadyForYou(signal: AttentionSignal): boolean {
    return READY_FOR_YOU_TYPES.has(signal.signalType);
  }

  private deriveSignals(workspaceId: string): DerivedSignal[] {
    const signals: DerivedSignal[] = [];
    const campaigns = db.prepare(`
      SELECT c.*, o.name as objective_name, o.objective_type, o.primary_kpi
      FROM campaigns c
      LEFT JOIN objectives o ON o.id = c.objective_id
      WHERE c.workspace_id = ? AND c.status NOT IN ('ARCHIVED', 'CANCELLED')
    `).all(workspaceId) as Array<CampaignRow & { objective_name?: string; objective_type?: string; primary_kpi?: string }>;

    for (const campaign of campaigns) {
      this.deriveCampaignSignals(workspaceId, campaign, signals);
      this.deriveCreativeSignals(workspaceId, campaign, signals);
      this.deriveScheduleSignals(workspaceId, campaign, signals);
      this.derivePerformanceSignals(workspaceId, campaign, signals);
      this.deriveExperimentSignals(workspaceId, campaign, signals);
    }

    this.deriveBlueprintSignals(workspaceId, signals);
    this.deriveLearningSignals(workspaceId, signals);
    this.deriveIntegrationSignals(workspaceId, signals);

    return signals;
  }

  private push(
    workspaceId: string,
    signals: DerivedSignal[],
    input: Omit<DerivedSignal, 'signalKey'>,
  ): void {
    signals.push({
      ...input,
      signalKey: buildSignalKey({
        workspaceId,
        signalType: input.signalType,
        entityType: input.entityType,
        entityId: input.entityId,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        sourceVersion: input.sourceVersion,
      }),
      dismissible: input.dismissible ?? DISMISSIBLE_TYPES.has(input.signalType),
    });
  }

  private deriveCampaignSignals(
    workspaceId: string,
    campaign: CampaignRow & { objective_name?: string },
    signals: DerivedSignal[],
  ): void {
    const base = {
      entityType: 'CAMPAIGN' as AttentionEntityType,
      entityId: campaign.id,
      campaignId: campaign.id,
      sourceType: 'campaign_status',
      sourceId: campaign.id,
      sourceVersion: campaign.status,
    };

    if (campaign.status === 'READY_FOR_REVIEW') {
      this.push(workspaceId, signals, {
        ...base,
        signalType: 'CAMPAIGN_READY_FOR_REVIEW',
        severity: 'MEDIUM',
        title: `${campaign.name} ready for review`,
        summary: campaign.objective_name ? `${campaign.objective_name} campaign` : undefined,
        actionLabel: 'Review',
        actionTarget: `campaign:${campaign.id}:overview`,
        dismissible: false,
      });
    }
    if (campaign.status === 'READY_FOR_APPROVAL') {
      this.push(workspaceId, signals, {
        ...base,
        signalType: 'CAMPAIGN_READY_FOR_APPROVAL',
        severity: 'HIGH',
        title: `${campaign.name} ready for approval`,
        actionLabel: 'Review',
        actionTarget: `campaign:${campaign.id}:overview`,
        dismissible: false,
      });
    }
    if (campaign.status === 'CHANGES_REQUESTED') {
      this.push(workspaceId, signals, {
        ...base,
        signalType: 'CAMPAIGN_CHANGES_REQUESTED',
        severity: 'HIGH',
        title: `${campaign.name} — changes requested`,
        summary: 'Revision needed before approval can continue.',
        actionLabel: 'Revise',
        actionTarget: `campaign:${campaign.id}:content`,
        dismissible: false,
      });
    }

    const contentPlan = db.prepare(`
      SELECT status, version FROM content_plans WHERE campaign_id = ? AND is_current = 1
    `).get(campaign.id) as { status: string; version: number } | undefined;
    if (contentPlan?.status === 'READY_FOR_REVIEW') {
      this.push(workspaceId, signals, {
        signalType: 'CONTENT_READY_FOR_REVIEW',
        severity: 'MEDIUM',
        entityType: 'CONTENT',
        entityId: campaign.id,
        campaignId: campaign.id,
        sourceType: 'content_plan',
        sourceId: campaign.id,
        sourceVersion: String(contentPlan.version),
        title: `Content plan ready for review — ${campaign.name}`,
        actionLabel: 'Review',
        actionTarget: `campaign:${campaign.id}:content`,
        dismissible: false,
      });
    }
  }

  private deriveCreativeSignals(
    workspaceId: string,
    campaign: CampaignRow,
    signals: DerivedSignal[],
  ): void {
    const summary = creativeGeneratorService.getSummary(campaign.id);
    if ('error' in summary) return;

    for (const d of summary.deliverables) {
      if (!d.hasCreative || d.isApproved || !d.artifactId || !d.currentVersion) continue;
      this.push(workspaceId, signals, {
        signalType: 'CONTENT_READY_FOR_APPROVAL',
        severity: 'HIGH',
        entityType: 'CREATIVE',
        entityId: d.artifactId,
        campaignId: campaign.id,
        sourceType: 'creative_artifact',
        sourceId: d.contentKey,
        sourceVersion: String(d.currentVersion),
        title: `${d.title} ready for approval`,
        summary: `${campaign.name} · V${d.currentVersion}`,
        actionLabel: 'Review',
        actionTarget: `campaign:${campaign.id}:content:${d.contentKey}`,
        dismissible: false,
      });

      if (d.status === 'CHANGES_REQUESTED') {
        this.push(workspaceId, signals, {
          signalType: 'CONTENT_CHANGES_REQUESTED',
          severity: 'HIGH',
          entityType: 'CREATIVE',
          entityId: d.artifactId,
          campaignId: campaign.id,
          sourceType: 'creative_artifact',
          sourceId: d.contentKey,
          sourceVersion: String(d.currentVersion),
          title: `${d.title} — changes requested`,
          actionLabel: 'Revise',
          actionTarget: `campaign:${campaign.id}:content:${d.contentKey}`,
          dismissible: false,
        });
      }
    }
  }

  private deriveScheduleSignals(
    workspaceId: string,
    campaign: CampaignRow,
    signals: DerivedSignal[],
  ): void {
    const summary = schedulingService.getSummary(campaign.id);
    if ('error' in summary) return;

    if (summary.unscheduled > 0 && ['APPROVED', 'SCHEDULED', 'PUBLISHED', 'MEASURING'].includes(campaign.status)) {
      this.push(workspaceId, signals, {
        signalType: 'READY_TO_SCHEDULE',
        severity: 'MEDIUM',
        entityType: 'CAMPAIGN',
        entityId: campaign.id,
        campaignId: campaign.id,
        sourceType: 'schedule_gap',
        sourceId: campaign.id,
        sourceVersion: String(summary.unscheduled),
        title: `${campaign.name}`,
        summary: `${summary.unscheduled} approved item${summary.unscheduled === 1 ? '' : 's'} need scheduling`,
        actionLabel: 'Schedule',
        actionTarget: `campaign:${campaign.id}:schedule`,
        dismissible: false,
      });
    }

    for (const item of summary.failedItems) {
      const overdue = new Date(item.scheduledFor).getTime() < Date.now();
      const attempts = publishingService.getAttempts(item.id, campaign.id);
      const lastFailed = attempts.find((a) => a.status === 'FAILED');
      this.push(workspaceId, signals, {
        signalType: lastFailed ? 'PUBLISHING_RETRY_REQUIRED' : 'PUBLISHING_FAILED',
        severity: overdue ? 'CRITICAL' : 'HIGH',
        entityType: 'SCHEDULE',
        entityId: item.id,
        campaignId: campaign.id,
        sourceType: 'publish_attempt',
        sourceId: lastFailed?.id ?? item.id,
        sourceVersion: lastFailed?.completedAt ?? item.updatedAt,
        title: `Publishing failed — ${item.contentKey}`,
        summary: lastFailed?.errorMessage ?? item.blockReason ?? `${item.channel} publish failed`,
        actionLabel: 'Review',
        actionTarget: `campaign:${campaign.id}:schedule:${item.id}`,
        dismissible: false,
      });
    }

    for (const blocked of summary.upcoming.filter((u) => u.status === 'BLOCKED')) {
      this.push(workspaceId, signals, {
        signalType: 'PUBLISHING_FAILED',
        severity: 'HIGH',
        entityType: 'SCHEDULE',
        entityId: blocked.id,
        campaignId: campaign.id,
        sourceType: 'schedule_blocked',
        sourceId: blocked.id,
        sourceVersion: blocked.updatedAt,
        title: `Media issue — ${blocked.contentKey}`,
        summary: blocked.blockReason ?? 'Scheduled publication blocked due to media',
        actionLabel: 'Review',
        actionTarget: `campaign:${campaign.id}:schedule:${blocked.id}`,
        dismissible: false,
      });
    }
  }

  private derivePerformanceSignals(
    workspaceId: string,
    campaign: CampaignRow & { objective_type?: string; primary_kpi?: string; objective_name?: string },
    signals: DerivedSignal[],
  ): void {
    if (!['PUBLISHED', 'MEASURING', 'COMPLETE'].includes(campaign.status)) return;

    const latest = objectiveEvaluationService.getLatestEvaluation(campaign.id);
    const summary = campaignPerformanceService.getSummary(campaign.id, workspaceId);
    if ('error' in summary) return;

    const classification = latest?.classification ?? summary.classification;
    const sourceVersion = latest?.id ?? `${classification}:${summary.primaryKpiValue ?? 'na'}`;
    const base = {
      entityType: 'PERFORMANCE' as AttentionEntityType,
      entityId: campaign.id,
      campaignId: campaign.id,
      sourceType: 'performance_evaluation',
      sourceId: campaign.id,
      sourceVersion,
    };

    if (classification === 'LOW_PERFORMING' || classification === 'BELOW_AVERAGE') {
      this.push(workspaceId, signals, {
        ...base,
        signalType: 'PERFORMANCE_UNDERPERFORMING',
        severity: 'HIGH',
        title: `${campaign.name} underperforming`,
        summary: (latest?.reasons ?? summary.evaluationReasons ?? []).slice(0, 2).join(' · ') || undefined,
        actionLabel: 'View Performance',
        actionTarget: `campaign:${campaign.id}:performance`,
        dismissible: false,
      });
    } else if (classification === 'HIGH_PERFORMING' || classification === 'EXCEPTIONAL') {
      this.push(workspaceId, signals, {
        ...base,
        signalType: 'PERFORMANCE_HIGH_PERFORMING',
        severity: 'INFO',
        title: `${campaign.name} performing well`,
        summary: `${summary.primaryKpi}: ${summary.primaryKpiValue ?? '—'}`,
        actionLabel: 'View Performance',
        actionTarget: `campaign:${campaign.id}:performance`,
        dismissible: true,
      });
    } else if (classification === 'INSUFFICIENT_DATA') {
      this.push(workspaceId, signals, {
        ...base,
        signalType: 'PERFORMANCE_INSUFFICIENT_DATA',
        severity: 'LOW',
        title: `${campaign.name} — not enough data yet`,
        summary: 'More evidence is needed before classification.',
        actionLabel: 'View Performance',
        actionTarget: `campaign:${campaign.id}:performance`,
        dismissible: false,
      });
    }
  }

  private deriveExperimentSignals(
    workspaceId: string,
    campaign: CampaignRow,
    signals: DerivedSignal[],
  ): void {
    const experiments = experimentService.list(campaign.id, workspaceId);
    if ('error' in experiments) return;

    for (const exp of experiments) {
      const base = {
        entityType: 'EXPERIMENT' as AttentionEntityType,
        entityId: exp.id,
        campaignId: campaign.id,
        sourceType: 'experiment',
        sourceId: exp.id,
        sourceVersion: exp.status,
      };

      if (['DRAFT', 'READY'].includes(exp.status) && exp.variants.length >= 2) {
        this.push(workspaceId, signals, {
          ...base,
          signalType: 'EXPERIMENT_READY_TO_START',
          severity: 'MEDIUM',
          title: `${exp.name} ready to start`,
          summary: `${exp.variableType.replace(/_/g, ' ')} test`,
          actionLabel: 'Start',
          actionTarget: `campaign:${campaign.id}:experiments:${exp.id}`,
          dismissible: false,
        });
      }

      if (exp.status === 'RUNNING') {
        const analyses = experimentAnalysisService.listAnalyses(exp.id, workspaceId);
        const latest = analyses[analyses.length - 1];
        if (latest) {
          const winnerOutcomes = new Set(['VARIANT_A_WINS', 'VARIANT_B_WINS', 'VARIANT_WINNER']);
          if (winnerOutcomes.has(latest.outcome)) {
            this.push(workspaceId, signals, {
              ...base,
              signalType: 'EXPERIMENT_DECISION_AVAILABLE',
              severity: 'HIGH',
              sourceVersion: latest.id,
              title: `${exp.name} — decision available`,
              summary: `${latest.outcome.replace(/_/g, ' ').toLowerCase()} on ${latest.primaryKpi}`,
              actionLabel: 'Review Experiment',
              actionTarget: `campaign:${campaign.id}:experiments:${exp.id}`,
              dismissible: false,
            });
          } else if (['INCONCLUSIVE', 'INSUFFICIENT_DATA', 'NO_MEANINGFUL_DIFFERENCE'].includes(latest.outcome)) {
            this.push(workspaceId, signals, {
              ...base,
              signalType: latest.outcome === 'INSUFFICIENT_DATA' ? 'EXPERIMENT_INSUFFICIENT_DATA' : 'EXPERIMENT_INCONCLUSIVE',
              severity: 'MEDIUM',
              sourceVersion: latest.id,
              title: `${exp.name} — ${latest.outcome.replace(/_/g, ' ').toLowerCase()}`,
              summary: latest.reasons.slice(0, 2).join(' · ') || undefined,
              actionLabel: 'Review Experiment',
              actionTarget: `campaign:${campaign.id}:experiments:${exp.id}`,
              dismissible: false,
            });
          }
          if (exp.mode === 'OBSERVATIONAL_COMPARISON') {
            this.push(workspaceId, signals, {
              ...base,
              signalType: 'EXPERIMENT_READY_FOR_ANALYSIS',
              severity: 'LOW',
              sourceVersion: `${latest.id}:observational`,
              title: `${exp.name} — observational comparison`,
              summary: 'Not a randomized audience split. Timing or audience may influence results.',
              actionLabel: 'Review Experiment',
              actionTarget: `campaign:${campaign.id}:experiments:${exp.id}`,
              dismissible: false,
            });
          }
        } else {
          this.push(workspaceId, signals, {
            ...base,
            signalType: 'EXPERIMENT_READY_FOR_ANALYSIS',
            severity: 'MEDIUM',
            title: `${exp.name} ready to analyze`,
            actionLabel: 'Analyze',
            actionTarget: `campaign:${campaign.id}:experiments:${exp.id}`,
            dismissible: false,
          });
        }
      }
    }
  }

  private deriveBlueprintSignals(workspaceId: string, signals: DerivedSignal[]): void {
    const rows = db.prepare(`
      SELECT clr.*, c.name as campaign_name
      FROM campaign_library_records clr
      JOIN campaigns c ON c.id = clr.campaign_id
      WHERE clr.workspace_id = ? AND clr.blueprint_candidate = 1 AND (clr.blueprint_id IS NULL OR clr.blueprint_id = '')
    `).all(workspaceId) as Array<{ campaign_id: string; campaign_name: string; updated_at: string }>;

    for (const row of rows) {
      const perf = campaignPerformanceService.getSummary(row.campaign_id, workspaceId);
      if ('error' in perf || !perf.blueprintCandidate) continue;
      this.push(workspaceId, signals, {
        signalType: 'BLUEPRINT_CANDIDATE',
        severity: 'MEDIUM',
        entityType: 'BLUEPRINT',
        entityId: row.campaign_id,
        campaignId: row.campaign_id,
        sourceType: 'library_record',
        sourceId: row.campaign_id,
        sourceVersion: row.updated_at,
        title: `${row.campaign_name} — blueprint candidate`,
        summary: `${perf.classification.replace(/_/g, ' ').toLowerCase()} · ${perf.objective.type}`,
        actionLabel: 'Create Blueprint',
        actionTarget: `library:${row.campaign_id}:blueprint`,
        dismissible: true,
      });
    }
  }

  private deriveLearningSignals(workspaceId: string, signals: DerivedSignal[]): void {
    for (const learning of learningService.list(workspaceId, 'CANDIDATE')) {
      this.push(workspaceId, signals, {
        signalType: 'LEARNING_CANDIDATE',
        severity: 'LOW',
        entityType: 'LEARNING',
        entityId: learning.id,
        sourceType: 'workspace_learning',
        sourceId: learning.id,
        sourceVersion: String(learning.evidenceCount),
        title: 'Learning candidate',
        summary: learning.statement,
        actionLabel: 'Review Learning',
        actionTarget: `learning:${learning.id}`,
        dismissible: true,
      });
    }
  }

  private deriveIntegrationSignals(workspaceId: string, signals: DerivedSignal[]): void {
    const rows = db.prepare(`
      SELECT * FROM integration_connections
      WHERE workspace_id = ? AND status IN ('ERROR', 'REAUTH_REQUIRED', 'DISCONNECTED')
    `).all(workspaceId) as Array<{ id: string; provider_key: string; status: string }>;

    for (const row of rows) {
      this.push(workspaceId, signals, {
        signalType: 'INTEGRATION_ATTENTION',
        severity: 'MEDIUM',
        entityType: 'INTEGRATION',
        entityId: row.id,
        sourceType: 'integration_connection',
        sourceId: row.id,
        sourceVersion: row.status,
        title: `${row.provider_key} connection needs attention`,
        summary: row.status.replace(/_/g, ' ').toLowerCase(),
        actionLabel: 'Review',
        actionTarget: `integrations:${row.id}`,
        dismissible: false,
      });
    }
  }
}

export const attentionSignalService = new AttentionSignalService();

export function formatScheduleLocal(scheduledFor: string, timezone = DEFAULT_SCHEDULE_TIMEZONE): {
  localDayLabel: string;
  localTimeLabel: string;
} {
  const date = new Date(scheduledFor);
  const dayFormatter = new Intl.DateTimeFormat('en-NZ', {
    timeZone: timezone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  const timeFormatter = new Intl.DateTimeFormat('en-NZ', {
    timeZone: timezone,
    hour: 'numeric',
    minute: '2-digit',
  });
  const now = new Date();
  const todayStr = dayFormatter.format(now);
  const dayStr = dayFormatter.format(date);
  const localDayLabel = dayStr === todayStr ? 'Today' : dayStr;
  return { localDayLabel, localTimeLabel: timeFormatter.format(date) };
}

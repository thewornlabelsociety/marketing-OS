import {
  AlertCircle,
  ArrowRight,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Circle,
  Clock,
  Loader2,
  TrendingDown,
  TrendingUp,
  Zap,
} from 'lucide-react';
import type { Campaign, CampaignCreativeSummary, CampaignPerformanceSummary, CampaignPublishingSummary, CampaignStatus } from '../../types';
import type { AttentionSignal } from '../../types/dashboard';
import type { Experiment } from '../../types/experiment';

type DetailTab = 'overview' | 'content' | 'schedule' | 'performance' | 'experiments';

export interface PlanStatusData {
  aiConfigured: boolean;
  hasPlan: boolean;
}

export interface ContentStatusData {
  hasContentPlan: boolean;
  contentPlanStatus: string | null;
  strategyApproved: boolean;
  contentPlanApproved: boolean;
  aiConfigured: boolean;
}

interface Props {
  campaign: Campaign;
  planStatus: PlanStatusData | null;
  contentStatus: ContentStatusData | null;
  creativeSummary: CampaignCreativeSummary | null;
  scheduleSummary: CampaignPublishingSummary | null;
  performance: CampaignPerformanceSummary | null;
  performanceUnavailable: boolean;
  experiments: Experiment[];
  attentionSignals: AttentionSignal[];
  loading: boolean;
  onNavigate: (tab: DetailTab) => void;
}

// ─── Stage derivation ─────────────────────────────────────────────────────────

type StageState = 'done' | 'active' | 'warning' | 'pending';

interface Stage {
  key: string;
  label: string;
  state: StageState;
  badge?: number;
}

function deriveStages(
  campaign: Campaign,
  planStatus: PlanStatusData | null,
  contentStatus: ContentStatusData | null,
  creativeSummary: CampaignCreativeSummary | null,
  scheduleSummary: CampaignPublishingSummary | null,
  performance: CampaignPerformanceSummary | null,
  experiments: Experiment[],
): Stage[] {
  const s = campaign.status as CampaignStatus;
  const PAST = new Set<CampaignStatus>(['APPROVED', 'SCHEDULED', 'PUBLISHED', 'MEASURING', 'COMPLETE']);
  const strategyApproved = PAST.has(s);

  const hasPlan = planStatus?.hasPlan ?? false;
  const hasContentPlan = contentStatus?.hasContentPlan ?? false;
  const contentPlanApproved = contentStatus?.contentPlanApproved ?? false;
  const generated = creativeSummary?.generated ?? 0;
  const needsReview = creativeSummary?.needsReview ?? 0;
  const needsGeneration = creativeSummary?.needsGeneration ?? 0;
  const readyForScheduling = creativeSummary?.readyForScheduling ?? false;
  const scheduled = scheduleSummary?.scheduled ?? 0;
  const published = scheduleSummary?.published ?? 0;
  const failed = scheduleSummary?.failed ?? 0;
  const unscheduled = scheduleSummary?.unscheduled ?? 0;
  const hasObservations = Boolean(performance?.lastObservedAt);
  const hasExperimentResults = experiments.some(e => Boolean(e.outcome));

  const planState: StageState = strategyApproved ? 'done' : hasPlan ? 'active' : 'pending';

  const createState: StageState = (() => {
    if (contentPlanApproved && generated > 0 && needsGeneration === 0) return 'done';
    if (contentPlanApproved || hasContentPlan || strategyApproved) return 'active';
    return 'pending';
  })();

  const reviewState: StageState = (() => {
    if (generated > 0 && needsReview === 0 && contentPlanApproved) return 'done';
    if (needsReview > 0) return 'active';
    if (generated > 0) return 'active';
    return 'pending';
  })();

  const approveState: StageState = (() => {
    if (readyForScheduling) return 'done';
    if (generated > 0 && needsReview === 0) return 'active';
    return 'pending';
  })();

  const scheduleState: StageState = (() => {
    if (scheduled > 0 && unscheduled === 0 && readyForScheduling) return 'done';
    if (scheduled > 0) return 'active';
    if (readyForScheduling && unscheduled > 0) return 'active';
    return 'pending';
  })();

  const publishState: StageState = (() => {
    if (failed > 0) return 'warning';
    if (published > 0 && scheduled === 0) return 'done';
    if (scheduled > 0) return 'active';
    return 'pending';
  })();

  const measureState: StageState = (() => {
    if (hasObservations && performance?.classification !== 'INSUFFICIENT_DATA') return 'done';
    if (published > 0 || hasObservations) return 'active';
    return 'pending';
  })();

  const learnState: StageState = hasExperimentResults ? 'done'
    : hasObservations ? 'active'
    : 'pending';

  return [
    { key: 'plan', label: 'Plan', state: planState },
    { key: 'create', label: 'Create', state: createState, badge: needsGeneration || undefined },
    { key: 'review', label: 'Review', state: reviewState, badge: needsReview || undefined },
    { key: 'approve', label: 'Approve', state: approveState },
    { key: 'schedule', label: 'Schedule', state: scheduleState, badge: (readyForScheduling && unscheduled) || undefined },
    { key: 'publish', label: 'Publish', state: publishState, badge: failed || undefined },
    { key: 'measure', label: 'Measure', state: measureState },
    { key: 'learn', label: 'Learn', state: learnState },
  ];
}

// ─── Next action derivation ──────────────────────────────────────────────────

interface NextAction {
  label: string;
  description: string;
  tab?: DetailTab;
}

function deriveNextAction(
  campaign: Campaign,
  planStatus: PlanStatusData | null,
  contentStatus: ContentStatusData | null,
  creativeSummary: CampaignCreativeSummary | null,
  scheduleSummary: CampaignPublishingSummary | null,
  performance: CampaignPerformanceSummary | null,
): NextAction | null {
  const s = campaign.status as CampaignStatus;
  if (s === 'CANCELLED' || s === 'COMPLETE' || s === 'ARCHIVED') return null;

  const hasPlan = planStatus?.hasPlan ?? false;
  const hasContentPlan = contentStatus?.hasContentPlan ?? false;
  const contentPlanApproved = contentStatus?.contentPlanApproved ?? false;
  const generated = creativeSummary?.generated ?? 0;
  const needsReview = creativeSummary?.needsReview ?? 0;
  const needsGeneration = creativeSummary?.needsGeneration ?? 0;
  const readyForScheduling = creativeSummary?.readyForScheduling ?? false;
  const unscheduled = scheduleSummary?.unscheduled ?? 0;
  const failed = scheduleSummary?.failed ?? 0;
  const scheduled = scheduleSummary?.scheduled ?? 0;
  const published = scheduleSummary?.published ?? 0;

  if (!hasPlan) return {
    label: 'Create Campaign Plan',
    description: 'Build the strategic approach before creating content.',
    tab: 'overview',
  };

  if (s === 'READY_FOR_APPROVAL') return {
    label: 'Approve Campaign Strategy',
    description: 'Review and approve the campaign plan — see Campaign Plan below.',
    tab: 'overview',
  };

  if (!hasContentPlan) return {
    label: 'Create Content Plan',
    description: 'Define the specific content pieces for this campaign.',
    tab: 'content',
  };

  if (!contentPlanApproved) return {
    label: 'Review Content Plan',
    description: 'Approve the content plan to start generating creative.',
    tab: 'content',
  };

  if (needsGeneration > 0) return {
    label: `Generate ${needsGeneration} Creative Piece${needsGeneration !== 1 ? 's' : ''}`,
    description: 'Approved deliverables are waiting for creative generation.',
    tab: 'content',
  };

  if (needsReview > 0) return {
    label: `Review ${needsReview} Piece${needsReview !== 1 ? 's' : ''}`,
    description: 'Content is ready for your review and approval.',
    tab: 'content',
  };

  if (generated > 0 && !readyForScheduling) return {
    label: 'Approve Creative',
    description: 'All content has been reviewed — approve to unlock scheduling.',
    tab: 'content',
  };

  if (failed > 0) return {
    label: `Fix ${failed} Publishing Failure${failed !== 1 ? 's' : ''}`,
    description: 'Posts failed to publish. Retry or reschedule.',
    tab: 'schedule',
  };

  if (unscheduled > 0) return {
    label: `Schedule ${unscheduled} Post${unscheduled !== 1 ? 's' : ''}`,
    description: 'Approved content is ready to be scheduled.',
    tab: 'schedule',
  };

  if (scheduled > 0) return {
    label: 'Monitor Schedule',
    description: `${scheduled} post${scheduled !== 1 ? 's' : ''} queued for publishing.`,
    tab: 'schedule',
  };

  if (published > 0 && !performance?.lastObservedAt) return {
    label: 'Add Performance Data',
    description: 'Content has published — record results to measure impact.',
    tab: 'performance',
  };

  if (performance?.lastObservedAt && performance.classification !== 'INSUFFICIENT_DATA') return {
    label: 'Review Results',
    description: `Campaign is ${performance.classification.replace(/_/g, ' ').toLowerCase()}.`,
    tab: 'performance',
  };

  return null;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function StageIcon({ state }: { state: StageState }) {
  if (state === 'done') return <CheckCircle2 className="h-4 w-4 text-[#09090B]" />;
  if (state === 'active') return <Circle className="h-4 w-4 fill-[#09090B] text-[#09090B]" />;
  if (state === 'warning') return <AlertCircle className="h-4 w-4 text-amber-500" />;
  return <Circle className="h-4 w-4 text-[#D4D4D8]" />;
}

function ProgressStrip({ stages }: { stages: Stage[] }) {
  return (
    <div className="flex items-center gap-0 overflow-x-auto">
      {stages.map((stage, i) => (
        <div key={stage.key} className="flex items-center">
          <div className="flex flex-col items-center gap-1 px-1">
            <div className="relative">
              <StageIcon state={stage.state} />
              {stage.badge != null && stage.badge > 0 && (
                <span className="absolute -right-2 -top-2 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[9px] font-bold text-white">
                  {stage.badge > 9 ? '9+' : stage.badge}
                </span>
              )}
            </div>
            <span
              className={`whitespace-nowrap text-[10px] font-medium ${
                stage.state === 'done' ? 'text-[#09090B]'
                : stage.state === 'active' ? 'text-[#09090B]'
                : stage.state === 'warning' ? 'text-amber-600'
                : 'text-[#A1A1AA]'
              }`}
            >
              {stage.label}
            </span>
          </div>
          {i < stages.length - 1 && (
            <div className={`h-px w-6 shrink-0 ${stage.state === 'done' ? 'bg-[#D4D4D8]' : 'bg-[#E4E4E7]'}`} />
          )}
        </div>
      ))}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-[#A1A1AA]">
      {children}
    </p>
  );
}

function PERF_COLOR(c: string): string {
  if (['EXCEPTIONAL', 'HIGH_PERFORMING', 'ABOVE_AVERAGE'].includes(c)) return 'text-emerald-700 bg-emerald-50';
  if (['BELOW_AVERAGE', 'LOW_PERFORMING'].includes(c)) return 'text-red-700 bg-red-50';
  if (c === 'INSUFFICIENT_DATA') return 'text-[#71717A] bg-[#F4F4F5]';
  return 'text-[#71717A] bg-[#F4F4F5]';
}

function SIGNAL_COLOR(severity: string): string {
  if (severity === 'CRITICAL') return 'border-red-200 bg-red-50';
  if (severity === 'HIGH') return 'border-amber-200 bg-amber-50';
  if (severity === 'MEDIUM') return 'border-amber-100 bg-amber-50/50';
  return 'border-[#E4E4E7] bg-white';
}

function SIGNAL_ICON_COLOR(severity: string): string {
  if (severity === 'CRITICAL') return 'text-red-500';
  if (severity === 'HIGH') return 'text-amber-500';
  if (severity === 'MEDIUM') return 'text-amber-400';
  return 'text-[#71717A]';
}

// ─── Main component ──────────────────────────────────────────────────────────

export function CampaignCommandCentre({
  campaign,
  planStatus,
  contentStatus,
  creativeSummary,
  scheduleSummary,
  performance,
  performanceUnavailable,
  experiments,
  attentionSignals,
  loading,
  onNavigate,
}: Props) {
  const stages = deriveStages(campaign, planStatus, contentStatus, creativeSummary, scheduleSummary, performance, experiments);
  const nextAction = deriveNextAction(campaign, planStatus, contentStatus, creativeSummary, scheduleSummary, performance);

  const generated = creativeSummary?.generated ?? 0;
  const needsReview = creativeSummary?.needsReview ?? 0;
  const approved = creativeSummary?.approved ?? 0;
  const needsGeneration = creativeSummary?.needsGeneration ?? 0;
  const totalDeliverables = creativeSummary?.totalDeliverables ?? 0;

  const upcoming = scheduleSummary?.upcoming ?? [];
  const failed = scheduleSummary?.failed ?? 0;
  const published = scheduleSummary?.published ?? 0;
  const scheduled = scheduleSummary?.scheduled ?? 0;

  const s = campaign.status as CampaignStatus;
  const isTerminal = s === 'CANCELLED' || s === 'COMPLETE' || s === 'ARCHIVED';

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      {/* Campaign Progress */}
      <section>
        <SectionLabel>Campaign Progress</SectionLabel>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-[#71717A]">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading…
          </div>
        ) : (
          <div className="rounded-xl border border-[#E4E4E7] bg-white px-4 py-4">
            <ProgressStrip stages={stages} />
          </div>
        )}
      </section>

      {/* Primary Next Action */}
      {!loading && nextAction && (
        <section>
          <SectionLabel>Next Step</SectionLabel>
          <button
            type="button"
            onClick={() => {
              if (nextAction.tab) onNavigate(nextAction.tab);
            }}
            className="flex w-full items-center justify-between rounded-xl border border-[#09090B] bg-[#09090B] px-4 py-4 text-left transition hover:bg-[#18181B]"
          >
            <div>
              <p className="text-sm font-semibold text-white">{nextAction.label}</p>
              <p className="mt-0.5 text-xs text-[#A1A1AA]">{nextAction.description}</p>
            </div>
            <ArrowRight className="h-4 w-4 shrink-0 text-white" />
          </button>
        </section>
      )}

      {/* Attention */}
      {!loading && attentionSignals.length > 0 && (
        <section>
          <SectionLabel>Needs Attention</SectionLabel>
          <div className="space-y-2">
            {attentionSignals.slice(0, 5).map((signal) => (
              <div
                key={signal.id}
                className={`flex items-start gap-3 rounded-xl border p-3 ${SIGNAL_COLOR(signal.severity)}`}
              >
                <AlertCircle className={`mt-0.5 h-4 w-4 shrink-0 ${SIGNAL_ICON_COLOR(signal.severity)}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[#09090B]">{signal.title}</p>
                  {signal.summary && (
                    <p className="mt-0.5 text-xs text-[#71717A]">{signal.summary}</p>
                  )}
                </div>
                {signal.actionLabel && signal.actionTarget && (
                  <button
                    type="button"
                    onClick={() => {
                      const target = signal.actionTarget;
                      if (target?.includes('/content')) onNavigate('content');
                      else if (target?.includes('/schedule')) onNavigate('schedule');
                      else if (target?.includes('/performance')) onNavigate('performance');
                      else if (target?.includes('/experiments')) onNavigate('experiments');
                    }}
                    className="shrink-0 rounded-lg border border-[#E4E4E7] bg-white px-2.5 py-1 text-xs font-medium text-[#09090B] hover:bg-[#FAFAFA]"
                  >
                    {signal.actionLabel}
                  </button>
                )}
              </div>
            ))}
            {attentionSignals.length > 5 && (
              <p className="text-xs text-[#71717A] px-1">{attentionSignals.length - 5} more signals on the dashboard</p>
            )}
          </div>
        </section>
      )}

      {/* Content Workspace */}
      {!loading && (
        <section>
          <div className="flex items-center justify-between mb-2">
            <SectionLabel>Content Workspace</SectionLabel>
            <button
              type="button"
              onClick={() => onNavigate('content')}
              className="flex items-center gap-1 text-xs text-[#71717A] hover:text-[#09090B]"
            >
              View all <ChevronRight className="h-3 w-3" />
            </button>
          </div>

          {!contentStatus?.hasContentPlan ? (
            <div className="rounded-xl border border-dashed border-[#E4E4E7] px-4 py-6 text-center">
              <p className="text-sm text-[#71717A]">No content plan yet.</p>
              {!isTerminal && (
                <button
                  type="button"
                  onClick={() => onNavigate('content')}
                  className="mt-2 text-xs font-medium text-[#09090B] underline underline-offset-2 hover:opacity-70"
                >
                  Create content plan
                </button>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-[#E4E4E7] bg-white divide-y divide-[#F4F4F5]">
              {creativeSummary ? (
                <div className="grid grid-cols-4 divide-x divide-[#F4F4F5]">
                  {[
                    { label: 'Planned', value: totalDeliverables, note: totalDeliverables === 1 ? 'piece' : 'pieces' },
                    { label: 'Generated', value: generated, note: needsGeneration > 0 ? `${needsGeneration} remaining` : 'all done' },
                    { label: 'Needs Review', value: needsReview, note: needsReview > 0 ? 'action needed' : 'none' },
                    { label: 'Approved', value: approved, note: creativeSummary.readyForScheduling ? 'ready to schedule' : '' },
                  ].map((stat) => (
                    <button
                      key={stat.label}
                      type="button"
                      onClick={() => onNavigate('content')}
                      className="flex flex-col items-center px-4 py-4 text-center hover:bg-[#FAFAFA] transition"
                    >
                      <span className="text-2xl font-semibold text-[#09090B]">{stat.value}</span>
                      <span className="mt-0.5 text-[11px] font-medium text-[#71717A]">{stat.label}</span>
                      {stat.note && <span className="mt-0.5 text-[10px] text-[#A1A1AA]">{stat.note}</span>}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="px-4 py-3">
                  <p className="text-sm text-[#71717A]">
                    {contentStatus.contentPlanStatus === 'GENERATING'
                      ? 'Content plan is being generated…'
                      : contentStatus.contentPlanApproved
                      ? 'No creative generated yet.'
                      : 'Content plan awaiting approval.'}
                  </p>
                  <button
                    type="button"
                    onClick={() => onNavigate('content')}
                    className="mt-1 text-xs font-medium text-[#09090B] underline underline-offset-2 hover:opacity-70"
                  >
                    Go to content
                  </button>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* Schedule */}
      {!loading && (
        <section>
          <div className="flex items-center justify-between mb-2">
            <SectionLabel>Schedule</SectionLabel>
            <button
              type="button"
              onClick={() => onNavigate('schedule')}
              className="flex items-center gap-1 text-xs text-[#71717A] hover:text-[#09090B]"
            >
              View all <ChevronRight className="h-3 w-3" />
            </button>
          </div>

          {scheduleSummary === null ? (
            <div className="rounded-xl border border-dashed border-[#E4E4E7] px-4 py-6 text-center">
              <p className="text-sm text-[#71717A]">No schedule data yet.</p>
            </div>
          ) : upcoming.length === 0 && published === 0 && failed === 0 && scheduled === 0 ? (
            <div className="rounded-xl border border-dashed border-[#E4E4E7] px-4 py-6 text-center">
              <p className="text-sm text-[#71717A]">Nothing scheduled yet.</p>
              {creativeSummary?.readyForScheduling && !isTerminal && (
                <button
                  type="button"
                  onClick={() => onNavigate('schedule')}
                  className="mt-2 text-xs font-medium text-[#09090B] underline underline-offset-2 hover:opacity-70"
                >
                  Schedule approved content
                </button>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-[#E4E4E7] bg-white overflow-hidden">
              {/* Summary row */}
              <div className="flex items-center divide-x divide-[#F4F4F5] border-b border-[#F4F4F5]">
                {[
                  { label: 'Scheduled', value: scheduled, color: 'text-[#09090B]' },
                  { label: 'Published', value: published, color: 'text-[#09090B]' },
                  { label: 'Failed', value: failed, color: failed > 0 ? 'text-red-600' : 'text-[#A1A1AA]' },
                ].map((stat) => (
                  <div key={stat.label} className="flex flex-col items-center flex-1 py-3 px-2">
                    <span className={`text-lg font-semibold ${stat.color}`}>{stat.value}</span>
                    <span className="text-[10px] text-[#71717A]">{stat.label}</span>
                  </div>
                ))}
              </div>

              {/* Upcoming items */}
              {upcoming.slice(0, 3).map((item) => {
                const d = new Date(item.scheduledFor);
                const dateLabel = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                const timeLabel = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
                return (
                  <div key={item.id} className="flex items-center gap-3 px-4 py-3 border-b border-[#F4F4F5] last:border-0">
                    <Calendar className="h-3.5 w-3.5 shrink-0 text-[#A1A1AA]" />
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-sm font-medium text-[#09090B]">{item.contentKey.replace(/[-_]+/g, ' ').replace(/\b\w/g, m => m.toUpperCase()).replace(/\b0*\d+\b/g, '').trim()}</p>
                      <p className="text-xs text-[#71717A]">{item.channel} · {dateLabel} {timeLabel}</p>
                    </div>
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                      item.status === 'PUBLISHED' ? 'bg-emerald-50 text-emerald-700'
                      : item.status === 'FAILED' ? 'bg-red-50 text-red-700'
                      : item.status === 'PUBLISHING' ? 'bg-blue-50 text-blue-700'
                      : 'bg-[#F4F4F5] text-[#71717A]'
                    }`}>
                      {item.status}
                    </span>
                  </div>
                );
              })}

              {upcoming.length > 3 && (
                <button
                  type="button"
                  onClick={() => onNavigate('schedule')}
                  className="flex w-full items-center justify-center gap-1 px-4 py-2.5 text-xs text-[#71717A] hover:bg-[#FAFAFA]"
                >
                  {upcoming.length - 3} more <ChevronRight className="h-3 w-3" />
                </button>
              )}
            </div>
          )}
        </section>
      )}

      {/* Results */}
      {!loading && (
        <section>
          <div className="flex items-center justify-between mb-2">
            <SectionLabel>Results</SectionLabel>
            <button
              type="button"
              onClick={() => onNavigate('performance')}
              className="flex items-center gap-1 text-xs text-[#71717A] hover:text-[#09090B]"
            >
              Full results <ChevronRight className="h-3 w-3" />
            </button>
          </div>

          {performanceUnavailable ? (
            <div className="rounded-xl border border-[#E4E4E7] bg-white px-4 py-4">
              <p className="text-sm text-[#71717A]">Performance data temporarily unavailable.</p>
            </div>
          ) : !performance || !performance.lastObservedAt ? (
            <div className="rounded-xl border border-dashed border-[#E4E4E7] px-4 py-6 text-center">
              <p className="text-sm text-[#71717A]">
                {published > 0 ? 'Gathering performance data…' : 'Results will appear after content is published.'}
              </p>
              {published > 0 && (
                <button
                  type="button"
                  onClick={() => onNavigate('performance')}
                  className="mt-2 text-xs font-medium text-[#09090B] underline underline-offset-2 hover:opacity-70"
                >
                  Add performance data
                </button>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-[#E4E4E7] bg-white p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    {['EXCEPTIONAL', 'HIGH_PERFORMING', 'ABOVE_AVERAGE'].includes(performance.classification)
                      ? <TrendingUp className="h-4 w-4 text-emerald-600" />
                      : ['BELOW_AVERAGE', 'LOW_PERFORMING'].includes(performance.classification)
                      ? <TrendingDown className="h-4 w-4 text-red-600" />
                      : <Zap className="h-4 w-4 text-[#71717A]" />}
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${PERF_COLOR(performance.classification)}`}>
                      {performance.classification.replace(/_/g, ' ')}
                    </span>
                  </div>
                  {performance.primaryKpiValue != null ? (
                    <p className="mt-2 text-2xl font-semibold text-[#09090B]">
                      {performance.primaryKpiValue.toLocaleString()}
                    </p>
                  ) : null}
                  <p className="mt-0.5 text-xs text-[#71717A]">
                    {performance.primaryKpi.replace(/_/g, ' ')}
                    {performance.primaryKpiValue == null && (
                      <span className="ml-1 text-[#A1A1AA]">(no data yet)</span>
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate('performance')}
                  className="shrink-0 rounded-lg border border-[#E4E4E7] px-3 py-1.5 text-xs font-medium text-[#09090B] hover:bg-[#FAFAFA]"
                >
                  Details
                </button>
              </div>
              {performance.evaluationReasons.length > 0 && (
                <p className="mt-3 text-xs text-[#71717A] leading-relaxed">
                  {performance.evaluationReasons[0]}
                </p>
              )}
            </div>
          )}
        </section>
      )}

      {/* Learning */}
      {!loading && experiments.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-2">
            <SectionLabel>Experiments & Learning</SectionLabel>
            <button
              type="button"
              onClick={() => onNavigate('experiments')}
              className="flex items-center gap-1 text-xs text-[#71717A] hover:text-[#09090B]"
            >
              View all <ChevronRight className="h-3 w-3" />
            </button>
          </div>

          <div className="rounded-xl border border-[#E4E4E7] bg-white divide-y divide-[#F4F4F5] overflow-hidden">
            {experiments.slice(0, 3).map((exp) => (
              <div key={exp.id} className="flex items-center justify-between px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[#09090B] truncate">{exp.name}</p>
                  <p className="text-xs text-[#71717A]">
                    {exp.primaryKpi.replace(/_/g, ' ')} · {exp.status}
                    {exp.outcome ? ` · ${exp.outcome.replace(/_/g, ' ')}` : ''}
                  </p>
                </div>
                {exp.outcome && (
                  <span className={`ml-2 shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                    ['VARIANT_A_WINS', 'VARIANT_B_WINS', 'VARIANT_WINNER'].includes(exp.outcome)
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-[#F4F4F5] text-[#71717A]'
                  }`}>
                    {exp.outcome.replace(/_/g, ' ')}
                  </span>
                )}
              </div>
            ))}
            {experiments.length > 3 && (
              <button
                type="button"
                onClick={() => onNavigate('experiments')}
                className="flex w-full items-center justify-center gap-1 px-4 py-2.5 text-xs text-[#71717A] hover:bg-[#FAFAFA]"
              >
                {experiments.length - 3} more <ChevronRight className="h-3 w-3" />
              </button>
            )}
          </div>
        </section>
      )}

      {/* Learning empty state for active campaigns with no experiments */}
      {!loading && experiments.length === 0 && !isTerminal && performance?.lastObservedAt && (
        <section>
          <SectionLabel>Learning</SectionLabel>
          <div className="rounded-xl border border-dashed border-[#E4E4E7] px-4 py-4">
            <p className="text-sm text-[#71717A]">Run an experiment to generate campaign learning evidence.</p>
            <button
              type="button"
              onClick={() => onNavigate('experiments')}
              className="mt-1.5 text-xs font-medium text-[#09090B] underline underline-offset-2 hover:opacity-70"
            >
              Create experiment
            </button>
          </div>
        </section>
      )}

      {/* Terminal state notice */}
      {isTerminal && (
        <div className="rounded-xl border border-[#E4E4E7] bg-[#FAFAFA] px-4 py-3">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-[#A1A1AA]" />
            <p className="text-sm text-[#71717A]">
              {s === 'CANCELLED'
                ? `Campaign cancelled${campaign.cancellationReason ? ` — ${campaign.cancellationReason}` : ''}`
                : s === 'COMPLETE'
                ? 'Campaign complete. Results and learnings are preserved for future reference.'
                : 'Campaign archived.'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

import { AlertCircle, ArrowRight, Calendar, FlaskConical, Loader2, Sparkles, TrendingDown, TrendingUp } from 'lucide-react';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useApp } from '../../app/AppContext';
import { api } from '../../services/api';
import type { DashboardSnapshot, AttentionSignal } from '../../types/dashboard';

function sectionHasContent(children: ReactNode): boolean {
  if (children == null || children === false) return false;
  if (Array.isArray(children)) {
    return children.some((child) => child != null && child !== false);
  }
  return true;
}

function SignalRow({
  signal,
  onAction,
  onDismiss,
}: {
  signal: AttentionSignal;
  onAction: (target: string) => void;
  onDismiss?: (id: string) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-3">
      <div className="flex items-start gap-2.5 min-w-0">
        <AlertCircle className={`mt-0.5 h-4 w-4 shrink-0 ${signal.severity === 'CRITICAL' || signal.severity === 'HIGH' ? 'text-[#DC2626]' : 'text-[#71717A]'}`} />
        <div className="min-w-0">
          <p className="text-sm font-medium text-[#09090B]">{signal.title}</p>
          {signal.summary && <p className="mt-0.5 text-xs text-[#71717A]">{signal.summary}</p>}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {signal.dismissible && onDismiss && (
          <button type="button" onClick={() => onDismiss(signal.id)} className="text-xs text-[#A1A1AA] hover:text-[#71717A]">
            Dismiss
          </button>
        )}
        {signal.actionTarget && signal.actionLabel && (
          <button
            type="button"
            onClick={() => onAction(signal.actionTarget!)}
            className="inline-flex items-center gap-1 text-xs font-medium text-[#09090B] hover:underline"
          >
            {signal.actionLabel}
            <ArrowRight className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}

function Section({ title, children, empty }: { title: string; children?: ReactNode; empty?: string }) {
  const hasContent = sectionHasContent(children);
  return (
    <section>
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-[#A1A1AA]">{title}</p>
      <div className="rounded-xl border border-[#E4E4E7] bg-white px-4">
        {hasContent ? children : <p className="py-4 text-sm text-[#71717A]">{empty ?? 'Nothing here.'}</p>}
      </div>
    </section>
  );
}

function DashboardHeader() {
  return (
    <div>
      <h1 className="text-lg font-semibold text-[#09090B]">Dashboard</h1>
      <p className="mt-1 text-sm text-[#71717A]">What needs attention, what needs a decision, and what to do next.</p>
    </div>
  );
}

export default function DashboardPage() {
  const { activeEntity, setActiveTab, setActiveCampaignId } = useApp();
  const [dashboard, setDashboard] = useState<DashboardSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const workspaceId = activeEntity?.id ?? '';

  const load = useCallback(async () => {
    if (!workspaceId) {
      setLoading(false);
      setDashboard(null);
      setLoadError(null);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      setDashboard(await api.getDashboard(workspaceId));
    } catch (err) {
      console.error('Dashboard load failed', err);
      setDashboard(null);
      setLoadError((err as Error).message || 'Request failed');
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => { void load(); }, [load]);

  function handleAction(target: string) {
    const [kind, id, section] = target.split(':');
    if (kind === 'campaign') {
      setActiveCampaignId(id);
      setActiveTab('campaign-detail');
      if (section === 'performance') {
        sessionStorage.setItem('campaignDetailTab', 'performance');
      } else if (section === 'schedule') {
        sessionStorage.setItem('campaignDetailTab', 'schedule');
      } else if (section === 'experiments') {
        sessionStorage.setItem('campaignDetailTab', 'experiments');
      } else if (section === 'content') {
        sessionStorage.setItem('campaignDetailTab', 'content');
      }
    } else if (kind === 'library') {
      setActiveTab('library');
    }
  }

  async function handleDismiss(signalId: string) {
    if (!workspaceId) return;
    await api.dismissAttentionSignal(signalId, workspaceId);
    await load();
  }

  if (!workspaceId && !loading) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 p-6">
        <DashboardHeader />
        <p className="text-sm text-[#71717A]">Select a workspace to load your dashboard.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl space-y-8 p-6">
        <DashboardHeader />
        <div className="flex items-center gap-2 text-sm text-[#71717A]">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading dashboard…
        </div>
      </div>
    );
  }

  if (!dashboard) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 p-6">
        <DashboardHeader />
        <div className="rounded-xl border border-[#E4E4E7] bg-white p-4">
          <p className="text-sm text-[#71717A]">We couldn&apos;t load your dashboard.</p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-3 rounded-lg border border-[#E4E4E7] px-3 py-1.5 text-sm font-medium text-[#09090B] hover:bg-[#FAFAFA]"
          >
            Retry
          </button>
        </div>
        {import.meta.env.DEV && loadError && (
          <p className="text-xs text-[#A1A1AA]">{loadError}</p>
        )}
      </div>
    );
  }

  const { counts } = dashboard;
  const showCounts = counts.needsAttention > 0 || counts.readyForReview > 0 || counts.scheduledThisWeek > 0;

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-6">
      <DashboardHeader />

      {showCounts && (
        <div className="flex flex-wrap gap-4 text-sm text-[#71717A]">
          {counts.needsAttention > 0 && <span>{counts.needsAttention} need attention</span>}
          {counts.readyForReview > 0 && <span>{counts.readyForReview} ready for review</span>}
          {counts.scheduledThisWeek > 0 && <span>{counts.scheduledThisWeek} scheduled this week</span>}
          {counts.underperforming > 0 && <span>{counts.underperforming} underperforming</span>}
        </div>
      )}

      <Section title="Needs Attention" empty="Nothing needs your attention.">
        {dashboard.needsAttention.length === 0 ? null : (
          <div className="divide-y divide-[#F4F4F5]">
            {dashboard.needsAttention.map((s) => (
              <SignalRow key={s.id} signal={s} onAction={handleAction} onDismiss={handleDismiss} />
            ))}
          </div>
        )}
      </Section>

      <Section title="Ready for You" empty="No decisions waiting on you.">
        {dashboard.readyForYou.length === 0 ? null : (
          <div className="divide-y divide-[#F4F4F5]">
            {dashboard.readyForYou.map((s) => (
              <SignalRow key={s.id} signal={s} onAction={handleAction} onDismiss={handleDismiss} />
            ))}
          </div>
        )}
      </Section>

      <Section title="Next Up" empty="No upcoming scheduled content.">
        {dashboard.upcoming.length === 0 ? null : (
          <div className="divide-y divide-[#F4F4F5]">
            {dashboard.upcoming.map((u) => (
              <div key={u.scheduleId} className="flex items-center justify-between gap-3 py-3">
                <div className="flex items-start gap-2.5">
                  <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-[#71717A]" />
                  <div>
                    <p className="text-sm font-medium text-[#09090B]">{u.campaignName}</p>
                    <p className="text-xs text-[#71717A]">{u.localDayLabel} · {u.localTimeLabel} · {u.channel} · {u.contentKey}</p>
                  </div>
                </div>
                <span className="text-xs text-[#71717A]">{u.status.replaceAll('_', ' ').toLowerCase()}</span>
              </div>
            ))}
          </div>
        )}
      </Section>

      <div className="grid gap-8 lg:grid-cols-2">
        <Section title="High Performing" empty="No recent performance data yet.">
          {dashboard.performance.highPerforming.length === 0 ? null : (
            <div className="divide-y divide-[#F4F4F5]">
              {dashboard.performance.highPerforming.map((p) => (
                <div key={p.campaignId} className="flex items-center justify-between gap-3 py-3">
                  <div className="flex items-start gap-2">
                    <TrendingUp className="mt-0.5 h-4 w-4 text-[#71717A]" />
                    <div>
                      <p className="text-sm font-medium text-[#09090B]">{p.campaignName}</p>
                      <p className="text-xs text-[#71717A]">{p.objectiveType} · {p.primaryKpi}: {p.primaryKpiValue ?? '—'}</p>
                    </div>
                  </div>
                  <button type="button" onClick={() => handleAction(p.actionTarget)} className="text-xs font-medium text-[#09090B] hover:underline">View</button>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section title="Underperforming" empty="No underperformers flagged.">
          {dashboard.performance.underperforming.length === 0 ? null : (
            <div className="divide-y divide-[#F4F4F5]">
              {dashboard.performance.underperforming.map((p) => (
                <div key={p.campaignId} className="flex items-center justify-between gap-3 py-3">
                  <div className="flex items-start gap-2">
                    <TrendingDown className="mt-0.5 h-4 w-4 text-[#71717A]" />
                    <div>
                      <p className="text-sm font-medium text-[#09090B]">{p.campaignName}</p>
                      <p className="text-xs text-[#71717A]">{p.reasons?.[0] ?? p.classification.replaceAll('_', ' ').toLowerCase()}</p>
                    </div>
                  </div>
                  <button type="button" onClick={() => handleAction(p.actionTarget)} className="text-xs font-medium text-[#09090B] hover:underline">View</button>
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>

      {dashboard.experiments.length > 0 && (
        <Section title="Experiments">
          <div className="divide-y divide-[#F4F4F5]">
            {dashboard.experiments.map((e) => (
              <div key={e.experimentId} className="flex items-center justify-between gap-3 py-3">
                <div className="flex items-start gap-2">
                  <FlaskConical className="mt-0.5 h-4 w-4 shrink-0 text-[#71717A]" />
                  <div>
                    <p className="text-sm font-medium text-[#09090B]">{e.name}</p>
                    <p className="text-xs text-[#71717A]">
                      {e.outcome ? e.outcome.replaceAll('_', ' ').toLowerCase() : e.signalType.replaceAll('_', ' ').toLowerCase()}
                      {e.primaryKpi ? ` · ${e.primaryKpi}` : ''}
                      {e.confidence ? ` · ${e.confidence} confidence` : ''}
                    </p>
                    {e.warnings?.[0] && <p className="mt-1 text-xs text-amber-800">{e.warnings[0]}</p>}
                  </div>
                </div>
                <button type="button" onClick={() => handleAction(e.actionTarget)} className="text-xs font-medium text-[#09090B] hover:underline">Review</button>
              </div>
            ))}
          </div>
        </Section>
      )}

      {dashboard.opportunities.length > 0 && (
        <Section title="Opportunities">
          <div className="divide-y divide-[#F4F4F5]">
            {dashboard.opportunities.map((o) => (
              <div key={`${o.type}-${o.id}`} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <p className="text-sm font-medium text-[#09090B]">{o.title}</p>
                  {o.summary && <p className="text-xs text-[#71717A]">{o.summary}</p>}
                </div>
                <div className="flex items-center gap-2">
                  {o.dismissible && o.signalId && (
                    <button type="button" onClick={() => void handleDismiss(o.signalId!)} className="text-xs text-[#A1A1AA]">Dismiss</button>
                  )}
                  <button type="button" onClick={() => handleAction(o.actionTarget)} className="text-xs font-medium text-[#09090B] hover:underline">{o.actionLabel}</button>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {dashboard.empty && (
        <div className="rounded-xl border border-dashed border-[#E4E4E7] bg-[#FAFAFA] px-6 py-8 text-center">
          <Sparkles className="mx-auto h-6 w-6 text-[#A1A1AA]" />
          <p className="mt-3 text-sm font-medium text-[#09090B]">Create a campaign to start building your marketing plan.</p>
          <button
            type="button"
            onClick={() => setActiveTab('campaigns')}
            className="mt-4 rounded-lg bg-[#09090B] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#18181B]"
          >
            Create Campaign
          </button>
        </div>
      )}
    </div>
  );
}

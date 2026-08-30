import { BarChart3, FlaskConical, Loader2, Plus, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../../services/api';
import { useApp } from '../../app/AppContext';
import type { CampaignPerformanceSummary, ScheduledContentItem } from '../../types';
import type { Experiment } from '../../types/experiment';

const CLASS_LABELS: Record<string, string> = {
  EXCEPTIONAL: 'Exceptional',
  HIGH_PERFORMING: 'High Performing',
  ABOVE_AVERAGE: 'Above Average',
  AVERAGE: 'Average',
  BELOW_AVERAGE: 'Below Average',
  LOW_PERFORMING: 'Low Performing',
  INSUFFICIENT_DATA: 'Insufficient Data',
};

interface Props {
  campaignId: string;
}

export function CampaignPerformanceTab({ campaignId }: Props) {
  const { activeEntity } = useApp();
  const [summary, setSummary] = useState<CampaignPerformanceSummary | null>(null);
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [schedules, setSchedules] = useState<ScheduledContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [form, setForm] = useState({ scheduleId: '', views: '', clicks: '', purchases: '', revenue: '', notes: '' });
  const [message, setMessage] = useState('');

  const workspaceId = activeEntity?.id ?? '';

  const load = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const [perf, sched, exps] = await Promise.all([
        api.getCampaignPerformance(campaignId, workspaceId),
        api.getCampaignSchedule(campaignId, workspaceId),
        api.getCampaignExperiments(campaignId, workspaceId),
      ]);
      setSummary(perf);
      setSchedules(sched.filter((s) => s.status === 'PUBLISHED'));
      setExperiments(exps);
    } catch {
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [campaignId, workspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleEvaluate() {
    if (!workspaceId) return;
    await api.evaluateCampaignPerformance(campaignId, workspaceId);
    await load();
  }

  async function handleRefresh() {
    if (!workspaceId) return;
    setRefreshing(true);
    setMessage('');
    try {
      await api.refreshCampaignPerformance(campaignId, workspaceId);
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Refresh unavailable');
    } finally {
      setRefreshing(false);
    }
  }

  async function handleAddPerformance() {
    if (!workspaceId || !form.scheduleId) return;
    const sched = schedules.find((s) => s.id === form.scheduleId);
    if (!sched) return;
    setMessage('');
    try {
      await api.createPerformanceObservation(campaignId, workspaceId, {
        scheduleId: sched.id,
        contentKey: sched.contentKey,
        sourceCreativeArtifactId: sched.sourceCreativeArtifactId,
        sourceCreativeVersion: sched.sourceCreativeVersion,
        channel: sched.channel,
        measurementWindow: '7_DAYS',
        metrics: {
          views: form.views ? Number(form.views) : null,
          clicks: form.clicks ? Number(form.clicks) : null,
          purchases: form.purchases ? Number(form.purchases) : null,
          revenue: form.revenue ? Number(form.revenue) : null,
        },
        source: 'MANUAL',
      });
      await handleEvaluate();
      setShowForm(false);
      setForm({ scheduleId: '', views: '', clicks: '', purchases: '', revenue: '', notes: '' });
      setMessage('Performance recorded.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to save');
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-[#71717A]" />
      </div>
    );
  }

  const published = schedules.length > 0;
  const hasData = summary && (summary.lastObservedAt || summary.conversions.purchases > 0);

  if (!published && !hasData) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <BarChart3 className="mx-auto h-8 w-8 text-[#A1A1AA]" />
        <p className="mt-3 text-sm font-medium text-[#09090B]">No performance data yet</p>
        <p className="mt-1 text-xs text-[#71717A]">
          Published content can be measured here once results are available.
        </p>
      </div>
    );
  }

  const classification = summary?.classification ?? 'INSUFFICIENT_DATA';

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-[#A1A1AA]">Performance</p>
          <div className="mt-1 flex items-center gap-2">
            <h2 className="text-base font-semibold text-[#09090B]">{summary?.objective.name ?? 'Campaign'}</h2>
            <span className="rounded-full border border-[#E4E4E7] px-2 py-0.5 text-[11px] font-medium text-[#09090B]">
              {CLASS_LABELS[classification] ?? classification}
            </span>
          </div>
          {summary?.primaryKpi && (
            <p className="mt-1 text-sm text-[#71717A]">
              {summary.primaryKpi}: {summary.primaryKpiValue ?? '—'}
              {summary.conversions.revenue > 0 && ` · $${summary.conversions.revenue.toLocaleString()} attributed revenue`}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#09090B] px-3 py-2 text-xs font-medium text-white"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Performance
          </button>
          <button
            type="button"
            onClick={() => void handleRefresh()}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#E4E4E7] px-3 py-2 text-xs font-medium text-[#09090B]"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {classification === 'INSUFFICIENT_DATA' && (
        <div className="rounded-lg border border-[#E4E4E7] bg-[#FAFAFA] px-4 py-3 text-sm text-[#71717A]">
          More evidence is needed before this campaign is classified. Record additional performance or wait for measurement to mature.
        </div>
      )}

      {experiments.length > 0 && (
        <section>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-[#A1A1AA]">Experiments</p>
          <div className="divide-y divide-[#E4E4E7] rounded-xl border border-[#E4E4E7] bg-white">
            {experiments.map((exp) => (
              <div key={exp.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="flex items-start gap-2">
                  <FlaskConical className="mt-0.5 h-4 w-4 shrink-0 text-[#71717A]" />
                  <div>
                    <p className="text-sm font-medium text-[#09090B]">{exp.name}</p>
                    <p className="text-xs text-[#71717A]">
                      {exp.status === 'RUNNING' ? 'Running' : exp.status === 'COMPLETED' ? 'Completed' : exp.status.replaceAll('_', ' ')}
                      {' · '}A vs B · {exp.experimentKpi ?? exp.primaryKpi}
                    </p>
                  </div>
                </div>
                <p className="shrink-0 text-xs text-[#71717A]">
                  {exp.outcome ? exp.outcome.replaceAll('_', ' ').toLowerCase() : exp.status === 'RUNNING' ? 'Measuring' : '—'}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {summary?.evaluationReasons && summary.evaluationReasons.length > 0 && (
        <section>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-[#A1A1AA]">Why</p>
          <ul className="space-y-1 text-sm text-[#09090B]">
            {summary.evaluationReasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </section>
      )}

      {summary && summary.topContent.length > 0 && (
        <section>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-[#A1A1AA]">Content</p>
          <div className="divide-y divide-[#E4E4E7] rounded-xl border border-[#E4E4E7] bg-white">
            {summary.topContent.map((c) => (
              <div key={`${c.contentKey}-${c.sourceCreativeVersion}`} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-[#09090B]">{c.contentKey}</p>
                  <p className="text-xs text-[#71717A]">{c.channel}</p>
                </div>
                <p className="text-sm text-[#09090B]">
                  {c.conversions.purchases > 0 ? `${c.conversions.purchases} purchases` : `${c.metrics.views ?? '—'} views`}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {summary && summary.channelPerformance.length > 0 && (
        <section>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-[#A1A1AA]">Channels</p>
          <div className="divide-y divide-[#E4E4E7] rounded-xl border border-[#E4E4E7] bg-white">
            {summary.channelPerformance.map((ch) => (
              <div key={ch.channel} className="flex items-center justify-between px-4 py-3">
                <p className="text-sm font-medium text-[#09090B]">{ch.channel}</p>
                <p className="text-sm text-[#71717A]">
                  {ch.conversions.revenue > 0
                    ? `$${ch.conversions.revenue.toLocaleString()} revenue`
                    : `${ch.metrics.reach ?? ch.metrics.views ?? '—'} reach`}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {summary?.lastObservedAt && (
        <p className="text-xs text-[#71717A]">
          Last updated: {summary.measurementWindow.replace(/_/g, ' ').toLowerCase()} · Confidence: {summary.confidence}
        </p>
      )}

      {message && <p className="text-xs text-[#71717A]">{message}</p>}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-md rounded-xl border border-[#E4E4E7] bg-white p-5 shadow-lg">
            <p className="text-sm font-semibold text-[#09090B]">Add Performance</p>
            <div className="mt-4 space-y-3">
              <select
                value={form.scheduleId}
                onChange={(e) => setForm({ ...form, scheduleId: e.target.value })}
                className="w-full rounded-lg border border-[#E4E4E7] px-3 py-2 text-sm"
              >
                <option value="">Select published item</option>
                {schedules.map((s) => (
                  <option key={s.id} value={s.id}>{s.contentKey} · {s.channel}</option>
                ))}
              </select>
              <input placeholder="Views" value={form.views} onChange={(e) => setForm({ ...form, views: e.target.value })} className="w-full rounded-lg border border-[#E4E4E7] px-3 py-2 text-sm" />
              <input placeholder="Clicks" value={form.clicks} onChange={(e) => setForm({ ...form, clicks: e.target.value })} className="w-full rounded-lg border border-[#E4E4E7] px-3 py-2 text-sm" />
              <input placeholder="Purchases" value={form.purchases} onChange={(e) => setForm({ ...form, purchases: e.target.value })} className="w-full rounded-lg border border-[#E4E4E7] px-3 py-2 text-sm" />
              <input placeholder="Revenue" value={form.revenue} onChange={(e) => setForm({ ...form, revenue: e.target.value })} className="w-full rounded-lg border border-[#E4E4E7] px-3 py-2 text-sm" />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setShowForm(false)} className="rounded-lg px-3 py-2 text-xs text-[#71717A]">Cancel</button>
              <button type="button" onClick={() => void handleAddPerformance()} className="rounded-lg bg-[#09090B] px-3 py-2 text-xs font-medium text-white">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

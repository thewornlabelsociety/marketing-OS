import { BarChart3, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../../app/AppContext';
import { api } from '../../services/api';
import type { WorkspacePerformanceSummary } from '../../types';

const CLASS_LABELS: Record<string, string> = {
  EXCEPTIONAL: 'Exceptional',
  HIGH_PERFORMING: 'High Performing',
  ABOVE_AVERAGE: 'Above Average',
  AVERAGE: 'Average',
  BELOW_AVERAGE: 'Below Average',
  LOW_PERFORMING: 'Low Performing',
  INSUFFICIENT_DATA: 'Insufficient Data',
};

export default function PerformancePage() {
  const { activeEntity } = useApp();
  const [summary, setSummary] = useState<WorkspacePerformanceSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!activeEntity) return;
    setLoading(true);
    try {
      setSummary(await api.getPerformanceSummary(activeEntity.id));
    } catch {
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [activeEntity]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!activeEntity) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <BarChart3 className="h-8 w-8 text-[#A1A1AA]" />
        <p className="mt-3 text-sm text-[#71717A]">Select a workspace to view performance.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-[#71717A]" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-6">
      <div>
        <h1 className="text-lg font-semibold text-[#09090B]">Performance</h1>
        <p className="mt-1 text-sm text-[#71717A]">Campaign results evaluated against objectives.</p>
      </div>

      <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-[#E4E4E7] bg-white p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-[#A1A1AA]">Measured</p>
          <p className="mt-1 text-xl font-semibold text-[#09090B]">{summary?.campaignsMeasured ?? 0}</p>
        </div>
        <div className="rounded-xl border border-[#E4E4E7] bg-white p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-[#A1A1AA]">Conversions</p>
          <p className="mt-1 text-xl font-semibold text-[#09090B]">{summary?.attributedConversions ?? 0}</p>
        </div>
        <div className="rounded-xl border border-[#E4E4E7] bg-white p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-[#A1A1AA]">Revenue</p>
          <p className="mt-1 text-xl font-semibold text-[#09090B]">
            {summary?.attributedRevenue ? `$${summary.attributedRevenue.toLocaleString()}` : '—'}
          </p>
        </div>
        <div className="rounded-xl border border-[#E4E4E7] bg-white p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-[#A1A1AA]">ROAS</p>
          <p className="mt-1 text-xl font-semibold text-[#09090B]">
            {summary?.roas != null ? summary.roas.toFixed(1) : '—'}
          </p>
        </div>
      </section>

      {summary && summary.campaigns.length > 0 ? (
        <section>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-[#A1A1AA]">Campaigns</p>
          <div className="divide-y divide-[#E4E4E7] rounded-xl border border-[#E4E4E7] bg-white">
            {summary.campaigns.map((c) => (
              <div key={c.campaignId} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-[#09090B]">{c.campaignName}</p>
                  <p className="text-xs text-[#71717A]">{c.objectiveType} · {c.primaryKpi}</p>
                </div>
                <span className="rounded-full border border-[#E4E4E7] px-2 py-0.5 text-[11px] font-medium">
                  {CLASS_LABELS[c.classification] ?? c.classification}
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : (
        <div className="rounded-xl border border-[#E4E4E7] bg-[#FAFAFA] px-6 py-12 text-center">
          <p className="text-sm text-[#71717A]">No measured campaigns yet. Performance appears after published content is evaluated.</p>
        </div>
      )}
    </div>
  );
}

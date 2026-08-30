import { Calendar, Loader2, MoreHorizontal } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { ScheduleItemDrawer } from '../../components/drawers/ScheduleItemDrawer';
import { api } from '../../services/api';
import type { CampaignPublishingSummary, ScheduledContentItem } from '../../types';

interface Props {
  campaignId: string;
  workspaceId: string;
  campaignName: string;
}

function statusLabel(status: string, blockReason?: string) {
  if (status === 'BLOCKED' && blockReason) return blockReason;
  return status.replaceAll('_', ' ').toLowerCase();
}

export function CampaignScheduleTab({ campaignId, workspaceId, campaignName }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState<CampaignPublishingSummary | null>(null);
  const [selected, setSelected] = useState<ScheduledContentItem | null>(null);
  const [schedulingKey, setSchedulingKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.getCampaignScheduleSummary(campaignId, workspaceId);
      setSummary(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load schedule');
    } finally {
      setLoading(false);
    }
  }, [campaignId, workspaceId]);

  useEffect(() => { void load(); }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-sm text-[#71717A]">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading schedule…
      </div>
    );
  }

  if (error) {
    return <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>;
  }

  if (!summary) return null;

  const primaryAction = summary.unscheduled > 0
    ? 'Schedule Content'
    : summary.failed > 0
      ? 'Review Failed'
      : summary.published === summary.totalApprovedCreative && summary.totalApprovedCreative > 0
        ? 'All published'
        : 'Review Schedule';

  return (
    <div className="mx-auto max-w-xl space-y-8">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-[#A1A1AA]">Schedule</p>
          <p className="mt-1 text-sm text-[#71717A]">
            {summary.published} of {summary.totalApprovedCreative} published
            {summary.unscheduled > 0 ? ` · ${summary.unscheduled} unscheduled` : ''}
            {summary.failed > 0 ? ` · ${summary.failed} failed` : ''}
          </p>
        </div>
        {summary.unscheduled > 0 && summary.unscheduledItems[0] && (
          <button
            type="button"
            onClick={() => setSchedulingKey(summary.unscheduledItems[0].contentKey)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#09090B] px-4 py-2 text-sm font-medium text-white hover:bg-[#18181B]"
          >
            <Calendar className="h-3.5 w-3.5" />
            {primaryAction}
          </button>
        )}
      </div>

      {summary.unscheduledItems.length > 0 && (
        <section>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-[#A1A1AA]">Unscheduled</p>
          <div className="divide-y divide-[#F4F4F5]">
            {summary.unscheduledItems.map((item) => (
              <div key={item.contentKey} className="flex items-start justify-between gap-3 py-3">
                <div>
                  <p className="text-sm font-medium text-[#09090B]">{item.title}</p>
                  <p className="text-xs text-[#71717A]">{item.channel} · Approved V{item.approvedVersion}</p>
                  {item.suggestedTiming && <p className="text-xs text-[#A1A1AA]">Suggested · {item.suggestedTiming}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => setSchedulingKey(item.contentKey)}
                  className="rounded-md border border-[#E4E4E7] px-2.5 py-1 text-xs text-[#09090B] hover:bg-[#FAFAFA]"
                >
                  Schedule
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {summary.upcoming.length > 0 && (
        <section>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-[#A1A1AA]">Upcoming</p>
          <ScheduleRows items={summary.upcoming} onOpen={setSelected} />
        </section>
      )}

      {summary.publishedItems.length > 0 && (
        <section>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-[#A1A1AA]">Published</p>
          <ScheduleRows items={summary.publishedItems} onOpen={setSelected} />
        </section>
      )}

      {summary.totalApprovedCreative === 0 && (
        <div className="py-12 text-center text-sm text-[#71717A]">
          Approve creative before scheduling content.
        </div>
      )}

      {schedulingKey && (
        <ScheduleItemDrawer
          mode="create"
          campaignId={campaignId}
          workspaceId={workspaceId}
          campaignName={campaignName}
          contentKey={schedulingKey}
          onClose={() => setSchedulingKey(null)}
          onSaved={() => { setSchedulingKey(null); void load(); }}
        />
      )}

      {selected && (
        <ScheduleItemDrawer
          mode="view"
          campaignId={campaignId}
          workspaceId={workspaceId}
          campaignName={campaignName}
          item={selected}
          onClose={() => setSelected(null)}
          onSaved={() => { setSelected(null); void load(); }}
        />
      )}
    </div>
  );
}

function ScheduleRows({ items, onOpen }: { items: ScheduledContentItem[]; onOpen: (item: ScheduledContentItem) => void }) {
  return (
    <div className="divide-y divide-[#F4F4F5]">
      {items.map((item) => (
        <div key={item.id} className="flex items-start justify-between gap-3 py-3">
          <div>
            <p className="text-xs text-[#71717A]">{new Date(item.scheduledFor).toLocaleString()} · {item.channel}</p>
            <p className="text-sm font-medium text-[#09090B]">{item.contentKey}</p>
            <p className="text-xs text-[#71717A]">
              {statusLabel(item.status, item.blockReason)}
              {item.publicationMode !== 'DIRECT' ? ` · ${item.publicationMode.toLowerCase()}` : ''}
            </p>
            {item.newerRevisionAvailable && (
              <p className="text-xs text-amber-700">Newer unapproved revision exists</p>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onOpen(item)}
              className="rounded-md border border-[#E4E4E7] px-2.5 py-1 text-xs text-[#09090B] hover:bg-[#FAFAFA]"
            >
              Open
            </button>
            <span className="inline-flex p-1.5 text-[#A1A1AA]"><MoreHorizontal className="h-3.5 w-3.5" /></span>
          </div>
        </div>
      ))}
    </div>
  );
}

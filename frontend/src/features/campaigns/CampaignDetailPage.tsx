import {
  ArrowLeft,
  BarChart3,
  CalendarDays,
  FileText,
  MoreHorizontal,
  Target,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { SopDrawerTrigger } from '../../components/drawers/SopDrawer';
import { useApp } from '../../app/AppContext';
import { api } from '../../services/api';
import type { Campaign, CampaignStatus } from '../../types';

interface Props {
  campaignId: string | null;
}

type DetailTab = 'overview' | 'content' | 'schedule' | 'performance';

const STATUS_LABELS: Record<CampaignStatus, string> = {
  DRAFTING: 'Drafting',
  READY_FOR_REVIEW: 'Ready for Review',
  CHANGES_REQUESTED: 'Changes Requested',
  REVISING: 'Revising',
  READY_FOR_APPROVAL: 'Ready for Approval',
  APPROVED: 'Approved',
  SCHEDULED: 'Scheduled',
  PUBLISHED: 'Published',
  MEASURING: 'Measuring',
  COMPLETE: 'Complete',
  CANCELLED: 'Cancelled',
  ARCHIVED: 'Archived',
};

const SOURCE_LABELS: Record<string, string> = {
  PRODUCT: 'Product',
  SERVICE: 'Service',
  OFFER: 'Offer',
  FEATURE: 'Feature',
  EVENT: 'Event',
  INVENTORY_BATCH: 'Inventory batch',
  ANNOUNCEMENT: 'Announcement',
  EDUCATIONAL_TOPIC: 'Educational topic',
  CAMPAIGN_IDEA: 'Campaign idea',
  OTHER: 'Other',
};

// Statuses where cancellation makes sense
const CANCELLABLE = new Set<CampaignStatus>([
  'DRAFTING', 'READY_FOR_REVIEW', 'CHANGES_REQUESTED', 'REVISING',
  'READY_FOR_APPROVAL', 'APPROVED', 'SCHEDULED',
]);

function MetaRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-3 py-2.5">
      <span className="w-36 shrink-0 text-[11px] font-medium uppercase tracking-wide text-[#A1A1AA]">
        {label}
      </span>
      <span className="flex-1 text-sm text-[#09090B]">{value ?? <span className="text-[#A1A1AA]">—</span>}</span>
    </div>
  );
}

function EmptyTabState({ icon: Icon, message }: { icon: typeof FileText; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
      <Icon className="h-8 w-8 text-[#A1A1AA]" />
      <p className="text-sm font-medium text-[#09090B]">{message}</p>
      <p className="text-xs text-[#71717A]">This will be available in a future update.</p>
    </div>
  );
}

function OverflowMenu({ campaign, onCancelled }: { campaign: Campaign; onCancelled: () => void }) {
  const [open, setOpen] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [reason, setReason] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const canCancel = CANCELLABLE.has(campaign.status as CampaignStatus);

  async function handleCancel() {
    if (!reason.trim()) return;
    setCancelling(true);
    try {
      await api.patchCampaign(campaign.id, {
        status: 'CANCELLED',
        cancellationReason: reason.trim(),
      } as Partial<Campaign>);
      onCancelled();
    } finally {
      setCancelling(false);
      setShowCancel(false);
      setOpen(false);
    }
  }

  if (!canCancel) return null;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        title="More options"
        aria-label="More options"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center justify-center rounded-lg border border-[#E4E4E7] p-2 text-[#71717A] transition hover:bg-[#FAFAFA] hover:text-[#09090B]"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>

      {open && !showCancel && (
        <div className="absolute right-0 top-full z-30 mt-1 w-44 overflow-hidden rounded-xl border border-[#E4E4E7] bg-white shadow-lg">
          <button
            type="button"
            onClick={() => { setShowCancel(true); setOpen(false); }}
            className="flex w-full items-center px-4 py-2.5 text-sm text-red-600 hover:bg-red-50"
          >
            Cancel Campaign
          </button>
        </div>
      )}

      {showCancel && (
        <>
          <button
            type="button"
            aria-label="Dismiss"
            className="fixed inset-0 z-40 bg-black/10"
            onClick={() => setShowCancel(false)}
          />
          <div className="absolute right-0 top-full z-50 mt-1 w-72 rounded-xl border border-[#E4E4E7] bg-white p-4 shadow-xl">
            <p className="text-sm font-semibold text-[#09090B]">Cancel this campaign?</p>
            <p className="mt-1 text-xs text-[#71717A]">
              Provide a reason — cancelled campaigns are preserved as learning data.
            </p>
            <textarea
              autoFocus
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why is this campaign being cancelled?"
              rows={3}
              className="mt-3 w-full rounded-lg border border-[#E4E4E7] px-3 py-2 text-sm outline-none focus:border-[#A1A1AA]"
            />
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => setShowCancel(false)}
                className="flex-1 rounded-lg border border-[#E4E4E7] py-1.5 text-sm font-medium hover:bg-[#FAFAFA]"
              >
                Keep
              </button>
              <button
                type="button"
                disabled={!reason.trim() || cancelling}
                onClick={() => void handleCancel()}
                className="flex-1 rounded-lg bg-red-600 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {cancelling ? 'Cancelling…' : 'Cancel Campaign'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function CampaignDetailPage({ campaignId }: Props) {
  const { setActiveTab } = useApp();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<DetailTab>('overview');

  function load() {
    if (!campaignId) return;
    setLoading(true);
    setError('');
    api.getCampaign(campaignId)
      .then(setCampaign)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, [campaignId]);

  if (!campaignId) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-[#71717A]">
        No campaign selected.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-[#71717A]">
        Loading…
      </div>
    );
  }

  if (error || !campaign) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-red-500">
        {error || 'Campaign not found.'}
      </div>
    );
  }

  const sourceLabel = SOURCE_LABELS[campaign.sourceType] ?? campaign.sourceType;
  const statusLabel = STATUS_LABELS[campaign.status] ?? campaign.status;

  return (
    <div className="flex h-full flex-col">
      {/* Simplified header */}
      <div className="flex shrink-0 items-start justify-between border-b border-[#E4E4E7] bg-white px-6 py-4">
        <div className="flex items-start gap-3">
          <button
            type="button"
            aria-label="Back to campaigns"
            onClick={() => setActiveTab('campaigns')}
            className="mt-0.5 rounded-lg p-1.5 text-[#71717A] hover:bg-[#FAFAFA]"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-base font-semibold text-[#09090B]">{campaign.name}</h1>
            <p className="mt-0.5 text-xs text-[#71717A]">
              {sourceLabel}
              {campaign.objectiveName ? ` · ${campaign.objectiveName}` : ''}
              {' · '}
              {statusLabel}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <SopDrawerTrigger context={`Campaign: ${campaign.name}`} />
          <OverflowMenu campaign={campaign} onCancelled={load} />
        </div>
      </div>

      {/* 4 canonical tabs */}
      <div className="shrink-0 border-b border-[#E4E4E7] bg-white px-6">
        <div className="flex">
          {(['overview', 'content', 'schedule', 'performance'] as DetailTab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`border-b-2 px-4 py-3 text-sm font-medium capitalize transition ${
                tab === t
                  ? 'border-[#09090B] text-[#09090B]'
                  : 'border-transparent text-[#71717A] hover:text-[#09090B]'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-6">
        {tab === 'overview' && (
          <div className="mx-auto max-w-xl space-y-6">
            {/* Objective */}
            <section>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-[#A1A1AA]">
                Objective
              </p>
              <div className="flex items-start gap-3 rounded-xl border border-[#E4E4E7] bg-white p-4">
                <Target className="mt-0.5 h-4 w-4 shrink-0 text-[#71717A]" />
                <div>
                  <p className="text-sm font-medium text-[#09090B]">
                    {campaign.objectiveName ?? '—'}
                  </p>
                  {campaign.objectivePrimaryKpi && (
                    <p className="mt-0.5 text-xs text-[#71717A]">
                      Primary KPI: {campaign.objectivePrimaryKpi}
                    </p>
                  )}
                </div>
              </div>
            </section>

            {/* Campaign details — compact rows */}
            <section>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-[#A1A1AA]">
                What we're marketing
              </p>
              <div className="divide-y divide-[#F4F4F5] rounded-xl border border-[#E4E4E7] bg-white px-4">
                <MetaRow label="Type" value={sourceLabel} />
                <MetaRow label="Source" value={campaign.sourceTitle} />
                {campaign.sourceDescription && (
                  <MetaRow label="Details" value={campaign.sourceDescription} />
                )}
                {campaign.channels.length > 0 && (
                  <MetaRow label="Channels" value={campaign.channels.join(', ')} />
                )}
              </div>
            </section>

            {/* Brief */}
            <section>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-[#A1A1AA]">
                Campaign brief
              </p>
              {campaign.brief ? (
                <div className="rounded-xl border border-[#E4E4E7] bg-white px-4 py-3">
                  <p className="text-sm text-[#09090B] whitespace-pre-wrap">{campaign.brief}</p>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-[#E4E4E7] px-4 py-3">
                  <p className="text-sm text-[#A1A1AA]">No brief yet.</p>
                </div>
              )}
            </section>

            {/* Timestamps */}
            <section>
              <div className="divide-y divide-[#F4F4F5] rounded-xl border border-[#E4E4E7] bg-white px-4">
                <MetaRow label="Created" value={new Date(campaign.createdAt).toLocaleDateString()} />
                <MetaRow label="Updated" value={new Date(campaign.updatedAt).toLocaleDateString()} />
                {campaign.cancellationReason && (
                  <MetaRow label="Cancelled because" value={campaign.cancellationReason} />
                )}
              </div>
            </section>
          </div>
        )}

        {tab === 'content' && (
          <EmptyTabState icon={FileText} message="No content yet" />
        )}

        {tab === 'schedule' && (
          <EmptyTabState icon={CalendarDays} message="Not yet scheduled" />
        )}

        {tab === 'performance' && (
          <EmptyTabState icon={BarChart3} message="No performance data yet" />
        )}
      </div>
    </div>
  );
}

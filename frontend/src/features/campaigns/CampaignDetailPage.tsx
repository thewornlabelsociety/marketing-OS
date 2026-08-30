import { ArrowLeft, Target } from 'lucide-react';
import { useEffect, useState } from 'react';
import { SopDrawerTrigger } from '../../components/drawers/SopDrawer';
import { useApp } from '../../app/AppContext';
import { api } from '../../services/api';
import type { Campaign, CampaignStatus } from '../../types';

interface Props {
  campaignId: string | null;
}

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

const STATUS_COLORS: Partial<Record<CampaignStatus, string>> = {
  DRAFTING: 'bg-[#F4F4F5] text-[#71717A]',
  READY_FOR_REVIEW: 'bg-blue-50 text-blue-600',
  CHANGES_REQUESTED: 'bg-amber-50 text-amber-600',
  REVISING: 'bg-amber-50 text-amber-600',
  READY_FOR_APPROVAL: 'bg-blue-50 text-blue-600',
  APPROVED: 'bg-green-50 text-green-700',
  SCHEDULED: 'bg-green-50 text-green-700',
  PUBLISHED: 'bg-purple-50 text-purple-600',
  MEASURING: 'bg-purple-50 text-purple-600',
  COMPLETE: 'bg-[#F4F4F5] text-[#71717A]',
  CANCELLED: 'bg-red-50 text-red-600',
  ARCHIVED: 'bg-[#F4F4F5] text-[#71717A]',
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

function MetaRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-4 border-b border-[#F4F4F5] py-3 last:border-0">
      <span className="w-40 shrink-0 text-xs font-medium uppercase tracking-wide text-[#A1A1AA]">{label}</span>
      <span className="text-sm text-[#09090B]">{value ?? <span className="text-[#A1A1AA]">—</span>}</span>
    </div>
  );
}

export default function CampaignDetailPage({ campaignId }: Props) {
  const { setActiveTab } = useApp();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!campaignId) return;
    setLoading(true);
    setError('');
    api.getCampaign(campaignId)
      .then(setCampaign)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [campaignId]);

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

  const statusColor = STATUS_COLORS[campaign.status] ?? 'bg-[#F4F4F5] text-[#71717A]';

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-[#E4E4E7] bg-white px-6 py-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setActiveTab('campaigns')}
            className="rounded-lg p-1.5 text-[#71717A] hover:bg-[#FAFAFA]"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-semibold text-[#09090B]">{campaign.name}</h1>
              <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${statusColor}`}>
                {STATUS_LABELS[campaign.status] ?? campaign.status}
              </span>
            </div>
            <p className="text-xs text-[#71717A]">
              {SOURCE_LABELS[campaign.sourceType] ?? campaign.sourceType}: {campaign.sourceTitle}
            </p>
          </div>
        </div>
        <SopDrawerTrigger context={`Campaign: ${campaign.name}`} />
      </div>

      {/* Tab bar (Overview only for Phase 3A) */}
      <div className="shrink-0 border-b border-[#E4E4E7] bg-white px-6">
        <div className="flex">
          <button
            type="button"
            className="border-b-2 border-[#09090B] px-4 py-3 text-sm font-medium text-[#09090B]"
          >
            Overview
          </button>
        </div>
      </div>

      {/* Overview content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-2xl space-y-5">
          {/* Objective */}
          {campaign.objectiveName && (
            <div className="flex items-start gap-3 rounded-xl border border-[#E4E4E7] bg-white p-4">
              <Target className="mt-0.5 h-4 w-4 shrink-0 text-[#71717A]" />
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-[#A1A1AA]">Objective</p>
                <p className="mt-0.5 text-sm font-medium text-[#09090B]">{campaign.objectiveName}</p>
                {campaign.objectivePrimaryKpi && (
                  <p className="mt-0.5 text-xs text-[#71717A]">Primary KPI: {campaign.objectivePrimaryKpi}</p>
                )}
              </div>
            </div>
          )}

          {/* Meta */}
          <div className="rounded-xl border border-[#E4E4E7] bg-white px-5">
            <MetaRow label="Status" value={
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusColor}`}>
                {STATUS_LABELS[campaign.status]}
              </span>
            } />
            <MetaRow label="Source type" value={SOURCE_LABELS[campaign.sourceType] ?? campaign.sourceType} />
            <MetaRow label="Source" value={campaign.sourceTitle} />
            {campaign.sourceDescription && (
              <MetaRow label="Details" value={campaign.sourceDescription} />
            )}
            {campaign.channels.length > 0 && (
              <MetaRow label="Channels" value={campaign.channels.join(', ')} />
            )}
            <MetaRow label="Created" value={new Date(campaign.createdAt).toLocaleDateString()} />
            <MetaRow label="Updated" value={new Date(campaign.updatedAt).toLocaleDateString()} />
          </div>

          {/* Brief */}
          {campaign.brief && (
            <div className="rounded-xl border border-[#E4E4E7] bg-white p-5">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[#A1A1AA]">Brief</p>
              <p className="text-sm text-[#09090B] whitespace-pre-wrap">{campaign.brief}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import { Plus, Rocket } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useApp } from '../../app/AppContext';
import { api } from '../../services/api';
import type { Campaign, CampaignStatus } from '../../types';

type Tab = 'active' | 'review' | 'scheduled' | 'completed';

const TAB_STATUSES: Record<Tab, CampaignStatus[]> = {
  active: ['DRAFTING', 'CHANGES_REQUESTED', 'REVISING'],
  review: ['READY_FOR_REVIEW', 'READY_FOR_APPROVAL'],
  scheduled: ['APPROVED', 'SCHEDULED'],
  completed: ['PUBLISHED', 'MEASURING', 'COMPLETE', 'CANCELLED', 'ARCHIVED'],
};

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
  INVENTORY_BATCH: 'Inventory',
  ANNOUNCEMENT: 'Announcement',
  EDUCATIONAL_TOPIC: 'Education',
  CAMPAIGN_IDEA: 'Idea',
  OTHER: 'Other',
};

export default function CampaignsPage() {
  const { activeEntity, setActiveTab, setActiveCampaignId } = useApp();
  const [tab, setTab] = useState<Tab>('active');
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeEntity) return;
    setLoading(true);
    api.getCampaigns(activeEntity.id)
      .then(setCampaigns)
      .catch(() => setCampaigns([]))
      .finally(() => setLoading(false));
  }, [activeEntity?.id]);

  const filtered = campaigns.filter((c) => TAB_STATUSES[tab].includes(c.status as CampaignStatus));

  function openCampaign(id: string) {
    setActiveCampaignId(id);
    setActiveTab('campaign-detail');
  }

  function tabCount(t: Tab) {
    return campaigns.filter((c) => TAB_STATUSES[t].includes(c.status as CampaignStatus)).length;
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-[#E4E4E7] bg-white px-6 py-4">
        <div>
          <h1 className="text-base font-semibold text-[#09090B]">Campaigns</h1>
          {activeEntity && <p className="text-xs text-[#71717A]">{activeEntity.name}</p>}
        </div>
        <button
          type="button"
          onClick={() => setActiveTab('create')}
          className="inline-flex items-center gap-2 rounded-lg bg-[#09090B] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#27272A]"
        >
          <Plus className="h-4 w-4" />
          Create Campaign
        </button>
      </div>

      {/* Tabs */}
      <div className="shrink-0 border-b border-[#E4E4E7] bg-white px-6">
        <div className="flex">
          {(['active', 'review', 'scheduled', 'completed'] as Tab[]).map((t) => (
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
              {tabCount(t) > 0 && (
                <span className="ml-1.5 rounded-full bg-[#F4F4F5] px-1.5 py-0.5 text-[10px] font-semibold text-[#71717A]">
                  {tabCount(t)}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <p className="text-sm text-[#71717A]">Loading…</p>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
            <Rocket className="h-8 w-8 text-[#A1A1AA]" />
            <p className="text-sm font-medium text-[#09090B]">No {tab} campaigns</p>
            <p className="text-xs text-[#71717A]">
              {tab === 'active' ? 'Create a campaign to get started.' : 'Nothing here yet.'}
            </p>
            {tab === 'active' && (
              <button
                type="button"
                onClick={() => setActiveTab('create')}
                className="mt-1 inline-flex items-center gap-2 rounded-lg bg-[#09090B] px-4 py-2 text-sm font-medium text-white hover:bg-[#27272A]"
              >
                <Plus className="h-4 w-4" />
                Create Campaign
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => openCampaign(c.id)}
                className="flex w-full items-start justify-between rounded-xl border border-[#E4E4E7] bg-white px-5 py-4 text-left transition hover:bg-[#FAFAFA]"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium text-[#09090B]">{c.name}</p>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_COLORS[c.status] ?? 'bg-[#F4F4F5] text-[#71717A]'}`}>
                      {STATUS_LABELS[c.status] ?? c.status}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-xs text-[#71717A]">
                    <span>{SOURCE_LABELS[c.sourceType] ?? c.sourceType}: {c.sourceTitle}</span>
                    {c.objectiveName && <span>· {c.objectiveName}</span>}
                  </div>
                  <p className="mt-1 text-[10px] text-[#A1A1AA]">
                    {new Date(c.updatedAt).toLocaleDateString()}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

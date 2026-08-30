import { ArrowLeft } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useApp } from '../../app/AppContext';
import { ObjectivePicker } from '../objectives/ObjectivePicker';
import { api } from '../../services/api';
import type { CampaignSourceType, Objective } from '../../types';

const SOURCE_TYPES: { value: CampaignSourceType; label: string }[] = [
  { value: 'PRODUCT', label: 'Product' },
  { value: 'SERVICE', label: 'Service' },
  { value: 'OFFER', label: 'Offer' },
  { value: 'FEATURE', label: 'Feature' },
  { value: 'EVENT', label: 'Event' },
  { value: 'INVENTORY_BATCH', label: 'Inventory batch' },
  { value: 'ANNOUNCEMENT', label: 'Announcement' },
  { value: 'EDUCATIONAL_TOPIC', label: 'Educational topic' },
  { value: 'CAMPAIGN_IDEA', label: 'Campaign idea' },
  { value: 'OTHER', label: 'Other' },
];

const inputClass = 'w-full rounded-lg border border-[#E4E4E7] px-3 py-2 text-sm text-[#09090B] outline-none focus:border-[#A1A1AA]';
const labelClass = 'mb-1.5 block text-xs font-medium uppercase tracking-wide text-[#71717A]';

export default function CampaignCreatePage() {
  const { activeEntity, setActiveTab, setActiveCampaignId } = useApp();
  const [objectives, setObjectives] = useState<Objective[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [sourceType, setSourceType] = useState<CampaignSourceType>('PRODUCT');
  const [sourceTitle, setSourceTitle] = useState('');
  const [sourceDescription, setSourceDescription] = useState('');
  const [objectiveId, setObjectiveId] = useState('');
  const [campaignName, setCampaignName] = useState('');

  useEffect(() => {
    if (!activeEntity) return;
    api.getObjectives(activeEntity.id)
      .then(setObjectives)
      .catch(() => setObjectives([]));
  }, [activeEntity?.id]);

  const canSubmit = sourceTitle.trim().length > 0 && objectiveId.length > 0;

  async function handleCreate() {
    if (!activeEntity || !canSubmit) return;
    setSaving(true);
    setError('');
    try {
      const campaign = await api.createCampaign({
        workspaceId: activeEntity.id,
        objectiveId,
        sourceType,
        sourceTitle: sourceTitle.trim(),
        sourceDescription: sourceDescription.trim() || undefined,
        name: campaignName.trim() || undefined,
      });
      setActiveCampaignId(campaign.id);
      setActiveTab('campaign-detail');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-3 border-b border-[#E4E4E7] bg-white px-6 py-4">
        <button
          type="button"
          onClick={() => setActiveTab('campaigns')}
          className="rounded-lg p-1.5 text-[#71717A] hover:bg-[#FAFAFA]"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          <h1 className="text-base font-semibold text-[#09090B]">Create Campaign</h1>
          {activeEntity && <p className="text-xs text-[#71717A]">{activeEntity.name}</p>}
        </div>
      </div>

      {/* Form */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-xl space-y-6">
          <div className="rounded-xl border border-[#E4E4E7] bg-white p-5 space-y-5">
            <div>
              <p className="text-sm font-semibold text-[#09090B]">What are we marketing?</p>
              <p className="mt-0.5 text-xs text-[#71717A]">Describe the thing this campaign will promote.</p>
            </div>

            <label className="block">
              <span className={labelClass}>Type</span>
              <select
                value={sourceType}
                onChange={(e) => setSourceType(e.target.value as CampaignSourceType)}
                className={inputClass}
              >
                {SOURCE_TYPES.map(({ value, label }) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className={labelClass}>
                {SOURCE_TYPES.find((t) => t.value === sourceType)?.label ?? 'Item'} name / title{' '}
                <span className="text-red-400">*</span>
              </span>
              <input
                autoFocus
                type="text"
                value={sourceTitle}
                onChange={(e) => setSourceTitle(e.target.value)}
                placeholder="What specifically are we promoting?"
                className={inputClass}
              />
            </label>

            <label className="block">
              <span className={labelClass}>Details</span>
              <p className="mb-1 text-[10px] text-[#A1A1AA]">Optional — key facts, price, dates, etc.</p>
              <textarea
                value={sourceDescription}
                onChange={(e) => setSourceDescription(e.target.value)}
                rows={3}
                placeholder="Any additional context about what's being marketed."
                className={inputClass}
              />
            </label>
          </div>

          <div className="rounded-xl border border-[#E4E4E7] bg-white p-5 space-y-5">
            <div>
              <p className="text-sm font-semibold text-[#09090B]">Campaign objective</p>
              <p className="mt-0.5 text-xs text-[#71717A]">What should this campaign achieve?</p>
            </div>

            <div>
              <span className={labelClass}>Objective <span className="text-red-400">*</span></span>
              <ObjectivePicker
                objectives={objectives}
                value={objectiveId}
                onChange={setObjectiveId}
              />
            </div>
          </div>

          <div className="rounded-xl border border-[#E4E4E7] bg-white p-5">
            <label className="block">
              <span className={labelClass}>Campaign name</span>
              <p className="mb-1 text-[10px] text-[#A1A1AA]">Optional — defaults to the item title if left blank.</p>
              <input
                type="text"
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
                placeholder="Give this campaign a name…"
                className={inputClass}
              />
            </label>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex items-center justify-end gap-3 pb-6">
            <button
              type="button"
              onClick={() => setActiveTab('campaigns')}
              className="rounded-lg border border-[#E4E4E7] px-4 py-2 text-sm font-medium hover:bg-[#FAFAFA]"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!canSubmit || saving}
              onClick={() => void handleCreate()}
              className="rounded-lg bg-[#09090B] px-5 py-2 text-sm font-medium text-white hover:bg-[#27272A] disabled:opacity-50"
            >
              {saving ? 'Creating…' : 'Create Campaign'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

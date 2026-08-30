import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useApp } from '../../app/AppContext';
import { ObjectivePicker } from '../objectives/ObjectivePicker';
import { api } from '../../services/api';
import type { CampaignBlueprint, CampaignSourceType, Objective } from '../../types';

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

const inputClass =
  'w-full rounded-lg border border-[#E4E4E7] px-3 py-2 text-sm text-[#09090B] outline-none focus:border-[#A1A1AA]';
const labelClass = 'mb-1.5 block text-xs font-medium uppercase tracking-wide text-[#71717A]';

interface Props {
  onClose: () => void;
}

export function CampaignCreateDrawer({ onClose }: Props) {
  const { activeEntity, setActiveTab, setActiveCampaignId } = useApp();
  const [objectives, setObjectives] = useState<Objective[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [sourceType, setSourceType] = useState<CampaignSourceType>('PRODUCT');
  const [sourceTitle, setSourceTitle] = useState('');
  const [sourceDescription, setSourceDescription] = useState('');
  const [objectiveId, setObjectiveId] = useState('');
  const [campaignName, setCampaignName] = useState('');
  const [mode, setMode] = useState<'scratch' | 'blueprint'>('scratch');
  const [blueprints, setBlueprints] = useState<CampaignBlueprint[]>([]);
  const [selectedBlueprintId, setSelectedBlueprintId] = useState('');

  useEffect(() => {
    if (!activeEntity) return;
    api.getObjectives(activeEntity.id)
      .then(setObjectives)
      .catch(() => setObjectives([]));
    api.getBlueprints(activeEntity.id, 'ACTIVE')
      .then(setBlueprints)
      .catch(() => setBlueprints([]));
  }, [activeEntity?.id]);

  const canSubmit = sourceTitle.trim().length > 0 && (mode === 'blueprint' ? selectedBlueprintId.length > 0 : objectiveId.length > 0);

  async function handleCreate() {
    if (!activeEntity || !canSubmit) return;
    setSaving(true);
    setError('');
    try {
      if (mode === 'blueprint') {
        const result = await api.useBlueprint(selectedBlueprintId, activeEntity.id, {
          sourceType,
          sourceTitle: sourceTitle.trim(),
          sourceDescription: sourceDescription.trim() || undefined,
          objectiveId: objectiveId || undefined,
          name: campaignName.trim() || undefined,
        });
        setActiveCampaignId(result.campaignId);
      } else {
        const campaign = await api.createCampaign({
          workspaceId: activeEntity.id,
          objectiveId,
          sourceType,
          sourceTitle: sourceTitle.trim(),
          sourceDescription: sourceDescription.trim() || undefined,
          name: campaignName.trim() || undefined,
        });
        setActiveCampaignId(campaign.id);
      }
      setActiveTab('campaign-detail');
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close"
        className="fixed inset-0 z-40 bg-black/20"
        onClick={onClose}
      />

      {/* Drawer */}
      <aside className="fixed right-0 top-0 z-50 flex h-full w-[480px] flex-col border-l border-[#E4E4E7] bg-white shadow-xl">
        {/* Header */}
        <header className="flex shrink-0 items-center justify-between border-b border-[#E4E4E7] px-5 py-4">
          <p className="text-sm font-semibold text-[#09090B]">New Campaign</p>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="rounded-lg p-1.5 text-[#71717A] hover:bg-[#FAFAFA]"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {/* Scrollable form body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <div className="flex rounded-lg border border-[#E4E4E7] p-0.5">
            <button type="button" onClick={() => setMode('scratch')} className={`flex-1 rounded-md px-3 py-2 text-xs font-medium ${mode === 'scratch' ? 'bg-[#09090B] text-white' : ''}`}>Start from scratch</button>
            <button type="button" onClick={() => setMode('blueprint')} className={`flex-1 rounded-md px-3 py-2 text-xs font-medium ${mode === 'blueprint' ? 'bg-[#09090B] text-white' : ''}`}>Use a blueprint</button>
          </div>

          {mode === 'blueprint' && (
            <section className="rounded-xl border border-[#E4E4E7] p-4">
              <span className={labelClass}>Blueprint</span>
              <select value={selectedBlueprintId} onChange={(e) => setSelectedBlueprintId(e.target.value)} className={inputClass}>
                <option value="">Select a blueprint…</option>
                {blueprints.map((bp) => (
                  <option key={bp.id} value={bp.id}>{bp.name}</option>
                ))}
              </select>
              {blueprints.length === 0 && <p className="mt-2 text-xs text-[#71717A]">No active blueprints. Create one from a high-performing campaign in Library.</p>}
            </section>
          )}

          {/* What we're marketing */}
          <section className="rounded-xl border border-[#E4E4E7] p-4 space-y-4">
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
          </section>

          {/* Objective */}
          <section className="rounded-xl border border-[#E4E4E7] p-4 space-y-4">
            <div>
              <p className="text-sm font-semibold text-[#09090B]">Campaign objective</p>
              <p className="mt-0.5 text-xs text-[#71717A]">{mode === 'blueprint' ? 'Confirm or change the suggested objective.' : 'What should this campaign achieve?'}</p>
            </div>
            <div>
              <span className={labelClass}>Objective {mode === 'scratch' && <span className="text-red-400">*</span>}</span>
              <ObjectivePicker
                objectives={objectives}
                value={objectiveId}
                onChange={setObjectiveId}
              />
            </div>
          </section>

          {/* Optional name */}
          <section className="rounded-xl border border-[#E4E4E7] p-4">
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
          </section>

          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>

        {/* Footer actions */}
        <footer className="flex shrink-0 items-center justify-end gap-3 border-t border-[#E4E4E7] px-5 py-4">
          <button
            type="button"
            onClick={onClose}
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
        </footer>
      </aside>
    </>
  );
}

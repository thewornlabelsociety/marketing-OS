import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useApp } from '../../app/AppContext';
import { ObjectivePicker } from '../objectives/ObjectivePicker';
import { api } from '../../services/api';
import type { Campaign, CampaignSourceType, Objective } from '../../types';

const SOURCE_TYPE_LABELS: Record<CampaignSourceType, string> = {
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

const inputClass =
  'w-full rounded-lg border border-[#E4E4E7] px-3 py-2 text-sm text-[#09090B] outline-none focus:border-[#A1A1AA]';
const labelClass = 'mb-1.5 block text-xs font-medium uppercase tracking-wide text-[#71717A]';

interface Props {
  campaign: Campaign;
  onClose: () => void;
  onSaved: (updated: Campaign) => void;
}

export function CampaignEditDrawer({ campaign, onClose, onSaved }: Props) {
  const { activeEntity } = useApp();
  const [objectives, setObjectives] = useState<Objective[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [name, setName] = useState(campaign.name);
  const [sourceTitle, setSourceTitle] = useState(campaign.sourceTitle);
  const [sourceDescription, setSourceDescription] = useState(campaign.sourceDescription ?? '');
  const [brief, setBrief] = useState(campaign.brief ?? '');
  const [objectiveId, setObjectiveId] = useState(campaign.objectiveId);

  useEffect(() => {
    if (!activeEntity) return;
    api.getObjectives(activeEntity.id)
      .then(setObjectives)
      .catch(() => setObjectives([]));
  }, [activeEntity?.id]);

  const canSubmit = name.trim().length > 0 && sourceTitle.trim().length > 0;

  async function handleSave() {
    if (!canSubmit) return;
    setSaving(true);
    setError('');
    try {
      const patch: Record<string, string | null> = {
        workspaceId: campaign.workspaceId,
      };

      if (name.trim() !== campaign.name) patch.name = name.trim();
      if (sourceTitle.trim() !== campaign.sourceTitle) patch.sourceTitle = sourceTitle.trim();

      const newSourceDesc = sourceDescription.trim() || null;
      if (newSourceDesc !== campaign.sourceDescription) patch.sourceDescription = newSourceDesc;

      const newBrief = brief.trim() || null;
      if (newBrief !== campaign.brief) patch.brief = newBrief;

      if (objectiveId !== campaign.objectiveId) patch.objectiveId = objectiveId;

      const updated = await api.patchCampaign(campaign.id, patch as Partial<Campaign>);
      onSaved(updated);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const sourceTypeLabel = SOURCE_TYPE_LABELS[campaign.sourceType] ?? 'Item';

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
        <header className="flex shrink-0 items-center justify-between border-b border-[#E4E4E7] px-5 py-4">
          <p className="text-sm font-semibold text-[#09090B]">Edit Campaign</p>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="rounded-lg p-1.5 text-[#71717A] hover:bg-[#FAFAFA]"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Campaign name */}
          <section className="rounded-xl border border-[#E4E4E7] p-4">
            <label className="block">
              <span className={labelClass}>Campaign name</span>
              <input
                autoFocus
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Give this campaign a name…"
                className={inputClass}
              />
            </label>
          </section>

          {/* What we're marketing */}
          <section className="rounded-xl border border-[#E4E4E7] p-4 space-y-4">
            <div>
              <p className="text-sm font-semibold text-[#09090B]">What are we marketing?</p>
              <p className="mt-0.5 text-xs text-[#71717A]">Type: {sourceTypeLabel}</p>
            </div>
            <label className="block">
              <span className={labelClass}>
                {sourceTypeLabel} name / title{' '}
                <span className="text-red-400">*</span>
              </span>
              <input
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
              <p className="mt-0.5 text-xs text-[#71717A]">
                Changing this affects how performance is evaluated going forward.
              </p>
            </div>
            <div>
              <span className={labelClass}>Objective</span>
              <ObjectivePicker
                objectives={objectives}
                value={objectiveId}
                onChange={setObjectiveId}
              />
            </div>
          </section>

          {/* Planning notes */}
          <section className="rounded-xl border border-[#E4E4E7] p-4">
            <label className="block">
              <span className={labelClass}>Planning notes</span>
              <p className="mb-1 text-[10px] text-[#A1A1AA]">
                Optional — additional context used when generating plans and creative.
              </p>
              <textarea
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                rows={3}
                placeholder="Any additional notes for planning…"
                className={inputClass}
              />
            </label>
          </section>

          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>

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
            onClick={() => void handleSave()}
            className="rounded-lg bg-[#09090B] px-5 py-2 text-sm font-medium text-white hover:bg-[#27272A] disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </footer>
      </aside>
    </>
  );
}

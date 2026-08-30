import { Save, Send } from 'lucide-react';
import { useState } from 'react';
import { api } from '../../services/api';
import { useApp } from '../../app/AppContext';

export function StudioTab() {
  const { activeEntity, dropDraft, updateDropDraft } = useApp();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  if (!activeEntity) {
    return <EmptyState title="No entity selected" subtitle="Choose an entity to start drafting." />;
  }

  const saveDraft = async (status: 'draft' | 'scheduled') => {
    setSaving(true);
    setMessage('');
    try {
      await api.createContent({
        entityId: activeEntity.id,
        type: 'drop',
        title: dropDraft.title || 'Untitled drop',
        bodyMarkdown: buildBody(dropDraft),
        status,
        targetChannels: dropDraft.targetChannels,
        scheduledFor: dropDraft.scheduledFor || null,
      });
      setMessage(status === 'draft' ? 'Draft saved.' : 'Drop scheduled.');
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold text-[#09090B]">Studio</h1>
        <p className="mt-1 text-sm text-[#71717A]">
          Compose drops for {activeEntity.name}. Previews update live in the simulator.
        </p>
      </div>

      <div className="rounded-xl border border-[#E4E4E7] bg-white p-5 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2">
          <Input
            label="Brand"
            value={dropDraft.brand}
            onChange={(v) => updateDropDraft({ brand: v })}
          />
          <Input
            label="Price"
            value={dropDraft.price}
            onChange={(v) => updateDropDraft({ price: v })}
            placeholder="$128"
          />
          <div className="md:col-span-2">
            <Input
              label="Title"
              value={dropDraft.title}
              onChange={(v) => updateDropDraft({ title: v })}
              placeholder="Vintage silk blazer — limited drop"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-[#71717A]">
                Hook
              </span>
              <input
                value={dropDraft.hook}
                onChange={(e) => updateDropDraft({ hook: e.target.value })}
                placeholder="The piece your wardrobe has been waiting for."
                className="w-full rounded-lg border border-[#E4E4E7] px-3 py-2 text-sm outline-none focus:border-[#A1A1AA]"
              />
            </label>
          </div>
          <div className="md:col-span-2">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-[#71717A]">
                Body copy
              </span>
              <textarea
                rows={5}
                value={dropDraft.body}
                onChange={(e) => updateDropDraft({ body: e.target.value })}
                placeholder="Tell the story behind this drop…"
                className="w-full resize-y rounded-lg border border-[#E4E4E7] px-3 py-2 text-sm outline-none focus:border-[#A1A1AA]"
              />
            </label>
          </div>
          <Input
            label="Schedule for"
            type="datetime-local"
            value={dropDraft.scheduledFor}
            onChange={(v) => updateDropDraft({ scheduledFor: v })}
          />
          <div>
            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-[#71717A]">
              Channels
            </p>
            <div className="flex flex-wrap gap-2">
              {['instagram', 'email', 'tiktok'].map((channel) => {
                const active = dropDraft.targetChannels.includes(channel);
                return (
                  <button
                    key={channel}
                    type="button"
                    onClick={() =>
                      updateDropDraft({
                        targetChannels: active
                          ? dropDraft.targetChannels.filter((c) => c !== channel)
                          : [...dropDraft.targetChannels, channel],
                      })
                    }
                    className={`rounded-full border px-3 py-1 text-xs font-medium capitalize ${
                      active
                        ? 'border-[#09090B] bg-[#09090B] text-white'
                        : 'border-[#E4E4E7] text-[#71717A]'
                    }`}
                  >
                    {channel}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-[#E4E4E7] pt-5">
          <button
            type="button"
            disabled={saving}
            onClick={() => void saveDraft('draft')}
            className="inline-flex items-center gap-2 rounded-lg border border-[#E4E4E7] px-4 py-2 text-sm font-medium hover:bg-[#FAFAFA] disabled:opacity-60"
          >
            <Save className="h-4 w-4" />
            Save draft
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void saveDraft('scheduled')}
            className="inline-flex items-center gap-2 rounded-lg bg-[#09090B] px-4 py-2 text-sm font-medium text-white hover:bg-[#27272A] disabled:opacity-60"
          >
            <Send className="h-4 w-4" />
            Schedule drop
          </button>
          {message && <p className="text-sm text-[#71717A]">{message}</p>}
        </div>
      </div>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-[#71717A]">
        {label}
      </span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-[#E4E4E7] px-3 py-2 text-sm outline-none focus:border-[#A1A1AA]"
      />
    </label>
  );
}

function buildBody(draft: { brand: string; price: string; hook: string; body: string }) {
  return [
    draft.hook && `**${draft.hook}**`,
    draft.body,
    draft.price && `Price: ${draft.price}`,
    draft.brand && `Brand: ${draft.brand}`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

function EmptyState({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="flex h-full items-center justify-center p-10">
      <div className="text-center">
        <h2 className="text-lg font-semibold text-[#09090B]">{title}</h2>
        <p className="mt-1 text-sm text-[#71717A]">{subtitle}</p>
      </div>
    </div>
  );
}

import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../../services/api';
import { useApp } from '../../app/AppContext';
import type { BrandKit } from '../../types';

export function BrandKitDrawer() {
  const { brandKitOpen, setBrandKitOpen, activeEntity, refreshEntities } = useApp();
  const [draft, setDraft] = useState<BrandKit>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (activeEntity) {
      setDraft(activeEntity.brandKit ?? {});
    }
  }, [activeEntity]);

  if (!brandKitOpen || !activeEntity) return null;

  const save = async () => {
    setSaving(true);
    setMessage('');
    try {
      await api.patchBrandKit(activeEntity.id, draft);
      await refreshEntities();
      setMessage('Brand kit saved.');
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button
        type="button"
        aria-label="Close brand kit drawer"
        className="fixed inset-0 z-40 bg-black/20"
        onClick={() => setBrandKitOpen(false)}
      />
      <aside className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l border-[#E4E4E7] bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-[#E4E4E7] px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-[#09090B]">Brand Kit</h2>
            <p className="text-xs text-[#71717A]">{activeEntity.name}</p>
          </div>
          <button
            type="button"
            onClick={() => setBrandKitOpen(false)}
            className="rounded-lg border border-[#E4E4E7] p-2 hover:bg-[#FAFAFA]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <Field
            label="Primary color"
            value={draft.primaryColor ?? ''}
            onChange={(v) => setDraft((d) => ({ ...d, primaryColor: v }))}
            type="color"
          />
          <Field
            label="Secondary color"
            value={draft.secondaryColor ?? ''}
            onChange={(v) => setDraft((d) => ({ ...d, secondaryColor: v }))}
            type="color"
          />
          <Field
            label="Background color"
            value={draft.backgroundColor ?? ''}
            onChange={(v) => setDraft((d) => ({ ...d, backgroundColor: v }))}
            type="color"
          />
          <Field
            label="Heading font"
            value={draft.typography?.heading ?? ''}
            onChange={(v) =>
              setDraft((d) => ({ ...d, typography: { ...d.typography, heading: v } }))
            }
          />
          <Field
            label="Body font"
            value={draft.typography?.body ?? ''}
            onChange={(v) =>
              setDraft((d) => ({ ...d, typography: { ...d.typography, body: v } }))
            }
          />
          <Field
            label="Voice tone"
            value={draft.voice?.tone ?? ''}
            onChange={(v) => setDraft((d) => ({ ...d, voice: { ...d.voice, tone: v } }))}
          />
          <Field
            label="Archetype"
            value={draft.voice?.archetype ?? activeEntity.archetype}
            onChange={(v) =>
              setDraft((d) => ({ ...d, voice: { ...d.voice, archetype: v } }))
            }
          />

          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[#71717A]">
              Top performing hooks
            </p>
            <div className="space-y-2">
              {(draft.memoryVault?.topPerformingHooks ?? []).length === 0 ? (
                <p className="text-sm text-[#71717A]">No hooks synced yet.</p>
              ) : (
                draft.memoryVault?.topPerformingHooks?.map((hook) => (
                  <div
                    key={hook}
                    className="rounded-lg border border-[#E4E4E7] px-3 py-2 text-sm text-[#09090B]"
                  >
                    {hook}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="border-t border-[#E4E4E7] p-5">
          {message && <p className="mb-3 text-sm text-[#71717A]">{message}</p>}
          <button
            type="button"
            disabled={saving}
            onClick={() => void save()}
            className="w-full rounded-lg bg-[#09090B] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#27272A] disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save brand kit'}
          </button>
        </div>
      </aside>
    </>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
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
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-[#E4E4E7] px-3 py-2 text-sm text-[#09090B] outline-none focus:border-[#A1A1AA]"
      />
    </label>
  );
}

import { Plus, Target } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useApp } from '../../app/AppContext';
import { api } from '../../services/api';
import type { Objective } from '../../types';

type Tab = 'all' | 'system' | 'custom';

export default function ObjectiveLibraryPage() {
  const { activeEntity } = useApp();
  const [tab, setTab] = useState<Tab>('all');
  const [objectives, setObjectives] = useState<Objective[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewForm, setShowNewForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newType, setNewType] = useState('');
  const [newKpi, setNewKpi] = useState('');

  useEffect(() => {
    if (!activeEntity) return;
    setLoading(true);
    api.getObjectives(activeEntity.id)
      .then(setObjectives)
      .catch(() => setObjectives([]))
      .finally(() => setLoading(false));
  }, [activeEntity?.id]);

  const filtered = objectives.filter((o) => {
    if (tab === 'system') return o.isSystem;
    if (tab === 'custom') return !o.isSystem;
    return true;
  });

  async function handleCreate() {
    if (!activeEntity || !newName.trim() || !newType.trim() || !newKpi.trim()) {
      setFormError('Name, type, and primary KPI are required.');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      const created = await api.createObjective({
        workspaceId: activeEntity.id,
        name: newName.trim(),
        description: newDescription.trim() || undefined,
        objectiveType: newType.trim().toUpperCase().replace(/\s+/g, '_'),
        primaryKpi: newKpi.trim().toLowerCase().replace(/\s+/g, '_'),
      });
      setObjectives((prev) => [created, ...prev]);
      setShowNewForm(false);
      setNewName('');
      setNewDescription('');
      setNewType('');
      setNewKpi('');
      setTab('custom');
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const inputClass = 'w-full rounded-lg border border-[#E4E4E7] px-3 py-2 text-sm text-[#09090B] outline-none focus:border-[#A1A1AA]';
  const labelClass = 'mb-1.5 block text-xs font-medium uppercase tracking-wide text-[#71717A]';

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-[#E4E4E7] bg-white px-6 py-4">
        <div>
          <h1 className="text-base font-semibold text-[#09090B]">Objective Library</h1>
          {activeEntity && <p className="text-xs text-[#71717A]">{activeEntity.name}</p>}
        </div>
        <button
          type="button"
          onClick={() => setShowNewForm((v) => !v)}
          className="inline-flex items-center gap-2 rounded-lg bg-[#09090B] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#27272A]"
        >
          <Plus className="h-4 w-4" />
          New Objective
        </button>
      </div>

      {showNewForm && (
        <div className="shrink-0 border-b border-[#E4E4E7] bg-[#FAFAFA] px-6 py-5">
          <p className="mb-4 text-sm font-medium text-[#09090B]">New Custom Objective</p>
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className={labelClass}>Name *</span>
              <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} className={inputClass} placeholder="e.g. Referral Growth" />
            </label>
            <label className="block">
              <span className={labelClass}>Primary KPI *</span>
              <input type="text" value={newKpi} onChange={(e) => setNewKpi(e.target.value)} className={inputClass} placeholder="e.g. referrals" />
            </label>
            <label className="block">
              <span className={labelClass}>Type *</span>
              <input type="text" value={newType} onChange={(e) => setNewType(e.target.value)} className={inputClass} placeholder="e.g. Referral" />
            </label>
            <label className="block">
              <span className={labelClass}>Description</span>
              <input type="text" value={newDescription} onChange={(e) => setNewDescription(e.target.value)} className={inputClass} placeholder="Optional" />
            </label>
          </div>
          {formError && <p className="mt-2 text-sm text-red-500">{formError}</p>}
          <div className="mt-4 flex gap-3">
            <button
              type="button"
              onClick={() => void handleCreate()}
              disabled={saving}
              className="rounded-lg bg-[#09090B] px-4 py-2 text-sm font-medium text-white hover:bg-[#27272A] disabled:opacity-60"
            >
              {saving ? 'Creating…' : 'Create'}
            </button>
            <button
              type="button"
              onClick={() => setShowNewForm(false)}
              className="rounded-lg border border-[#E4E4E7] px-4 py-2 text-sm font-medium hover:bg-white"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Tab bar */}
      <div className="shrink-0 border-b border-[#E4E4E7] bg-white px-6">
        <div className="flex">
          {(['all', 'system', 'custom'] as Tab[]).map((t) => (
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
              <span className="ml-1.5 text-xs text-[#A1A1AA]">
                ({objectives.filter((o) => t === 'all' ? true : t === 'system' ? o.isSystem : !o.isSystem).length})
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <p className="text-sm text-[#71717A]">Loading…</p>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
            <Target className="h-8 w-8 text-[#A1A1AA]" />
            <p className="text-sm font-medium text-[#09090B]">No objectives</p>
            <p className="text-xs text-[#71717A]">
              {tab === 'custom' ? 'Create a custom objective for this workspace.' : 'No objectives found.'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((obj) => (
              <div
                key={obj.id}
                className="flex items-start justify-between rounded-xl border border-[#E4E4E7] bg-white px-5 py-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-[#09090B]">{obj.name}</p>
                    {obj.isSystem && (
                      <span className="rounded-full bg-[#F4F4F5] px-2 py-0.5 text-[10px] font-medium text-[#71717A]">
                        System
                      </span>
                    )}
                  </div>
                  {obj.description && (
                    <p className="mt-0.5 text-xs text-[#71717A]">{obj.description}</p>
                  )}
                  <p className="mt-1.5 text-[10px] uppercase tracking-wide text-[#A1A1AA]">
                    KPI: {obj.primaryKpi}
                    {obj.supportingKpis.length > 0 && ` · Supporting: ${obj.supportingKpis.join(', ')}`}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

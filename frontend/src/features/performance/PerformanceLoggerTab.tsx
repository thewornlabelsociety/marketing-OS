import { Plus, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../../services/api';
import { useApp } from '../../app/AppContext';
import type { PerformanceLog } from '../../types';

export function PerformanceLoggerTab() {
  const { activeEntity, refreshEntities } = useApp();
  const [logs, setLogs] = useState<PerformanceLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [form, setForm] = useState({
    hook: '',
    impressions: '0',
    revenue: '0',
    conversions: '0',
    aiLearnings: '',
  });
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    if (!activeEntity) return;
    setLoading(true);
    try {
      setLogs(await api.getPerformance(activeEntity.id));
    } finally {
      setLoading(false);
    }
  }, [activeEntity]);

  useEffect(() => {
    void load();
  }, [load]);

  const createLog = async () => {
    if (!activeEntity) return;
    setMessage('');
    try {
      await api.createPerformance({
        entityId: activeEntity.id,
        hook: form.hook || null,
        impressions: Number(form.impressions),
        revenue: Number(form.revenue),
        conversions: Number(form.conversions),
        aiLearnings: form.aiLearnings || null,
      });
      setForm({ hook: '', impressions: '0', revenue: '0', conversions: '0', aiLearnings: '' });
      await load();
      setMessage('Performance log created.');
    } catch (err) {
      setMessage((err as Error).message);
    }
  };

  const syncVault = async () => {
    if (!activeEntity) return;
    setSyncing(true);
    setMessage('');
    try {
      const result = await api.syncVault(activeEntity.id);
      await refreshEntities();
      await load();
      setMessage(`Synced ${result.synced} hook(s) to brand vault.`);
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setSyncing(false);
    }
  };

  if (!activeEntity) {
    return (
      <div className="flex h-full items-center justify-center p-10 text-sm text-[#71717A]">
        Select an entity to log performance.
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-[#09090B]">Performance Logger</h1>
          <p className="mt-1 text-sm text-[#71717A]">
            Track hooks and revenue for {activeEntity.name}.
          </p>
        </div>
        <button
          type="button"
          disabled={syncing}
          onClick={() => void syncVault()}
          className="inline-flex items-center gap-2 rounded-lg border border-[#E4E4E7] px-4 py-2 text-sm font-medium hover:bg-[#FAFAFA] disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
          Sync to vault
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <div className="rounded-xl border border-[#E4E4E7] bg-white p-5">
          <h2 className="text-sm font-semibold text-[#09090B]">New log entry</h2>
          <div className="mt-4 space-y-3">
            <Field label="Hook" value={form.hook} onChange={(v) => setForm((f) => ({ ...f, hook: v }))} />
            <div className="grid grid-cols-3 gap-2">
              <Field
                label="Impressions"
                value={form.impressions}
                onChange={(v) => setForm((f) => ({ ...f, impressions: v }))}
              />
              <Field
                label="Revenue"
                value={form.revenue}
                onChange={(v) => setForm((f) => ({ ...f, revenue: v }))}
              />
              <Field
                label="Conversions"
                value={form.conversions}
                onChange={(v) => setForm((f) => ({ ...f, conversions: v }))}
              />
            </div>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-[#71717A]">
                AI learnings
              </span>
              <textarea
                rows={3}
                value={form.aiLearnings}
                onChange={(e) => setForm((f) => ({ ...f, aiLearnings: e.target.value }))}
                className="w-full rounded-lg border border-[#E4E4E7] px-3 py-2 text-sm outline-none focus:border-[#A1A1AA]"
              />
            </label>
            <button
              type="button"
              onClick={() => void createLog()}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#09090B] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#27272A]"
            >
              <Plus className="h-4 w-4" />
              Add log
            </button>
            {message && <p className="text-sm text-[#71717A]">{message}</p>}
          </div>
        </div>

        <div className="rounded-xl border border-[#E4E4E7] bg-white">
          <div className="border-b border-[#E4E4E7] px-5 py-4">
            <h2 className="text-sm font-semibold text-[#09090B]">Recent logs</h2>
          </div>
          <div className="divide-y divide-[#E4E4E7]">
            {loading ? (
              <p className="p-5 text-sm text-[#71717A]">Loading…</p>
            ) : logs.length === 0 ? (
              <p className="p-5 text-sm text-[#71717A]">No performance logs yet.</p>
            ) : (
              logs.map((log) => (
                <div key={log.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium text-[#09090B]">{log.hook ?? 'Untitled hook'}</p>
                    <span className="text-xs text-[#71717A]">
                      {new Date(log.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-4 text-sm text-[#71717A]">
                    <span>{log.impressions.toLocaleString()} impressions</span>
                    <span>${log.revenue.toFixed(2)} revenue</span>
                    <span>{log.conversions} conversions</span>
                    {log.isSyncedToVault && (
                      <span className="rounded-full border border-[#E4E4E7] px-2 py-0.5 text-xs">
                        Synced
                      </span>
                    )}
                  </div>
                  {log.aiLearnings && (
                    <p className="mt-2 text-sm text-[#71717A]">{log.aiLearnings}</p>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-[#71717A]">
        {label}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-[#E4E4E7] px-3 py-2 text-sm outline-none focus:border-[#A1A1AA]"
      />
    </label>
  );
}

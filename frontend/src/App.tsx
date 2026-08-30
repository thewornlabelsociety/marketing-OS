import { useState } from 'react';
import { AppProvider, useApp } from './app/AppContext';
import { BrandKitDrawer } from './components/drawers/BrandKitDrawer';
import { SidebarNav } from './components/layout/SidebarNav';
import { TopNav } from './components/layout/TopNav';
import { SimulatorPanel } from './components/simulator/SimulatorPanel';
import { EmptyBrandState } from './components/ui/EmptyBrandState';
import { DropCalendarTab } from './features/calendar/DropCalendarTab';
import { PerformanceLoggerTab } from './features/performance/PerformanceLoggerTab';
import { StudioTab } from './features/studio/StudioTab';

function CreateBrandModal({ onClose }: { onClose: () => void }) {
  const { refreshEntities } = useApp();
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) { setError('Brand name is required.'); return; }

    setSaving(true);
    setError('');
    try {
      const slug = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const id = `entity_${slug}_${Date.now()}`;

      const r = await fetch('/api/entities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name: trimmed, slug, brand_kit: {} }),
      });
      if (!r.ok) throw new Error(await r.text());

      await refreshEntities();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button
        type="button"
        aria-label="Close"
        className="fixed inset-0 z-40 bg-black/20"
        onClick={onClose}
      />
      <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[#E4E4E7] bg-white p-6 shadow-xl">
        <h2 className="text-base font-semibold text-[#09090B]">Create Brand Workspace</h2>
        <p className="mt-1 text-sm text-[#71717A]">
          You can configure brand voice, colours and rules after creation.
        </p>
        <label className="mt-5 block">
          <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-[#71717A]">
            Brand name
          </span>
          <input
            autoFocus
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void handleCreate(); }}
            placeholder="e.g. Worn Label, Eloe Studio…"
            className="w-full rounded-lg border border-[#E4E4E7] px-3 py-2 text-sm text-[#09090B] outline-none focus:border-[#A1A1AA]"
          />
        </label>
        {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
        <div className="mt-5 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[#E4E4E7] px-4 py-2 text-sm font-medium hover:bg-[#FAFAFA]"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleCreate()}
            className="rounded-lg bg-[#09090B] px-4 py-2 text-sm font-medium text-white hover:bg-[#27272A] disabled:opacity-60"
          >
            {saving ? 'Creating…' : 'Create Brand'}
          </button>
        </div>
      </div>
    </>
  );
}

function AppShell() {
  const { activeTab, entities, loading, error } = useApp();
  const [showCreateModal, setShowCreateModal] = useState(false);

  const hasEntities = entities.length > 0;

  return (
    <div className="flex h-full flex-col bg-white">
      <TopNav
        showBrandControls={hasEntities}
        onCreateBrand={() => setShowCreateModal(true)}
      />

      <div className="flex min-h-0 flex-1">
        {hasEntities && <SidebarNav />}

        <main className="min-w-0 flex-1 overflow-y-auto bg-white">
          {loading && (
            <div className="flex h-full items-center justify-center p-10 text-sm text-[#71717A]">
              Loading workspace…
            </div>
          )}

          {!loading && error && (
            <div className="m-6 rounded-xl border border-[#E4E4E7] bg-white p-6">
              <p className="text-sm font-medium text-[#09090B]">Backend unavailable</p>
              <p className="mt-1 text-sm text-[#71717A]">
                Start the backend on port 4100, then refresh. {error}
              </p>
            </div>
          )}

          {!loading && !error && !hasEntities && (
            <EmptyBrandState onCreateBrand={() => setShowCreateModal(true)} />
          )}

          {!loading && !error && hasEntities && (
            <>
              {activeTab === 'studio' && <StudioTab />}
              {activeTab === 'calendar' && <DropCalendarTab />}
              {activeTab === 'performance' && <PerformanceLoggerTab />}
            </>
          )}
        </main>

        {hasEntities && <SimulatorPanel />}
      </div>

      {hasEntities && <BrandKitDrawer />}
      {showCreateModal && <CreateBrandModal onClose={() => setShowCreateModal(false)} />}
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppShell />
    </AppProvider>
  );
}

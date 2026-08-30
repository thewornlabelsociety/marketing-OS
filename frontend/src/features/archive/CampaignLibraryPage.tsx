import { Archive, BookOpen, Loader2, Search, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../../app/AppContext';
import { api } from '../../services/api';
import type { CampaignBlueprint, LibraryCampaignSummary, LibrarySummary } from '../../types';

const FILTERS = [
  { id: '', label: 'All' },
  { id: 'HIGH_PERFORMING', label: 'High Performing' },
  { id: 'LOW_PERFORMING', label: 'Low Performing' },
  { id: 'EVERGREEN', label: 'Evergreen' },
  { id: 'SEASONAL', label: 'Seasonal' },
  { id: 'BLUEPRINT_CANDIDATE', label: 'Candidates' },
  { id: 'CANCELLED', label: 'Cancelled' },
  { id: 'ARCHIVED', label: 'Archived' },
] as const;

const CLASS_LABELS: Record<string, string> = {
  EXCEPTIONAL: 'Exceptional',
  HIGH_PERFORMING: 'High Performing',
  LOW_PERFORMING: 'Low Performing',
  BLUEPRINT_CANDIDATE: 'Blueprint Candidate',
};

export default function CampaignLibraryPage() {
  const { activeEntity, setActiveTab, setActiveCampaignId } = useApp();
  const [items, setItems] = useState<LibraryCampaignSummary[]>([]);
  const [blueprints, setBlueprints] = useState<CampaignBlueprint[]>([]);
  const [summary, setSummary] = useState<LibrarySummary | null>(null);
  const [filter, setFilter] = useState('');
  const [view, setView] = useState<'campaigns' | 'blueprints'>('campaigns');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<LibraryCampaignSummary | null>(null);
  const [selectedBp, setSelectedBp] = useState<CampaignBlueprint | null>(null);
  const [message, setMessage] = useState('');

  const workspaceId = activeEntity?.id ?? '';

  const load = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const [campaigns, bps, sum] = await Promise.all([
        api.getLibraryCampaigns(workspaceId, { classification: filter || undefined, search: search || undefined, includeArchived: filter === 'ARCHIVED' }),
        api.getBlueprints(workspaceId),
        api.getLibrarySummary(workspaceId),
      ]);
      setItems(campaigns);
      setBlueprints(bps);
      setSummary(sum);
    } finally {
      setLoading(false);
    }
  }, [workspaceId, filter, search]);

  useEffect(() => { void load(); }, [load]);

  async function handleCreateBlueprint(campaignId: string) {
    if (!workspaceId) return;
    setMessage('');
    try {
      const bp = await api.createBlueprintFromCampaign(campaignId, workspaceId);
      await api.activateBlueprint(bp.id, workspaceId);
      setMessage('Blueprint created and activated.');
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed');
    }
  }

  async function handleUseBlueprint(blueprintId: string) {
    if (!workspaceId) return;
    const sourceTitle = window.prompt('What are you marketing now?');
    if (!sourceTitle?.trim()) return;
    try {
      const result = await api.useBlueprint(blueprintId, workspaceId, {
        sourceType: 'PRODUCT',
        sourceTitle: sourceTitle.trim(),
      });
      setActiveCampaignId(result.campaignId);
      setActiveTab('campaign-detail');
      setSelectedBp(null);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed');
    }
  }

  if (!activeEntity) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <BookOpen className="h-8 w-8 text-[#A1A1AA]" />
        <p className="mt-3 text-sm text-[#71717A]">Select a workspace to view the library.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div>
        <h1 className="text-lg font-semibold text-[#09090B]">Library</h1>
        <p className="mt-1 text-sm text-[#71717A]">Campaign history, performance knowledge, and proven blueprints.</p>
      </div>

      {summary && (
        <div className="flex flex-wrap gap-2 text-xs text-[#71717A]">
          <span>{summary.total} campaigns</span>
          <span>·</span>
          <span>{summary.highPerforming} high performing</span>
          <span>·</span>
          <span>{summary.blueprints} blueprints</span>
        </div>
      )}

      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-[#A1A1AA]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search campaigns…"
            className="w-full rounded-lg border border-[#E4E4E7] py-2 pl-9 pr-3 text-sm"
          />
        </div>
        <div className="flex rounded-lg border border-[#E4E4E7] p-0.5">
          <button type="button" onClick={() => setView('campaigns')} className={`rounded-md px-3 py-1.5 text-xs font-medium ${view === 'campaigns' ? 'bg-[#09090B] text-white' : ''}`}>Campaigns</button>
          <button type="button" onClick={() => setView('blueprints')} className={`rounded-md px-3 py-1.5 text-xs font-medium ${view === 'blueprints' ? 'bg-[#09090B] text-white' : ''}`}>Blueprints</button>
        </div>
      </div>

      {view === 'campaigns' && (
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${filter === f.id ? 'border-[#09090B] bg-[#09090B] text-white' : 'border-[#E4E4E7] text-[#71717A]'}`}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-[#71717A]" /></div>
      ) : view === 'blueprints' ? (
        <div className="divide-y divide-[#E4E4E7] rounded-xl border border-[#E4E4E7] bg-white">
          {blueprints.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-[#71717A]">No blueprints yet. Create one from a high-performing campaign.</p>
          ) : blueprints.map((bp) => (
            <button key={bp.id} type="button" onClick={() => setSelectedBp(bp)} className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-[#FAFAFA]">
              <div>
                <p className="text-sm font-medium text-[#09090B]">{bp.name}</p>
                <p className="text-xs text-[#71717A]">{bp.objectiveType} · v{bp.currentVersion} · {bp.status}</p>
              </div>
              <Sparkles className="h-4 w-4 text-[#71717A]" />
            </button>
          ))}
        </div>
      ) : (
        <div className="divide-y divide-[#E4E4E7] rounded-xl border border-[#E4E4E7] bg-white">
          {items.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-[#71717A]">No campaigns match this filter.</p>
          ) : items.map((item) => (
            <button key={item.campaignId} type="button" onClick={() => setSelected(item)} className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-[#FAFAFA]">
              <div>
                <p className="text-sm font-medium text-[#09090B]">{item.campaignName}</p>
                <p className="text-xs text-[#71717A]">{item.objectiveName} · {item.channels.join(' · ')}</p>
              </div>
              <div className="text-right">
                {item.performanceClassification && (
                  <span className="text-xs font-medium text-[#09090B]">{CLASS_LABELS[item.performanceClassification] ?? item.performanceClassification}</span>
                )}
                {item.libraryRecord.blueprintCandidate && (
                  <p className="text-[10px] text-[#71717A]">Blueprint Candidate</p>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {message && <p className="text-xs text-[#71717A]">{message}</p>}

      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/20">
          <aside className="flex h-full w-[420px] flex-col border-l border-[#E4E4E7] bg-white shadow-xl">
            <header className="border-b border-[#E4E4E7] px-5 py-4">
              <p className="text-sm font-semibold text-[#09090B]">{selected.campaignName}</p>
              <p className="text-xs text-[#71717A]">{selected.objectiveName}</p>
            </header>
            <div className="flex-1 overflow-y-auto p-5 space-y-4 text-sm">
              <p>Status: {selected.lifecycleStatus}</p>
              <p>Classifications: {selected.libraryRecord.classifications.join(', ')}</p>
              {selected.libraryRecord.cancellationReasonType && <p>Cancelled: {selected.libraryRecord.cancellationReasonType}</p>}
              {selected.primaryKpiValue != null && <p>{selected.primaryKpi}: {selected.primaryKpiValue}</p>}
            </div>
            <footer className="flex flex-wrap gap-2 border-t border-[#E4E4E7] p-4">
              <button type="button" onClick={() => { setActiveCampaignId(selected.campaignId); setActiveTab('campaign-detail'); setSelected(null); }} className="rounded-lg bg-[#09090B] px-3 py-2 text-xs font-medium text-white">Open Campaign</button>
              {selected.libraryRecord.blueprintCandidate && (
                <button type="button" onClick={() => void handleCreateBlueprint(selected.campaignId)} className="rounded-lg border border-[#E4E4E7] px-3 py-2 text-xs font-medium">Create Blueprint</button>
              )}
              {!selected.libraryRecord.evergreen && (
                <button type="button" onClick={async () => { await api.markLibraryEvergreen(selected.campaignId, workspaceId); setSelected(null); await load(); }} className="rounded-lg border border-[#E4E4E7] px-3 py-2 text-xs font-medium">Mark Evergreen</button>
              )}
              {!selected.libraryRecord.seasonal && (
                <button type="button" onClick={async () => { await api.markLibrarySeasonal(selected.campaignId, workspaceId, { season: 'Christmas', recurringWindow: 'December' }); setSelected(null); await load(); }} className="rounded-lg border border-[#E4E4E7] px-3 py-2 text-xs font-medium">Mark Seasonal</button>
              )}
              <button type="button" onClick={async () => { await api.archiveLibraryCampaign(selected.campaignId, workspaceId); setSelected(null); await load(); }} className="rounded-lg border border-[#E4E4E7] px-3 py-2 text-xs font-medium"><Archive className="inline h-3 w-3" /> Archive</button>
            </footer>
          </aside>
          <button type="button" aria-label="Close" className="flex-1" onClick={() => setSelected(null)} />
        </div>
      )}

      {selectedBp && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/20">
          <aside className="flex h-full w-[420px] flex-col border-l border-[#E4E4E7] bg-white shadow-xl">
            <header className="border-b border-[#E4E4E7] px-5 py-4">
              <p className="text-sm font-semibold text-[#09090B]">{selectedBp.name}</p>
              <p className="text-xs text-[#71717A]">{selectedBp.objectiveType}</p>
            </header>
            <div className="flex-1 overflow-y-auto p-5 space-y-3 text-sm">
              <p className="font-medium">Why it worked</p>
              <ul className="list-disc pl-4 text-[#71717A]">{selectedBp.learnedWhy.map((w) => <li key={w}>{w}</li>)}</ul>
              <p className="font-medium">Content pattern</p>
              <p className="text-[#71717A]">{selectedBp.contentPattern.length} deliverables · {selectedBp.channelPattern.join(', ')}</p>
            </div>
            <footer className="border-t border-[#E4E4E7] p-4">
              {selectedBp.status === 'ACTIVE' && (
                <button type="button" onClick={() => void handleUseBlueprint(selectedBp.id)} className="w-full rounded-lg bg-[#09090B] px-3 py-2 text-xs font-medium text-white">Use Blueprint</button>
              )}
            </footer>
          </aside>
          <button type="button" aria-label="Close" className="flex-1" onClick={() => setSelectedBp(null)} />
        </div>
      )}
    </div>
  );
}

import { Filter, ImageOff, Layers, Loader2, MoreHorizontal, Plus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useApp } from '../../app/AppContext';
import { api } from '../../services/api';
import type { StudioLibraryItem } from '../../types';

type StatusFilter = 'all' | 'drafts' | 'ready' | 'approved';

const FILTERS: { id: StatusFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'drafts', label: 'Drafts' },
  { id: 'ready', label: 'Ready' },
  { id: 'approved', label: 'Approved' },
];

const FORMAT_LABELS: Record<string, string> = {
  POST: 'Post',
  CAROUSEL: 'Carousel',
  STORY: 'Story',
  EMAIL: 'Email',
};

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  READY_FOR_REVIEW: { label: 'Draft', className: 'bg-zinc-100 text-zinc-600' },
  CHANGES_REQUESTED: { label: 'Changes', className: 'bg-amber-50 text-amber-700' },
  REVISING: { label: 'Revising', className: 'bg-blue-50 text-blue-700' },
  READY_FOR_APPROVAL: { label: 'Ready', className: 'bg-emerald-50 text-emerald-700' },
  APPROVED: { label: 'Approved', className: 'bg-emerald-100 text-emerald-800' },
  GENERATING: { label: 'Generating', className: 'bg-zinc-100 text-zinc-500' },
};

function matches(item: StudioLibraryItem, filter: StatusFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'drafts') return ['READY_FOR_REVIEW', 'CHANGES_REQUESTED', 'REVISING', 'GENERATING'].includes(item.status);
  if (filter === 'ready') return item.status === 'READY_FOR_APPROVAL';
  if (filter === 'approved') return item.status === 'APPROVED';
  return true;
}

function LibraryCard({ item, onOpen, onCreateVersions }: { item: StudioLibraryItem; onOpen: () => void; onCreateVersions: () => void }) {
  const hero = item.products[0];
  const heroImage = hero?.imageUrls[0] ?? null;
  const statusCfg = STATUS_CONFIG[item.status] ?? { label: item.status, className: 'bg-zinc-100 text-zinc-600' };
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  return (
    <div className="group relative flex flex-col rounded-2xl border border-zinc-200 bg-white shadow-sm transition hover:border-zinc-400 hover:shadow-md">
      {/* Image area — clickable */}
      <button
        type="button"
        onClick={onOpen}
        className="relative aspect-[4/5] w-full overflow-hidden rounded-t-2xl bg-zinc-100 focus-visible:outline-2 focus-visible:outline-zinc-950 text-left"
      >
        {heroImage ? (
          <img
            src={heroImage}
            alt=""
            className="h-full w-full object-cover transition group-hover:scale-[1.02]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <ImageOff className="h-8 w-8 text-zinc-300" />
          </div>
        )}

        {/* Format badge top-left */}
        <span className="absolute left-2 top-2 rounded-lg bg-black/60 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur-sm">
          {FORMAT_LABELS[item.studioFormat] ?? item.studioFormat}
        </span>

        {/* Multi-product strip */}
        {item.products.length > 1 && (
          <div className="absolute bottom-2 right-2 flex -space-x-1.5">
            {item.products.slice(0, 4).map((p, i) => (
              <div
                key={p.id}
                className="h-7 w-7 overflow-hidden rounded-full border-2 border-white bg-zinc-200 shadow"
                style={{ zIndex: item.products.length - i }}
              >
                {p.imageUrls[0] ? (
                  <img src={p.imageUrls[0]} alt="" className="h-full w-full object-cover" />
                ) : null}
              </div>
            ))}
          </div>
        )}
      </button>

      {/* Card footer */}
      <div className="flex flex-col gap-1 p-3">
        <p className="truncate text-[11px] font-semibold text-zinc-900">
          {item.title ?? item.campaignName}
        </p>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <p className="truncate text-[10px] text-zinc-400">{item.campaignName}</p>
            {item.creativeDirection && (
              <span className="shrink-0 rounded-full border border-zinc-200 px-1.5 py-0.5 text-[9px] font-medium text-zinc-500">
                {item.creativeDirection === 'EDITORIAL' ? 'Ed.' : item.creativeDirection === 'PRODUCT_LED' ? 'PL' : 'Min.'}
              </span>
            )}
          </div>
          <div className="relative flex items-center gap-1" ref={menuRef}>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${statusCfg.className}`}>
              {statusCfg.label}
            </span>
            <button
              type="button"
              onClick={() => setMenuOpen(v => !v)}
              className="rounded p-0.5 text-zinc-300 hover:text-zinc-600 focus-visible:outline-none"
              aria-label="More options"
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
            {menuOpen && (
              <div className="absolute bottom-full right-0 mb-1 z-20 min-w-[130px] rounded-xl border border-zinc-200 bg-white py-1 shadow-lg">
                <button
                  type="button"
                  onClick={() => { setMenuOpen(false); onCreateVersions(); }}
                  className="w-full px-3 py-2 text-left text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  Create versions
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CreativeStudioPage() {
  const { activeEntity, setActiveTab, setStudioReturnTarget, setSelectedSourceProductIds, newStudioSession, setRepurposeSourceArtifactId } = useApp();
  const [items, setItems] = useState<StudioLibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<StatusFilter>('all');

  useEffect(() => {
    if (!activeEntity) return;
    setLoading(true);
    setError(null);
    api.establishLocalOperatorSession()
      .then(() => api.getStudioLibrary(activeEntity.id))
      .then(setItems)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [activeEntity]);

  const visible = items.filter(item => matches(item, filter));

  const openItem = (item: StudioLibraryItem) => {
    setStudioReturnTarget(item);
    setSelectedSourceProductIds(item.products.map(p => p.id));
    setActiveTab('operator-studio');
  };

  const handleCreate = () => newStudioSession();

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-zinc-100 bg-white px-6 py-4">
        <div className="flex items-center gap-2">
          <Layers className="h-5 w-5 text-zinc-400" />
          <h1 className="text-base font-semibold tracking-tight text-zinc-950">Creative Studio</h1>
          {!loading && (
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-500">
              {items.length}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {/* Filter chips */}
          <div className="flex items-center gap-1 rounded-xl border border-zinc-200 bg-zinc-50 p-1">
            <Filter className="ml-1.5 h-3.5 w-3.5 text-zinc-400" />
            {FILTERS.map(f => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                  filter === f.id
                    ? 'bg-white text-zinc-950 shadow-sm'
                    : 'text-zinc-500 hover:text-zinc-800'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={handleCreate}
            className="flex items-center gap-1.5 rounded-xl bg-zinc-950 px-3 py-2 text-xs font-semibold text-white transition hover:bg-zinc-800"
          >
            <Plus className="h-3.5 w-3.5" />
            Create
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        {loading && (
          <div className="flex h-full items-center justify-center gap-3 text-sm text-zinc-400">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading creative work…
          </div>
        )}

        {!loading && error && (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-zinc-500">Failed to load: {error}</p>
          </div>
        )}

        {!loading && !error && items.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-100">
              <Layers className="h-7 w-7 text-zinc-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-zinc-900">No creative work yet</p>
              <p className="mt-1 text-xs text-zinc-500">Click Create to make your first piece of content.</p>
            </div>
            <button
              type="button"
              onClick={handleCreate}
              className="flex items-center gap-1.5 rounded-xl bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800"
            >
              <Plus className="h-4 w-4" />
              Create content
            </button>
          </div>
        )}

        {!loading && !error && items.length > 0 && visible.length === 0 && (
          <div className="flex h-40 items-center justify-center">
            <p className="text-sm text-zinc-400">No {filter} items yet.</p>
          </div>
        )}

        {!loading && !error && visible.length > 0 && (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {visible.map(item => (
              <LibraryCard
                key={item.artifactId}
                item={item}
                onOpen={() => openItem(item)}
                onCreateVersions={() => {
                  setRepurposeSourceArtifactId(item.artifactId);
                  setActiveTab('repurpose');
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

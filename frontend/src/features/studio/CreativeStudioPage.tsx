import {
  Check,
  ChevronDown,
  ExternalLink,
  Image,
  ImageOff,
  Layers,
  Link,
  Loader2,
  MoreHorizontal,
  Search,
  Upload,
  Video,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../../app/AppContext';
import { api } from '../../services/api';
import type { MediaAsset, StudioLibraryItem, StudioLibraryProduct } from '../../types';

// ── Local derived types ──────────────────────────────────────────────────────

interface StatusCounts {
  approved: number;
  readyForApproval: number;
  changesRequested: number;
  readyForReview: number;
  revising: number;
  generating: number;
}

interface CreativeSet {
  campaignId: string;
  setTitle: string;
  heroImageUrl: string | null;
  products: StudioLibraryProduct[];
  campaignName: string;
  campaignStatus: string;
  items: StudioLibraryItem[];
  channels: string[];
  latestUpdatedAt: string;
  earliestCreatedAt: string;
  pieceCount: number;
  statusCounts: StatusCounts;
  needsAttentionScore: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SET_PAGE_SIZE = 12;

type StudioTab = 'creative' | 'media';
type StatusFilterKey = 'all' | 'needs-review' | 'ready' | 'approved';
type SortOption = 'newest' | 'oldest' | 'attention' | 'most-pieces';
type MediaFilter = 'all' | 'uploaded' | 'connected' | 'recent' | 'images' | 'video';

const CHANNEL_LABELS: Record<string, string> = {
  INSTAGRAM: 'Instagram',
  FACEBOOK: 'Facebook',
  TIKTOK: 'TikTok',
  EMAIL: 'Email',
  LINKEDIN: 'LinkedIn',
  WEBSITE: 'Website',
};

const CONTENT_TYPE_LABELS: Record<string, string> = {
  STATIC_POST: 'Post',
  CAROUSEL: 'Carousel',
  STORY: 'Story',
  SHORT_VIDEO: 'Reel',
  LONG_VIDEO: 'Long Video',
  EMAIL: 'Email',
  NEWSLETTER: 'Newsletter',
  TEXT_POST: 'Text Post',
  ARTICLE: 'Article',
  LANDING_PAGE: 'Landing Page',
  TALKING_POINTS: 'Talking Points',
};

const ARTIFACT_STATUS_CONFIG: Record<string, { label: string; badge: string }> = {
  READY_FOR_REVIEW: { label: 'Needs review', badge: 'bg-zinc-100 text-zinc-600' },
  CHANGES_REQUESTED: { label: 'Changes requested', badge: 'bg-amber-50 text-amber-700' },
  REVISING: { label: 'Revising', badge: 'bg-blue-50 text-blue-700' },
  READY_FOR_APPROVAL: { label: 'Ready to approve', badge: 'bg-emerald-50 text-emerald-700' },
  APPROVED: { label: 'Approved', badge: 'bg-emerald-100 text-emerald-800' },
  GENERATING: { label: 'Generating', badge: 'bg-zinc-100 text-zinc-500' },
};

const MEDIA_FILTERS: { id: MediaFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'uploaded', label: 'My Uploads' },
  { id: 'connected', label: 'Website Arrivals' },
  { id: 'recent', label: 'Recent' },
  { id: 'images', label: 'Images' },
  { id: 'video', label: 'Video' },
];

// ── Utility ───────────────────────────────────────────────────────────────────

function formatDate(isoStr: string): string {
  try {
    return new Date(isoStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  } catch {
    return '';
  }
}

// Grouping — runs over the FULL fetched dataset; pagination happens on the resulting sets
function buildCreativeSets(items: StudioLibraryItem[]): CreativeSet[] {
  const map = new Map<string, StudioLibraryItem[]>();
  for (const item of items) {
    const group = map.get(item.campaignId) ?? [];
    group.push(item);
    map.set(item.campaignId, group);
  }

  return Array.from(map.entries()).map(([campaignId, setItems]) => {
    // Hero image: prefer first item that has a product with an actual image URL
    const withImage = setItems.find(i => i.products.length > 0 && i.products[0].imageUrls.length > 0);
    const withProducts = withImage ?? setItems.find(i => i.products.length > 0);
    const products = withProducts?.products ?? [];
    const heroImageUrl = products[0]?.imageUrls[0] ?? null;

    // Title priority: product brand+title → product title → campaignName
    let setTitle: string;
    if (products.length > 0) {
      const p = products[0];
      setTitle = p.brand ? `${p.brand} ${p.title}` : p.title;
    } else {
      setTitle = setItems[0].campaignName;
    }

    const channels = Array.from(new Set(setItems.map(i => i.channel)));
    const latestUpdatedAt = setItems.reduce((m, i) => (i.updatedAt > m ? i.updatedAt : m), setItems[0].updatedAt);
    const earliestCreatedAt = setItems.reduce((m, i) => (i.createdAt < m ? i.createdAt : m), setItems[0].createdAt);

    const statusCounts: StatusCounts = {
      approved: setItems.filter(i => i.status === 'APPROVED').length,
      readyForApproval: setItems.filter(i => i.status === 'READY_FOR_APPROVAL').length,
      changesRequested: setItems.filter(i => i.status === 'CHANGES_REQUESTED').length,
      readyForReview: setItems.filter(i => i.status === 'READY_FOR_REVIEW').length,
      revising: setItems.filter(i => i.status === 'REVISING').length,
      generating: setItems.filter(i => i.status === 'GENERATING').length,
    };

    const needsAttentionScore =
      statusCounts.changesRequested * 3 +
      statusCounts.readyForApproval * 2 +
      statusCounts.readyForReview;

    return {
      campaignId,
      setTitle,
      heroImageUrl,
      products,
      campaignName: setItems[0].campaignName,
      campaignStatus: setItems[0].campaignStatus,
      items: setItems,
      channels,
      latestUpdatedAt,
      earliestCreatedAt,
      pieceCount: setItems.length,
      statusCounts,
      needsAttentionScore,
    };
  });
}

function applySetFilters(
  sets: CreativeSet[],
  opts: { search: string; status: StatusFilterKey; channel: string; campaign: string; sort: SortOption },
): CreativeSet[] {
  let result = [...sets];
  const q = opts.search.trim().toLowerCase();
  if (q) result = result.filter(s => s.setTitle.toLowerCase().includes(q) || s.campaignName.toLowerCase().includes(q));

  if (opts.status === 'needs-review')
    result = result.filter(s => s.statusCounts.readyForReview + s.statusCounts.changesRequested + s.statusCounts.readyForApproval > 0);
  else if (opts.status === 'ready')
    result = result.filter(s => s.statusCounts.readyForApproval > 0);
  else if (opts.status === 'approved')
    result = result.filter(s => s.statusCounts.approved === s.pieceCount);

  if (opts.channel !== 'all') result = result.filter(s => s.channels.includes(opts.channel));
  if (opts.campaign !== 'all') result = result.filter(s => s.campaignId === opts.campaign);

  switch (opts.sort) {
    case 'newest': result.sort((a, b) => b.latestUpdatedAt.localeCompare(a.latestUpdatedAt)); break;
    case 'oldest': result.sort((a, b) => a.earliestCreatedAt.localeCompare(b.earliestCreatedAt)); break;
    case 'attention': result.sort((a, b) => b.needsAttentionScore - a.needsAttentionScore); break;
    case 'most-pieces': result.sort((a, b) => b.pieceCount - a.pieceCount); break;
  }
  return result;
}

function buildStatusLine(sc: StatusCounts, total: number): { text: string; allApproved: boolean } {
  if (sc.approved === total && total > 0) return { text: 'All approved', allApproved: true };
  const parts: string[] = [];
  if (sc.approved > 0) parts.push(`${sc.approved} Approved`);
  const needsAttn = sc.changesRequested + sc.readyForApproval + sc.readyForReview;
  if (needsAttn > 0) parts.push(`${needsAttn} Needs review`);
  const drafts = total - sc.approved - needsAttn - sc.revising - sc.generating;
  if (drafts > 0) parts.push(`${drafts} Draft`);
  if (sc.revising > 0) parts.push(`${sc.revising} Revising`);
  return { text: parts.slice(0, 3).join(' · ') || 'Generating…', allApproved: false };
}

// ── FilterDropdown ─────────────────────────────────────────────────────────────

function FilterDropdown({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { id: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const active = options.find(o => o.id === value);
  const isFiltered = value !== options[0]?.id;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
          isFiltered
            ? 'border-zinc-950 bg-zinc-950 text-white'
            : 'border-zinc-200 bg-white text-zinc-600 hover:border-zinc-400 hover:text-zinc-900'
        }`}
      >
        {isFiltered ? active?.label : label}
        <ChevronDown className="h-3 w-3 opacity-60" />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 min-w-[160px] rounded-xl border border-zinc-200 bg-white py-1 shadow-lg">
          {options.map(o => (
            <button
              key={o.id}
              type="button"
              onClick={() => { onChange(o.id); setOpen(false); }}
              className={`flex w-full items-center justify-between px-3 py-2 text-left text-xs font-medium transition hover:bg-zinc-50 ${value === o.id ? 'text-zinc-950' : 'text-zinc-600'}`}
            >
              {o.label}
              {value === o.id && <Check className="h-3 w-3 text-zinc-950" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="flex flex-col rounded-2xl border border-zinc-100 bg-white">
      <div className="aspect-[4/5] w-full animate-pulse rounded-t-2xl bg-zinc-100" />
      <div className="flex flex-col gap-2 p-4">
        <div className="h-3.5 w-3/4 animate-pulse rounded bg-zinc-100" />
        <div className="h-2.5 w-1/2 animate-pulse rounded bg-zinc-100" />
        <div className="flex gap-1 pt-1">
          <div className="h-4 w-16 animate-pulse rounded-full bg-zinc-100" />
          <div className="h-4 w-14 animate-pulse rounded-full bg-zinc-100" />
        </div>
        <div className="mt-2 h-2.5 w-2/3 animate-pulse rounded bg-zinc-100" />
      </div>
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)}
    </div>
  );
}

// ── Creative Set Card ─────────────────────────────────────────────────────────

function CreativeSetCard({ set, isExpanded, onOpen }: {
  set: CreativeSet;
  isExpanded: boolean;
  onOpen: () => void;
}) {
  const { text: statusText, allApproved } = buildStatusLine(set.statusCounts, set.pieceCount);
  const visibleChannels = set.channels.slice(0, 3);
  const extraChannels = set.channels.length - 3;

  return (
    <div
      className={`group flex flex-col rounded-2xl border bg-white transition hover:shadow-md ${
        isExpanded ? 'border-zinc-950 shadow-md ring-1 ring-zinc-950' : 'border-zinc-200 shadow-sm hover:border-zinc-300'
      }`}
    >
      {/* Hero image */}
      <button
        type="button"
        onClick={onOpen}
        className="relative aspect-[4/5] w-full overflow-hidden rounded-t-2xl bg-zinc-100 text-left focus-visible:outline-2 focus-visible:outline-zinc-950"
        aria-label={`Open ${set.setTitle}`}
      >
        {set.heroImageUrl ? (
          <img
            src={set.heroImageUrl}
            alt=""
            className="h-full w-full object-cover transition group-hover:scale-[1.02]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <ImageOff className="h-8 w-8 text-zinc-300" />
          </div>
        )}

        {/* Piece count */}
        <span className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur-sm">
          {set.pieceCount} {set.pieceCount === 1 ? 'piece' : 'pieces'}
        </span>

        {/* Attention dot */}
        {set.needsAttentionScore > 0 && (
          <span
            className="absolute left-2 top-2 h-2 w-2 rounded-full bg-amber-400 ring-2 ring-white"
            aria-label="Needs attention"
          />
        )}
      </button>

      {/* Card body */}
      <div className="flex flex-1 flex-col gap-2 p-4">
        <p className="line-clamp-2 text-[13px] font-semibold leading-snug text-zinc-950">{set.setTitle}</p>
        <p className="truncate text-[11px] text-zinc-400">
          {set.campaignName} · {formatDate(set.latestUpdatedAt)}
        </p>

        {/* Channel chips */}
        <div className="flex flex-wrap gap-1">
          {visibleChannels.map(ch => (
            <span
              key={ch}
              className="rounded-full border border-zinc-200 px-2 py-0.5 text-[10px] font-medium text-zinc-500"
            >
              {CHANNEL_LABELS[ch] ?? ch}
            </span>
          ))}
          {extraChannels > 0 && (
            <span className="rounded-full border border-zinc-200 px-2 py-0.5 text-[10px] font-medium text-zinc-400">
              +{extraChannels}
            </span>
          )}
        </div>

        {/* Status summary + open */}
        <div className="mt-auto flex items-center justify-between pt-2">
          <p className={`text-[10px] font-medium leading-tight ${allApproved ? 'text-emerald-700' : 'text-zinc-500'}`}>
            {allApproved ? '✓ ' : ''}{statusText}
          </p>
          <button
            type="button"
            onClick={onOpen}
            className="ml-2 shrink-0 rounded-lg px-2 py-1 text-[11px] font-semibold text-zinc-500 transition hover:text-zinc-950 focus-visible:outline-2 focus-visible:outline-zinc-950"
          >
            {isExpanded ? 'Close ↑' : 'Open →'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Artifact Row (inside detail panel) ───────────────────────────────────────

function ArtifactRow({ item, onOpen, onRepurpose }: {
  item: StudioLibraryItem;
  onOpen: () => void;
  onRepurpose: () => void;
}) {
  const heroImage = item.products[0]?.imageUrls[0] ?? null;
  const statusCfg = ARTIFACT_STATUS_CONFIG[item.status] ?? { label: item.status, badge: 'bg-zinc-100 text-zinc-600' };
  const channelLabel = CHANNEL_LABELS[item.channel] ?? item.channel;
  const typeLabel = CONTENT_TYPE_LABELS[item.contentType] ?? item.contentType;
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const h = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [menuOpen]);

  return (
    <div className="flex items-center gap-3 rounded-xl border border-zinc-100 bg-white px-3 py-2.5 transition hover:border-zinc-200">
      {/* Thumbnail */}
      <div className="h-11 w-10 shrink-0 overflow-hidden rounded-lg bg-zinc-100">
        {heroImage ? (
          <img src={heroImage} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <ImageOff className="h-3.5 w-3.5 text-zinc-300" />
          </div>
        )}
      </div>

      {/* Name */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12px] font-semibold text-zinc-900">
          {channelLabel} {typeLabel}
        </p>
        {item.title && (
          <p className="truncate text-[10px] text-zinc-400">{item.title}</p>
        )}
      </div>

      {/* Status */}
      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${statusCfg.badge}`}>
        {statusCfg.label}
      </span>

      {/* Edit */}
      <button
        type="button"
        onClick={onOpen}
        className="shrink-0 rounded-lg border border-zinc-200 px-2.5 py-1 text-[11px] font-semibold text-zinc-700 transition hover:border-zinc-950 hover:text-zinc-950 focus-visible:outline-2 focus-visible:outline-zinc-950"
      >
        Edit →
      </button>

      {/* Overflow */}
      <div className="relative shrink-0" ref={menuRef}>
        <button
          type="button"
          onClick={() => setMenuOpen(v => !v)}
          className="rounded p-1 text-zinc-300 hover:text-zinc-600"
          aria-label="More options"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
        {menuOpen && (
          <div className="absolute right-0 top-full z-30 mt-1 min-w-[140px] rounded-xl border border-zinc-200 bg-white py-1 shadow-lg">
            <button
              type="button"
              onClick={() => { setMenuOpen(false); onRepurpose(); }}
              className="w-full px-3 py-2 text-left text-xs font-medium text-zinc-700 hover:bg-zinc-50"
            >
              Create versions
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Creative Set Detail Panel ─────────────────────────────────────────────────

function CreativeSetDetail({ set, channelFilter, onChannelFilterChange, onClose, onOpenItem, onRepurpose }: {
  set: CreativeSet;
  channelFilter: string;
  onChannelFilterChange: (ch: string) => void;
  onClose: () => void;
  onOpenItem: (item: StudioLibraryItem) => void;
  onRepurpose: (artifactId: string) => void;
}) {
  const { text: statusText, allApproved } = buildStatusLine(set.statusCounts, set.pieceCount);

  const detailItems = channelFilter === 'all'
    ? set.items
    : set.items.filter(i => i.channel === channelFilter);

  const channelTabs = [
    { id: 'all', label: `All (${set.pieceCount})` },
    ...set.channels.map(ch => ({
      id: ch,
      label: `${CHANNEL_LABELS[ch] ?? ch} (${set.items.filter(i => i.channel === ch).length})`,
    })),
  ];

  return (
    <div
      className="flex shrink-0 flex-col border-t-2 border-zinc-950 bg-zinc-50"
      style={{ height: '52%', minHeight: '260px', maxHeight: '460px' }}
    >
      {/* Detail header */}
      <div className="flex shrink-0 items-center gap-4 border-b border-zinc-200 bg-white px-6 py-3">
        {set.heroImageUrl && (
          <div className="h-10 w-8 shrink-0 overflow-hidden rounded-lg bg-zinc-100">
            <img src={set.heroImageUrl} alt="" className="h-full w-full object-cover" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold text-zinc-950">{set.setTitle}</h2>
          <p className="text-[11px] text-zinc-400">
            {set.campaignName} · {formatDate(set.latestUpdatedAt)} ·{' '}
            <span className={allApproved ? 'text-emerald-700' : 'text-zinc-500'}>
              {set.pieceCount} pieces{allApproved ? ' · ✓ All approved' : ` · ${statusText}`}
            </span>
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="ml-2 shrink-0 rounded-lg p-1.5 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700"
          aria-label="Close detail panel"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Channel tabs */}
      <div className="flex shrink-0 items-center overflow-x-auto border-b border-zinc-200 bg-white px-6">
        {channelTabs.map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChannelFilterChange(tab.id)}
            className={`shrink-0 border-b-2 px-3 py-2.5 text-xs font-medium transition ${
              channelFilter === tab.id
                ? 'border-zinc-950 text-zinc-950'
                : 'border-transparent text-zinc-400 hover:text-zinc-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Artifact list */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {detailItems.length === 0 ? (
          <div className="flex h-16 items-center justify-center text-xs text-zinc-400">
            No pieces match this filter.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {detailItems.map(item => (
              <ArtifactRow
                key={item.artifactId}
                item={item}
                onOpen={() => onOpenItem(item)}
                onRepurpose={() => onRepurpose(item.artifactId)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Media Library (preserved exactly) ────────────────────────────────────────

function matchesMedia(asset: MediaAsset, filter: MediaFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'images') return asset.mimeType.startsWith('image/');
  if (filter === 'video') return asset.mimeType.startsWith('video/');
  if (filter === 'recent') return new Date(asset.createdAt).getTime() > Date.now() - 7 * 24 * 60 * 60 * 1000;
  if (filter === 'uploaded') return !asset.campaignId;
  if (filter === 'connected') return Boolean(asset.campaignId);
  return true;
}

function MediaCard({ asset, previewUrl }: { asset: MediaAsset; previewUrl?: string }) {
  const isVideo = asset.mimeType.startsWith('video/');
  const sizeKb = Math.round(asset.fileSize / 1024);
  const sizeLabel = sizeKb >= 1024 ? `${(sizeKb / 1024).toFixed(1)} MB` : `${sizeKb} KB`;

  return (
    <div className="group relative flex flex-col rounded-2xl border border-zinc-200 bg-white shadow-sm transition hover:border-zinc-400 hover:shadow-md">
      <div className="relative aspect-square w-full overflow-hidden rounded-t-2xl bg-zinc-100">
        {previewUrl ? (
          isVideo ? (
            <video src={previewUrl} className="h-full w-full object-cover" muted playsInline />
          ) : (
            <img src={previewUrl} alt={asset.originalFilename ?? ''} className="h-full w-full object-cover transition group-hover:scale-[1.02]" />
          )
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            {isVideo ? <Video className="h-8 w-8 text-zinc-300" /> : <Image className="h-8 w-8 text-zinc-300" />}
          </div>
        )}
        <span className="absolute left-2 top-2 rounded-lg bg-black/60 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur-sm">
          {isVideo ? 'Video' : 'Image'}
        </span>
      </div>
      <div className="px-3 py-2">
        <p className="truncate text-[11px] font-medium text-zinc-900">{asset.originalFilename ?? asset.id.slice(0, 8)}</p>
        <p className="mt-0.5 text-[10px] text-zinc-400">{sizeLabel}{asset.width ? ` · ${asset.width}×${asset.height}` : ''}</p>
      </div>
    </div>
  );
}

function MediaLibraryPanel({ workspaceId }: { workspaceId: string }) {
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [mediaFilter, setMediaFilter] = useState<MediaFilter>('all');
  const [urlImportOpen, setUrlImportOpen] = useState(false);
  const [importUrl, setImportUrl] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchPreviewUrl = async (assetId: string) => {
    try {
      const { url } = await api.getMediaPreviewUrl(assetId, workspaceId);
      setPreviewUrls(prev => ({ ...prev, [assetId]: url }));
    } catch { /* no preview */ }
  };

  const refreshAssets = async () => {
    const { assets: fresh } = await api.listWorkspaceMedia(workspaceId);
    setAssets(fresh);
    await Promise.allSettled(fresh.slice(0, 24).map(a => fetchPreviewUrl(a.id)));
  };

  useEffect(() => {
    setLoading(true);
    refreshAssets().catch(() => {}).finally(() => setLoading(false));
  }, [workspaceId]); // eslint-disable-line react-hooks/exhaustive-deps

  const uploadFile = async (file: File) => {
    return new Promise<void>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          await api.uploadMediaAsset({ workspaceId, fileBase64: reader.result as string, mimeType: file.type, filename: file.name });
          resolve();
        } catch (e) { reject(e); }
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleFiles = async (files: FileList | File[]) => {
    const list = Array.from(files).filter(f => f.type.startsWith('image/') || f.type.startsWith('video/'));
    if (!list.length) return;
    setUploading(true);
    try {
      await Promise.allSettled(list.map(uploadFile));
      await refreshAssets();
    } finally { setUploading(false); }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) void handleFiles(e.target.files);
    e.target.value = '';
  };

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragOver(true); };
  const handleDragLeave = (e: React.DragEvent) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false); };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    if (e.dataTransfer.files?.length) void handleFiles(e.dataTransfer.files);
  };

  const filtered = assets.filter(a => matchesMedia(a, mediaFilter));

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Action bar */}
      <div className="flex shrink-0 items-center gap-3 border-b border-zinc-100 bg-white px-6 py-3">
        <input ref={fileInputRef} type="file" accept="image/*,video/*" className="hidden" onChange={handleFileSelect} />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-1.5 rounded-xl bg-zinc-950 px-3 py-2 text-xs font-semibold text-white transition hover:bg-zinc-800"
        >
          <Upload className="h-3.5 w-3.5" /> Upload
        </button>
        <button
          type="button"
          onClick={() => setUrlImportOpen(v => !v)}
          className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium transition ${urlImportOpen ? 'border-zinc-950 bg-zinc-950 text-white' : 'border-zinc-200 text-zinc-700 hover:border-zinc-400'}`}
        >
          <Link className="h-3.5 w-3.5" /> Import URL
        </button>
        <a href="https://app.photoroom.com/" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs font-medium text-zinc-500 transition hover:text-zinc-900">
          Open PhotoRoom <ExternalLink className="h-3 w-3" />
        </a>
        <div className="flex-1" />
        {uploading && <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />}
        {!loading && !uploading && (
          <span className="text-[11px] text-zinc-400">{assets.length} asset{assets.length !== 1 ? 's' : ''}</span>
        )}
      </div>

      {urlImportOpen && (
        <div className="flex shrink-0 items-center gap-2 border-b border-zinc-100 bg-zinc-50 px-6 py-2.5">
          <input
            type="url"
            value={importUrl}
            onChange={e => setImportUrl(e.target.value)}
            placeholder="Paste an image URL…"
            className="flex-1 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-950/20"
          />
          <button type="button" disabled={!importUrl.trim()} className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:border-zinc-400 disabled:opacity-40">
            Import
          </button>
          <button type="button" onClick={() => { setUrlImportOpen(false); setImportUrl(''); }} className="rounded-lg p-1.5 text-zinc-400 hover:text-zinc-700">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Filter chips */}
      <div className="flex shrink-0 items-center gap-1 px-6 py-3">
        {MEDIA_FILTERS.map(f => (
          <button
            key={f.id}
            type="button"
            onClick={() => setMediaFilter(f.id)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition ${mediaFilter === f.id ? 'border-zinc-950 bg-zinc-950 text-white' : 'border-zinc-200 bg-white text-zinc-500 hover:border-zinc-400 hover:text-zinc-800'}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Grid — drop zone */}
      <div
        className="relative flex-1 overflow-y-auto px-6 pb-6"
        onDragOver={handleDragOver}
        onDragEnter={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {dragOver && (
          <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-zinc-950 bg-zinc-50/90 backdrop-blur-sm">
            <Upload className="h-8 w-8 text-zinc-950" />
            <p className="text-sm font-semibold text-zinc-950">Drop to add to library</p>
          </div>
        )}
        {loading && (
          <div className="flex h-40 items-center justify-center gap-3 text-sm text-zinc-400">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading media…
          </div>
        )}
        {!loading && filtered.length === 0 && (
          <div className="flex h-64 flex-col items-center justify-center gap-4 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-dashed border-zinc-200 bg-zinc-50">
              <Image className="h-7 w-7 text-zinc-300" />
            </div>
            <div>
              <p className="text-sm font-semibold text-zinc-900">
                {assets.length === 0 ? 'No media yet' : 'No items match this filter'}
              </p>
              {assets.length === 0 && (
                <p className="mt-1 text-xs text-zinc-500">Drop files here, or upload and import by URL.</p>
              )}
            </div>
            {assets.length === 0 && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 rounded-xl bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800"
              >
                <Upload className="h-4 w-4" /> Upload media
              </button>
            )}
          </div>
        )}
        {!loading && filtered.length > 0 && (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {filtered.map(asset => (
              <MediaCard key={asset.id} asset={asset} previewUrl={previewUrls[asset.id]} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function CreativeStudioPage() {
  const {
    activeEntity,
    setActiveTab,
    setStudioReturnTarget,
    setSelectedSourceProductIds,
    newStudioSession,
    setRepurposeSourceArtifactId,
  } = useApp();

  const [tab, setTab] = useState<StudioTab>('creative');

  // Library data — fetched in full before grouping
  const [items, setItems] = useState<StudioLibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Workflow summary counts
  const [readyToScheduleCount, setReadyToScheduleCount] = useState<number | null>(null);
  const [scheduledCount, setScheduledCount] = useState<number | null>(null);

  // Filter state
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilterKey>('all');
  const [channelFilter, setChannelFilter] = useState('all');
  const [campaignFilter, setCampaignFilter] = useState('all');
  const [sort, setSort] = useState<SortOption>('newest');

  // Pagination — applied to Creative Sets, not individual artifacts
  const [visibleSetCount, setVisibleSetCount] = useState(SET_PAGE_SIZE);

  // Expanded set
  const [expandedSetId, setExpandedSetId] = useState<string | null>(null);
  const [detailChannelFilter, setDetailChannelFilter] = useState('all');

  // Fetch library (full response, grouped after receipt)
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

  // Fetch workflow summary counts from separate endpoints
  useEffect(() => {
    if (!activeEntity) return;
    api.getReadyToSchedule(activeEntity.id)
      .then(r => setReadyToScheduleCount(r.length))
      .catch(() => setReadyToScheduleCount(0));
    api.getWorkspaceSchedule(activeEntity.id)
      .then(r => setScheduledCount(r.filter(s => ['SCHEDULED', 'READY', 'PUBLISHING'].includes(s.status)).length))
      .catch(() => setScheduledCount(0));
  }, [activeEntity]);

  // Build Creative Sets — grouping over the full fetched dataset
  const allSets = useMemo(() => buildCreativeSets(items), [items]);

  // "Needs review" count derived from library data (no extra call needed)
  const needsReviewCount = useMemo(
    () => items.filter(i => ['READY_FOR_REVIEW', 'CHANGES_REQUESTED', 'READY_FOR_APPROVAL'].includes(i.status)).length,
    [items],
  );

  // Unique channels across all sets (for top-level channel filter)
  const allChannels = useMemo(() => {
    const seen = new Set<string>();
    allSets.forEach(s => s.channels.forEach(c => seen.add(c)));
    return Array.from(seen).sort();
  }, [allSets]);

  // Unique campaigns (for campaign filter)
  const allCampaigns = useMemo(
    () => allSets.map(s => ({ id: s.campaignId, name: s.campaignName })),
    [allSets],
  );

  // Apply filters + sort to Creative Sets
  const filteredSets = useMemo(
    () => applySetFilters(allSets, { search, status: statusFilter, channel: channelFilter, campaign: campaignFilter, sort }),
    [allSets, search, statusFilter, channelFilter, campaignFilter, sort],
  );

  // Paginate sets (not artifacts)
  const displayedSets = filteredSets.slice(0, visibleSetCount);
  const hasMoreSets = filteredSets.length > visibleSetCount;

  // Expanded set detail
  const expandedSet = expandedSetId ? (allSets.find(s => s.campaignId === expandedSetId) ?? null) : null;

  // Preserved: opens individual artifact in Operator Studio
  const openItem = useCallback((item: StudioLibraryItem) => {
    setStudioReturnTarget(item);
    setSelectedSourceProductIds(item.products.map(p => p.id));
    setActiveTab('operator-studio');
  }, [setStudioReturnTarget, setSelectedSourceProductIds, setActiveTab]);

  const handleOpenSet = useCallback((setId: string) => {
    if (expandedSetId === setId) {
      setExpandedSetId(null);
    } else {
      setExpandedSetId(setId);
      setDetailChannelFilter('all');
    }
  }, [expandedSetId]);

  const resetPagination = () => setVisibleSetCount(SET_PAGE_SIZE);

  // Filter options
  const statusOptions: { id: StatusFilterKey; label: string }[] = [
    { id: 'all', label: 'All statuses' },
    { id: 'needs-review', label: 'Needs review' },
    { id: 'ready', label: 'Ready to approve' },
    { id: 'approved', label: 'Approved' },
  ];

  const channelOptions = [
    { id: 'all', label: 'All channels' },
    ...allChannels.map(ch => ({ id: ch, label: CHANNEL_LABELS[ch] ?? ch })),
  ];

  const campaignOptions = [
    { id: 'all', label: 'All campaigns' },
    ...allCampaigns.map(c => ({ id: c.id, label: c.name })),
  ];

  const sortOptions: { id: SortOption; label: string }[] = [
    { id: 'newest', label: 'Newest' },
    { id: 'oldest', label: 'Oldest' },
    { id: 'attention', label: 'Needs attention' },
    { id: 'most-pieces', label: 'Most pieces' },
  ];

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* ── Page header ─────────────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center gap-6 border-b border-zinc-100 bg-white px-6 py-3">
        <div className="flex items-center gap-3">
          <Layers className="h-5 w-5 text-zinc-400" />
          <div>
            <h1 className="text-base font-semibold tracking-tight text-zinc-950">Creative Studio</h1>
            <p className="text-[11px] leading-none text-zinc-400">Create, review and approve your content.</p>
          </div>
        </div>

        {/* Tab switcher */}
        <div className="flex items-center gap-0.5 rounded-xl border border-zinc-200 bg-zinc-50 p-1">
          <button
            type="button"
            onClick={() => setTab('creative')}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${tab === 'creative' ? 'bg-white text-zinc-950 shadow-sm' : 'text-zinc-500 hover:text-zinc-800'}`}
          >
            Creative Sets
            {!loading && allSets.length > 0 && (
              <span className="ml-1.5 rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] font-bold text-zinc-500">{allSets.length}</span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setTab('media')}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${tab === 'media' ? 'bg-white text-zinc-950 shadow-sm' : 'text-zinc-500 hover:text-zinc-800'}`}
          >
            Media Library
          </button>
        </div>
      </div>

      {/* ── Creative Sets tab ──────────────────────────────────────────────── */}
      {tab === 'creative' && (
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Workflow summary */}
          <div className="flex shrink-0 items-center gap-2 border-b border-zinc-100 bg-white px-6 py-2.5">
            <button
              type="button"
              onClick={() => { setStatusFilter('needs-review'); resetPagination(); setExpandedSetId(null); }}
              className="flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:border-zinc-400 hover:bg-zinc-50"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
              Needs review
              <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-zinc-600">
                {needsReviewCount}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('calendar')}
              className="flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:border-zinc-400 hover:bg-zinc-50"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Ready to schedule
              <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-zinc-600">
                {readyToScheduleCount === null ? '–' : readyToScheduleCount}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('calendar')}
              className="flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:border-zinc-400 hover:bg-zinc-50"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
              Scheduled
              <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-zinc-600">
                {scheduledCount === null ? '–' : scheduledCount}
              </span>
            </button>
          </div>

          {/* Filter bar */}
          <div className="flex shrink-0 items-center gap-2 border-b border-zinc-100 bg-white px-6 py-3">
            {/* Search */}
            <div className="relative flex-1 max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
              <input
                type="text"
                value={search}
                onChange={e => { setSearch(e.target.value); resetPagination(); }}
                placeholder="Search creative sets…"
                className="w-full rounded-lg border border-zinc-200 bg-white py-1.5 pl-8 pr-3 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => { setSearch(''); resetPagination(); }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-zinc-400 hover:text-zinc-700"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            <FilterDropdown
              label="Status ▾"
              options={statusOptions}
              value={statusFilter}
              onChange={v => { setStatusFilter(v as StatusFilterKey); resetPagination(); }}
            />
            <FilterDropdown
              label="Channel ▾"
              options={channelOptions}
              value={channelFilter}
              onChange={v => { setChannelFilter(v); resetPagination(); }}
            />
            <FilterDropdown
              label="Campaign ▾"
              options={campaignOptions}
              value={campaignFilter}
              onChange={v => { setCampaignFilter(v); resetPagination(); }}
            />
            <FilterDropdown
              label={`Sort: ${sortOptions.find(o => o.id === sort)?.label ?? 'Newest'}`}
              options={sortOptions}
              value={sort}
              onChange={v => { setSort(v as SortOption); resetPagination(); }}
            />
          </div>

          {/* Grid + detail */}
          <div className="flex flex-1 flex-col overflow-hidden">
            {/* Set grid — scrollable */}
            <div
              className="overflow-y-auto px-6 py-6"
              style={expandedSet ? { flex: '0 0 auto', maxHeight: '48%' } : { flex: '1 1 auto' }}
            >
              {loading && <SkeletonGrid />}

              {!loading && error && (
                <div className="flex h-40 flex-col items-center justify-center gap-2 text-center">
                  <p className="text-sm font-semibold text-zinc-900">Couldn't load creative work</p>
                  <p className="text-xs text-zinc-400">{error}</p>
                </div>
              )}

              {!loading && !error && items.length === 0 && (
                <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-100">
                    <Layers className="h-7 w-7 text-zinc-400" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-zinc-900">No creative work yet</p>
                    <p className="mt-1 text-xs text-zinc-500">Use + Create to make your first piece of content.</p>
                  </div>
                </div>
              )}

              {!loading && !error && items.length > 0 && filteredSets.length === 0 && (
                <div className="flex h-40 flex-col items-center justify-center gap-2 text-center">
                  <p className="text-sm font-semibold text-zinc-900">No sets match these filters</p>
                  <button
                    type="button"
                    onClick={() => {
                      setSearch(''); setStatusFilter('all');
                      setChannelFilter('all'); setCampaignFilter('all');
                      resetPagination();
                    }}
                    className="text-xs text-zinc-500 underline underline-offset-2 hover:text-zinc-900"
                  >
                    Clear all filters
                  </button>
                </div>
              )}

              {!loading && !error && filteredSets.length > 0 && (
                <>
                  <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {displayedSets.map(set => (
                      <CreativeSetCard
                        key={set.campaignId}
                        set={set}
                        isExpanded={expandedSetId === set.campaignId}
                        onOpen={() => handleOpenSet(set.campaignId)}
                      />
                    ))}
                  </div>
                  {hasMoreSets && (
                    <div className="mt-6 flex justify-center">
                      <button
                        type="button"
                        onClick={() => setVisibleSetCount(c => c + SET_PAGE_SIZE)}
                        className="rounded-xl border border-zinc-200 bg-white px-5 py-2 text-xs font-medium text-zinc-600 transition hover:border-zinc-400 hover:text-zinc-900"
                      >
                        Load more ({filteredSets.length - visibleSetCount} more sets)
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Detail panel — inline, below grid, only when a set is expanded */}
            {expandedSet && (
              <CreativeSetDetail
                set={expandedSet}
                channelFilter={detailChannelFilter}
                onChannelFilterChange={setDetailChannelFilter}
                onClose={() => setExpandedSetId(null)}
                onOpenItem={openItem}
                onRepurpose={artifactId => {
                  setRepurposeSourceArtifactId(artifactId);
                  setActiveTab('repurpose');
                }}
              />
            )}
          </div>
        </div>
      )}

      {/* ── Media Library tab ──────────────────────────────────────────────── */}
      {tab === 'media' && activeEntity && (
        <MediaLibraryPanel workspaceId={activeEntity.id} />
      )}
    </div>
  );
}

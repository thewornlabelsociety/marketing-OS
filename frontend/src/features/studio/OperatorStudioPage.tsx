import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  GripVertical,
  ImageOff,
  Loader2,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useApp } from '../../app/AppContext';
import { ScheduleItemDrawer } from '../../components/drawers/ScheduleItemDrawer';
import { api } from '../../services/api';
import type { SourceProduct } from '../../types';

// ─── Types ───────────────────────────────────────────────────────────────────

type StudioFormat = 'POST' | 'CAROUSEL' | 'STORY' | 'EMAIL';
type CreativeDirection = 'EDITORIAL' | 'PRODUCT_LED' | 'MINIMAL';

interface WholeSetResult {
  campaignId: string;
  campaignName: string;
  formats: Array<{ format: StudioFormat; contentKey: string; artifact: Artifact }>;
  products: StudioProduct[];
  aiGenerated: boolean;
  creativeDirection: CreativeDirection | null;
}

interface StudioProduct {
  id: string;
  title: string;
  brand: string | null;
  price: number | null;
  currency: string | null;
  imageUrls: string[];
  availability: string;
  marketingBucket: 'NEW' | 'CURRENT' | 'SALE' | null;
  size: string | null;
  category: string | null;
  publicUrl: string | null;
}

interface CarouselContent {
  kind: 'CAROUSEL';
  caption: string;
  slides: { slideNumber: number; headline: string; body: string }[];
  cta: string;
}
interface PostContent {
  kind: 'STATIC_POST';
  caption: string;
  hook: string;
  cta: string;
}
interface StoryContent {
  kind: 'STORY';
  frames: { frameNumber: number; headline: string; body?: string; cta?: string }[];
}
interface EmailContent {
  kind: 'EMAIL';
  subject: string;
  preheader: string;
  headline: string;
  body: string;
  cta: { label: string; destinationDescription: string };
}
interface TalkingPointsContent {
  kind: 'TALKING_POINTS';
  hook: string;
  talkingPoints: string[];
  angle: string | null;
  cta: string | null;
  suggestedDurationSeconds: number | null;
}
type ArtifactContent = CarouselContent | PostContent | StoryContent | EmailContent | TalkingPointsContent;

interface Artifact {
  id: string;
  workspaceId: string;
  campaignId: string;
  contentKey: string;
  deliverableId: string;
  version: number;
  channel: string;
  contentType: string;
  format: string;
  status: string;
  content: ArtifactContent;
  sourceContentPlanId?: string;
  sourceContentPlanVersion?: number;
}

interface Session {
  campaignId: string;
  campaignName: string;
  contentKey: string;
  artifact: Artifact;
  products: StudioProduct[];
  aiGenerated: boolean;
  creativeDirection: CreativeDirection | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const FORMAT_LABELS: Record<StudioFormat, string> = {
  POST: 'Instagram Post',
  CAROUSEL: 'Carousel',
  STORY: 'Stories',
  EMAIL: 'Email',
};

const DIRECTION_LABELS: Record<CreativeDirection, string> = {
  EDITORIAL: 'Editorial',
  PRODUCT_LED: 'Product-led',
  MINIMAL: 'Minimal',
};

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  READY_FOR_REVIEW:  { label: 'Draft',      className: 'bg-zinc-100 text-zinc-600' },
  CHANGES_REQUESTED: { label: 'Changes',    className: 'bg-amber-50 text-amber-700' },
  REVISING:          { label: 'Revising',   className: 'bg-blue-50 text-blue-700' },
  READY_FOR_APPROVAL:{ label: 'Ready',      className: 'bg-emerald-50 text-emerald-700' },
  APPROVED:          { label: 'Approved',   className: 'bg-emerald-100 text-emerald-800' },
  GENERATING:        { label: 'Generating', className: 'bg-zinc-100 text-zinc-500' },
};

function statusLabel(status: string): string {
  return STATUS_CONFIG[status]?.label ?? status;
}

function formatPrice(price: number | null, currency: string | null) {
  if (price == null) return '';
  return new Intl.NumberFormat('en-NZ', {
    style: 'currency',
    currency: currency ?? 'NZD',
    maximumFractionDigits: 0,
  }).format(price);
}

// ─── Format Picker ────────────────────────────────────────────────────────────

const FORMAT_DESCRIPTIONS: Record<StudioFormat, string> = {
  POST: 'Single image · 4:5 portrait',
  CAROUSEL: 'Swipeable slides · one per product',
  STORY: 'Vertical frames · 9:16',
  EMAIL: 'Newsletter layout · subject + body',
};

// CSS-only aspect-ratio thumbnails representing each format
function FormatThumb({ format }: { format: StudioFormat | 'WHOLE_SET' }) {
  if (format === 'POST') {
    return (
      <div className="mb-3 flex justify-center">
        <div className="h-12 w-[38px] rounded-md bg-zinc-200 ring-1 ring-inset ring-zinc-300" />
      </div>
    );
  }
  if (format === 'CAROUSEL') {
    return (
      <div className="mb-3 flex items-end justify-center gap-0.5">
        <div className="h-12 w-[35px] rounded-md bg-zinc-200 ring-1 ring-inset ring-zinc-300" />
        <div className="h-10 w-[32px] rounded-md bg-zinc-100 ring-1 ring-inset ring-zinc-200" />
        <div className="h-8 w-[28px] rounded-md bg-zinc-100 ring-1 ring-inset ring-zinc-200" />
      </div>
    );
  }
  if (format === 'STORY') {
    return (
      <div className="mb-3 flex justify-center">
        <div className="h-14 w-[32px] rounded-md bg-zinc-200 ring-1 ring-inset ring-zinc-300" />
      </div>
    );
  }
  if (format === 'EMAIL') {
    return (
      <div className="mb-3 flex justify-center">
        <div className="h-12 w-[52px] overflow-hidden rounded-md bg-zinc-200 ring-1 ring-inset ring-zinc-300">
          <div className="mx-1 mt-1 h-2.5 rounded-sm bg-zinc-300" />
          <div className="mx-1 mt-1 space-y-0.5">
            <div className="h-1 rounded-sm bg-zinc-300/60" />
            <div className="h-1 w-3/4 rounded-sm bg-zinc-300/60" />
          </div>
        </div>
      </div>
    );
  }
  // WHOLE_SET
  return (
    <div className="mb-3 flex items-end justify-center gap-1">
      <div className="h-10 w-[22px] rounded-sm bg-zinc-200 ring-1 ring-inset ring-zinc-300" />
      <div className="h-12 w-[18px] rounded-sm bg-zinc-200 ring-1 ring-inset ring-zinc-300" />
      <div className="h-14 w-[14px] rounded-sm bg-zinc-200 ring-1 ring-inset ring-zinc-300" />
      <div className="h-10 w-[22px] rounded-sm bg-zinc-200 ring-1 ring-inset ring-zinc-300" />
    </div>
  );
}

function FormatPicker({
  products,
  onSelect,
  onWholeSet,
  direction,
  onDirectionChange,
}: {
  products: StudioProduct[];
  onSelect: (format: StudioFormat) => void;
  onWholeSet: () => void;
  direction: CreativeDirection | null;
  onDirectionChange: (d: CreativeDirection | null) => void;
}) {
  const formats: StudioFormat[] = ['POST', 'CAROUSEL', 'STORY', 'EMAIL'];
  const count = products.length;
  const directions: { id: CreativeDirection; label: string; desc: string }[] = [
    { id: 'EDITORIAL', label: 'Editorial', desc: 'Narrative, mood-led — no prices' },
    { id: 'PRODUCT_LED', label: 'Product-led', desc: 'Details first — name, price, size' },
    { id: 'MINIMAL', label: 'Minimal', desc: 'Short and restrained — less is more' },
  ];

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <p className="mos-eyebrow mb-1">Studio</p>
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-950">
        {count === 1 ? (products[0]?.title || 'Product selected') : `${count} products selected`}
      </h1>
      <p className="mt-1 text-sm text-zinc-500">
        {count} {count === 1 ? 'product' : 'products'} · Choose a format to continue
      </p>

      {/* Product strip */}
      <div className="mt-5 flex gap-2 overflow-x-auto pb-1">
        {products.map((p) => (
          <div key={p.id} className="relative flex-shrink-0">
            <div className="h-14 w-14 overflow-hidden rounded-xl bg-zinc-100">
              {p.imageUrls[0] ? (
                <img src={p.imageUrls[0]} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full items-center justify-center">
                  <ImageOff className="h-5 w-5 text-zinc-400" />
                </span>
              )}
            </div>
            {p.marketingBucket === 'NEW' && (
              <span className="absolute -right-1 -top-1 rounded-full bg-emerald-500 px-1.5 py-0.5 text-[9px] font-bold text-white">
                NEW
              </span>
            )}
            {p.marketingBucket === 'SALE' && (
              <span className="absolute -right-1 -top-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-800">
                SALE
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Creative direction */}
      <div className="mt-8">
        <p className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-zinc-400">Creative direction</p>
        <div className="grid grid-cols-3 gap-2">
          {directions.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => onDirectionChange(direction === d.id ? null : d.id)}
              className={`rounded-xl border p-3 text-left transition ${
                direction === d.id
                  ? 'border-zinc-950 bg-zinc-950 text-white shadow-sm'
                  : 'border-zinc-200 bg-white hover:border-zinc-400'
              }`}
            >
              <p className="text-xs font-semibold">{d.label}</p>
              <p className={`mt-0.5 text-[10px] leading-relaxed ${direction === d.id ? 'text-zinc-300' : 'text-zinc-500'}`}>
                {d.desc}
              </p>
            </button>
          ))}
        </div>
        {!direction && (
          <p className="mt-1.5 text-[10px] text-zinc-400">No direction selected — AI will choose based on your brand voice.</p>
        )}
      </div>

      {/* Format cards */}
      <div className="mt-8 grid grid-cols-2 gap-3">
        {formats.map((fmt) => (
          <button
            key={fmt}
            onClick={() => onSelect(fmt)}
            className="group rounded-2xl border border-zinc-200 bg-white p-4 text-left transition hover:border-zinc-950 hover:shadow-sm focus-visible:outline-2 focus-visible:outline-zinc-950"
          >
            <FormatThumb format={fmt} />
            <p className="text-sm font-semibold text-zinc-950">{FORMAT_LABELS[fmt]}</p>
            <p className="mt-0.5 text-[11px] text-zinc-500">{FORMAT_DESCRIPTIONS[fmt]}</p>
          </button>
        ))}
        <button
          onClick={onWholeSet}
          className="col-span-2 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-center transition hover:border-zinc-950 hover:bg-white hover:shadow-sm"
        >
          <FormatThumb format="WHOLE_SET" />
          <p className="text-sm font-semibold text-zinc-950">Make whole set</p>
          <p className="mt-0.5 text-[11px] text-zinc-500">Post · Carousel · Story · Email — all at once</p>
        </button>
      </div>
    </div>
  );
}

// ─── Source Product Picker ────────────────────────────────────────────────────

function SourceProductPicker({
  onContinue,
}: {
  onContinue: (ids: string[], products: SourceProduct[]) => void;
}) {
  const { activeEntity } = useApp();
  const [products, setProducts] = useState<SourceProduct[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeEntity) return;
    api.establishLocalOperatorSession()
      .then(() => api.getSourceProducts(activeEntity.id, 'new'))
      .then(setProducts)
      .catch(() => setProducts([]))
      .finally(() => setLoading(false));
  }, [activeEntity]);

  const toggle = (id: string) => {
    setSelected(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : prev.length < 6 ? [...prev, id] : prev
    );
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center gap-3 text-sm text-zinc-400">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading products…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <p className="mos-eyebrow mb-1">Studio</p>
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-950">Select products</h1>
      <p className="mt-1 text-sm text-zinc-500">Choose up to 6 products to create content for.</p>

      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {products.map(p => {
          const isSelected = selected.includes(p.id);
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => toggle(p.id)}
              className={`group relative overflow-hidden rounded-2xl border text-left transition ${
                isSelected ? 'border-zinc-950 shadow-md' : 'border-zinc-200 hover:border-zinc-400'
              }`}
            >
              <div className="aspect-[4/5] w-full bg-zinc-100">
                {p.imageUrls[0] ? (
                  <img src={p.imageUrls[0]} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <ImageOff className="h-6 w-6 text-zinc-300" />
                  </div>
                )}
              </div>
              <div className="p-2.5">
                <p className="truncate text-[11px] font-semibold text-zinc-900">{p.title}</p>
                {p.attributes?.brand && (
                  <p className="truncate text-[10px] text-zinc-400">{p.attributes.brand}</p>
                )}
              </div>
              {isSelected && (
                <div className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-zinc-950 text-white shadow">
                  <Check className="h-3.5 w-3.5" />
                </div>
              )}
              {p.marketingBucket === 'NEW' && !isSelected && (
                <span className="absolute left-2 top-2 rounded-full bg-emerald-500 px-1.5 py-0.5 text-[9px] font-bold text-white">
                  NEW
                </span>
              )}
            </button>
          );
        })}
      </div>

      {products.length === 0 && (
        <p className="mt-8 text-sm text-zinc-400">No new products found. Try syncing your integration.</p>
      )}

      <div className="sticky bottom-0 mt-8 border-t border-zinc-100 bg-white pt-4">
        <button
          type="button"
          disabled={selected.length === 0}
          onClick={() => onContinue(selected, products.filter(p => selected.includes(p.id)))}
          className="w-full rounded-2xl bg-zinc-950 py-3 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-40"
        >
          Continue with {selected.length} {selected.length === 1 ? 'product' : 'products'}
        </button>
      </div>
    </div>
  );
}

// ─── Whole Set Overview ───────────────────────────────────────────────────────

type ApproveAllState = 'idle' | 'approving' | 'done' | 'partial';

function WholeSetOverview({
  result,
  onOpenFormat,
  onBack,
}: {
  result: WholeSetResult;
  onOpenFormat: (fmt: StudioFormat) => void;
  onBack: () => void;
}) {
  const { activeEntity, setRepurposeSourceArtifactId, setActiveTab } = useApp();
  const [approveState, setApproveState] = useState<ApproveAllState>('idle');
  const [versionsMenuOpen, setVersionsMenuOpen] = useState(false);
  const versionsMenuRef = useRef<HTMLDivElement>(null);
  const [localStatuses, setLocalStatuses] = useState<Record<string, string>>(() =>
    Object.fromEntries(result.formats.map(f => [f.format, f.artifact.status]))
  );
  const [partialErrors, setPartialErrors] = useState<string[]>([]);

  const allApproved = result.formats.every(f => localStatuses[f.format] === 'APPROVED');

  const handleApproveAll = async () => {
    if (!activeEntity || approveState === 'approving') return;
    setApproveState('approving');
    setPartialErrors([]);
    try {
      await api.establishLocalOperatorSession();
      const artifacts = result.formats.map(f => ({ artifactId: f.artifact.id, contentKey: f.artifact.contentKey }));
      const { results } = await api.approveWholeSet(activeEntity.id, result.campaignId, artifacts);
      const errors: string[] = [];
      const updated = { ...localStatuses };
      for (const r of results) {
        if (r.success) {
          const fmt = result.formats.find(f => f.artifact.id === r.artifactId);
          if (fmt) updated[fmt.format] = 'APPROVED';
        } else {
          errors.push(`${r.contentKey}: ${r.error ?? 'Unknown error'}`);
        }
      }
      setLocalStatuses(updated);
      setPartialErrors(errors);
      setApproveState(errors.length > 0 ? 'partial' : 'done');
    } catch (err) {
      setPartialErrors([(err as Error).message]);
      setApproveState('partial');
    }
  };

  // Format-specific content extraction for mini-preview
  const getFormatPreviewText = (fmt: StudioFormat, artifact: Artifact): string => {
    const c = artifact.content;
    if (fmt === 'POST' && c.kind === 'STATIC_POST') return c.hook ?? c.caption.slice(0, 60);
    if (fmt === 'CAROUSEL' && c.kind === 'CAROUSEL') return `${c.slides.length} slides`;
    if (fmt === 'STORY' && c.kind === 'STORY') return `${c.frames.length} frames`;
    if (fmt === 'EMAIL' && c.kind === 'EMAIL') return c.subject;
    return '';
  };

  const FORMAT_VISUAL: Record<StudioFormat, { aspect: string; badge: string; bgHint: string }> = {
    POST:     { aspect: 'aspect-[4/5]',  badge: '4:5',  bgHint: '' },
    CAROUSEL: { aspect: 'aspect-[4/5]',  badge: '4:5',  bgHint: '' },
    STORY:    { aspect: 'aspect-[9/16]', badge: '9:16', bgHint: '' },
    EMAIL:    { aspect: 'aspect-[4/5]',  badge: 'Email', bgHint: 'bg-white' },
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between border-b border-zinc-100 bg-white px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </button>
          <span className="text-xs font-semibold text-zinc-950">{result.campaignName}</span>
          <span className="rounded-full border border-zinc-200 px-2 py-0.5 text-[10px] font-semibold text-zinc-500">
            Whole Set
          </span>
          {result.creativeDirection && (
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-600">
              {DIRECTION_LABELS[result.creativeDirection]}
            </span>
          )}
        </div>
        {/* Right-side actions */}
        <div className="flex items-center gap-2">
          {/* Create versions dropdown */}
          <div className="relative" ref={versionsMenuRef}>
            <button
              type="button"
              onClick={() => setVersionsMenuOpen(v => !v)}
              className="flex items-center gap-1.5 rounded-xl border border-zinc-200 px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
            >
              <Copy className="h-3.5 w-3.5" />
              Create versions
              <ChevronDown className="h-3 w-3 text-zinc-400" />
            </button>
            {versionsMenuOpen && (
              <div className="absolute right-0 top-full z-20 mt-1 w-44 rounded-xl border border-zinc-200 bg-white py-1 shadow-lg">
                {result.formats.map(({ format: fmt, artifact: a }) => (
                  <button
                    key={fmt}
                    type="button"
                    onClick={() => {
                      setVersionsMenuOpen(false);
                      setRepurposeSourceArtifactId(a.id);
                      setActiveTab('repurpose');
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-xs text-zinc-700 hover:bg-zinc-50"
                  >
                    <Copy className="h-3 w-3 text-zinc-400" />
                    {FORMAT_LABELS[fmt]}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Approve all */}
          {!allApproved && approveState !== 'done' ? (
            <button
              onClick={() => void handleApproveAll()}
              disabled={approveState === 'approving'}
              className="flex items-center gap-1.5 rounded-xl bg-zinc-950 px-4 py-2 text-xs font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-50"
            >
              {approveState === 'approving' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" />
              )}
              Looks good to all
            </button>
          ) : (
            <div className="flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
              <CheckCircle2 className="h-3.5 w-3.5" /> All approved
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-8">
        {!result.aiGenerated && (
          <div className="mb-5 flex items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-xs text-zinc-600">
            <Sparkles className="h-4 w-4 shrink-0 text-zinc-400" />
            Starter copy generated — edit each format to personalise. AI rewriting will be available once the connection is restored.
          </div>
        )}

        {partialErrors.length > 0 && (
          <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
            <p className="font-semibold">Some approvals were not completed:</p>
            {partialErrors.map((e, i) => <p key={i} className="mt-0.5">{e}</p>)}
          </div>
        )}

        <p className="mos-eyebrow mb-1">Content set ready</p>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-950">{result.campaignName}</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {result.products.length} {result.products.length === 1 ? 'product' : 'products'} · 4 formats generated
        </p>

        <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {result.formats.map(({ format: fmt, artifact }) => {
            const vis = FORMAT_VISUAL[fmt];
            const status = localStatuses[fmt] ?? artifact.status;
            const statusCfg = STATUS_CONFIG[status] ?? { label: statusLabel(status), className: 'bg-zinc-100 text-zinc-600' };
            const hero = result.products[0];
            const heroImage = hero?.imageUrls[0] ?? null;
            const previewText = getFormatPreviewText(fmt, artifact);
            const isEmail = fmt === 'EMAIL';

            return (
              <button
                key={fmt}
                type="button"
                onClick={() => onOpenFormat(fmt)}
                className="group flex flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white text-left shadow-sm transition hover:border-zinc-950 hover:shadow-md"
              >
                {/* Mini preview */}
                <div className={`relative w-full overflow-hidden ${vis.bgHint || 'bg-zinc-100'} ${vis.aspect}`}>
                  {isEmail ? (
                    // Email: show subject line preview
                    <div className="flex h-full flex-col bg-white p-3">
                      <div className="mb-1.5 h-2 w-3/4 rounded-sm bg-zinc-200" />
                      <div className="mb-1 h-1.5 rounded-sm bg-zinc-100" />
                      <div className="h-1.5 w-2/3 rounded-sm bg-zinc-100" />
                      {artifact.content.kind === 'EMAIL' && (
                        <p className="mt-auto truncate text-[9px] font-medium text-zinc-600">
                          {artifact.content.subject}
                        </p>
                      )}
                    </div>
                  ) : heroImage ? (
                    <img src={heroImage} alt="" className="h-full w-full object-cover transition group-hover:scale-[1.02]" />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <ImageOff className="h-8 w-8 text-zinc-300" />
                    </div>
                  )}

                  {!isEmail && <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />}

                  {/* Format badge */}
                  <span className="absolute left-2 top-2 rounded-lg bg-black/60 px-1.5 py-0.5 text-[9px] font-bold text-white backdrop-blur-sm">
                    {FORMAT_LABELS[fmt]}
                  </span>
                  {/* Ratio badge for story */}
                  {fmt === 'STORY' && (
                    <span className="absolute right-2 top-2 rounded bg-zinc-800/60 px-1 py-0.5 text-[8px] font-semibold text-white">
                      9:16
                    </span>
                  )}
                  {/* Status */}
                  <span className={`absolute bottom-2 right-2 rounded-full px-2 py-0.5 text-[9px] font-bold ${statusCfg.className}`}>
                    {statusCfg.label}
                  </span>
                  {/* Preview text overlay (non-email) */}
                  {!isEmail && previewText && (
                    <p className="absolute bottom-7 left-2 right-2 truncate text-[9px] font-medium text-white drop-shadow">
                      {previewText}
                    </p>
                  )}
                </div>
                <div className="p-3">
                  <p className="text-[11px] font-semibold text-zinc-700 group-hover:text-zinc-950">
                    Open to edit →
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Preview Frames ───────────────────────────────────────────────────────────

function CarouselPreview({
  content,
  products,
  activeSlide,
}: {
  content: CarouselContent;
  products: StudioProduct[];
  activeSlide: number;
}) {
  const slide = content.slides[activeSlide];
  const product = products[activeSlide] ?? products[0];
  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-hidden rounded-2xl bg-zinc-100">
        {product?.imageUrls[0] ? (
          <img src={product.imageUrls[0]} alt="" className="aspect-[4/5] w-full object-cover" />
        ) : (
          <div className="flex aspect-[4/5] w-full items-center justify-center">
            <ImageOff className="h-10 w-10 text-zinc-300" />
          </div>
        )}
      </div>
      {slide && (
        <div className="rounded-xl bg-zinc-50 p-3">
          <p className="text-xs font-bold text-zinc-800">{slide.headline}</p>
          <p className="mt-0.5 text-xs text-zinc-600">{slide.body}</p>
        </div>
      )}
      {/* Slide dots */}
      <div className="flex justify-center gap-1.5">
        {content.slides.map((_, i) => (
          <span
            key={i}
            className={`h-1.5 rounded-full transition-all ${
              i === activeSlide ? 'w-5 bg-zinc-950' : 'w-1.5 bg-zinc-300'
            }`}
          />
        ))}
      </div>
    </div>
  );
}

function PostPreview({ content, products }: { content: PostContent; products: StudioProduct[] }) {
  const product = products[0];
  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-hidden rounded-2xl bg-zinc-100">
        {product?.imageUrls[0] ? (
          <img src={product.imageUrls[0]} alt="" className="aspect-[4/5] w-full object-cover" />
        ) : (
          <div className="flex aspect-[4/5] w-full items-center justify-center">
            <ImageOff className="h-10 w-10 text-zinc-300" />
          </div>
        )}
      </div>
      <div className="rounded-xl bg-zinc-50 p-3">
        <p className="text-xs font-bold text-zinc-800">{content.hook}</p>
        <p className="mt-1 text-xs leading-relaxed text-zinc-600 line-clamp-4">{content.caption}</p>
      </div>
    </div>
  );
}

function StoryPreview({ content, products }: { content: StoryContent; products: StudioProduct[] }) {
  const [activeFrame, setActiveFrame] = useState(0);
  const frame = content.frames[activeFrame];
  const product = products[activeFrame] ?? products[0];
  return (
    <div className="flex flex-col gap-2">
      <div className="relative overflow-hidden rounded-2xl bg-zinc-900">
        {product?.imageUrls[0] ? (
          <img src={product.imageUrls[0]} alt="" className="aspect-[9/16] w-full object-cover opacity-75" />
        ) : (
          <div className="aspect-[9/16] w-full" />
        )}
        {/* Gradient for readability */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
        {frame && (
          <div className="absolute inset-x-4 bottom-8 text-white">
            <p className="text-lg font-bold leading-tight drop-shadow-md">{frame.headline}</p>
            {frame.body && <p className="mt-1.5 text-sm leading-snug text-white/80 drop-shadow">{frame.body}</p>}
            {frame.cta && (
              <p className="mt-3 inline-block rounded-full bg-white px-4 py-1.5 text-xs font-semibold text-zinc-950">
                {frame.cta}
              </p>
            )}
          </div>
        )}
        {/* Progress bars */}
        <div className="absolute inset-x-3 top-3 flex gap-1">
          {content.frames.map((_, i) => (
            <button
              key={i}
              onClick={() => setActiveFrame(i)}
              className={`h-0.5 flex-1 rounded-full transition-all ${i <= activeFrame ? 'bg-white' : 'bg-white/30'}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function EmailPreview({ content, products }: { content: EmailContent; products: StudioProduct[] }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white text-sm shadow-sm">
      {/* Email client header */}
      <div className="border-b border-zinc-100 bg-zinc-50 px-4 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Email preview</p>
        <p className="mt-1 text-xs font-semibold text-zinc-900">{content.subject}</p>
        <p className="mt-0.5 text-[10px] text-zinc-400">{content.preheader}</p>
      </div>
      {/* Brand header band */}
      <div className="bg-zinc-950 px-6 py-5 text-white">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-zinc-400">Newsletter</p>
        <h2 className="mt-2 text-lg font-semibold leading-tight">{content.headline}</h2>
      </div>
      {/* Hero product image */}
      {products[0]?.imageUrls[0] && (
        <div className="aspect-[3/1] w-full overflow-hidden bg-zinc-100">
          <img src={products[0].imageUrls[0]} alt="" className="h-full w-full object-cover" />
        </div>
      )}
      {/* Body */}
      <div className="px-6 py-5">
        <div className="space-y-3 text-sm leading-relaxed text-zinc-700">
          {content.body.split('\n').filter(Boolean).map((para, i) => (
            <p key={i}>{para}</p>
          ))}
        </div>
        {/* Product names */}
        {products.length > 1 && (
          <div className="mt-4 space-y-1">
            {products.slice(0, 3).map((p, i) => (
              <div key={i} className="flex items-center gap-2.5 rounded-lg border border-zinc-100 px-3 py-2">
                {p.imageUrls[0] && (
                  <div className="h-8 w-8 flex-shrink-0 overflow-hidden rounded-md bg-zinc-100">
                    <img src={p.imageUrls[0]} alt="" className="h-full w-full object-cover" />
                  </div>
                )}
                <p className="truncate text-xs font-medium text-zinc-800">{p.title}</p>
              </div>
            ))}
          </div>
        )}
        {/* CTA */}
        <div className="mt-6">
          <span className="inline-block rounded-full bg-zinc-950 px-5 py-2.5 text-sm font-semibold text-white">
            {content.cta.label}
          </span>
        </div>
      </div>
      {/* Footer */}
      <div className="border-t border-zinc-100 px-6 py-4">
        <p className="text-[10px] text-zinc-400">You received this email because you subscribed to updates.</p>
      </div>
    </div>
  );
}

// ─── Copy Editor Panel ─────────────────────────────────────────────────────────

type QuickAction = 'brand-voice' | 'shorter' | 'editorial' | 'playful';

function getQuickActions(workspaceName: string): { id: QuickAction; label: string }[] {
  return [
    { id: 'brand-voice', label: `More ${workspaceName}` },
    { id: 'shorter', label: 'Shorter' },
    { id: 'editorial', label: 'More editorial' },
    { id: 'playful', label: 'More playful' },
  ];
}

function getRevisionPrompts(workspaceName: string): Record<QuickAction, string> {
  return {
    'brand-voice': `Rewrite using a stronger ${workspaceName} brand voice — aligned to the brand personality and tone.`,
    'shorter': 'Shorten the copy by about 30%. Keep the most impactful lines.',
    'editorial': 'Make the copy more editorial — read like a fashion magazine, not an ad.',
    'playful': 'Make the copy more playful and human. Less formal, more personality.',
  };
}

function CopyEditor({
  content,
  format,
  session,
  onContentChange,
  onRevising,
  activeSlide,
  onSlideActivate,
}: {
  content: ArtifactContent;
  format: StudioFormat;
  session: Session;
  onContentChange: (c: ArtifactContent) => void;
  onRevising: (v: boolean) => void;
  activeSlide: number;
  onSlideActivate: (i: number) => void;
}) {
  const { activeEntity } = useApp();
  const workspaceName = activeEntity?.name ?? 'your brand';
  const [revisingAction, setRevisingAction] = useState<QuickAction | null>(null);
  const slideRefs = useRef<(HTMLDetailsElement | null)[]>([]);

  // Auto-open and scroll to active slide when changed externally (product strip click)
  useEffect(() => {
    if (format !== 'CAROUSEL') return;
    const el = slideRefs.current[activeSlide];
    if (el) {
      el.open = true;
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [activeSlide, format]);

  const requestRevision = useCallback(
    async (action: QuickAction) => {
      if (!activeEntity) return;
      setRevisingAction(action);
      onRevising(true);
      const prompts = getRevisionPrompts(workspaceName);
      try {
        await api.establishLocalOperatorSession();
        const result = await api.requestCreativeRevision(
          session.campaignId,
          session.artifact.contentKey,
          activeEntity.id,
          prompts[action],
        );
        const newContent = (result as { content?: ArtifactContent }).content;
        if (newContent) onContentChange(newContent);
      } catch {
        // silent
      } finally {
        setRevisingAction(null);
        onRevising(false);
      }
    },
    [activeEntity, session, onContentChange, onRevising, workspaceName],
  );

  const quickActions = getQuickActions(workspaceName);
  const isCarousel = format === 'CAROUSEL' && content.kind === 'CAROUSEL';
  const isPost = format === 'POST' && content.kind === 'STATIC_POST';
  const isEmail = format === 'EMAIL' && content.kind === 'EMAIL';
  const isStory = format === 'STORY' && content.kind === 'STORY';
  const isTalkingPoints = content.kind === 'TALKING_POINTS';

  return (
    <div className="space-y-5">
      {/* Quick AI actions */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">AI quick actions</p>
        <div className="flex flex-wrap gap-2">
          {quickActions.map((action) => (
            <button
              key={action.id}
              onClick={() => void requestRevision(action.id)}
              disabled={revisingAction !== null}
              className="flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition hover:border-zinc-400 hover:bg-zinc-50 disabled:opacity-40"
            >
              {revisingAction === action.id ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Sparkles className="h-3 w-3 text-zinc-400" />
              )}
              {action.label}
            </button>
          ))}
        </div>
      </div>

      {/* Copy fields */}
      {isPost && (
        <div className="space-y-3">
          <Field label="Hook (first line)">
            <textarea
              rows={2}
              value={(content as PostContent).hook}
              onChange={(e) => onContentChange({ ...(content as PostContent), hook: e.target.value })}
              className="mos-field w-full resize-none"
            />
          </Field>
          <Field label="Caption">
            <textarea
              rows={5}
              value={(content as PostContent).caption}
              onChange={(e) => onContentChange({ ...(content as PostContent), caption: e.target.value })}
              className="mos-field w-full resize-none"
            />
          </Field>
        </div>
      )}

      {isCarousel && (
        <div className="space-y-3">
          <Field label="Opening caption">
            <textarea
              rows={4}
              value={(content as CarouselContent).caption}
              onChange={(e) => onContentChange({ ...(content as CarouselContent), caption: e.target.value })}
              className="mos-field w-full resize-none"
            />
          </Field>
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Slides — drag to reorder</p>
            {(content as CarouselContent).slides.map((slide, i) => {
              const isActive = i === activeSlide;
              return (
                <details
                  key={i}
                  ref={el => { slideRefs.current[i] = el; }}
                  className={`group mb-2 rounded-xl border transition ${
                    isActive ? 'border-zinc-950 shadow-sm' : 'border-zinc-200'
                  }`}
                  onToggle={(e) => {
                    if ((e.currentTarget as HTMLDetailsElement).open) onSlideActivate(i);
                  }}
                >
                  <summary
                    className="flex cursor-pointer items-center justify-between px-4 py-3 text-xs font-semibold text-zinc-700 marker:hidden"
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData('slideIndex', String(i))}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const from = Number(e.dataTransfer.getData('slideIndex'));
                      if (from === i) return;
                      const slides = [...(content as CarouselContent).slides];
                      const [moved] = slides.splice(from, 1);
                      slides.splice(i, 0, moved);
                      const renumbered = slides.map((s, idx) => ({ ...s, slideNumber: idx + 1 }));
                      onContentChange({ ...(content as CarouselContent), slides: renumbered });
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <GripVertical className="h-3.5 w-3.5 cursor-grab text-zinc-300 active:cursor-grabbing" />
                      {isActive && (
                        <span className="h-1.5 w-1.5 rounded-full bg-zinc-950" />
                      )}
                      <span>Slide {i + 1} · {slide.headline.slice(0, 40)}</span>
                    </div>
                    <ChevronDown className="h-3.5 w-3.5 text-zinc-400 transition group-open:rotate-180" />
                  </summary>
                  <div className="space-y-2 px-4 pb-4">
                    <Field label="Headline">
                      <input
                        type="text"
                        value={slide.headline}
                        onChange={(e) => {
                          const slides = [...(content as CarouselContent).slides];
                          slides[i] = { ...slide, headline: e.target.value };
                          onContentChange({ ...(content as CarouselContent), slides });
                        }}
                        className="mos-field w-full"
                      />
                    </Field>
                    <Field label="Body">
                      <textarea
                        rows={2}
                        value={slide.body}
                        onChange={(e) => {
                          const slides = [...(content as CarouselContent).slides];
                          slides[i] = { ...slide, body: e.target.value };
                          onContentChange({ ...(content as CarouselContent), slides });
                        }}
                        className="mos-field w-full resize-none"
                      />
                    </Field>
                  </div>
                </details>
              );
            })}
          </div>
        </div>
      )}

      {isStory && (
        <div className="space-y-3">
          {(content as StoryContent).frames.map((frame, i) => (
            <details key={i} className="group rounded-xl border border-zinc-200">
              <summary className="flex cursor-pointer items-center justify-between px-4 py-3 text-xs font-semibold text-zinc-700 marker:hidden">
                <span>Frame {i + 1} · {frame.headline.slice(0, 40)}</span>
                <ChevronDown className="h-3.5 w-3.5 text-zinc-400 transition group-open:rotate-180" />
              </summary>
              <div className="space-y-2 px-4 pb-4">
                <Field label="Headline">
                  <input
                    type="text"
                    value={frame.headline}
                    onChange={(e) => {
                      const frames = [...(content as StoryContent).frames];
                      frames[i] = { ...frame, headline: e.target.value };
                      onContentChange({ ...(content as StoryContent), frames });
                    }}
                    className="mos-field w-full"
                  />
                </Field>
                <Field label="Body (optional)">
                  <input
                    type="text"
                    value={frame.body ?? ''}
                    onChange={(e) => {
                      const frames = [...(content as StoryContent).frames];
                      frames[i] = { ...frame, body: e.target.value };
                      onContentChange({ ...(content as StoryContent), frames });
                    }}
                    className="mos-field w-full"
                  />
                </Field>
              </div>
            </details>
          ))}
        </div>
      )}

      {isEmail && (
        <div className="space-y-3">
          <Field label="Subject line">
            <input
              type="text"
              value={(content as EmailContent).subject}
              onChange={(e) => onContentChange({ ...(content as EmailContent), subject: e.target.value })}
              className="mos-field w-full"
            />
          </Field>
          <Field label="Preheader">
            <input
              type="text"
              value={(content as EmailContent).preheader}
              onChange={(e) => onContentChange({ ...(content as EmailContent), preheader: e.target.value })}
              className="mos-field w-full"
            />
          </Field>
          <Field label="Headline">
            <input
              type="text"
              value={(content as EmailContent).headline}
              onChange={(e) => onContentChange({ ...(content as EmailContent), headline: e.target.value })}
              className="mos-field w-full"
            />
          </Field>
          <Field label="Body">
            <textarea
              rows={6}
              value={(content as EmailContent).body}
              onChange={(e) => onContentChange({ ...(content as EmailContent), body: e.target.value })}
              className="mos-field w-full resize-none"
            />
          </Field>
          <Field label="CTA label">
            <input
              type="text"
              value={(content as EmailContent).cta.label}
              onChange={(e) => onContentChange({ ...(content as EmailContent), cta: { ...(content as EmailContent).cta, label: e.target.value } })}
              className="mos-field w-full"
            />
          </Field>
        </div>
      )}

      {isTalkingPoints && (
        <div className="space-y-3">
          <Field label="Hook (opening line)">
            <input
              type="text"
              value={(content as TalkingPointsContent).hook}
              onChange={(e) => onContentChange({ ...(content as TalkingPointsContent), hook: e.target.value })}
              className="mos-field w-full"
            />
          </Field>
          <Field label="Talking points">
            {((content as TalkingPointsContent).talkingPoints ?? []).map((pt, i) => (
              <div key={i} className="mb-2 flex items-start gap-2">
                <span className="mt-2 text-xs text-zinc-400">{i + 1}.</span>
                <textarea
                  rows={2}
                  value={pt}
                  onChange={(e) => {
                    const pts = [...(content as TalkingPointsContent).talkingPoints];
                    pts[i] = e.target.value;
                    onContentChange({ ...(content as TalkingPointsContent), talkingPoints: pts });
                  }}
                  className="mos-field w-full resize-none"
                />
              </div>
            ))}
          </Field>
          {(content as TalkingPointsContent).cta && (
            <Field label="Call to action">
              <input
                type="text"
                value={(content as TalkingPointsContent).cta ?? ''}
                onChange={(e) => onContentChange({ ...(content as TalkingPointsContent), cta: e.target.value })}
                className="mos-field w-full"
              />
            </Field>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-zinc-500">{label}</label>
      {children}
    </div>
  );
}

// ─── Live Preview Panel ────────────────────────────────────────────────────────

function LivePreview({
  content,
  format,
  products,
  activeSlide,
}: {
  content: ArtifactContent;
  format: StudioFormat;
  products: StudioProduct[];
  activeSlide: number;
}) {
  return (
    <div className="sticky top-0 pt-1">
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Preview</p>
      <div className={format !== 'EMAIL' ? 'max-w-[260px] md:max-w-[300px]' : 'max-w-[400px]'}>
        {format === 'CAROUSEL' && content.kind === 'CAROUSEL' && (
          <CarouselPreview content={content} products={products} activeSlide={activeSlide} />
        )}
        {format === 'POST' && content.kind === 'STATIC_POST' && (
          <PostPreview content={content} products={products} />
        )}
        {format === 'STORY' && content.kind === 'STORY' && (
          <StoryPreview content={content} products={products} />
        )}
        {format === 'EMAIL' && content.kind === 'EMAIL' && (
          <EmailPreview content={content} products={products} />
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type PageStep = 'source-select' | 'format' | 'setup' | 'studio' | 'whole-set' | 'error';

export default function OperatorStudioPage() {
  const {
    activeEntity,
    selectedSourceProductIds,
    setSelectedSourceProductIds,
    setActiveTab,
    setActiveCampaignId,
    studioReturnTarget,
    setStudioReturnTarget,
    recommendationSeed,
    setRecommendationSeed,
    studioWholeSetResult,
    setStudioWholeSetResult,
    setRepurposeSourceArtifactId,
  } = useApp();

  const hasProducts = selectedSourceProductIds.length > 0;
  const initialStep: PageStep = studioReturnTarget ? 'studio'
    : studioWholeSetResult ? 'whole-set'
    : hasProducts ? 'format' : 'source-select';

  const [step, setStep] = useState<PageStep>(initialStep);
  const [format, setFormat] = useState<StudioFormat | null>(null);
  const [creativeDirection, setCreativeDirection] = useState<CreativeDirection | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [wholeSetResult, setWholeSetResult] = useState<WholeSetResult | null>(
    studioWholeSetResult as WholeSetResult | null
  );
  const [setupError, setSetupError] = useState<string | null>(null);

  // Studio editing state
  const [content, setContent] = useState<ArtifactContent | null>(null);
  const [activeSlide, setActiveSlide] = useState(0);
  const [approved, setApproved] = useState(false);
  const [approving, setApproving] = useState(false);
  const [revising, setRevising] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [studioTab, setStudioTab] = useState<'edit' | 'preview'>('edit');
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [pickerProducts, setPickerProducts] = useState<StudioProduct[]>([]);
  const [entrySource] = useState<'fresh' | 'library'>(() => studioReturnTarget ? 'library' : 'fresh');
  const [setupMsgIdx, setSetupMsgIdx] = useState(0);

  // Populate picker products from return target or IDs
  useEffect(() => {
    if (studioReturnTarget) {
      const item = studioReturnTarget;
      const sessionProducts: StudioProduct[] = item.products.map(p => ({
        id: p.id, title: p.title, brand: p.brand, price: p.price, currency: p.currency,
        imageUrls: p.imageUrls, availability: 'AVAILABLE', marketingBucket: null,
        size: null, category: null, publicUrl: null,
      }));
      const reconstructed: Session = {
        campaignId: item.campaignId,
        campaignName: item.campaignName,
        contentKey: item.contentKey,
        artifact: {
          id: item.artifactId,
          workspaceId: activeEntity?.id ?? '',
          campaignId: item.campaignId,
          contentKey: item.contentKey,
          deliverableId: '',
          version: 1,
          channel: item.channel,
          contentType: item.contentType,
          format: item.format,
          status: item.status,
          content: item.content as ArtifactContent,
          sourceContentPlanId: '',
          sourceContentPlanVersion: 1,
        },
        products: sessionProducts,
        aiGenerated: true,
        creativeDirection: item.creativeDirection as CreativeDirection | null,
      };
      setFormat(item.studioFormat);
      setCreativeDirection(item.creativeDirection as CreativeDirection | null);
      setSession(reconstructed);
      setContent(item.content as ArtifactContent);
      setApproved(item.status === 'APPROVED');
      setStep('studio');
      setStudioReturnTarget(null);
      return;
    }

    if (selectedSourceProductIds.length === 0) return;
    setPickerProducts(
      selectedSourceProductIds.map((id) => ({
        id, title: '', brand: null, price: null, currency: null, imageUrls: [],
        availability: 'AVAILABLE', marketingBucket: null, size: null, category: null, publicUrl: null,
      })),
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (step !== 'setup' || format) return;
    const id = setInterval(() => setSetupMsgIdx(i => (i + 1) % 4), 1400);
    return () => clearInterval(id);
  }, [step, format]);

  const setupStudio = useCallback(
    async (selectedFormat: StudioFormat) => {
      if (!activeEntity) return;
      setFormat(selectedFormat);
      setStep('setup');
      setSetupError(null);
      try {
        await api.establishLocalOperatorSession();
        const result = await api.createStudioSession(
          activeEntity.id,
          selectedSourceProductIds,
          selectedFormat,
          creativeDirection,
          recommendationSeed?.recommendationId ?? null,
        );
        setRecommendationSeed(null);
        const s: Session = {
          campaignId: result.campaignId,
          campaignName: result.campaignName,
          contentKey: result.contentKey,
          artifact: result.artifact as unknown as Artifact,
          products: result.products as unknown as StudioProduct[],
          aiGenerated: result.aiGenerated,
          creativeDirection,
        };
        setSession(s);
        setContent(s.artifact.content);
        setActiveSlide(0);
        setApproved(false);
        setStep('studio');
      } catch (err) {
        setSetupError((err as Error).message);
        setStep('error');
      }
    },
    [activeEntity, selectedSourceProductIds, creativeDirection],
  );

  const setupWholeSet = useCallback(async () => {
    if (!activeEntity) return;
    setStep('setup');
    setSetupError(null);
    try {
      await api.establishLocalOperatorSession();
      const result = await api.createWholeSet(activeEntity.id, selectedSourceProductIds, creativeDirection, recommendationSeed?.recommendationId ?? null);
      setRecommendationSeed(null);
      const ws: WholeSetResult = {
        campaignId: result.campaignId,
        campaignName: result.campaignName,
        formats: result.formats.map(f => ({
          format: f.format as StudioFormat,
          contentKey: f.contentKey,
          artifact: f.artifact as unknown as Artifact,
        })),
        products: result.products as unknown as StudioProduct[],
        aiGenerated: result.aiGenerated,
        creativeDirection,
      };
      setWholeSetResult(ws);
      setStudioWholeSetResult(ws);
      setStep('whole-set');
    } catch (err) {
      setSetupError((err as Error).message);
      setStep('error');
    }
  }, [activeEntity, selectedSourceProductIds, creativeDirection, setStudioWholeSetResult]);

  const persistEdit = useCallback(
    async (newContent: ArtifactContent) => {
      if (!session || !activeEntity) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      setSaveState('saving');
      saveTimer.current = setTimeout(async () => {
        try {
          await api.establishLocalOperatorSession();
          await api.patchCreative(
            session.campaignId,
            session.artifact.contentKey,
            activeEntity.id,
            newContent,
          );
          if (approved) setApproved(false);
          setSaveState('saved');
          setTimeout(() => setSaveState('idle'), 2000);
        } catch {
          setSaveState('idle');
        }
      }, 800);
    },
    [session, activeEntity, approved],
  );

  const handleContentChange = useCallback(
    (newContent: ArtifactContent) => {
      setContent(newContent);
      void persistEdit(newContent);
    },
    [persistEdit],
  );

  const handleApprove = useCallback(async () => {
    if (!session || !activeEntity || approving) return;
    setApproving(true);
    try {
      await api.establishLocalOperatorSession();
      await api.approveCreative(
        session.campaignId,
        session.artifact.contentKey,
        activeEntity.id,
        session.artifact.id,
      );
      setApproved(true);
    } catch {
      // show button again
    } finally {
      setApproving(false);
    }
  }, [session, activeEntity, approving]);

  const openFormatFromWholeSet = (fmt: StudioFormat) => {
    if (!wholeSetResult) return;
    const entry = wholeSetResult.formats.find(f => f.format === fmt);
    if (!entry) return;
    const s: Session = {
      campaignId: wholeSetResult.campaignId,
      campaignName: wholeSetResult.campaignName,
      contentKey: entry.contentKey,
      artifact: entry.artifact,
      products: wholeSetResult.products,
      aiGenerated: wholeSetResult.aiGenerated,
      creativeDirection: wholeSetResult.creativeDirection,
    };
    setSession(s);
    setContent(entry.artifact.content);
    setFormat(fmt);
    setActiveSlide(0);
    setApproved(entry.artifact.status === 'APPROVED');
    setStep('studio');
  };

  const handleBack = () => {
    if (step === 'studio' && wholeSetResult) {
      setStep('whole-set');
    } else if (step === 'whole-set') {
      setStep('format');
    } else if (step === 'source-select') {
      setSelectedSourceProductIds([]);
      setActiveTab('creative-studio');
    } else if (step === 'studio') {
      if (entrySource === 'library') {
        setSelectedSourceProductIds([]);
        setWholeSetResult(null);
        setActiveTab('creative-studio');
      } else {
        setStep('format');
      }
    } else {
      setSelectedSourceProductIds([]);
      setWholeSetResult(null);
      setActiveTab('creative-studio');
    }
  };

  // ─── Source Select Step ──────────────────────────────────────────────────────

  if (step === 'source-select') {
    return (
      <div className="relative h-full overflow-y-auto">
        <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-zinc-100 bg-white px-4 py-3">
          <button
            onClick={handleBack}
            className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </button>
          <span className="text-xs font-semibold text-zinc-950">Select products</span>
        </div>
        <SourceProductPicker
          onContinue={(ids, prods) => {
            setSelectedSourceProductIds(ids);
            setPickerProducts(prods.map(p => ({
              id: p.id,
              title: p.title,
              brand: p.attributes?.brand ?? null,
              price: p.priceAmount,
              currency: p.priceCurrency,
              imageUrls: p.imageUrls,
              availability: p.availability,
              marketingBucket: p.marketingBucket,
              size: p.attributes?.size ?? null,
              category: p.attributes?.category ?? null,
              publicUrl: p.attributes?.publicUrl ?? null,
            })));
            setStep('format');
          }}
        />
      </div>
    );
  }

  // ─── Format Picker Step ──────────────────────────────────────────────────────

  if (step === 'format') {
    return (
      <div className="relative h-full overflow-y-auto">
        <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-zinc-100 bg-white px-4 py-3">
          <button
            onClick={handleBack}
            className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </button>
          <span className="text-xs font-semibold text-zinc-950">Choose format</span>
        </div>
        <FormatPicker
          products={pickerProducts}
          onSelect={(f) => void setupStudio(f)}
          onWholeSet={() => void setupWholeSet()}
          direction={creativeDirection}
          onDirectionChange={setCreativeDirection}
        />
      </div>
    );
  }

  // ─── Setup Step ──────────────────────────────────────────────────────────────

  if (step === 'setup') {
    const wholeSetMsgs = ['Preparing Post…', 'Preparing Carousel…', 'Preparing Story…', 'Preparing Email…'];
    const singleMsgs = ['Writing in your brand voice', 'Adapting your selected products'];
    const subMsg = format
      ? `${FORMAT_LABELS[format]}${creativeDirection ? ` · ${DIRECTION_LABELS[creativeDirection]}` : ''} · ${singleMsgs[setupMsgIdx % singleMsgs.length]}`
      : wholeSetMsgs[setupMsgIdx];
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-10">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
        <p className="text-sm font-medium text-zinc-600">Creating your content…</p>
        <p className="text-xs text-zinc-400">{subMsg}</p>
      </div>
    );
  }

  // ─── Whole Set Step ──────────────────────────────────────────────────────────

  if (step === 'whole-set' && wholeSetResult) {
    return (
      <WholeSetOverview
        result={wholeSetResult}
        onOpenFormat={openFormatFromWholeSet}
        onBack={() => setStep('format')}
      />
    );
  }

  // ─── Error Step ──────────────────────────────────────────────────────────────

  if (step === 'error') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-10 text-center">
        <AlertCircle className="h-8 w-8 text-amber-500" />
        <p className="text-sm font-semibold text-zinc-900">Something went wrong</p>
        <p className="max-w-sm text-xs text-zinc-500">{setupError}</p>
        <button
          onClick={() => {
            if (format) void setupStudio(format);
            else void setupWholeSet();
          }}
          className="mt-2 flex items-center gap-1.5 rounded-lg border border-zinc-200 px-4 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Try again
        </button>
        <button onClick={handleBack} className="text-xs text-zinc-400 underline hover:text-zinc-700">
          Go back
        </button>
      </div>
    );
  }

  // ─── Studio Step ─────────────────────────────────────────────────────────────

  if (!session || !content) return null;

  const sessionProducts = session.products;
  const isCarousel = format === 'CAROUSEL';
  const sessionDirection = session.creativeDirection;
  const currentStatusCfg = STATUS_CONFIG[approved ? 'APPROVED' : (session.artifact.status ?? 'READY_FOR_REVIEW')];

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Top bar */}
      <div className="flex flex-shrink-0 items-center justify-between border-b border-zinc-100 bg-white px-4 py-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={handleBack}
            className="flex flex-shrink-0 items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </button>
          <span className="hidden text-xs text-zinc-300 sm:inline">|</span>
          {wholeSetResult && (
            <span className="hidden text-xs text-zinc-400 sm:inline">Whole Set ·</span>
          )}
          <span className="hidden truncate text-xs font-semibold text-zinc-950 sm:inline max-w-[160px]">
            {session.campaignName}
          </span>
          <span className="rounded-full border border-zinc-200 px-2 py-0.5 text-[10px] font-semibold text-zinc-500 shrink-0">
            {format ? FORMAT_LABELS[format] : ''}
          </span>
          {sessionDirection && (
            <span className="hidden rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-500 sm:inline shrink-0">
              {DIRECTION_LABELS[sessionDirection]}
            </span>
          )}
          {!session.aiGenerated && (
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold text-zinc-600 shrink-0">
              Starter copy — edit to personalise
            </span>
          )}
        </div>

        <div className="flex flex-shrink-0 items-center gap-2">
          {saveState === 'saving' && (
            <span className="text-[10px] text-zinc-400">Saving…</span>
          )}
          {saveState === 'saved' && (
            <span className="flex items-center gap-1 text-[10px] text-emerald-600">
              <Check className="h-3 w-3" /> Saved
            </span>
          )}
          {/* Status pill */}
          {currentStatusCfg && (
            <span className={`hidden rounded-full px-2 py-0.5 text-[10px] font-semibold sm:inline ${currentStatusCfg.className}`}>
              {currentStatusCfg.label}
            </span>
          )}

          {!approved ? (
            <button
              onClick={() => void handleApprove()}
              disabled={approving || revising}
              className="flex items-center gap-1.5 rounded-xl bg-zinc-950 px-4 py-2 text-xs font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-50"
            >
              {approving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              Looks good
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
                <Check className="h-3.5 w-3.5" /> Approved
              </span>
              {session?.artifact.id && (
                <button
                  onClick={() => {
                    setRepurposeSourceArtifactId(session.artifact.id);
                    setActiveTab('repurpose');
                  }}
                  className="rounded-xl border border-zinc-200 px-4 py-2 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50"
                >
                  Create versions
                </button>
              )}
              <button
                onClick={() => setScheduleOpen(true)}
                className="rounded-xl bg-zinc-950 px-4 py-2 text-xs font-semibold text-white transition hover:bg-zinc-800"
              >
                Schedule
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Product strip */}
      <div className="flex flex-shrink-0 items-center gap-3 overflow-x-auto border-b border-zinc-100 bg-zinc-50 px-4 py-3">
        {sessionProducts.map((p, i) => (
          <button
            key={p.id}
            onClick={() => { if (isCarousel) setActiveSlide(i); }}
            className={`group flex flex-shrink-0 items-center gap-2.5 rounded-xl border px-2.5 py-2 transition ${
              isCarousel && activeSlide === i
                ? 'border-zinc-950 bg-white shadow-sm'
                : 'border-zinc-200 bg-white hover:border-zinc-400'
            }`}
          >
            <div className="relative h-10 w-10 flex-shrink-0 overflow-hidden rounded-lg bg-zinc-100">
              {p.imageUrls[0] ? (
                <img src={p.imageUrls[0]} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full items-center justify-center">
                  <ImageOff className="h-4 w-4 text-zinc-300" />
                </span>
              )}
              {p.marketingBucket === 'NEW' && (
                <span className="absolute -right-1 -top-1 rounded-full bg-emerald-500 px-1 py-0.5 text-[8px] font-bold text-white">N</span>
              )}
              {p.marketingBucket === 'SALE' && (
                <span className="absolute -right-1 -top-1 rounded-full bg-amber-100 px-1 py-0.5 text-[8px] font-bold text-amber-800">S</span>
              )}
              {p.availability !== 'AVAILABLE' && (
                <span className="absolute inset-0 flex items-center justify-center bg-white/70 text-[9px] font-bold text-red-600">SOLD</span>
              )}
            </div>
            <div className="hidden text-left sm:block">
              <p className="max-w-[120px] truncate text-[11px] font-semibold text-zinc-900">{p.title}</p>
              <p className="text-[10px] text-zinc-500">
                {p.brand ?? ''}{p.size ? ` · ${p.size}` : ''}
                {p.price != null ? ` · ${formatPrice(p.price, p.currency)}` : ''}
              </p>
            </div>
          </button>
        ))}
      </div>

      {/* Responsive tab switcher (visible below lg) */}
      <div className="flex shrink-0 border-b border-zinc-100 bg-white lg:hidden">
        <button
          onClick={() => setStudioTab('edit')}
          className={`flex-1 py-2 text-xs font-semibold transition ${studioTab === 'edit' ? 'border-b-2 border-zinc-950 text-zinc-950' : 'text-zinc-400 hover:text-zinc-700'}`}
        >
          Edit
        </button>
        <button
          onClick={() => setStudioTab('preview')}
          className={`flex-1 py-2 text-xs font-semibold transition ${studioTab === 'preview' ? 'border-b-2 border-zinc-950 text-zinc-950' : 'text-zinc-400 hover:text-zinc-700'}`}
        >
          Preview
        </button>
      </div>

      {/* Two-panel workspace */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Left: editor */}
        <div className={`min-w-0 flex-1 overflow-y-auto border-r border-zinc-100 p-5 ${studioTab === 'preview' ? 'hidden lg:block' : 'block'}`}>
          <CopyEditor
            content={content}
            format={format!}
            session={session}
            onContentChange={handleContentChange}
            onRevising={setRevising}
            activeSlide={activeSlide}
            onSlideActivate={setActiveSlide}
          />
        </div>

        {/* Right: preview — always visible at lg+, tab-controlled below */}
        <div className={`overflow-y-auto p-5 lg:block lg:w-72 xl:w-88 ${studioTab === 'preview' ? 'block w-full' : 'hidden'}`}>
          <LivePreview
            content={content}
            format={format!}
            products={sessionProducts}
            activeSlide={activeSlide}
          />
        </div>
      </div>

      {/* Schedule drawer */}
      {scheduleOpen && session && format && activeEntity && (
        <ScheduleItemDrawer
          mode="create"
          campaignId={session.campaignId}
          campaignName={session.campaignName}
          workspaceId={activeEntity.id}
          contentKey={session.contentKey}
          channel={session.artifact.channel as import('../../types').MarketingChannel}
          creativeArtifactId={session.artifact.id}
          creativeVersion={session.artifact.version}
          onClose={() => setScheduleOpen(false)}
          onSaved={() => {
            setScheduleOpen(false);
            setActiveCampaignId(session.campaignId);
            setActiveTab('campaign-detail');
          }}
        />
      )}
    </div>
  );
}

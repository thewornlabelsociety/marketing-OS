import { ArrowRight, CalendarDays, Clock, Info, LayoutGrid, Lightbulb, Plus, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp, type RecommendationSeed } from '../../app/AppContext';
import { PageHeader } from '../../components/ui/ProductUI';
import { api } from '../../services/api';
import { contentTypeLabel } from '../../utils/displayLabels';

// ─── Types ────────────────────────────────────────────────────────────────────

type OrganicItemState = 'PUBLISHED' | 'SCHEDULED' | 'PREPARED_CREATIVE' | 'PROPOSED_IDEA';
type OrganicContentClass = 'FOUNDER' | 'EDITORIAL' | 'SHOP' | 'MARKETPLACE' | 'PRODUCT' | 'BRAND' | 'OTHER';

interface OrganicPlanItem {
  id: string;
  state: OrganicItemState;
  channel: string;
  classification: OrganicContentClass;
  marketingScopes: string[];
  title: string | null;
  contentType: string | null;
  creativeDirection: string | null;
  effectiveTimestamp: string | null;
  mediaAssetId: string | null;
  imageUrls: string[];
  artifactId: string | null;
  scheduleId: string | null;
  recommendationId: string | null;
  campaignId: string | null;
  sourceProductIds: string[];
  hook: string | null;
  angle: string | null;
  recommendationType: string | null;
}

interface PlanSignal {
  type: string;
  severity: 'INFO' | 'WARNING';
  message: string;
  gapDays?: number;
}

interface OrganicPlan {
  channel: string;
  channelStrategy: { enabled: boolean; priority: string | null };
  currentFeed: OrganicPlanItem[];
  plannedFeed: OrganicPlanItem[];
  readyToPlace: OrganicPlanItem[];
  proposedNext: OrganicPlanItem[];
  signals: PlanSignal[];
  summary: {
    publishedCount: number;
    scheduledCount: number;
    preparedCount: number;
    proposedCount: number;
    largestGapDays: number | null;
    hasUpcomingContent: boolean;
  };
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CHANNELS = ['instagram', 'facebook', 'tiktok', 'email'];

const CLASS_COLORS: Record<OrganicContentClass, string> = {
  FOUNDER: 'bg-violet-100 text-violet-700',
  EDITORIAL: 'bg-sky-100 text-sky-700',
  MARKETPLACE: 'bg-emerald-100 text-emerald-700',
  SHOP: 'bg-teal-100 text-teal-700',
  PRODUCT: 'bg-amber-100 text-amber-700',
  BRAND: 'bg-rose-100 text-rose-700',
  OTHER: 'bg-zinc-100 text-zinc-500',
};

const CLASS_BG: Record<OrganicContentClass, string> = {
  FOUNDER: 'bg-violet-900',
  EDITORIAL: 'bg-sky-900',
  MARKETPLACE: 'bg-emerald-900',
  SHOP: 'bg-teal-900',
  PRODUCT: 'bg-zinc-800',
  BRAND: 'bg-rose-900',
  OTHER: 'bg-zinc-700',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatShort(iso: string): string {
  return new Date(iso).toLocaleDateString('en-NZ', { month: 'short', day: 'numeric' });
}

function formatRelative(iso: string): string {
  const diffMs = new Date(iso).getTime() - Date.now();
  const diffDays = Math.round(diffMs / 86400000);
  if (diffDays <= 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays < 7) return `In ${diffDays} days`;
  return formatShort(iso);
}

function classLabel(cls: OrganicContentClass): string {
  return cls.charAt(0) + cls.slice(1).toLowerCase();
}

function classInitial(cls: OrganicContentClass): string {
  return { FOUNDER: 'F', EDITORIAL: 'Ed', MARKETPLACE: 'Mkt', SHOP: 'Sh', PRODUCT: 'P', BRAND: 'B', OTHER: '?' }[cls];
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

// ─── Media resolution ─────────────────────────────────────────────────────────

function useMediaUrls(items: OrganicPlanItem[], workspaceId: string) {
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});
  const resolvedRef = useRef(new Set<string>());

  useEffect(() => {
    const needed = items.filter(i => i.mediaAssetId && !resolvedRef.current.has(i.id));
    if (needed.length === 0) return;

    void Promise.allSettled(
      needed.map(async item => {
        resolvedRef.current.add(item.id);
        const { url } = await api.getMediaPreviewUrl(item.mediaAssetId!, workspaceId);
        setMediaUrls(prev => ({ ...prev, [item.id]: url }));
      })
    );
  }, [items, workspaceId]);

  return mediaUrls;
}

// ─── Grid tile ────────────────────────────────────────────────────────────────

function GridTile({ item, mediaUrl, isPlanned }: { item: OrganicPlanItem; mediaUrl?: string; isPlanned?: boolean }) {
  const imgUrl = mediaUrl ?? item.imageUrls[0] ?? null;
  const isScheduled = item.state === 'SCHEDULED';

  return (
    <div className="relative aspect-square overflow-hidden rounded-sm bg-zinc-100">
      {imgUrl ? (
        <img src={imgUrl} alt={item.title ?? ''} className="h-full w-full object-cover" />
      ) : (
        <div className={`flex h-full w-full items-center justify-center ${CLASS_BG[item.classification]}`}>
          <span className="text-lg font-bold text-white/60 select-none">
            {classInitial(item.classification)}
          </span>
        </div>
      )}

      {/* Scheduled date overlay */}
      {isPlanned && isScheduled && item.effectiveTimestamp && (
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2 py-1.5">
          <span className="flex items-center gap-1 text-[10px] font-semibold text-white">
            <Clock className="h-3 w-3" />
            {formatRelative(item.effectiveTimestamp)}
          </span>
        </div>
      )}

      {/* Classification dot */}
      <span className={`absolute left-1.5 top-1.5 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${CLASS_COLORS[item.classification]}`}>
        {classLabel(item.classification)}
      </span>
    </div>
  );
}

// ─── Signal bar ───────────────────────────────────────────────────────────────

function SignalBar({ signals }: { signals: PlanSignal[] }) {
  const visible = signals.filter(s => s.type !== 'CHANNEL_DISABLED');
  if (visible.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {visible.map(s => (
        <div
          key={s.type}
          className={`flex items-start gap-1.5 rounded-xl px-3 py-2 text-xs ${
            s.severity === 'WARNING'
              ? 'bg-amber-50 text-amber-800'
              : 'bg-zinc-50 text-zinc-600'
          }`}
        >
          {s.severity === 'WARNING'
            ? <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
            : <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-400" />
          }
          {s.message}
        </div>
      ))}
    </div>
  );
}

// ─── Ready to Place card ──────────────────────────────────────────────────────

function PreparedCard({
  item,
  mediaUrl,
  onSchedule,
}: {
  item: OrganicPlanItem;
  mediaUrl?: string;
  onSchedule: (item: OrganicPlanItem) => void;
}) {
  const imgUrl = mediaUrl ?? item.imageUrls[0] ?? null;

  return (
    <div className="flex gap-3 rounded-2xl border border-zinc-200 bg-white p-3">
      <div className={`h-12 w-12 shrink-0 overflow-hidden rounded-lg ${CLASS_BG[item.classification]}`}>
        {imgUrl
          ? <img src={imgUrl} alt="" className="h-full w-full object-cover" />
          : <span className="flex h-full w-full items-center justify-center text-sm font-bold text-white/60">{classInitial(item.classification)}</span>}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{item.title ?? item.contentType ?? 'Creative'}</p>
        <div className="mt-0.5 flex flex-wrap gap-1">
          <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${CLASS_COLORS[item.classification]}`}>{classLabel(item.classification)}</span>
          {item.contentType && <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-500">{contentTypeLabel(item.contentType)}</span>}
        </div>
      </div>
      <button
        type="button"
        onClick={() => onSchedule(item)}
        className="shrink-0 self-center rounded-xl bg-zinc-950 px-3 py-1.5 text-xs font-semibold text-white hover:bg-zinc-800"
      >
        <CalendarDays className="inline h-3 w-3 -mt-0.5 mr-1" />Schedule
      </button>
    </div>
  );
}

// ─── Proposed Next card ───────────────────────────────────────────────────────

function ProposedCard({
  item,
  onCreateThis,
  onDismiss,
}: {
  item: OrganicPlanItem;
  onCreateThis: (item: OrganicPlanItem) => void;
  onDismiss: (id: string) => void;
}) {
  return (
    <div className="relative flex flex-col rounded-2xl border border-zinc-200 bg-white p-4">
      <button
        type="button"
        onClick={() => onDismiss(item.id)}
        className="absolute right-3 top-3 rounded-full p-1 text-zinc-300 hover:text-zinc-600"
        aria-label="Dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </button>

      <span className={`mb-2 inline-flex self-start rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${CLASS_COLORS[item.classification]}`}>
        {classLabel(item.classification)}
      </span>

      <p className="pr-6 text-sm font-semibold leading-snug">{item.title}</p>

      {item.hook && (
        <p className="mt-1 line-clamp-2 text-xs leading-5 text-zinc-500">"{item.hook}"</p>
      )}

      {item.marketingScopes.length > 1 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {item.marketingScopes.map(s => (
            <span key={s} className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-500">{s}</span>
          ))}
        </div>
      )}

      <div className="mt-auto pt-3">
        <button
          type="button"
          onClick={() => onCreateThis(item)}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-zinc-950 px-3 py-2 text-xs font-semibold text-white hover:bg-zinc-800"
        >
          <Plus className="h-3.5 w-3.5" />
          Create this
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

type FeedView = 'current' | 'planned';

export default function InstagramGridPlannerPage() {
  const { activeEntity, setActiveTab, launchFromRecommendation } = useApp();
  const workspaceId = activeEntity?.id ?? '';

  const [channel, setChannel] = useState('instagram');
  const [feedView, setFeedView] = useState<FeedView>('current');
  const [plan, setPlan] = useState<OrganicPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    setError('');
    try {
      const result = await api.getOrganicPlan(workspaceId, channel);
      setPlan(result as unknown as OrganicPlan);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [workspaceId, channel]);

  useEffect(() => { void load(); }, [load]);

  const gridItems = feedView === 'current' ? (plan?.currentFeed ?? []) : (plan?.plannedFeed ?? []);
  const allItems = [
    ...(plan?.currentFeed ?? []),
    ...(plan?.plannedFeed ?? []),
    ...(plan?.readyToPlace ?? []),
  ];

  const mediaUrls = useMediaUrls(allItems, workspaceId);

  const handleCreateThis = useCallback((item: OrganicPlanItem) => {
    if (!item.recommendationId) return;
    const seed: RecommendationSeed = {
      recommendationId: item.recommendationId,
      recommendationType: item.recommendationType ?? '',
      sourceProductIds: item.sourceProductIds,
      contentType: item.contentType,
      title: item.title ?? '',
      hook: item.hook,
      angle: item.angle,
      cta: null,
      talkingPoints: null,
    };
    launchFromRecommendation(seed);
  }, [launchFromRecommendation]);

  const handleSchedule = useCallback((_item: OrganicPlanItem) => {
    // Scheduling an approved unscheduled creative — navigate to calendar which has the scheduling UI
    setActiveTab('calendar');
  }, [setActiveTab]);

  const handleDismiss = useCallback(async (id: string) => {
    try {
      await api.dismissRecommendation(id);
      setPlan(prev => prev ? { ...prev, proposedNext: prev.proposedNext.filter(i => i.id !== id) } : prev);
    } catch { /* silent */ }
  }, []);

  const channelDisabled = plan && !plan.channelStrategy.enabled;

  if (loading) {
    return (
      <div className="mos-page max-w-5xl">
        <PageHeader eyebrow="Content planning" title="Planner" description="Your Instagram grid — current, planned, and what's ready to go." />
        <div className="space-y-2">
          {[1, 2, 3].map(i => <div key={i} className="mos-skeleton h-32 w-full" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="mos-page max-w-5xl space-y-8">
      <PageHeader
        eyebrow="Content planning"
        title="Planner"
        description="Your Instagram grid — current, planned, and what's ready to go."
        action={
          <select
            value={channel}
            onChange={e => setChannel(e.target.value)}
            className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-zinc-950"
          >
            {CHANNELS.map(ch => (
              <option key={ch} value={ch}>{titleCase(ch)}</option>
            ))}
          </select>
        }
      />

      {error && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>
      )}

      {channelDisabled && (
        <div className="flex items-center gap-3 rounded-2xl bg-zinc-50 px-5 py-4 text-sm text-zinc-500">
          <LayoutGrid className="h-4 w-4 shrink-0" />
          This channel is currently disabled in your channel strategy. Historical content is shown below for reference.
        </div>
      )}

      {/* ── Instagram Grid ── */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="mos-eyebrow">{titleCase(channel)} grid</p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight">
              {feedView === 'current' ? 'Current feed' : 'Planned feed'}
            </h2>
            <p className="mt-0.5 text-sm text-zinc-500">
              {feedView === 'current'
                ? 'What your profile looks like right now.'
                : 'Projected view with scheduled posts included.'}
            </p>
          </div>

          <div className="flex gap-1 rounded-xl border border-zinc-200 bg-zinc-50 p-1">
            {(['current', 'planned'] as const).map(v => (
              <button
                key={v}
                type="button"
                onClick={() => setFeedView(v)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  feedView === v
                    ? 'bg-white text-zinc-900 shadow-sm'
                    : 'text-zinc-500 hover:text-zinc-700'
                }`}
              >
                {v === 'current' ? 'Current' : 'Planned'}
              </button>
            ))}
          </div>
        </div>

        {gridItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-zinc-200 py-16 text-center">
            <LayoutGrid className="h-8 w-8 text-zinc-300" />
            <p className="text-sm font-medium text-zinc-500">No published content yet for this channel.</p>
            <p className="text-xs text-zinc-400">Content will appear here once it's published or scheduled.</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-0.5 overflow-hidden rounded-2xl border border-zinc-200">
            {gridItems.slice(0, 12).map(item => (
              <GridTile
                key={item.id}
                item={item}
                mediaUrl={mediaUrls[item.id]}
                isPlanned={feedView === 'planned'}
              />
            ))}
          </div>
        )}

        {plan && (
          <p className="mt-2 text-right text-xs text-zinc-400">
            {plan.summary.publishedCount} published · {plan.summary.scheduledCount} scheduled
          </p>
        )}
      </section>

      {/* ── Signals ── */}
      {plan && plan.signals.length > 0 && (
        <section>
          <SignalBar signals={plan.signals} />
        </section>
      )}

      {/* ── Ready to Place ── */}
      {plan && plan.readyToPlace.length > 0 && (
        <section>
          <div className="mb-3">
            <p className="mos-eyebrow">Ready to place</p>
            <h2 className="mt-1 text-lg font-semibold tracking-tight">Approved creatives awaiting scheduling</h2>
            <p className="mt-0.5 text-sm text-zinc-500">
              These are real approved creatives with no scheduled date yet. Add them to the calendar to move them into your grid.
            </p>
          </div>
          <div className="space-y-2">
            {plan.readyToPlace.map(item => (
              <PreparedCard
                key={item.id}
                item={item}
                mediaUrl={mediaUrls[item.id]}
                onSchedule={handleSchedule}
              />
            ))}
          </div>
        </section>
      )}

      {/* ── Proposed Next ── */}
      {plan && plan.proposedNext.length > 0 && !channelDisabled && (
        <section>
          <div className="mb-3">
            <p className="mos-eyebrow">Proposed next</p>
            <h2 className="mt-1 text-lg font-semibold tracking-tight">Marketing expert suggestions</h2>
            <p className="mt-0.5 text-sm text-zinc-500">
              Ideas from your marketing expert — not yet created. Hit "Create this" to open Studio.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {plan.proposedNext.slice(0, 6).map(item => (
              <ProposedCard
                key={item.id}
                item={item}
                onCreateThis={handleCreateThis}
                onDismiss={handleDismiss}
              />
            ))}
          </div>
        </section>
      )}

      {plan && plan.proposedNext.length === 0 && plan.readyToPlace.length === 0 && !loading && (
        <div className="flex items-center justify-between rounded-2xl border border-dashed border-zinc-200 px-6 py-5">
          <div>
            <p className="text-sm font-semibold text-zinc-700">Nothing proposed yet</p>
            <p className="mt-1 text-xs text-zinc-500">Use your marketing expert on the Today page to generate recommendations.</p>
          </div>
          <button
            type="button"
            onClick={() => setActiveTab('dashboard')}
            className="flex items-center gap-1.5 rounded-xl bg-zinc-950 px-4 py-2 text-xs font-semibold text-white hover:bg-zinc-800"
          >
            Go to Today <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { PlatformPreview } from '../../components/preview/PlatformPreview';
import {
  ArrowLeft, Check, CheckCircle2, Copy, Loader2, AlertCircle, Mail, Share2, X,
} from 'lucide-react';
import { useApp } from '../../app/AppContext';
import { api } from '../../services/api';
import type { CreativeContent } from '../../types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Destination {
  channel: string;
  contentType: string;
  format: string;
  label: string;
  supportsCreative: boolean;
  supportsScheduling: boolean;
  supportsPublishing: boolean;
  channelEnabled: boolean;
}

interface SourceSummary {
  id: string;
  campaignId: string;
  channel: string;
  contentType: string;
  format: string;
  title: string | null;
  status: string;
  summary: {
    sourceLabel: string;
    campaignName: string;
    hook: string | null;
    caption: string | null;
    headline: string | null;
    contentElements: string[];
    cta: string | null;
  };
}

type DestResult =
  | { destination: string; status: 'SUCCEEDED';         artifactId: string; contentKey: string }
  | { destination: string; status: 'ALREADY_COMPLETED'; artifactId: string; contentKey: string }
  | { destination: string; status: 'AI_FAILED';          error: string }
  | { destination: string; status: 'VALIDATION_FAILED';  error: string }
  | { destination: string; status: 'PERSISTENCE_FAILED'; error: string };

type SuccessResult = Extract<DestResult, { status: 'SUCCEEDED' | 'ALREADY_COMPLETED' }>;

type PagePhase = 'loading' | 'pick' | 'generating' | 'results' | 'error';

// ─── Shared field wrapper ─────────────────────────────────────────────────────

function DrawerField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">{label}</p>
      {children}
    </div>
  );
}

const TA = 'w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400 resize-none';
const INP = 'w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-800 focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400';

// ─── Content fields (editable per kind) ──────────────────────────────────────

function ContentFields({
  content,
  onChange,
}: {
  content: CreativeContent;
  onChange: (c: CreativeContent) => void;
}) {
  if (content.kind === 'STATIC_POST') {
    return (
      <div className="space-y-4">
        {content.hook !== undefined && (
          <DrawerField label="Hook">
            <textarea rows={2} className={TA} value={content.hook ?? ''} onChange={e => onChange({ ...content, hook: e.target.value })} />
          </DrawerField>
        )}
        <DrawerField label="Caption">
          <textarea rows={6} className={TA} value={content.caption} onChange={e => onChange({ ...content, caption: e.target.value })} />
        </DrawerField>
        {content.cta !== undefined && (
          <DrawerField label="CTA">
            <input className={INP} value={content.cta ?? ''} onChange={e => onChange({ ...content, cta: e.target.value })} />
          </DrawerField>
        )}
        {content.hashtags && content.hashtags.length > 0 && (
          <DrawerField label="Hashtags">
            <textarea rows={2} className={TA} value={content.hashtags.join(' ')} onChange={e => onChange({ ...content, hashtags: e.target.value.split(/\s+/).filter(Boolean) })} />
          </DrawerField>
        )}
      </div>
    );
  }

  if (content.kind === 'CAROUSEL') {
    return (
      <div className="space-y-4">
        <DrawerField label="Opening caption">
          <textarea rows={4} className={TA} value={content.caption} onChange={e => onChange({ ...content, caption: e.target.value })} />
        </DrawerField>
        {content.slides.map((slide, i) => (
          <div key={i} className="space-y-3 rounded-xl border border-zinc-200 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Slide {slide.slideNumber}</p>
            {slide.headline !== undefined && (
              <DrawerField label="Headline">
                <input className={INP} value={slide.headline ?? ''} onChange={e => {
                  const slides = content.slides.map((s, si) => si === i ? { ...s, headline: e.target.value } : s);
                  onChange({ ...content, slides });
                }} />
              </DrawerField>
            )}
            {slide.body !== undefined && (
              <DrawerField label="Body">
                <textarea rows={3} className={TA} value={slide.body ?? ''} onChange={e => {
                  const slides = content.slides.map((s, si) => si === i ? { ...s, body: e.target.value } : s);
                  onChange({ ...content, slides });
                }} />
              </DrawerField>
            )}
          </div>
        ))}
        {content.cta !== undefined && (
          <DrawerField label="CTA">
            <input className={INP} value={content.cta ?? ''} onChange={e => onChange({ ...content, cta: e.target.value })} />
          </DrawerField>
        )}
      </div>
    );
  }

  if (content.kind === 'STORY') {
    return (
      <div className="space-y-4">
        {content.frames.map((frame, i) => (
          <div key={i} className="space-y-3 rounded-xl border border-zinc-200 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Frame {frame.frameNumber}</p>
            {frame.headline !== undefined && (
              <DrawerField label="Headline">
                <input className={INP} value={frame.headline ?? ''} onChange={e => {
                  const frames = content.frames.map((f, fi) => fi === i ? { ...f, headline: e.target.value } : f);
                  onChange({ ...content, frames });
                }} />
              </DrawerField>
            )}
            {frame.body !== undefined && (
              <DrawerField label="Body">
                <textarea rows={2} className={TA} value={frame.body ?? ''} onChange={e => {
                  const frames = content.frames.map((f, fi) => fi === i ? { ...f, body: e.target.value } : f);
                  onChange({ ...content, frames });
                }} />
              </DrawerField>
            )}
            {frame.cta !== undefined && (
              <DrawerField label="CTA">
                <input className={INP} value={frame.cta ?? ''} onChange={e => {
                  const frames = content.frames.map((f, fi) => fi === i ? { ...f, cta: e.target.value } : f);
                  onChange({ ...content, frames });
                }} />
              </DrawerField>
            )}
          </div>
        ))}
      </div>
    );
  }

  if (content.kind === 'EMAIL') {
    const bodyIsString = typeof content.body === 'string';
    const bodySections = bodyIsString ? null : (content.body as { sections: { heading?: string; body: string }[] }).sections;
    return (
      <div className="space-y-4">
        <DrawerField label="Subject">
          <input className={INP} value={content.subject} onChange={e => onChange({ ...content, subject: e.target.value })} />
        </DrawerField>
        {content.preheader !== undefined && (
          <DrawerField label="Preheader">
            <input className={INP} value={content.preheader ?? ''} onChange={e => onChange({ ...content, preheader: e.target.value })} />
          </DrawerField>
        )}
        {content.headline !== undefined && (
          <DrawerField label="Headline">
            <input className={INP} value={content.headline ?? ''} onChange={e => onChange({ ...content, headline: e.target.value })} />
          </DrawerField>
        )}
        <DrawerField label="Body">
          {bodyIsString ? (
            <textarea rows={8} className={TA} value={content.body as string} onChange={e => onChange({ ...content, body: e.target.value })} />
          ) : (
            <div className="space-y-3">
              {bodySections!.map((section, i) => (
                <div key={i} className="space-y-1">
                  {section.heading && <p className="text-xs font-semibold text-zinc-600">{section.heading}</p>}
                  <textarea rows={4} className={TA} value={section.body} onChange={e => {
                    const sections = bodySections!.map((s, si) => si === i ? { ...s, body: e.target.value } : s);
                    onChange({ ...content, body: { sections } });
                  }} />
                </div>
              ))}
            </div>
          )}
        </DrawerField>
        {content.cta?.label !== undefined && (
          <DrawerField label="CTA label">
            <input className={INP} value={content.cta.label} onChange={e => onChange({ ...content, cta: { ...content.cta!, label: e.target.value } })} />
          </DrawerField>
        )}
      </div>
    );
  }

  if (content.kind === 'TALKING_POINTS') {
    // Runtime field name may be `points` (canonical) or `talkingPoints` (legacy)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pts: string[] = (content as any).points ?? (content as any).talkingPoints ?? [];
    const setPoints = (next: string[]) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const hasLegacyField = 'talkingPoints' in (content as any);
      onChange(hasLegacyField
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ? { ...content, talkingPoints: next } as any
        : { ...content, points: next } as CreativeContent
      );
    };
    return (
      <div className="space-y-4">
        <DrawerField label="Hook">
          <textarea rows={2} className={TA} value={content.hook} onChange={e => onChange({ ...content, hook: e.target.value })} />
        </DrawerField>
        <DrawerField label="Talking points">
          <div className="space-y-2">
            {pts.map((pt, i) => (
              <div key={i} className="flex gap-2">
                <span className="mt-2 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-[10px] font-semibold text-zinc-500">{i + 1}</span>
                <textarea rows={2} className={`${TA} flex-1`} value={pt} onChange={e => setPoints(pts.map((p, pi) => pi === i ? e.target.value : p))} />
              </div>
            ))}
          </div>
        </DrawerField>
        {content.closingCta !== undefined && (
          <DrawerField label="Closing CTA">
            <input className={INP} value={content.closingCta ?? ''} onChange={e => onChange({ ...content, closingCta: e.target.value })} />
          </DrawerField>
        )}
      </div>
    );
  }

  return <p className="text-xs text-zinc-400">Preview not available for this content type.</p>;
}

// ─── Preview helpers ──────────────────────────────────────────────────────────

function repurposeContentTypeToFormat(ct: string): string {
  switch (ct.toUpperCase()) {
    case 'CAROUSEL': return 'carousel';
    case 'STORY': return 'story';
    case 'SHORT_VIDEO': return 'short-video';
    case 'EMAIL': case 'NEWSLETTER': return 'newsletter';
    default: return 'feed';
  }
}

// ─── Version review drawer ────────────────────────────────────────────────────

function VersionReviewDrawer({
  result,
  source,
  workspaceId,
  onClose,
  onApproved,
}: {
  result: SuccessResult;
  source: SourceSummary;
  workspaceId: string;
  onClose: () => void;
  onApproved: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState<CreativeContent | null>(null);
  const [artifactId, setArtifactId] = useState('');
  const [approved, setApproved] = useState(false);
  const [approving, setApproving] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | undefined>(undefined);
  const [previewChannel, setPreviewChannel] = useState('instagram');
  const [previewFormat, setPreviewFormat] = useState('feed');
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contentRef = useRef<CreativeContent | null>(null);

  useEffect(() => {
    let cancelled = false;
    void api.getCreative(source.campaignId, result.contentKey, workspaceId)
      .then(async a => {
        if (cancelled) return;
        const c = a.content as unknown as CreativeContent;
        setContent(c);
        contentRef.current = c;
        setArtifactId(a.id);
        setApproved(a.status === 'APPROVED');
        setPreviewChannel(String(a.channel).toLowerCase());
        setPreviewFormat(repurposeContentTypeToFormat(String(a.contentType)));
        if (a.mediaAssetId) {
          try {
            const { url } = await api.getMediaPreviewUrl(a.mediaAssetId, workspaceId);
            if (!cancelled) setImageUrl(url);
          } catch { /* no image */ }
        }
        setLoading(false);
      })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [source.campaignId, result.contentKey, workspaceId]);

  const persistContent = useCallback((c: CreativeContent) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await api.patchCreative(source.campaignId, result.contentKey, workspaceId, c);
      } catch { /* silent */ }
    }, 800);
  }, [source.campaignId, result.contentKey, workspaceId]);

  const handleContentChange = useCallback((c: CreativeContent) => {
    setContent(c);
    contentRef.current = c;
    persistContent(c);
  }, [persistContent]);

  const handleApprove = async () => {
    if (approving || approved || !artifactId) return;
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      if (contentRef.current) {
        try { await api.patchCreative(source.campaignId, result.contentKey, workspaceId, contentRef.current); } catch { /* silent */ }
      }
    }
    setApproving(true);
    try {
      await api.approveCreative(source.campaignId, result.contentKey, workspaceId, artifactId);
      setApproved(true);
      onApproved();
    } finally {
      setApproving(false);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[520px] flex-col bg-white shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-zinc-100 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <p className="text-sm font-semibold text-zinc-950">{result.destination}</p>
            {approved
              ? <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">Approved</span>
              : <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[10px] font-semibold text-zinc-500">Ready for review</span>
            }
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex h-48 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
            </div>
          )}
          {!loading && (
            <>
              <div className="border-b border-zinc-100 bg-zinc-50 px-5 py-5">
                <PlatformPreview
                  channel={previewChannel}
                  format={previewFormat}
                  creative={content}
                  imageUrl={imageUrl}
                />
              </div>
              {content && (
                <div className="px-5 py-5">
                  <ContentFields content={content} onChange={handleContentChange} />
                </div>
              )}
            </>
          )}
        </div>

        <div className="shrink-0 border-t border-zinc-100 bg-white px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <button type="button" onClick={onClose} className="text-xs text-zinc-400 hover:text-zinc-700">Close</button>
            {approved ? (
              <span className="flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-700">
                <CheckCircle2 className="h-3.5 w-3.5" /> Approved
              </span>
            ) : (
              <button
                type="button"
                onClick={() => void handleApprove()}
                disabled={approving || loading}
                className="flex items-center gap-1.5 rounded-xl bg-zinc-950 px-4 py-2 text-xs font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-50"
              >
                {approving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                Approve
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Channel icon helper ──────────────────────────────────────────────────────

function ChannelIcon({ channel, className }: { channel: string; className?: string }) {
  if (channel === 'EMAIL') return <Mail className={className} />;
  if (channel === 'INSTAGRAM' || channel === 'FACEBOOK') return <Share2 className={className} />;
  return <Copy className={className} />;
}

// ─── Destination card ─────────────────────────────────────────────────────────

function DestinationCard({
  dest,
  selected,
  onToggle,
  disabled,
}: {
  dest: Destination;
  selected: boolean;
  onToggle: () => void;
  disabled: boolean;
}) {
  const channelColors: Record<string, string> = {
    INSTAGRAM: 'bg-pink-50 border-pink-200',
    FACEBOOK:  'bg-blue-50  border-blue-200',
    EMAIL:     'bg-amber-50 border-amber-200',
    TIKTOK:    'bg-zinc-50  border-zinc-200',
  };
  const colorCls = channelColors[dest.channel] ?? 'bg-zinc-50 border-zinc-200';

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onToggle}
      className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition ${
        selected
          ? 'border-zinc-950 bg-zinc-950 text-white'
          : `${colorCls} hover:border-zinc-400`
      } disabled:opacity-40`}
    >
      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${selected ? 'bg-white/10' : 'bg-white/70'}`}>
        <ChannelIcon channel={dest.channel} className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className={`text-xs font-semibold ${selected ? 'text-white' : 'text-zinc-800'}`}>{dest.label}</p>
        <p className={`text-[10px] ${selected ? 'text-white/70' : 'text-zinc-500'}`}>
          {dest.channel} · {dest.format.replace(/_/g, ' ')}
        </p>
      </div>
      <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
        selected ? 'border-white bg-white/20' : 'border-zinc-300 bg-white'
      }`}>
        {selected && <Check className="h-3 w-3 text-white" />}
      </div>
    </button>
  );
}

// ─── Result card ──────────────────────────────────────────────────────────────

function ResultCard({
  result,
  isApproved,
  onOpen,
  onApprove,
}: {
  result: DestResult;
  isApproved: boolean;
  onOpen: () => void;
  onApprove: (artifactId: string, contentKey: string) => Promise<void>;
}) {
  const [approving, setApproving] = useState(false);

  const ok = result.status === 'SUCCEEDED' || result.status === 'ALREADY_COMPLETED';

  const handleApproveClick = async () => {
    if (!ok || isApproved || approving) return;
    const r = result as SuccessResult;
    setApproving(true);
    try {
      await onApprove(r.artifactId, r.contentKey);
    } finally {
      setApproving(false);
    }
  };

  return (
    <div
      role={ok ? 'button' : undefined}
      tabIndex={ok ? 0 : undefined}
      onClick={ok ? onOpen : undefined}
      onKeyDown={ok ? (e) => { if (e.key === 'Enter' || e.key === ' ') onOpen(); } : undefined}
      className={`rounded-xl border ${
        ok
          ? 'cursor-pointer border-zinc-200 bg-white transition hover:border-zinc-400 hover:shadow-sm'
          : 'border-red-100 bg-red-50'
      }`}
    >
      <div className="flex items-start justify-between gap-2 p-4">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-zinc-800">{result.destination}</p>
          {ok ? (
            <p className="mt-0.5 text-[10px] text-zinc-400">
              {isApproved ? 'Approved' : `Ready for review${result.status === 'ALREADY_COMPLETED' ? ' (existing)' : ''}`}
            </p>
          ) : (
            <p className="mt-0.5 text-[10px] text-red-600">
              {(result as { error: string }).error}
            </p>
          )}
        </div>
        {ok && !isApproved && (
          <button
            type="button"
            onClick={e => { e.stopPropagation(); void handleApproveClick(); }}
            disabled={approving}
            className="flex shrink-0 items-center gap-1 rounded-lg border border-zinc-200 px-3 py-1.5 text-[10px] font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
          >
            {approving ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
            Approve
          </button>
        )}
        {ok && isApproved && (
          <span className="flex shrink-0 items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[10px] font-semibold text-emerald-700">
            <CheckCircle2 className="h-3 w-3" /> Approved
          </span>
        )}
        {!ok && <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />}
      </div>
    </div>
  );
}

// ─── RepurposePage ────────────────────────────────────────────────────────────

export default function RepurposePage() {
  const { activeEntity, repurposeSourceArtifactId, setRepurposeSourceArtifactId, setActiveTab } = useApp();

  const [phase, setPhase] = useState<PagePhase>('loading');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [source, setSource] = useState<SourceSummary | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [generating, setGenerating] = useState(false);
  const [results, setResults] = useState<DestResult[]>([]);
  const [overallStatus, setOverallStatus] = useState<'COMPLETED' | 'PARTIAL' | 'FAILED' | null>(null);
  const [approvedSet, setApprovedSet] = useState<Set<string>>(new Set());
  const [drawerResult, setDrawerResult] = useState<SuccessResult | null>(null);

  const workspaceId = activeEntity?.id ?? '';

  useEffect(() => {
    if (!workspaceId || !repurposeSourceArtifactId) {
      setErrorMsg('No source artifact selected. Return to the studio and choose a format to repurpose.');
      setPhase('error');
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const [dests, src] = await Promise.all([
          api.getRepurposeDestinations(workspaceId),
          api.getRepurposeSource(workspaceId, repurposeSourceArtifactId),
        ]);
        if (cancelled) return;
        const filtered = dests.filter(d => !(d.channel === src.channel && d.contentType === src.contentType));
        setDestinations(filtered);
        setSource(src);
        const preSelected = new Set(filtered.filter(d => d.channelEnabled !== false).map(d => d.label));
        setSelected(preSelected);
        setPhase('pick');
      } catch (err) {
        if (cancelled) return;
        setErrorMsg((err as Error).message);
        setPhase('error');
      }
    })();
    return () => { cancelled = true; };
  }, [workspaceId, repurposeSourceArtifactId]);

  const handleBack = useCallback(() => {
    setRepurposeSourceArtifactId(null);
    setActiveTab('operator-studio');
  }, [setRepurposeSourceArtifactId, setActiveTab]);

  const toggleDest = (label: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  const handleGenerate = async () => {
    if (!workspaceId || !repurposeSourceArtifactId || selected.size === 0) return;
    setGenerating(true);
    setPhase('generating');
    try {
      const idempotencyKey = `${repurposeSourceArtifactId}-${Date.now().toString(36)}`;
      const response = await api.repurposeArtifact({
        workspaceId,
        sourceArtifactId: repurposeSourceArtifactId,
        destinations: Array.from(selected),
        idempotencyKey,
      });
      setResults(response.results);
      setOverallStatus(response.status === 'IN_PROGRESS' ? 'COMPLETED' : response.status);
      setPhase('results');
    } catch (err) {
      setErrorMsg((err as Error).message);
      setPhase('error');
    } finally {
      setGenerating(false);
    }
  };

  const handleApprove = useCallback(async (artifactId: string, contentKey: string, destination: string) => {
    if (!source) return;
    await api.approveCreative(source.campaignId, contentKey, workspaceId, artifactId);
    setApprovedSet(prev => { const s = new Set(prev); s.add(destination); return s; });
  }, [source, workspaceId]);

  // ── Render ────────────────────────────────────────────────────────────────

  if (phase === 'loading') {
    return (
      <div className="flex h-full items-center justify-center text-sm text-zinc-400">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
        <AlertCircle className="h-8 w-8 text-red-400" />
        <p className="text-sm text-zinc-700">{errorMsg}</p>
        <button
          type="button"
          onClick={handleBack}
          className="rounded-xl bg-zinc-950 px-4 py-2 text-xs font-semibold text-white hover:bg-zinc-800"
        >
          Go back
        </button>
      </div>
    );
  }

  if (phase === 'generating') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
        <p className="text-sm font-medium text-zinc-700">Generating {selected.size} version{selected.size !== 1 ? 's' : ''}…</p>
        <p className="text-xs text-zinc-400">Each destination gets its own AI call. This takes a moment.</p>
      </div>
    );
  }

  if (phase === 'results') {
    const succeeded = results.filter(r => r.status === 'SUCCEEDED' || r.status === 'ALREADY_COMPLETED').length;
    const failed = results.filter(r => r.status !== 'SUCCEEDED' && r.status !== 'ALREADY_COMPLETED').length;

    return (
      <div className="flex h-full flex-col overflow-hidden">
        <div className="flex shrink-0 items-center justify-between border-b border-zinc-100 bg-white px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              onClick={handleBack}
              className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back
            </button>
            <span className="text-xs font-semibold text-zinc-950">Content Versions</span>
            {overallStatus === 'COMPLETED' && (
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">All generated</span>
            )}
            {overallStatus === 'PARTIAL' && (
              <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">Partially generated</span>
            )}
            {overallStatus === 'FAILED' && (
              <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-700">Generation failed</span>
            )}
          </div>
          <p className="text-xs text-zinc-500">{succeeded} ready · {failed} failed</p>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-8">
          <p className="mos-eyebrow mb-1">Content family</p>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-950">{source?.summary.campaignName}</h1>
          <p className="mt-1 text-sm text-zinc-500">Repurposed from {source?.summary.sourceLabel}</p>

          <div className="mt-6 flex flex-col gap-3">
            {results.map(r => (
              <ResultCard
                key={r.destination}
                result={r}
                isApproved={approvedSet.has(r.destination)}
                onOpen={() => {
                  if (r.status === 'SUCCEEDED' || r.status === 'ALREADY_COMPLETED') {
                    setDrawerResult(r as SuccessResult);
                  }
                }}
                onApprove={(artifactId, contentKey) => handleApprove(artifactId, contentKey, r.destination)}
              />
            ))}
          </div>

          {failed > 0 && (
            <p className="mt-4 text-xs text-zinc-400">
              Failed destinations can be retried by returning to the studio and launching Create versions again.
            </p>
          )}
        </div>

        {drawerResult && source && (
          <VersionReviewDrawer
            result={drawerResult}
            source={source}
            workspaceId={workspaceId}
            onClose={() => setDrawerResult(null)}
            onApproved={() => {
              setApprovedSet(prev => { const s = new Set(prev); s.add(drawerResult.destination); return s; });
              setDrawerResult(null);
            }}
          />
        )}
      </div>
    );
  }

  // phase === 'pick'
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-3 border-b border-zinc-100 bg-white px-4 py-3">
        <button
          onClick={handleBack}
          className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </button>
        <span className="text-xs font-semibold text-zinc-950">Create versions</span>
        <span className="rounded-full border border-zinc-200 px-2 py-0.5 text-[10px] font-semibold text-zinc-500">
          1 idea → multiple channels
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-8">
        {source && (
          <div className="mb-8 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
            <p className="mos-eyebrow mb-1">Source</p>
            <p className="text-sm font-semibold text-zinc-800">{source.summary.campaignName}</p>
            <p className="text-xs text-zinc-500">{source.summary.sourceLabel}</p>
            {source.summary.hook && (
              <p className="mt-2 text-xs italic text-zinc-600">"{source.summary.hook}"</p>
            )}
            {source.summary.caption && !source.summary.hook && (
              <p className="mt-2 line-clamp-2 text-xs text-zinc-600">{source.summary.caption}</p>
            )}
          </div>
        )}

        <p className="mos-eyebrow mb-3">Choose channels to generate</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {destinations.map(d => (
            <DestinationCard
              key={d.label}
              dest={d}
              selected={selected.has(d.label)}
              onToggle={() => toggleDest(d.label)}
              disabled={generating}
            />
          ))}
        </div>
      </div>

      <div className="shrink-0 border-t border-zinc-100 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <p className="text-xs text-zinc-400">
            {selected.size === 0 ? 'Select at least one destination' : `${selected.size} destination${selected.size !== 1 ? 's' : ''} selected`}
          </p>
          <button
            type="button"
            disabled={selected.size === 0 || generating}
            onClick={() => void handleGenerate()}
            className="flex items-center gap-1.5 rounded-xl bg-zinc-950 px-5 py-2.5 text-xs font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-40"
          >
            {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />}
            Generate {selected.size > 0 ? `${selected.size} version${selected.size !== 1 ? 's' : ''}` : 'versions'}
          </button>
        </div>
      </div>
    </div>
  );
}

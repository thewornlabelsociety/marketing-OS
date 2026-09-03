import { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeft, Check, CheckCircle2, Copy, Loader2, AlertCircle, Mail, Share2,
} from 'lucide-react';
import { useApp } from '../../app/AppContext';
import { api } from '../../services/api';

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

type PagePhase = 'loading' | 'pick' | 'generating' | 'results' | 'error';

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
  onApprove,
}: {
  result: DestResult;
  onApprove: (artifactId: string, contentKey: string) => Promise<void>;
}) {
  const [approving, setApproving] = useState(false);
  const [approved, setApproved] = useState(false);

  const ok = result.status === 'SUCCEEDED' || result.status === 'ALREADY_COMPLETED';

  const handleApprove = async () => {
    if (!ok || approved || approving) return;
    const r = result as { destination: string; status: string; artifactId: string; contentKey: string };
    setApproving(true);
    try {
      await onApprove(r.artifactId, r.contentKey);
      setApproved(true);
    } finally {
      setApproving(false);
    }
  };

  return (
    <div className={`rounded-xl border p-4 ${ok ? 'border-zinc-200 bg-white' : 'border-red-100 bg-red-50'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-zinc-800">{result.destination}</p>
          {ok ? (
            <p className="mt-0.5 text-[10px] text-zinc-400">
              Ready for review{result.status === 'ALREADY_COMPLETED' ? ' (existing)' : ''}
            </p>
          ) : (
            <p className="mt-0.5 text-[10px] text-red-600">
              {(result as { error: string }).error}
            </p>
          )}
        </div>
        {ok && !approved && (
          <button
            type="button"
            onClick={() => void handleApprove()}
            disabled={approving}
            className="flex shrink-0 items-center gap-1 rounded-lg border border-zinc-200 px-3 py-1.5 text-[10px] font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
          >
            {approving ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
            Approve
          </button>
        )}
        {ok && approved && (
          <span className="flex shrink-0 items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[10px] font-semibold text-emerald-700">
            <CheckCircle2 className="h-3 w-3" /> Approved
          </span>
        )}
        {!ok && (
          <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
        )}
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

  const workspaceId = activeEntity?.id ?? '';

  // Load destinations + source on mount
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
        // Exclude the source's own channel/contentType to avoid self-repurpose
        const filtered = dests.filter(d => !(d.channel === src.channel && d.contentType === src.contentType));
        setDestinations(filtered);
        setSource(src);
        // Pre-select only destinations whose channel is enabled in the workspace channel strategy
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

  const handleApprove = async (artifactId: string, contentKey: string) => {
    if (!source) return;
    await api.approveCreative(source.campaignId, contentKey, workspaceId, artifactId);
  };

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
        {/* Header */}
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
                onApprove={handleApprove}
              />
            ))}
          </div>

          {failed > 0 && (
            <p className="mt-4 text-xs text-zinc-400">
              Failed destinations can be retried by returning to the studio and launching Create versions again.
            </p>
          )}
        </div>
      </div>
    );
  }

  // phase === 'pick'
  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
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
        {/* Source summary */}
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

        {/* Destination picker */}
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

      {/* Footer action */}
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

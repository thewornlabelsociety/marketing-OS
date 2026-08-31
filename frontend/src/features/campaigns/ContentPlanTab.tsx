import { FileText, Loader2, MoreHorizontal, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { ContentPlanPreviewDrawer, DeliverablePreviewButton } from '../../components/drawers/ContentPlanPreviewDrawer';
import { ContentPlanReviewDrawer } from '../../components/drawers/ContentPlanReviewDrawer';
import { ContentStudioDrawer } from '../../components/drawers/ContentStudioDrawer';
import { CreativePreviewDrawer } from '../../components/drawers/CreativePreviewDrawer';
import { CreativeReviewDrawer } from '../../components/drawers/CreativeReviewDrawer';
import { api } from '../../services/api';
import type {
  CampaignCreativeSummary,
  ChannelCapability,
  ContentDeliverable,
  ContentPlan,
  ContentPlanStatus,
  CreativeArtifact,
} from '../../types';

interface Props {
  campaignId: string;
  workspaceId: string;
  onReviewStrategy: () => void;
  onStatusChange?: (status: ContentPlanStatus | null) => void;
  onCreativeChange?: (summary: CampaignCreativeSummary | null) => void;
}

const FORMAT_LABEL: Record<string, string> = {
  SQUARE_1_1: '1:1',
  PORTRAIT_4_5: '4:5',
  VERTICAL_9_16: '9:16',
  LANDSCAPE_16_9: '16:9',
  NEWSLETTER: 'Newsletter',
  DOCUMENT_CAROUSEL: 'Document',
  TEXT_POST: 'Text',
  ARTICLE: 'Article',
  LANDING_PAGE: 'Landing page',
};

const TYPE_LABEL: Record<string, string> = {
  STATIC_POST: 'Post',
  CAROUSEL: 'Carousel',
  STORY: 'Story',
  SHORT_VIDEO: 'Reel',
  LONG_VIDEO: 'Video',
  NEWSLETTER: 'Newsletter',
  EMAIL: 'Email',
  ARTICLE: 'Article',
  LANDING_PAGE: 'Landing page',
  DOCUMENT: 'Document',
  OTHER: 'Other',
};

export function ContentPlanTab({ campaignId, workspaceId, onReviewStrategy, onStatusChange, onCreativeChange }: Props) {
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [generatingCreative, setGeneratingCreative] = useState(false);
  const [generatingKey, setGeneratingKey] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [aiConfigured, setAiConfigured] = useState(false);
  const [strategyApproved, setStrategyApproved] = useState(false);
  const [plan, setPlan] = useState<ContentPlan | null>(null);
  const [creativeSummary, setCreativeSummary] = useState<CampaignCreativeSummary | null>(null);
  const [capabilities, setCapabilities] = useState<ChannelCapability[]>([]);
  const [showReview, setShowReview] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [creativePreviewKey, setCreativePreviewKey] = useState<string | null>(null);
  const [reviewCreativeKey, setReviewCreativeKey] = useState<string | null>(null);
  const [reviewArtifact, setReviewArtifact] = useState<CreativeArtifact | null>(null);
  const [studioKey, setStudioKey] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);
  const [approvingCreative, setApprovingCreative] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [requestingCreative, setRequestingCreative] = useState(false);

  const loadCreative = useCallback(async () => {
    if (!plan || plan.status !== 'APPROVED') {
      setCreativeSummary(null);
      onCreativeChange?.(null);
      return;
    }
    try {
      const summary = await api.getCampaignCreative(campaignId, workspaceId);
      setCreativeSummary(summary);
      onCreativeChange?.(summary);
    } catch {
      setCreativeSummary(null);
      onCreativeChange?.(null);
    }
  }, [campaignId, workspaceId, plan, onCreativeChange]);

  const load = useCallback(() => {
    setLoading(true);
    api.getContentPlanStatus(campaignId, workspaceId)
      .then(async (status) => {
        setAiConfigured(status.aiConfigured);
        setStrategyApproved(status.strategyApproved);
        setCapabilities(status.capabilities ?? []);
        onStatusChange?.(status.contentPlanStatus as ContentPlanStatus | null);
        if (status.hasContentPlan) {
          const current = await api.getContentPlan(campaignId, workspaceId);
          setPlan(current);
        } else {
          setPlan(null);
        }
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [campaignId, workspaceId, onStatusChange]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { void loadCreative(); }, [loadCreative]);

  async function generate() {
    setGenerating(true);
    setError('');
    try {
      const created = await api.generateContentPlan(campaignId, workspaceId);
      setPlan(created);
      onStatusChange?.(created.status);
      setShowReview(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create content plan');
    } finally {
      setGenerating(false);
    }
  }

  async function approve(contentPlanId: string) {
    setApproving(true);
    try {
      await api.approveContentPlan(campaignId, workspaceId, contentPlanId);
      setShowReview(false);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve content plan');
    } finally {
      setApproving(false);
    }
  }

  async function requestChanges(requestText: string) {
    setRequesting(true);
    try {
      const revised = await api.requestContentPlanRevision(campaignId, workspaceId, requestText);
      setPlan(revised);
      onStatusChange?.(revised.status);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit revision');
    } finally {
      setRequesting(false);
    }
  }

  async function generateCreative(contentKey?: string) {
    if (contentKey) setGeneratingKey(contentKey);
    else setGeneratingCreative(true);
    setError('');
    try {
      if (contentKey) {
        await api.generateCreative(campaignId, contentKey, workspaceId);
      } else {
        await api.generateAllCreative(campaignId, workspaceId);
      }
      await loadCreative();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate creative');
    } finally {
      setGeneratingCreative(false);
      setGeneratingKey(null);
    }
  }

  async function openCreativeReview(contentKey: string) {
    try {
      const artifact = await api.getCreative(campaignId, contentKey, workspaceId);
      setReviewArtifact(artifact);
      setReviewCreativeKey(contentKey);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load creative');
    }
  }

  async function approveCreative(creativeArtifactId: string) {
    if (!reviewCreativeKey) return;
    setApprovingCreative(true);
    try {
      await api.approveCreative(campaignId, reviewCreativeKey, workspaceId, creativeArtifactId);
      setReviewCreativeKey(null);
      setReviewArtifact(null);
      await loadCreative();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve creative');
    } finally {
      setApprovingCreative(false);
    }
  }

  async function requestCreativeChanges(requestText: string, targetHint?: string) {
    if (!reviewCreativeKey) return;
    setRequestingCreative(true);
    try {
      const revised = await api.requestCreativeRevision(
        campaignId,
        reviewCreativeKey,
        workspaceId,
        requestText,
        targetHint,
      );
      setReviewArtifact(revised);
      await loadCreative();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit creative revision');
    } finally {
      setRequestingCreative(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-sm text-[#71717A]">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading content plan…
      </div>
    );
  }

  const assetSummary = plan
    ? Object.values(
        plan.deliverables.flatMap((d) => d.assetRequirements).reduce<Record<string, { description: string; quantity: number }>>((acc, asset) => {
          const key = asset.description;
          acc[key] = acc[key] ?? { description: asset.description, quantity: 0 };
          acc[key].quantity += asset.quantity ?? 1;
          return acc;
        }, {}),
      )
    : [];

  return (
    <div className="mx-auto max-w-xl space-y-6">
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {!strategyApproved && !plan && (
        <EmptyState
          title="Content Plan"
          body="Approve the campaign strategy before creating the content plan."
          actionLabel="Review Campaign Plan"
          onAction={onReviewStrategy}
        />
      )}

      {strategyApproved && !plan && (
        <EmptyState
          title="Content Plan"
          body="Turn the approved campaign strategy into channel-ready campaign deliverables."
          actionLabel={aiConfigured ? (generating ? 'Generating…' : 'Create Content Plan') : undefined}
          onAction={aiConfigured && !generating ? () => void generate() : undefined}
          loading={generating}
          note={!aiConfigured
            ? 'AI provider is not configured. Content planning is unavailable until AI_PROVIDER and an API key are set. No placeholder plan will be created.'
            : undefined}
        />
      )}

      {generating && plan == null && strategyApproved && aiConfigured && (
        <div className="flex items-center gap-2 text-sm text-[#71717A]">
          <Loader2 className="h-4 w-4 animate-spin" />
          Creating content plan from the approved strategy…
        </div>
      )}

      {plan && (
        <div className="space-y-8">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-[#A1A1AA]">Content Plan</p>
              <p className="mt-1 text-sm text-[#71717A]">Version {plan.version} · {plan.status.replaceAll('_', ' ').toLowerCase()}</p>
            </div>
            {plan.status === 'APPROVED' ? (
              <p className="text-sm font-medium text-[#09090B]">Ready for Creative Generation</p>
            ) : (
              <button
                type="button"
                onClick={() => setShowReview(true)}
                className="rounded-lg bg-[#09090B] px-4 py-2 text-sm font-medium text-white hover:bg-[#18181B]"
              >
                Review Content Plan
              </button>
            )}
          </div>

          <section>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-[#A1A1AA]">Campaign content strategy</p>
            <p className="text-sm text-[#09090B]">{plan.summary.campaignNarrative}</p>
            <p className="mt-1 text-sm text-[#71717A]">{plan.summary.contentStrategy}</p>
          </section>

          {plan.cadence.phases.length > 0 && (
            <section>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-[#A1A1AA]">Sequence</p>
              <ol className="space-y-2">
                {plan.cadence.phases.slice().sort((a, b) => a.order - b.order).map((phase) => (
                  <li key={phase.key} className="flex gap-3 text-sm">
                    <span className="w-6 font-mono text-[11px] text-[#A1A1AA]">{String(phase.order).padStart(2, '0')}</span>
                    <span className="text-[#09090B]">{phase.name}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}

          <section>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-[#A1A1AA]">Concepts</p>
            <div className="divide-y divide-[#F4F4F5]">
              {plan.concepts.map((concept) => (
                <div key={concept.id} className="py-2">
                  <p className="text-sm font-medium text-[#09090B]">{concept.name}</p>
                  <p className="text-xs text-[#71717A]">{concept.coreMessage}</p>
                </div>
              ))}
            </div>
          </section>

          <section>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-[#A1A1AA]">Deliverables</p>
            <DeliverableGroups plan={plan} onPreview={setPreviewId} />
          </section>

          {assetSummary.length > 0 && (
            <section>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-[#A1A1AA]">Assets needed</p>
              <ul className="space-y-1">
                {assetSummary.map((asset) => (
                  <li key={asset.description} className="text-sm text-[#71717A]">
                    {asset.quantity} {asset.description}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {plan.status === 'APPROVED' && (
            <CreativeSection
              summary={creativeSummary}
              aiConfigured={aiConfigured}
              generatingAll={generatingCreative}
              generatingKey={generatingKey}
              onGenerateAll={() => void generateCreative()}
              onGenerateOne={(key) => void generateCreative(key)}
              onReview={openCreativeReview}
              onPreview={setCreativePreviewKey}
              onEdit={setStudioKey}
            />
          )}
        </div>
      )}

      {showReview && plan && (
        <ContentPlanReviewDrawer
          plan={plan}
          onClose={() => setShowReview(false)}
          onApprove={approve}
          onRequestChanges={requestChanges}
          approving={approving}
          requesting={requesting}
          locked={plan.status === 'APPROVED'}
        />
      )}

      {previewId && plan && (
        <ContentPlanPreviewDrawer
          plan={plan}
          capabilities={capabilities}
          initialDeliverableId={previewId}
          onClose={() => setPreviewId(null)}
        />
      )}

      {creativePreviewKey && creativeSummary && (
        <CreativePreviewDrawer
          campaignId={campaignId}
          workspaceId={workspaceId}
          summary={creativeSummary}
          capabilities={capabilities}
          initialContentKey={creativePreviewKey}
          onClose={() => setCreativePreviewKey(null)}
        />
      )}

      {reviewArtifact && reviewCreativeKey && (
        <CreativeReviewDrawer
          artifact={reviewArtifact}
          onClose={() => { setReviewArtifact(null); setReviewCreativeKey(null); }}
          onApprove={approveCreative}
          onRequestChanges={requestCreativeChanges}
          approving={approvingCreative}
          requesting={requestingCreative}
          locked={reviewArtifact.status === 'APPROVED'}
        />
      )}

      {studioKey && (
        <ContentStudioDrawer
          campaignId={campaignId}
          workspaceId={workspaceId}
          contentKey={studioKey}
          aiConfigured={aiConfigured}
          onClose={() => setStudioKey(null)}
          onSaved={() => void loadCreative()}
        />
      )}
    </div>
  );
}

function CreativeSection({
  summary,
  aiConfigured,
  generatingAll,
  generatingKey,
  onGenerateAll,
  onGenerateOne,
  onReview,
  onPreview,
  onEdit,
}: {
  summary: CampaignCreativeSummary | null;
  aiConfigured: boolean;
  generatingAll: boolean;
  generatingKey: string | null;
  onGenerateAll: () => void;
  onGenerateOne: (contentKey: string) => void;
  onReview: (contentKey: string) => void;
  onPreview: (contentKey: string) => void;
  onEdit: (contentKey: string) => void;
}) {
  if (!summary) {
    return (
      <section className="border-t border-[#F4F4F5] pt-6">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-[#A1A1AA]">Creative</p>
        <div className="mt-3 flex items-center gap-2 text-sm text-[#71717A]">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading creative status…
        </div>
      </section>
    );
  }

  const primaryLabel = summary.generated === 0
    ? (generatingAll ? 'Generating…' : 'Generate Creative')
    : summary.needsGeneration > 0
      ? (generatingAll ? 'Continuing…' : 'Continue Creative')
      : summary.needsReview > 0
        ? 'Review Creative'
        : summary.readyForScheduling
          ? 'Creative approved'
          : 'Review Creative';

  const primaryAction = () => {
    if (summary.generated === 0 || summary.needsGeneration > 0) onGenerateAll();
    else if (summary.needsReview > 0) {
      const next = summary.deliverables.find((d) => d.hasCreative && !d.isApproved);
      if (next) onReview(next.contentKey);
    }
  };

  return (
    <section className="border-t border-[#F4F4F5] pt-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-[#A1A1AA]">Creative</p>
          {summary.generated === 0 ? (
            <p className="mt-1 text-sm text-[#71717A]">{summary.totalDeliverables} deliverables ready to create.</p>
          ) : summary.needsGeneration > 0 ? (
            <p className="mt-1 text-sm text-[#71717A]">
              {summary.generated} of {summary.totalDeliverables} created · {summary.needsGeneration} remaining
            </p>
          ) : summary.readyForScheduling ? (
            <p className="mt-1 text-sm text-[#71717A]">Ready for scheduling</p>
          ) : (
            <p className="mt-1 text-sm text-[#71717A]">
              {summary.generated} of {summary.totalDeliverables} created
              {summary.needsReview > 0 ? ` · ${summary.needsReview} need review` : ''}
            </p>
          )}
        </div>
        {!summary.readyForScheduling && (
          <button
            type="button"
            disabled={generatingAll || (!aiConfigured && summary.generated === 0)}
            onClick={primaryAction}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#09090B] px-4 py-2 text-sm font-medium text-white hover:bg-[#18181B] disabled:opacity-50"
          >
            {generatingAll ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            {primaryLabel}
          </button>
        )}
      </div>

      {!aiConfigured && summary.generated === 0 && (
        <p className="mb-4 text-xs text-[#71717A]">
          AI provider is not configured. Creative generation is unavailable until AI_PROVIDER and an API key are set.
        </p>
      )}

      <div className="divide-y divide-[#F4F4F5]">
        {summary.deliverables.map((row) => (
          <div key={row.contentKey} className="flex items-start justify-between gap-3 py-3">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-[#A1A1AA]">Creative</p>
              <p className="text-sm font-medium text-[#09090B]">{row.title}</p>
              <p className="text-xs text-[#71717A]">
                {row.channel} · {TYPE_LABEL[row.contentType] ?? row.contentType} · {FORMAT_LABEL[row.format] ?? row.format}
              </p>
              <p className="text-xs text-[#A1A1AA]">{row.contentKey}</p>
              <p className="mt-1 text-xs text-[#71717A]">
                {!row.hasCreative
                  ? 'Not generated'
                  : row.isApproved
                    ? 'Approved'
                    : row.status?.replaceAll('_', ' ').toLowerCase() ?? 'Ready for review'}
              </p>
            </div>
            <div className="flex items-center gap-1">
              {!row.hasCreative ? (
                <button
                  type="button"
                  disabled={!aiConfigured || generatingKey === row.contentKey}
                  onClick={() => onGenerateOne(row.contentKey)}
                  className="rounded-md border border-[#E4E4E7] px-2.5 py-1 text-xs text-[#09090B] hover:bg-[#FAFAFA] disabled:opacity-50"
                >
                  {generatingKey === row.contentKey ? 'Generating…' : 'Generate'}
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => onEdit(row.contentKey)}
                    className="rounded-md border border-[#E4E4E7] px-2.5 py-1 text-xs text-[#09090B] hover:bg-[#FAFAFA]"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => onPreview(row.contentKey)}
                    className="rounded-md border border-[#E4E4E7] px-2.5 py-1 text-xs text-[#09090B] hover:bg-[#FAFAFA]"
                  >
                    Preview
                  </button>
                  {!row.isApproved && (
                    <button
                      type="button"
                      onClick={() => void onReview(row.contentKey)}
                      className="rounded-md border border-[#E4E4E7] px-2.5 py-1 text-xs text-[#09090B] hover:bg-[#FAFAFA]"
                    >
                      Review
                    </button>
                  )}
                </>
              )}
              <span className="inline-flex p-1.5 text-[#A1A1AA]" title="More">
                <MoreHorizontal className="h-3.5 w-3.5" />
              </span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function DeliverableGroups({ plan, onPreview }: { plan: ContentPlan; onPreview: (id: string) => void }) {
  const phases = plan.cadence.phases.slice().sort((a, b) => a.order - b.order);
  const used = new Set<string>();
  const groups: { name: string | null; items: ContentDeliverable[] }[] = [];

  for (const phase of phases) {
    const items = plan.deliverables.filter((d) => d.timing?.phase === phase.name || d.timing?.phase === phase.key);
    items.forEach((d) => used.add(d.id));
    if (items.length > 0) groups.push({ name: phase.name, items });
  }

  const leftover = plan.deliverables.filter((d) => !used.has(d.id));
  if (groups.length === 0) {
    groups.push({ name: null, items: plan.deliverables });
  } else if (leftover.length > 0) {
    groups.push({ name: 'Also planned', items: leftover });
  }

  return (
    <div className="divide-y divide-[#F4F4F5]">
      {groups.map((group) => (
        <div key={group.name ?? 'all'} className="py-3">
          {group.name && (
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-[#A1A1AA]">{group.name}</p>
          )}
          {group.items.map((d) => {
            const concept = plan.concepts.find((c) => c.id === d.sourceConceptId || c.contentKey === d.sourceConceptId);
            return (
              <div key={d.id} className="flex items-start justify-between gap-3 py-2">
                <div>
                  <p className="text-xs text-[#71717A]">
                    {d.channel} · {TYPE_LABEL[d.contentType] ?? d.contentType} · {FORMAT_LABEL[d.format] ?? d.format}
                  </p>
                  <p className="text-sm font-medium text-[#09090B]">{d.title}</p>
                  <p className="text-xs text-[#71717A]">
                    {d.journeyStage ?? d.campaignRole}
                    {concept ? ` · ${concept.name}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <DeliverablePreviewButton deliverable={d} onClick={() => onPreview(d.id)} />
                  <span className="inline-flex p-1.5 text-[#A1A1AA]" title="More">
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function EmptyState({
  title,
  body,
  actionLabel,
  onAction,
  loading,
  note,
}: {
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
  loading?: boolean;
  note?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <FileText className="h-8 w-8 text-[#A1A1AA]" />
      <p className="text-sm font-medium text-[#09090B]">{title}</p>
      <p className="text-sm text-[#71717A]">{body}</p>
      {note && <p className="max-w-sm text-xs text-[#71717A]">{note}</p>}
      {actionLabel && onAction && (
        <button
          type="button"
          disabled={loading}
          onClick={onAction}
          className="rounded-lg bg-[#09090B] px-4 py-2 text-sm font-medium text-white hover:bg-[#18181B] disabled:opacity-50"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

import {
  AlertCircle,
  ArrowLeft,
  BarChart3,
  CalendarDays,
  FileText,
  Loader2,
  MoreHorizontal,
  Sparkles,
  Target,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { SopDrawerTrigger } from '../../components/drawers/SopDrawer';
import { PlanReviewDrawer } from '../../components/drawers/PlanReviewDrawer';
import { ContentPlanTab } from './ContentPlanTab';
import { useApp } from '../../app/AppContext';
import { api } from '../../services/api';
import type { Campaign, CampaignBrief, CampaignPlan, CampaignStatus, ContentPlanStatus } from '../../types';

interface Props {
  campaignId: string | null;
}

type DetailTab = 'overview' | 'content' | 'schedule' | 'performance';

const STATUS_LABELS: Record<CampaignStatus, string> = {
  DRAFTING: 'Drafting',
  READY_FOR_REVIEW: 'Ready for Review',
  CHANGES_REQUESTED: 'Changes Requested',
  REVISING: 'Revising',
  READY_FOR_APPROVAL: 'Ready for Approval',
  APPROVED: 'Approved',
  SCHEDULED: 'Scheduled',
  PUBLISHED: 'Published',
  MEASURING: 'Measuring',
  COMPLETE: 'Complete',
  CANCELLED: 'Cancelled',
  ARCHIVED: 'Archived',
};

const SOURCE_LABELS: Record<string, string> = {
  PRODUCT: 'Product',
  SERVICE: 'Service',
  OFFER: 'Offer',
  FEATURE: 'Feature',
  EVENT: 'Event',
  INVENTORY_BATCH: 'Inventory batch',
  ANNOUNCEMENT: 'Announcement',
  EDUCATIONAL_TOPIC: 'Educational topic',
  CAMPAIGN_IDEA: 'Campaign idea',
  OTHER: 'Other',
};

const CANCELLABLE = new Set<CampaignStatus>([
  'DRAFTING', 'READY_FOR_REVIEW', 'CHANGES_REQUESTED', 'REVISING',
  'READY_FOR_APPROVAL', 'APPROVED', 'SCHEDULED',
]);

const PLANNABLE = new Set<CampaignStatus>([
  'DRAFTING', 'READY_FOR_REVIEW', 'CHANGES_REQUESTED', 'REVISING', 'READY_FOR_APPROVAL',
]);

function MetaRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-3 py-2.5">
      <span className="w-36 shrink-0 text-[11px] font-medium uppercase tracking-wide text-[#A1A1AA]">
        {label}
      </span>
      <span className="flex-1 text-sm text-[#09090B]">{value ?? <span className="text-[#A1A1AA]">—</span>}</span>
    </div>
  );
}

function EmptyTabState({ icon: Icon, message }: { icon: typeof FileText; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
      <Icon className="h-8 w-8 text-[#A1A1AA]" />
      <p className="text-sm font-medium text-[#09090B]">{message}</p>
      <p className="text-xs text-[#71717A]">This will be available in a future update.</p>
    </div>
  );
}

function OverflowMenu({ campaign, onCancelled }: { campaign: Campaign; onCancelled: () => void }) {
  const [open, setOpen] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [reason, setReason] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const canCancel = CANCELLABLE.has(campaign.status as CampaignStatus);

  async function handleCancel() {
    if (!reason.trim()) return;
    setCancelling(true);
    try {
      await api.patchCampaign(campaign.id, {
        status: 'CANCELLED',
        cancellationReason: reason.trim(),
      } as Partial<Campaign>);
      onCancelled();
    } finally {
      setCancelling(false);
      setShowCancel(false);
      setOpen(false);
    }
  }

  if (!canCancel) return null;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        title="More options"
        aria-label="More options"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center justify-center rounded-lg border border-[#E4E4E7] p-2 text-[#71717A] transition hover:bg-[#FAFAFA] hover:text-[#09090B]"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>

      {open && !showCancel && (
        <div className="absolute right-0 top-full z-30 mt-1 w-44 overflow-hidden rounded-xl border border-[#E4E4E7] bg-white shadow-lg">
          <button
            type="button"
            onClick={() => { setShowCancel(true); setOpen(false); }}
            className="flex w-full items-center px-4 py-2.5 text-sm text-red-600 hover:bg-red-50"
          >
            Cancel Campaign
          </button>
        </div>
      )}

      {showCancel && (
        <>
          <button
            type="button"
            aria-label="Dismiss"
            className="fixed inset-0 z-40 bg-black/10"
            onClick={() => setShowCancel(false)}
          />
          <div className="absolute right-0 top-full z-50 mt-1 w-72 rounded-xl border border-[#E4E4E7] bg-white p-4 shadow-xl">
            <p className="text-sm font-semibold text-[#09090B]">Cancel this campaign?</p>
            <p className="mt-1 text-xs text-[#71717A]">
              Provide a reason — cancelled campaigns are preserved as learning data.
            </p>
            <textarea
              autoFocus
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why is this campaign being cancelled?"
              rows={3}
              className="mt-3 w-full rounded-lg border border-[#E4E4E7] px-3 py-2 text-sm outline-none focus:border-[#A1A1AA]"
            />
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => setShowCancel(false)}
                className="flex-1 rounded-lg border border-[#E4E4E7] py-1.5 text-sm font-medium hover:bg-[#FAFAFA]"
              >
                Keep
              </button>
              <button
                type="button"
                disabled={!reason.trim() || cancelling}
                onClick={() => void handleCancel()}
                className="flex-1 rounded-lg bg-red-600 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {cancelling ? 'Cancelling…' : 'Cancel Campaign'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// --- Brief completeness notice ---

interface BriefMissingProps {
  brief: CampaignBrief;
  workspaceId: string;
  onSaved: (updated: CampaignBrief) => void;
}

const FIELD_LABELS: Record<string, string> = {
  timingStartDate: 'Event start date',
  offerDescription: 'Offer description',
  additionalContext: 'Additional context',
  sourceSummary: 'Source summary',
};

function BriefCompletenessNotice({ brief, workspaceId, onSaved }: BriefMissingProps) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  if (brief.completenessStatus === 'COMPLETE') return null;

  const missing = brief.completenessMissingFields;

  async function save() {
    setSaving(true);
    try {
      const updated = await api.patchCampaignBrief(brief.campaignId, workspaceId, values);
      onSaved(updated);
    } finally {
      setSaving(false);
    }
  }

  const hasValues = Object.values(values).some((v) => v.trim());

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
      <div className="flex items-start gap-2">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <div className="flex-1 space-y-3">
          <p className="text-sm font-medium text-amber-900">
            A few more details will improve the campaign plan
          </p>
          {missing.map((field) => (
            <div key={field}>
              <label className="mb-1 block text-xs font-medium text-amber-800">
                {FIELD_LABELS[field] ?? field}
              </label>
              <input
                type={field === 'timingStartDate' ? 'date' : 'text'}
                value={values[field] ?? ''}
                onChange={(e) => setValues((v) => ({ ...v, [field]: e.target.value }))}
                className="w-full rounded-lg border border-amber-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-amber-400"
              />
            </div>
          ))}
          {hasValues && (
            <button
              type="button"
              disabled={saving}
              onClick={() => void save()}
              className="rounded-lg bg-amber-700 px-4 py-1.5 text-sm font-medium text-white hover:bg-amber-800 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Brief summary ---

function BriefSummary({ brief }: { brief: CampaignBrief }) {
  const rows: { label: string; value: string | null }[] = [
    { label: 'Audience', value: brief.audienceDescription },
    { label: 'Problem', value: brief.audienceProblem },
    { label: 'Desire', value: brief.audienceDesire },
    { label: 'Proposition', value: brief.proposition },
    { label: 'Offer', value: brief.offerDescription },
    { label: 'Event start', value: brief.timingStartDate },
    { label: 'Additional context', value: brief.additionalContext },
  ].filter((r) => r.value);

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[#E4E4E7] px-4 py-3">
        <p className="text-sm text-[#A1A1AA]">Brief will be assembled from your campaign and brand data.</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-[#F4F4F5] rounded-xl border border-[#E4E4E7] bg-white px-4">
      {rows.map((r) => (
        <MetaRow key={r.label} label={r.label} value={r.value} />
      ))}
    </div>
  );
}

// --- Campaign Plan section ---

interface PlanSectionProps {
  campaignId: string;
  workspaceId: string;
  canPlan: boolean;
  brief: CampaignBrief | null;
  onCampaignUpdate: () => void;
  onHasPlanChange: (hasPlan: boolean) => void;
}

function PlanSection({ campaignId, workspaceId, canPlan, brief, onCampaignUpdate, onHasPlanChange }: PlanSectionProps) {
  const [planStatus, setPlanStatus] = useState<{ aiConfigured: boolean; hasPlan: boolean } | null>(null);
  const [plan, setPlan] = useState<CampaignPlan | null>(null);
  const [generating, setGenerating] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [approving, setApproving] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [planError, setPlanError] = useState('');
  const [loadingPlan, setLoadingPlan] = useState(true);

  const loadStatus = useCallback(() => {
    api.getCampaignPlanStatus(campaignId, workspaceId)
      .then((s) => {
        setPlanStatus(s);
        onHasPlanChange(s.hasPlan);
        if (s.hasPlan) {
          return api.getCampaignPlan(campaignId, workspaceId).then(setPlan);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingPlan(false));
  }, [campaignId, workspaceId, onHasPlanChange]);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  async function generate() {
    setGenerating(true);
    setPlanError('');
    try {
      const created = await api.generateCampaignPlan(campaignId, workspaceId);
      setPlan(created);
      setPlanStatus((s) => s ? { ...s, hasPlan: true } : s);
      onHasPlanChange(true);
      setShowReview(true);
      onCampaignUpdate();
    } catch (err) {
      setPlanError(err instanceof Error ? err.message : 'Failed to generate plan');
    } finally {
      setGenerating(false);
    }
  }

  async function approve(planId: string) {
    setApproving(true);
    try {
      await api.approveCampaignPlan(campaignId, workspaceId, planId);
      setShowReview(false);
      onCampaignUpdate();
    } catch (err) {
      setPlanError(err instanceof Error ? err.message : 'Failed to approve plan');
    } finally {
      setApproving(false);
    }
  }

  async function requestChanges(requestText: string) {
    setRequesting(true);
    try {
      const revised = await api.requestPlanRevision(campaignId, workspaceId, requestText);
      setPlan(revised);
      onCampaignUpdate();
    } catch (err) {
      setPlanError(err instanceof Error ? err.message : 'Failed to submit revision');
    } finally {
      setRequesting(false);
    }
  }

  if (loadingPlan) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-[#71717A]">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Loading plan…
      </div>
    );
  }

  const briefComplete = brief?.completenessStatus === 'COMPLETE';
  const aiOk = planStatus?.aiConfigured ?? false;

  return (
    <>
      {planError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {planError}
        </div>
      )}

      {plan ? (
        <div className="rounded-xl border border-[#E4E4E7] bg-white p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-[#09090B]">
                {plan.strategy.campaignAngle}
              </p>
              <p className="mt-0.5 text-xs text-[#71717A]">
                {plan.strategy.coreMessage}
              </p>
              <p className="mt-2 text-xs text-[#A1A1AA]">
                Version {plan.version} · {plan.channels.length} channel{plan.channels.length !== 1 ? 's' : ''} · {plan.contentMix.reduce((n, c) => n + c.quantity, 0)} pieces
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowReview(true)}
              className="shrink-0 rounded-lg border border-[#E4E4E7] px-3 py-1.5 text-sm font-medium text-[#09090B] hover:bg-[#FAFAFA]"
            >
              Review Plan
            </button>
          </div>
        </div>
      ) : canPlan ? (
        <div className="rounded-xl border border-dashed border-[#E4E4E7] px-4 py-6">
          <div className="flex flex-col items-center gap-3 text-center">
            <Sparkles className="h-6 w-6 text-[#A1A1AA]" />
            <div>
              <p className="text-sm font-medium text-[#09090B]">No campaign plan yet</p>
              {!aiOk ? (
                <p className="mt-1 text-xs text-[#71717A]">
                  AI provider is not configured. Set{' '}
                  <code className="rounded bg-[#F4F4F5] px-1 py-0.5 font-mono text-[10px]">
                    AI_PROVIDER
                  </code>{' '}
                  and the corresponding API key in your{' '}
                  <code className="rounded bg-[#F4F4F5] px-1 py-0.5 font-mono text-[10px]">
                    .env
                  </code>{' '}
                  file.
                </p>
              ) : !briefComplete ? (
                <p className="mt-1 text-xs text-[#71717A]">
                  Complete the missing brief details above to get the best plan, or generate now.
                </p>
              ) : (
                <p className="mt-1 text-xs text-[#71717A]">
                  Ready to generate a structured campaign plan.
                </p>
              )}
            </div>
            {aiOk && (
              <button
                type="button"
                disabled={generating}
                onClick={() => void generate()}
                className="flex items-center gap-1.5 rounded-lg bg-[#09090B] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#18181B] disabled:opacity-50"
              >
                {generating ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Generating…
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3.5 w-3.5" />
                    Create Campaign Plan
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      ) : null}

      {showReview && plan && (
        <PlanReviewDrawer
          plan={plan}
          onClose={() => setShowReview(false)}
          onApprove={approve}
          onRequestChanges={requestChanges}
          approving={approving}
          requesting={requesting}
          locked={plan.status === 'APPROVED'}
        />
      )}
    </>
  );
}

// --- SOP step derivation ---

function deriveSopSteps(
  campaign: Campaign,
  hasPlan: boolean,
  contentPlanStatus: ContentPlanStatus | null,
): { label: string; done: boolean }[] {
  const s = campaign.status as CampaignStatus;
  const past = (statuses: CampaignStatus[]) => statuses.includes(s);

  const strategyApproved = past(['APPROVED', 'SCHEDULED', 'PUBLISHED', 'MEASURING', 'COMPLETE']);
  const contentCreated = contentPlanStatus !== null;
  const contentReviewed = contentCreated && contentPlanStatus !== 'GENERATING';
  const contentApproved = contentPlanStatus === 'APPROVED';

  return [
    { label: 'Campaign created', done: true },
    { label: 'Objective confirmed', done: Boolean(campaign.objectiveId) },
    { label: 'Campaign brief ready', done: !past(['DRAFTING']) || hasPlan },
    { label: 'Campaign strategy created', done: hasPlan },
    { label: 'Campaign strategy approved', done: strategyApproved },
    { label: 'Content plan created', done: contentCreated },
    { label: 'Content plan reviewed', done: contentReviewed },
    { label: 'Content plan approved', done: contentApproved },
  ];
}

// --- Main page ---

export default function CampaignDetailPage({ campaignId }: Props) {
  const { setActiveTab } = useApp();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<DetailTab>('overview');
  const [brief, setBrief] = useState<CampaignBrief | null>(null);
  const [briefLoading, setBriefLoading] = useState(false);
  const [hasPlan, setHasPlan] = useState(false);
  const [contentPlanStatus, setContentPlanStatus] = useState<ContentPlanStatus | null>(null);

  function loadCampaign() {
    if (!campaignId) return;
    setLoading(true);
    setError('');
    api.getCampaign(campaignId)
      .then(setCampaign)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }

  function loadBrief(workspaceId: string) {
    setBriefLoading(true);
    api.getCampaignBrief(campaignId!, workspaceId)
      .then(setBrief)
      .catch(() => {})
      .finally(() => setBriefLoading(false));
  }

  useEffect(() => { loadCampaign(); }, [campaignId]);

  useEffect(() => {
    if (!campaignId || !campaign) return;
    api.getContentPlanStatus(campaign.id, campaign.workspaceId)
      .then((s) => setContentPlanStatus((s.contentPlanStatus as ContentPlanStatus | null) ?? null))
      .catch(() => {});
  }, [campaignId, campaign?.id, campaign?.workspaceId]);

  useEffect(() => {
    if (tab === 'overview' && campaignId && campaign) {
      loadBrief(campaign.workspaceId);
    }
  }, [tab, campaignId, campaign?.workspaceId]);

  if (!campaignId) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-[#71717A]">
        No campaign selected.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-[#71717A]">
        Loading…
      </div>
    );
  }

  if (error || !campaign) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-red-500">
        {error || 'Campaign not found.'}
      </div>
    );
  }

  const sourceLabel = SOURCE_LABELS[campaign.sourceType] ?? campaign.sourceType;
  const statusLabel = STATUS_LABELS[campaign.status] ?? campaign.status;
  const canPlan = PLANNABLE.has(campaign.status as CampaignStatus) || campaign.status === 'APPROVED';

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-start justify-between border-b border-[#E4E4E7] bg-white px-6 py-4">
        <div className="flex items-start gap-3">
          <button
            type="button"
            aria-label="Back to campaigns"
            onClick={() => setActiveTab('campaigns')}
            className="mt-0.5 rounded-lg p-1.5 text-[#71717A] hover:bg-[#FAFAFA]"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-base font-semibold text-[#09090B]">{campaign.name}</h1>
            <p className="mt-0.5 text-xs text-[#71717A]">
              {sourceLabel}
              {campaign.objectiveName ? ` · ${campaign.objectiveName}` : ''}
              {' · '}
              {statusLabel}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <SopDrawerTrigger
            context={`Campaign: ${campaign.name}`}
            steps={deriveSopSteps(campaign, hasPlan, contentPlanStatus)}
          />
          <OverflowMenu campaign={campaign} onCancelled={loadCampaign} />
        </div>
      </div>

      {/* Tabs */}
      <div className="shrink-0 border-b border-[#E4E4E7] bg-white px-6">
        <div className="flex">
          {(['overview', 'content', 'schedule', 'performance'] as DetailTab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`border-b-2 px-4 py-3 text-sm font-medium capitalize transition ${
                tab === t
                  ? 'border-[#09090B] text-[#09090B]'
                  : 'border-transparent text-[#71717A] hover:text-[#09090B]'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-6">
        {tab === 'overview' && (
          <div className="mx-auto max-w-xl space-y-6">
            {/* Objective */}
            <section>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-[#A1A1AA]">
                Objective
              </p>
              <div className="flex items-start gap-3 rounded-xl border border-[#E4E4E7] bg-white p-4">
                <Target className="mt-0.5 h-4 w-4 shrink-0 text-[#71717A]" />
                <div>
                  <p className="text-sm font-medium text-[#09090B]">
                    {campaign.objectiveName ?? '—'}
                  </p>
                  {campaign.objectivePrimaryKpi && (
                    <p className="mt-0.5 text-xs text-[#71717A]">
                      Primary KPI: {campaign.objectivePrimaryKpi}
                    </p>
                  )}
                </div>
              </div>
            </section>

            {/* What we're marketing */}
            <section>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-[#A1A1AA]">
                What we're marketing
              </p>
              <div className="divide-y divide-[#F4F4F5] rounded-xl border border-[#E4E4E7] bg-white px-4">
                <MetaRow label="Type" value={sourceLabel} />
                <MetaRow label="Source" value={campaign.sourceTitle} />
                {campaign.sourceDescription && (
                  <MetaRow label="Details" value={campaign.sourceDescription} />
                )}
                {campaign.channels.length > 0 && (
                  <MetaRow label="Channels" value={campaign.channels.join(', ')} />
                )}
              </div>
            </section>

            {/* Campaign brief */}
            <section>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-[#A1A1AA]">
                Campaign brief
              </p>
              {briefLoading ? (
                <div className="flex items-center gap-2 py-3 text-sm text-[#71717A]">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Assembling brief…
                </div>
              ) : brief ? (
                <div className="space-y-3">
                  <BriefCompletenessNotice brief={brief} workspaceId={campaign.workspaceId} onSaved={setBrief} />
                  <BriefSummary brief={brief} />
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-[#E4E4E7] px-4 py-3">
                  <p className="text-sm text-[#A1A1AA]">Brief could not be assembled.</p>
                </div>
              )}
            </section>

            {/* Campaign plan */}
            {canPlan && (
              <section>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-[#A1A1AA]">
                  Campaign plan
                </p>
                <PlanSection
                  campaignId={campaign.id}
                  workspaceId={campaign.workspaceId}
                  canPlan={canPlan}
                  brief={brief}
                  onCampaignUpdate={loadCampaign}
                  onHasPlanChange={setHasPlan}
                />
              </section>
            )}

            {/* Timestamps */}
            <section>
              <div className="divide-y divide-[#F4F4F5] rounded-xl border border-[#E4E4E7] bg-white px-4">
                <MetaRow label="Created" value={new Date(campaign.createdAt).toLocaleDateString()} />
                <MetaRow label="Updated" value={new Date(campaign.updatedAt).toLocaleDateString()} />
                {campaign.cancellationReason && (
                  <MetaRow label="Cancelled because" value={campaign.cancellationReason} />
                )}
              </div>
            </section>
          </div>
        )}

        {tab === 'content' && (
          <ContentPlanTab
            campaignId={campaign.id}
            workspaceId={campaign.workspaceId}
            onReviewStrategy={() => setTab('overview')}
            onStatusChange={setContentPlanStatus}
          />
        )}

        {tab === 'schedule' && (
          <EmptyTabState icon={CalendarDays} message="Not yet scheduled" />
        )}

        {tab === 'performance' && (
          <EmptyTabState icon={BarChart3} message="No performance data yet" />
        )}
      </div>
    </div>
  );
}

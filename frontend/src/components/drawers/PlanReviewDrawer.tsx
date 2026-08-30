import { Check, ChevronDown, ChevronUp, MessageSquare, X } from 'lucide-react';
import { useState } from 'react';
import type { CampaignPlan } from '../../types';

interface PlanReviewDrawerProps {
  plan: CampaignPlan;
  onClose: () => void;
  onApprove: (planId: string) => Promise<void>;
  onRequestChanges: (requestText: string) => Promise<void>;
  approving?: boolean;
  requesting?: boolean;
  locked?: boolean;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border-b border-[#F4F4F5] pb-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between py-3 text-left"
      >
        <span className="text-[11px] font-semibold uppercase tracking-widest text-[#A1A1AA]">
          {title}
        </span>
        {open ? (
          <ChevronUp className="h-3.5 w-3.5 text-[#A1A1AA]" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-[#A1A1AA]" />
        )}
      </button>
      {open && <div className="space-y-2">{children}</div>}
    </div>
  );
}

function PlanRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (!value) return null;
  return (
    <div className="flex gap-3">
      <span className="w-32 shrink-0 text-xs text-[#A1A1AA]">{label}</span>
      <span className="flex-1 text-sm text-[#09090B]">{value}</span>
    </div>
  );
}

export function PlanReviewDrawer({
  plan,
  onClose,
  onApprove,
  onRequestChanges,
  approving,
  requesting,
  locked,
}: PlanReviewDrawerProps) {
  const [mode, setMode] = useState<'review' | 'changes'>('review');
  const [changesText, setChangesText] = useState('');

  async function submitChanges() {
    if (!changesText.trim()) return;
    await onRequestChanges(changesText.trim());
    setChangesText('');
    setMode('review');
  }

  return (
    <>
      <button
        type="button"
        aria-label="Close"
        className="fixed inset-0 z-40 bg-black/20"
        onClick={onClose}
      />
      <div className="fixed right-0 top-0 z-50 flex h-full w-[600px] flex-col border-l border-[#E4E4E7] bg-white shadow-xl">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-[#E4E4E7] px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-[#09090B]">Campaign Plan</h2>
            <p className="text-xs text-[#71717A]">Version {plan.version}</p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="rounded-lg p-1.5 text-[#71717A] hover:bg-[#FAFAFA]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5">
          <Section title="Strategy">
            <PlanRow label="Angle" value={plan.strategy.campaignAngle} />
            <PlanRow label="Core message" value={plan.strategy.coreMessage} />
            <PlanRow label="Proposition" value={plan.strategy.proposition} />
            <PlanRow label="Audience focus" value={plan.strategy.audienceFocus} />
          </Section>

          <Section title="Hooks">
            <p className="text-sm font-medium text-[#09090B]">{plan.hooks.primary}</p>
            {plan.hooks.supporting.length > 0 && (
              <ul className="mt-1 space-y-1">
                {plan.hooks.supporting.map((h, i) => (
                  <li key={i} className="text-sm text-[#71717A]">
                    — {h}
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Call to Action">
            <p className="text-sm font-medium text-[#09090B]">{plan.callToAction.primary}</p>
            {plan.callToAction.alternatives.length > 0 && (
              <ul className="mt-1 space-y-1">
                {plan.callToAction.alternatives.map((a, i) => (
                  <li key={i} className="text-sm text-[#71717A]">
                    — {a}
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {plan.proofPoints.length > 0 && (
            <Section title="Proof Points">
              <ul className="space-y-1">
                {plan.proofPoints.map((p, i) => (
                  <li key={i} className="text-sm text-[#71717A]">
                    · {p}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {plan.channels.length > 0 && (
            <Section title="Channels">
              <div className="space-y-3">
                {plan.channels.map((ch, i) => (
                  <div key={i}>
                    <p className="text-sm font-medium capitalize text-[#09090B]">
                      {ch.channel}{' '}
                      <span className="text-xs font-normal text-[#71717A]">· {ch.role}</span>
                    </p>
                    <p className="text-xs text-[#71717A]">{ch.rationale}</p>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {plan.contentMix.length > 0 && (
            <Section title="Content Mix">
              <div className="space-y-2">
                {plan.contentMix.map((c, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="mt-0.5 rounded bg-[#F4F4F5] px-1.5 py-0.5 text-[10px] font-medium text-[#71717A]">
                      {c.quantity}×
                    </span>
                    <div>
                      <p className="text-sm text-[#09090B]">
                        {c.contentType} · {c.channel} · {c.format}
                      </p>
                      <p className="text-xs text-[#71717A]">{c.purpose}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          <Section title="Cadence">
            <p className="text-sm text-[#09090B]">{plan.cadence.summary}</p>
            {plan.cadence.duration && (
              <p className="text-xs text-[#71717A]">{plan.cadence.duration}</p>
            )}
          </Section>

          <Section title="Creative Direction">
            <PlanRow label="Visual" value={plan.creativeDirection.visualDirection} />
            <PlanRow label="Copy" value={plan.creativeDirection.copyDirection} />
            {plan.creativeDirection.photographyDirection && (
              <PlanRow label="Photography" value={plan.creativeDirection.photographyDirection} />
            )}
            {plan.creativeDirection.videoDirection && (
              <PlanRow label="Video" value={plan.creativeDirection.videoDirection} />
            )}
          </Section>

          <Section title="Measurement">
            <PlanRow label="Primary KPI" value={plan.measurement.primaryKpi} />
            {plan.measurement.supportingKpis.length > 0 && (
              <PlanRow
                label="Supporting"
                value={plan.measurement.supportingKpis.join(', ')}
              />
            )}
            {plan.measurement.conversionEvent && (
              <PlanRow label="Conversion event" value={plan.measurement.conversionEvent} />
            )}
          </Section>

          <Section title="Rationale">
            <p className="text-sm text-[#71717A]">{plan.rationale.summary}</p>
          </Section>

          {/* Spacer so footer doesn't overlap content */}
          <div className="h-6" />
        </div>

        {/* Footer */}
        {!locked && (
        <div className="shrink-0 border-t border-[#E4E4E7] bg-white px-5 py-4">
          {mode === 'review' ? (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setMode('changes')}
                className="flex items-center gap-1.5 rounded-lg border border-[#E4E4E7] px-4 py-2 text-sm font-medium text-[#71717A] transition hover:bg-[#FAFAFA] hover:text-[#09090B]"
              >
                <MessageSquare className="h-3.5 w-3.5" />
                Request Changes
              </button>
              <button
                type="button"
                disabled={approving}
                onClick={() => void onApprove(plan.id)}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#09090B] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#18181B] disabled:opacity-50"
              >
                <Check className="h-3.5 w-3.5" />
                {approving ? 'Approving…' : 'Approve Plan'}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs font-medium text-[#09090B]">
                What would you like changed?
              </p>
              <textarea
                autoFocus
                value={changesText}
                onChange={(e) => setChangesText(e.target.value)}
                placeholder="Describe the specific changes you'd like — e.g. 'Focus more on email, reduce social content' or 'Adjust the hook to emphasise urgency'"
                rows={4}
                className="w-full rounded-lg border border-[#E4E4E7] px-3 py-2 text-sm outline-none focus:border-[#A1A1AA] resize-none"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { setMode('review'); setChangesText(''); }}
                  className="rounded-lg border border-[#E4E4E7] px-4 py-2 text-sm font-medium text-[#71717A] hover:bg-[#FAFAFA]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!changesText.trim() || requesting}
                  onClick={() => void submitChanges()}
                  className="flex-1 rounded-lg bg-[#09090B] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#18181B] disabled:opacity-50"
                >
                  {requesting ? 'Submitting…' : 'Submit Changes'}
                </button>
              </div>
            </div>
          )}
        </div>
        )}
      </div>
    </>
  );
}

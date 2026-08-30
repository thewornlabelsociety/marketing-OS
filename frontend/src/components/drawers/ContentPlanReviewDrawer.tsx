import { Check, ChevronDown, ChevronUp, MessageSquare, X } from 'lucide-react';
import { useState } from 'react';
import type { ContentPlan } from '../../types';

interface Props {
  plan: ContentPlan;
  onClose: () => void;
  onApprove: (contentPlanId: string) => Promise<void>;
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

export function ContentPlanReviewDrawer({
  plan,
  onClose,
  onApprove,
  onRequestChanges,
  approving,
  requesting,
  locked,
}: Props) {
  const [mode, setMode] = useState<'review' | 'changes'>('review');
  const [changesText, setChangesText] = useState('');

  async function submitChanges() {
    if (!changesText.trim()) return;
    await onRequestChanges(changesText.trim());
    setChangesText('');
    setMode('review');
  }

  const conceptName = (id?: string) =>
    plan.concepts.find((c) => c.id === id || c.contentKey === id)?.name ?? id;

  return (
    <>
      <button type="button" aria-label="Close" className="fixed inset-0 z-40 bg-black/20" onClick={onClose} />
      <div className="fixed right-0 top-0 z-50 flex h-full w-[680px] flex-col border-l border-[#E4E4E7] bg-white shadow-xl">
        <div className="flex shrink-0 items-center justify-between border-b border-[#E4E4E7] px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-[#09090B]">Content Plan</h2>
            <p className="text-xs text-[#71717A]">
              Version {plan.version} · Strategy v{plan.sourcePlanVersion}
            </p>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="rounded-lg p-1.5 text-[#71717A] hover:bg-[#FAFAFA]">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5">
          <Section title="Strategy summary">
            <p className="text-sm text-[#09090B]">{plan.summary.campaignNarrative}</p>
            <p className="text-sm text-[#71717A]">{plan.summary.contentStrategy}</p>
            {plan.summary.customerJourney && (
              <p className="text-xs text-[#71717A]">{plan.summary.customerJourney}</p>
            )}
          </Section>

          {plan.cadence.phases.length > 0 && (
            <Section title="Sequence">
              <ol className="space-y-1.5">
                {plan.cadence.phases
                  .slice()
                  .sort((a, b) => a.order - b.order)
                  .map((phase) => (
                    <li key={phase.key} className="text-sm text-[#09090B]">
                      <span className="mr-2 font-mono text-[11px] text-[#A1A1AA]">
                        {String(phase.order).padStart(2, '0')}
                      </span>
                      {phase.name}
                      {phase.purpose ? <span className="text-[#71717A]"> — {phase.purpose}</span> : null}
                    </li>
                  ))}
              </ol>
            </Section>
          )}

          <Section title="Concepts">
            <div className="space-y-3">
              {plan.concepts.map((concept) => (
                <div key={concept.id}>
                  <p className="text-sm font-medium text-[#09090B]">{concept.name}</p>
                  <p className="text-xs text-[#71717A]">{concept.coreMessage}</p>
                  <p className="mt-0.5 text-[11px] text-[#A1A1AA]">{concept.strategicPurpose}</p>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Deliverables">
            <div className="divide-y divide-[#F4F4F5]">
              {plan.deliverables.map((d) => (
                <div key={d.id} className="py-3">
                  <p className="text-sm font-medium text-[#09090B]">{d.title}</p>
                  <p className="text-xs text-[#71717A]">
                    {d.channel} · {d.contentType.replaceAll('_', ' ')} · {d.format.replaceAll('_', ' ')}
                  </p>
                  <p className="mt-1 text-xs text-[#71717A]">{d.purpose}</p>
                  <p className="mt-1 text-[11px] text-[#A1A1AA]">
                    Objective: {d.objectiveRole}
                    {d.sourceConceptId ? ` · Concept: ${conceptName(d.sourceConceptId)}` : ''}
                    {d.adaptationOf ? ` · Adaptation of ${d.adaptationOf}` : ''}
                  </p>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Assets needed">
            <ul className="space-y-1">
              {plan.deliverables.flatMap((d) => d.assetRequirements).map((asset, i) => (
                <li key={`${asset.description}-${i}`} className="text-sm text-[#71717A]">
                  {asset.quantity ? `${asset.quantity} ` : ''}
                  {asset.description}
                  {!asset.required ? ' (optional)' : ''}
                </li>
              ))}
            </ul>
          </Section>
          <div className="h-6" />
        </div>

        {!locked && (
          <div className="shrink-0 border-t border-[#E4E4E7] bg-white px-5 py-4">
            {mode === 'review' ? (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setMode('changes')}
                  className="flex items-center gap-1.5 rounded-lg border border-[#E4E4E7] px-4 py-2 text-sm font-medium text-[#71717A] hover:bg-[#FAFAFA] hover:text-[#09090B]"
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                  Request Changes
                </button>
                <button
                  type="button"
                  disabled={approving}
                  onClick={() => void onApprove(plan.id)}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#09090B] px-4 py-2 text-sm font-medium text-white hover:bg-[#18181B] disabled:opacity-50"
                >
                  <Check className="h-3.5 w-3.5" />
                  {approving ? 'Approving…' : 'Approve'}
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs font-medium text-[#09090B]">What would you like changed?</p>
                <textarea
                  autoFocus
                  value={changesText}
                  onChange={(e) => setChangesText(e.target.value)}
                  placeholder="Describe the change in plain English — e.g. Drop TikTok and put more emphasis on email."
                  rows={4}
                  className="w-full resize-none rounded-lg border border-[#E4E4E7] px-3 py-2 text-sm outline-none focus:border-[#A1A1AA]"
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
                    className="flex-1 rounded-lg bg-[#09090B] px-4 py-2 text-sm font-medium text-white hover:bg-[#18181B] disabled:opacity-50"
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

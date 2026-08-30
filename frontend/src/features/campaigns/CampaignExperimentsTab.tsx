import { FlaskConical, Loader2, Plus, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../../services/api';
import type { CampaignCreativeSummary, ScheduledContentItem } from '../../types';
import type {
  Experiment,
  ExperimentAnalysis,
  ExperimentOutcome,
  ExperimentQualityResult,
  ExperimentVariableType,
} from '../../types/experiment';

interface Props {
  campaignId: string;
  workspaceId: string;
  objectivePrimaryKpi?: string;
}

const VARIABLE_OPTIONS: ExperimentVariableType[] = [
  'HOOK', 'HEADLINE', 'CTA', 'COPY', 'SUBJECT_LINE', 'THUMBNAIL', 'VISUAL_STYLE', 'CUSTOM',
];

const OUTCOME_LABELS: Record<ExperimentOutcome, string> = {
  VARIANT_A_WINS: 'A wins',
  VARIANT_B_WINS: 'B wins',
  VARIANT_WINNER: 'Variant wins',
  NO_MEANINGFUL_DIFFERENCE: 'No meaningful difference',
  INCONCLUSIVE: 'Inconclusive',
  INSUFFICIENT_DATA: 'Insufficient data',
  CANCELLED: 'Cancelled',
};

function outcomeLabel(exp: Experiment): string {
  if (exp.status === 'CANCELLED') return 'Cancelled';
  if (exp.outcome) return OUTCOME_LABELS[exp.outcome] ?? exp.outcome.replaceAll('_', ' ').toLowerCase();
  if (exp.status === 'RUNNING') return 'Measuring';
  if (exp.status === 'DRAFT' || exp.status === 'READY') return 'Design';
  return '—';
}

function SideDrawer({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <>
      <button type="button" aria-label="Close" className="fixed inset-0 z-40 bg-black/20" onClick={onClose} />
      <aside className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l border-[#E4E4E7] bg-white shadow-xl">
        <header className="flex items-center justify-between border-b border-[#E4E4E7] px-5 py-4">
          <p className="text-sm font-semibold text-[#09090B]">{title}</p>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-[#71717A] hover:bg-[#FAFAFA]">
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
      </aside>
    </>
  );
}

export function CampaignExperimentsTab({ campaignId, workspaceId, objectivePrimaryKpi }: Props) {
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [creative, setCreative] = useState<CampaignCreativeSummary | null>(null);
  const [schedules, setSchedules] = useState<ScheduledContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [selected, setSelected] = useState<Experiment | null>(null);
  const [analyses, setAnalyses] = useState<ExperimentAnalysis[]>([]);
  const [validation, setValidation] = useState<ExperimentQualityResult | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [form, setForm] = useState({
    name: '',
    hypothesis: '',
    variableType: 'HOOK' as ExperimentVariableType,
    controlDescription: '',
    variantDescription: '',
    controlKey: '',
    variantKey: '',
  });

  const approvedDeliverables = creative?.deliverables.filter((d) => d.isApproved && d.artifactId) ?? [];

  const load = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const [exps, cr, sched] = await Promise.all([
        api.getCampaignExperiments(campaignId, workspaceId),
        api.getCampaignCreative(campaignId, workspaceId),
        api.getCampaignSchedule(campaignId, workspaceId),
      ]);
      setExperiments(exps);
      setCreative(cr);
      setSchedules(sched.filter((s) => s.status === 'PUBLISHED'));
    } catch {
      setExperiments([]);
    } finally {
      setLoading(false);
    }
  }, [campaignId, workspaceId]);

  useEffect(() => { void load(); }, [load]);

  async function openDetail(exp: Experiment) {
    setSelected(exp);
    setValidation(null);
    setMessage('');
    try {
      const [detail, history, gate] = await Promise.all([
        api.getCampaignExperiment(campaignId, exp.id, workspaceId),
        api.getCampaignExperimentAnalyses(campaignId, exp.id, workspaceId),
        api.validateCampaignExperiment(campaignId, exp.id, workspaceId),
      ]);
      setSelected(detail);
      setAnalyses(history);
      setValidation(gate);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to load experiment');
    }
  }

  function scheduleFor(contentKey: string, artifactId: string, version: number) {
    return schedules.find(
      (s) => s.contentKey === contentKey && s.sourceCreativeArtifactId === artifactId && s.sourceCreativeVersion === version,
    )?.id;
  }

  async function handleCreate() {
    if (!form.name.trim() || !form.hypothesis.trim() || !form.controlKey || !form.variantKey) return;
    const control = approvedDeliverables.find((d) => d.contentKey === form.controlKey);
    const variant = approvedDeliverables.find((d) => d.contentKey === form.variantKey);
    if (!control?.artifactId || !variant?.artifactId) return;

    setCreating(true);
    setMessage('');
    try {
      const exp = await api.createCampaignExperiment(campaignId, workspaceId, {
        name: form.name.trim(),
        hypothesis: form.hypothesis.trim(),
        variableType: form.variableType,
        controlDescription: form.controlDescription.trim() || control.title,
        variantDescription: form.variantDescription.trim() || variant.title,
      });
      await api.addExperimentVariant(campaignId, exp.id, workspaceId, {
        label: 'A',
        role: 'CONTROL',
        contentKey: control.contentKey,
        creativeArtifactId: control.artifactId,
        creativeVersion: control.currentVersion ?? 1,
        channel: control.channel,
        scheduleId: scheduleFor(control.contentKey, control.artifactId, control.currentVersion ?? 1),
      });
      await api.addExperimentVariant(campaignId, exp.id, workspaceId, {
        label: 'B',
        role: 'VARIANT',
        contentKey: variant.contentKey,
        creativeArtifactId: variant.artifactId,
        creativeVersion: variant.currentVersion ?? 1,
        channel: variant.channel,
        scheduleId: scheduleFor(variant.contentKey, variant.artifactId, variant.currentVersion ?? 1),
      });
      setShowCreate(false);
      setForm({ name: '', hypothesis: '', variableType: 'HOOK', controlDescription: '', variantDescription: '', controlKey: '', variantKey: '' });
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to create experiment');
    } finally {
      setCreating(false);
    }
  }

  async function runAction(action: 'start' | 'pause' | 'analyze' | 'complete' | 'cancel') {
    if (!selected) return;
    setActionLoading(true);
    setMessage('');
    try {
      if (action === 'start') await api.startCampaignExperiment(campaignId, selected.id, workspaceId);
      if (action === 'pause') await api.pauseCampaignExperiment(campaignId, selected.id, workspaceId);
      if (action === 'analyze') await api.analyzeCampaignExperiment(campaignId, selected.id, workspaceId);
      if (action === 'complete') await api.completeCampaignExperiment(campaignId, selected.id, workspaceId);
      if (action === 'cancel') await api.cancelCampaignExperiment(campaignId, selected.id, workspaceId);
      await openDetail(selected);
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setActionLoading(false);
    }
  }

  const latestAnalysis = analyses[analyses.length - 1];

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-sm text-[#71717A]">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading experiments…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-[#A1A1AA]">Experiments</p>
          <p className="mt-1 text-sm text-[#71717A]">
            Controlled A/B tests tied to campaign objective{objectivePrimaryKpi ? ` · KPI: ${objectivePrimaryKpi}` : ''}
          </p>
        </div>
        <button
          type="button"
          disabled={approvedDeliverables.length < 2}
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#09090B] px-4 py-2 text-sm font-medium text-white hover:bg-[#18181B] disabled:opacity-40"
        >
          <Plus className="h-3.5 w-3.5" />
          Create Experiment
        </button>
      </div>

      {approvedDeliverables.length < 2 && (
        <p className="text-xs text-[#71717A]">Approve at least two creatives before running an experiment.</p>
      )}

      {message && !selected && !showCreate && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{message}</div>
      )}

      {experiments.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-[#E4E4E7] py-16 text-center">
          <FlaskConical className="h-8 w-8 text-[#A1A1AA]" />
          <p className="text-sm font-medium text-[#09090B]">No experiments yet</p>
          <p className="max-w-sm text-xs text-[#71717A]">Test one variable at a time against the campaign objective. Inconclusive results are valid.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[#E4E4E7]">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-[#E4E4E7] bg-[#FAFAFA] text-[11px] font-semibold uppercase tracking-wide text-[#71717A]">
              <tr>
                <th className="px-4 py-2.5">Experiment</th>
                <th className="px-4 py-2.5">Variable</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">Variants</th>
                <th className="px-4 py-2.5">KPI</th>
                <th className="px-4 py-2.5">Outcome</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F4F4F5]">
              {experiments.map((exp) => (
                <tr key={exp.id} className="cursor-pointer hover:bg-[#FAFAFA]" onClick={() => void openDetail(exp)}>
                  <td className="px-4 py-3 font-medium text-[#09090B]">{exp.name}</td>
                  <td className="px-4 py-3 text-[#71717A]">{exp.variableType.replaceAll('_', ' ')}</td>
                  <td className="px-4 py-3 text-[#71717A]">{exp.status.replaceAll('_', ' ')}</td>
                  <td className="px-4 py-3 text-[#71717A]">A vs B</td>
                  <td className="px-4 py-3 text-[#71717A]">{exp.experimentKpi ?? exp.primaryKpi}</td>
                  <td className="px-4 py-3 text-[#71717A]">{outcomeLabel(exp)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <SideDrawer title="Create experiment" onClose={() => setShowCreate(false)}>
          <div className="space-y-4">
            <label className="block">
              <span className="text-xs font-medium text-[#71717A]">Name</span>
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-[#E4E4E7] px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-[#71717A]">Hypothesis</span>
              <textarea
                value={form.hypothesis}
                onChange={(e) => setForm((f) => ({ ...f, hypothesis: e.target.value }))}
                rows={3}
                className="mt-1 w-full rounded-lg border border-[#E4E4E7] px-3 py-2 text-sm"
                placeholder="If we change X, then Y, because Z, measured by KPI"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-[#71717A]">Variable</span>
              <select
                value={form.variableType}
                onChange={(e) => setForm((f) => ({ ...f, variableType: e.target.value as ExperimentVariableType }))}
                className="mt-1 w-full rounded-lg border border-[#E4E4E7] px-3 py-2 text-sm"
              >
                {VARIABLE_OPTIONS.map((v) => (
                  <option key={v} value={v}>{v.replaceAll('_', ' ')}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-[#71717A]">Control (A)</span>
              <select
                value={form.controlKey}
                onChange={(e) => setForm((f) => ({ ...f, controlKey: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-[#E4E4E7] px-3 py-2 text-sm"
              >
                <option value="">Select approved creative</option>
                {approvedDeliverables.map((d) => (
                  <option key={d.contentKey} value={d.contentKey}>{d.title} · V{d.currentVersion}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-[#71717A]">Variant (B)</span>
              <select
                value={form.variantKey}
                onChange={(e) => setForm((f) => ({ ...f, variantKey: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-[#E4E4E7] px-3 py-2 text-sm"
              >
                <option value="">Select approved creative</option>
                {approvedDeliverables.map((d) => (
                  <option key={`${d.contentKey}-b`} value={d.contentKey}>{d.title} · V{d.currentVersion}</option>
                ))}
              </select>
            </label>
            {message && <p className="text-xs text-red-600">{message}</p>}
            <button
              type="button"
              disabled={creating}
              onClick={() => void handleCreate()}
              className="w-full rounded-lg bg-[#09090B] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#18181B] disabled:opacity-50"
            >
              {creating ? 'Creating…' : 'Create experiment'}
            </button>
          </div>
        </SideDrawer>
      )}

      {selected && (
        <SideDrawer title={selected.name} onClose={() => { setSelected(null); setAnalyses([]); setValidation(null); }}>
          <div className="space-y-5">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-[#A1A1AA]">Hypothesis</p>
              <p className="mt-1 text-sm text-[#09090B]">{selected.hypothesis}</p>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-widest text-[#A1A1AA]">Variable</p>
                <p className="mt-1 text-[#09090B]">{selected.variableType.replaceAll('_', ' ')}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-widest text-[#A1A1AA]">Primary KPI</p>
                <p className="mt-1 text-[#09090B]">{selected.experimentKpi ?? selected.primaryKpi}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-widest text-[#A1A1AA]">Mode</p>
                <p className="mt-1 text-[#09090B]">{selected.mode.replaceAll('_', ' ').toLowerCase()}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-widest text-[#A1A1AA]">Status</p>
                <p className="mt-1 text-[#09090B]">{selected.status.replaceAll('_', ' ')}</p>
              </div>
            </div>

            {validation && validation.findings.length > 0 && (
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-[#A1A1AA]">Quality checks</p>
                <ul className="space-y-1 text-xs text-[#71717A]">
                  {validation.findings.map((f, i) => (
                    <li key={i} className={f.severity === 'ERROR' ? 'text-red-700' : undefined}>• {f.message}</li>
                  ))}
                </ul>
              </div>
            )}

            {latestAnalysis && (
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-[#A1A1AA]">Latest evidence</p>
                <p className="text-sm font-medium text-[#09090B]">{OUTCOME_LABELS[latestAnalysis.outcome]}</p>
                <p className="mt-1 text-xs text-[#71717A]">Confidence: {latestAnalysis.confidence} · {latestAnalysis.measurementWindow.replaceAll('_', ' ').toLowerCase()}</p>
                {latestAnalysis.campaignObjectiveImpact && (
                  <p className="mt-2 text-xs text-amber-800">{latestAnalysis.campaignObjectiveImpact}</p>
                )}
                <div className="mt-3 divide-y divide-[#F4F4F5] rounded-lg border border-[#E4E4E7]">
                  {latestAnalysis.variantResults.map((v) => (
                    <div key={v.variantId} className="flex items-center justify-between px-3 py-2 text-sm">
                      <span className="font-medium">{v.label}</span>
                      <span className="text-[#71717A]">
                        {v.primaryKpiValue ?? '—'} {latestAnalysis.primaryKpi}
                      </span>
                    </div>
                  ))}
                </div>
                {latestAnalysis.reasons.length > 0 && (
                  <ul className="mt-2 space-y-1 text-xs text-[#71717A]">
                    {latestAnalysis.reasons.map((r, i) => <li key={i}>• {r}</li>)}
                  </ul>
                )}
              </div>
            )}

            {analyses.length > 1 && (
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-[#A1A1AA]">Analysis history</p>
                <div className="space-y-1 text-xs text-[#71717A]">
                  {analyses.map((a) => (
                    <div key={a.id} className="flex justify-between gap-2">
                      <span>{a.measurementWindow.replaceAll('_', ' ')}</span>
                      <span>{OUTCOME_LABELS[a.outcome]}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {message && <p className="text-xs text-red-600">{message}</p>}

            <div className="flex flex-wrap gap-2 pt-2">
              {selected.status === 'DRAFT' && validation?.valid && (
                <button type="button" disabled={actionLoading} onClick={() => void runAction('start')} className="rounded-lg bg-[#09090B] px-3 py-2 text-xs font-medium text-white">
                  Start
                </button>
              )}
              {selected.status === 'RUNNING' && (
                <>
                  <button type="button" disabled={actionLoading} onClick={() => void runAction('analyze')} className="rounded-lg border border-[#E4E4E7] px-3 py-2 text-xs font-medium">
                    Analyze
                  </button>
                  <button type="button" disabled={actionLoading} onClick={() => void runAction('complete')} className="rounded-lg bg-[#09090B] px-3 py-2 text-xs font-medium text-white">
                    Complete
                  </button>
                  <button type="button" disabled={actionLoading} onClick={() => void runAction('pause')} className="rounded-lg border border-[#E4E4E7] px-3 py-2 text-xs font-medium">
                    Pause
                  </button>
                </>
              )}
              {selected.status === 'PAUSED' && (
                <button type="button" disabled={actionLoading} onClick={() => void runAction('start')} className="rounded-lg bg-[#09090B] px-3 py-2 text-xs font-medium text-white">
                  Resume
                </button>
              )}
              {!['COMPLETED', 'CANCELLED'].includes(selected.status) && (
                <button type="button" disabled={actionLoading} onClick={() => void runAction('cancel')} className="rounded-lg border border-[#E4E4E7] px-3 py-2 text-xs font-medium text-[#71717A]">
                  Cancel
                </button>
              )}
            </div>
          </div>
        </SideDrawer>
      )}
    </div>
  );
}

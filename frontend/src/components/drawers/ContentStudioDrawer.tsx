import { Check, ChevronDown, ChevronUp, Image, Loader2, MessageSquare, Sparkles, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CreativeContentEditor } from '../../features/studio/CreativeContentEditor';
import { CreativeContentView } from '../../features/studio/CreativeContentView';
import { CreativeStudioDrawer } from './CreativeStudioDrawer';
import { api } from '../../services/api';
import type { CreativeArtifact, CreativeArtifactStatus, CreativeContent } from '../../types';

interface Props {
  campaignId: string;
  workspaceId: string;
  contentKey: string;
  aiConfigured: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

const STATUS_LABEL: Record<CreativeArtifactStatus, string> = {
  GENERATING: 'Generating',
  READY_FOR_REVIEW: 'Ready for review',
  CHANGES_REQUESTED: 'Changes requested',
  REVISING: 'Revising',
  READY_FOR_APPROVAL: 'Ready for approval',
  APPROVED: 'Approved',
};

const STATUS_COLOR: Record<CreativeArtifactStatus, string> = {
  GENERATING: 'bg-[#F4F4F5] text-[#71717A]',
  READY_FOR_REVIEW: 'bg-amber-100 text-amber-800',
  CHANGES_REQUESTED: 'bg-red-100 text-red-700',
  REVISING: 'bg-[#F4F4F5] text-[#71717A]',
  READY_FOR_APPROVAL: 'bg-blue-100 text-blue-700',
  APPROVED: 'bg-green-100 text-green-700',
};

export function ContentStudioDrawer({ campaignId, workspaceId, contentKey, aiConfigured, onClose, onSaved }: Props) {
  const [artifact, setArtifact] = useState<CreativeArtifact | null>(null);
  const [versions, setVersions] = useState<CreativeArtifact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Editing state
  const [draft, setDraft] = useState<CreativeContent | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');

  // AI actions
  const [showRevise, setShowRevise] = useState(false);
  const [reviseText, setReviseText] = useState('');
  const [revising, setRevising] = useState(false);
  const [generating, setGenerating] = useState(false);

  // Approval actions
  const [approving, setApproving] = useState(false);
  const [showRequestChanges, setShowRequestChanges] = useState(false);
  const [changesText, setChangesText] = useState('');
  const [requesting, setRequesting] = useState(false);

  // History
  const [showHistory, setShowHistory] = useState(false);

  // Creative Studio
  const [showCreativeStudio, setShowCreativeStudio] = useState(false);

  // Unsaved changes guard
  const dirtyRef = useRef(isDirty);
  dirtyRef.current = isDirty;

  const loadArtifact = useCallback(async () => {
    try {
      const [art, vers] = await Promise.all([
        api.getCreative(campaignId, contentKey, workspaceId),
        api.getCreativeVersions(campaignId, contentKey, workspaceId),
      ]);
      setArtifact(art);
      setDraft(art.content);
      setVersions(vers);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load creative');
    } finally {
      setLoading(false);
    }
  }, [campaignId, contentKey, workspaceId]);

  useEffect(() => { void loadArtifact(); }, [loadArtifact]);

  function handleContentChange(c: CreativeContent) {
    setDraft(c);
    setIsDirty(true);
    setSaveError('');
  }

  async function save() {
    if (!draft || !isDirty) return;
    setSaving(true);
    setSaveError('');
    try {
      const updated = await api.patchCreative(campaignId, contentKey, workspaceId, draft);
      setArtifact(updated);
      setDraft(updated.content);
      setIsDirty(false);
      setSavedAt(new Date());
      onSaved?.();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function generate() {
    if (dirtyRef.current) {
      if (!window.confirm('You have unsaved changes. Generating new content will discard them. Continue?')) return;
    }
    setGenerating(true);
    setError('');
    try {
      const updated = await api.generateCreative(campaignId, contentKey, workspaceId);
      setArtifact(updated);
      setDraft(updated.content);
      setIsDirty(false);
      setSavedAt(null);
      const vers = await api.getCreativeVersions(campaignId, contentKey, workspaceId);
      setVersions(vers);
      onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setGenerating(false);
    }
  }

  async function revise() {
    if (!reviseText.trim()) return;
    if (dirtyRef.current) {
      if (!window.confirm('You have unsaved changes. Requesting an AI revision will discard them. Continue?')) return;
    }
    setRevising(true);
    setError('');
    try {
      const updated = await api.requestCreativeRevision(campaignId, contentKey, workspaceId, reviseText.trim());
      setArtifact(updated);
      setDraft(updated.content);
      setIsDirty(false);
      setSavedAt(null);
      setReviseText('');
      setShowRevise(false);
      const vers = await api.getCreativeVersions(campaignId, contentKey, workspaceId);
      setVersions(vers);
      onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Revision failed');
    } finally {
      setRevising(false);
    }
  }

  async function approve() {
    if (!artifact) return;
    if (isDirty) {
      if (!window.confirm('You have unsaved changes. Save before approving?')) return;
      await save();
    }
    setApproving(true);
    setError('');
    try {
      await api.approveCreative(campaignId, contentKey, workspaceId, artifact.id);
      const updated = await api.getCreative(campaignId, contentKey, workspaceId);
      setArtifact(updated);
      setDraft(updated.content);
      onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Approval failed');
    } finally {
      setApproving(false);
    }
  }

  async function requestChanges() {
    if (!changesText.trim()) return;
    setRequesting(true);
    setError('');
    try {
      const updated = await api.requestCreativeRevision(campaignId, contentKey, workspaceId, changesText.trim());
      setArtifact(updated);
      setDraft(updated.content);
      setIsDirty(false);
      setSavedAt(null);
      setChangesText('');
      setShowRequestChanges(false);
      const vers = await api.getCreativeVersions(campaignId, contentKey, workspaceId);
      setVersions(vers);
      onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setRequesting(false);
    }
  }

  async function restoreVersion(v: CreativeArtifact) {
    if (dirtyRef.current) {
      if (!window.confirm('You have unsaved changes. Restoring a version will discard them. Continue?')) return;
    }
    setDraft(v.content);
    setIsDirty(true);
    setShowHistory(false);
  }

  function handleClose() {
    if (dirtyRef.current) {
      if (!window.confirm('You have unsaved changes. Close without saving?')) return;
    }
    onClose();
  }

  const isLocked = artifact?.status === 'APPROVED';

  return (
    <>
      <button type="button" aria-label="Close" className="fixed inset-0 z-40 bg-black/20" onClick={handleClose} />
      <div className="fixed right-0 top-0 z-50 flex h-full w-[760px] flex-col border-l border-[#E4E4E7] bg-white shadow-xl">

        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-[#E4E4E7] px-5 py-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-sm font-semibold text-[#09090B]">
                {artifact?.title ?? contentKey}
              </h2>
              {artifact && (
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_COLOR[artifact.status]}`}>
                  {STATUS_LABEL[artifact.status]}
                </span>
              )}
            </div>
            {artifact && (
              <p className="text-xs text-[#71717A]">
                {artifact.channel} · {artifact.contentType} · {artifact.format.replaceAll('_', ' ').toLowerCase()} · V{artifact.version}
              </p>
            )}
          </div>
          <div className="ml-3 flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => setMode(m => m === 'edit' ? 'preview' : 'edit')}
              className="rounded-md border border-[#E4E4E7] px-3 py-1.5 text-xs text-[#09090B] hover:bg-[#FAFAFA]"
            >
              {mode === 'edit' ? 'Preview' : 'Edit'}
            </button>
            <button type="button" aria-label="Close" onClick={handleClose} className="rounded-lg p-1.5 text-[#71717A] hover:bg-[#FAFAFA]">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex flex-1 items-center justify-center gap-2 text-sm text-[#71717A]">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : error && !artifact ? (
          <div className="flex flex-1 items-center justify-center p-8 text-sm text-red-600">{error}</div>
        ) : artifact && draft ? (
          <div className="flex flex-1 min-h-0">

            {/* Main editing area */}
            <div className="flex flex-1 flex-col min-w-0 border-r border-[#F4F4F5]">
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                {error && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
                )}
                {saveError && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{saveError}</div>
                )}
                {isLocked && mode === 'edit' && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    This creative is approved. Editing will require re-review.
                  </div>
                )}
                {artifact.quality.warnings.length > 0 && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    {artifact.quality.warnings.join(' · ')}
                  </div>
                )}

                {mode === 'preview' ? (
                  <CreativeContentView content={draft} />
                ) : (
                  <CreativeContentEditor content={draft} onChange={handleContentChange} />
                )}

                {/* Version history (collapsible) */}
                {versions.length > 1 && (
                  <div className="border-t border-[#F4F4F5] pt-4">
                    <button
                      type="button"
                      onClick={() => setShowHistory(h => !h)}
                      className="flex w-full items-center justify-between text-[11px] font-medium uppercase tracking-wide text-[#A1A1AA] hover:text-[#71717A]"
                    >
                      Version history ({versions.length})
                      {showHistory ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    </button>
                    {showHistory && (
                      <div className="mt-3 space-y-2">
                        {versions.map(v => (
                          <div key={v.id} className="flex items-center justify-between rounded-lg border border-[#F4F4F5] px-3 py-2">
                            <div>
                              <p className="text-xs font-medium text-[#09090B]">V{v.version}</p>
                              <p className="text-[11px] text-[#A1A1AA]">
                                {new Date(v.createdAt).toLocaleDateString()} · {STATUS_LABEL[v.status]}
                              </p>
                            </div>
                            {!v.isCurrent && (
                              <button
                                type="button"
                                onClick={() => void restoreVersion(v)}
                                className="rounded-md border border-[#E4E4E7] px-2.5 py-1 text-[11px] text-[#09090B] hover:bg-[#FAFAFA]"
                              >
                                Restore
                              </button>
                            )}
                            {v.isCurrent && (
                              <span className="text-[11px] text-[#A1A1AA]">Current</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Save bar */}
              <div className="shrink-0 border-t border-[#E4E4E7] px-5 py-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={!isDirty || saving}
                    onClick={() => void save()}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#09090B] px-4 py-2 text-sm font-medium text-white hover:bg-[#18181B] disabled:opacity-40"
                  >
                    {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                  {savedAt && !isDirty && (
                    <span className="text-xs text-[#A1A1AA]">Saved {savedAt.toLocaleTimeString()}</span>
                  )}
                  {isDirty && !saving && (
                    <span className="text-xs text-amber-600">Unsaved changes</span>
                  )}
                </div>
              </div>
            </div>

            {/* Sidebar: context + AI + approval */}
            <div className="flex w-56 shrink-0 flex-col overflow-y-auto px-4 py-4 space-y-5">

              {/* Context */}
              <section>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#A1A1AA]">Context</p>
                <dl className="space-y-1.5 text-xs">
                  <div>
                    <dt className="text-[#A1A1AA]">Channel</dt>
                    <dd className="font-medium text-[#09090B]">{artifact.channel}</dd>
                  </div>
                  <div>
                    <dt className="text-[#A1A1AA]">Type</dt>
                    <dd className="font-medium text-[#09090B]">{artifact.contentType}</dd>
                  </div>
                  <div>
                    <dt className="text-[#A1A1AA]">Format</dt>
                    <dd className="font-medium text-[#09090B]">{artifact.format.replaceAll('_', ' ')}</dd>
                  </div>
                  <div>
                    <dt className="text-[#A1A1AA]">Version</dt>
                    <dd className="font-medium text-[#09090B]">V{artifact.version}</dd>
                  </div>
                </dl>
              </section>

              {/* Creative Studio link — for image-bearing content */}
              {artifact && ['STATIC_POST', 'CAROUSEL', 'STORY'].includes(artifact.content.kind) && (
                <section>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#A1A1AA]">Media</p>
                  <button
                    type="button"
                    onClick={() => setShowCreativeStudio(true)}
                    className="flex w-full items-center gap-1.5 rounded-md border border-[#E4E4E7] px-3 py-2 text-xs text-[#09090B] hover:bg-[#FAFAFA]"
                  >
                    <Image className="h-3.5 w-3.5 text-[#71717A]" />
                    {artifact.mediaAssetId ? 'Edit media' : 'Attach media'}
                  </button>
                </section>
              )}

              {/* AI actions */}
              {aiConfigured && (
                <section>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#A1A1AA]">AI</p>
                  <div className="space-y-2">
                    <button
                      type="button"
                      disabled={generating || revising}
                      onClick={() => void generate()}
                      className="flex w-full items-center gap-1.5 rounded-md border border-[#E4E4E7] px-3 py-2 text-xs text-[#09090B] hover:bg-[#FAFAFA] disabled:opacity-50"
                    >
                      {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 text-[#71717A]" />}
                      {generating ? 'Generating…' : 'Regenerate'}
                    </button>
                    <button
                      type="button"
                      disabled={generating || revising}
                      onClick={() => setShowRevise(s => !s)}
                      className="flex w-full items-center gap-1.5 rounded-md border border-[#E4E4E7] px-3 py-2 text-xs text-[#09090B] hover:bg-[#FAFAFA] disabled:opacity-50"
                    >
                      <MessageSquare className="h-3.5 w-3.5 text-[#71717A]" />
                      Revise with AI
                    </button>
                    {showRevise && (
                      <div className="space-y-2">
                        <textarea
                          value={reviseText}
                          onChange={(e) => setReviseText(e.target.value)}
                          placeholder="Describe the changes you want…"
                          rows={3}
                          className="w-full rounded-md border border-[#E4E4E7] px-3 py-2 text-xs text-[#09090B] placeholder:text-[#A1A1AA] focus:outline-none focus:ring-1 focus:ring-[#09090B]"
                        />
                        <button
                          type="button"
                          disabled={!reviseText.trim() || revising}
                          onClick={() => void revise()}
                          className="inline-flex items-center gap-1 rounded-md bg-[#09090B] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                        >
                          {revising ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                          {revising ? 'Revising…' : 'Request revision'}
                        </button>
                      </div>
                    )}
                  </div>
                </section>
              )}

              {/* Approval actions */}
              {!isLocked && (
                <section>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#A1A1AA]">Review</p>
                  <div className="space-y-2">
                    <button
                      type="button"
                      disabled={approving || isDirty}
                      onClick={() => void approve()}
                      title={isDirty ? 'Save your changes before approving' : undefined}
                      className="flex w-full items-center gap-1.5 rounded-md bg-[#09090B] px-3 py-2 text-xs font-medium text-white hover:bg-[#18181B] disabled:opacity-50"
                    >
                      {approving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                      {approving ? 'Approving…' : 'Approve'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowRequestChanges(s => !s)}
                      className="flex w-full items-center gap-1.5 rounded-md border border-[#E4E4E7] px-3 py-2 text-xs text-[#09090B] hover:bg-[#FAFAFA]"
                    >
                      <MessageSquare className="h-3.5 w-3.5 text-[#71717A]" />
                      Request changes
                    </button>
                    {showRequestChanges && (
                      <div className="space-y-2">
                        <textarea
                          value={changesText}
                          onChange={(e) => setChangesText(e.target.value)}
                          placeholder="Describe what needs to change…"
                          rows={3}
                          className="w-full rounded-md border border-[#E4E4E7] px-3 py-2 text-xs text-[#09090B] placeholder:text-[#A1A1AA] focus:outline-none focus:ring-1 focus:ring-[#09090B]"
                        />
                        <button
                          type="button"
                          disabled={!changesText.trim() || requesting}
                          onClick={() => void requestChanges()}
                          className="inline-flex items-center gap-1 rounded-md border border-[#E4E4E7] px-3 py-1.5 text-xs text-[#09090B] disabled:opacity-50"
                        >
                          {requesting ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                          {requesting ? 'Submitting…' : 'Submit'}
                        </button>
                      </div>
                    )}
                  </div>
                </section>
              )}

              {isLocked && (
                <section>
                  <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-800">
                    <p className="font-medium">Approved</p>
                    <p className="mt-0.5">Edit to re-enter review.</p>
                  </div>
                </section>
              )}
            </div>
          </div>
        ) : null}
      </div>

      {showCreativeStudio && artifact && (
        <CreativeStudioDrawer
          campaignId={campaignId}
          workspaceId={workspaceId}
          contentKey={contentKey}
          artifact={artifact}
          onClose={() => setShowCreativeStudio(false)}
          onArtifactChanged={(updated) => {
            setArtifact(updated);
            onSaved?.();
          }}
        />
      )}
    </>
  );
}

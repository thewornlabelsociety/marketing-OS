import { Check, MessageSquare, X } from 'lucide-react';
import { useState } from 'react';
import { CreativeContentView } from '../../features/studio/CreativeContentView';
import type { CreativeArtifact } from '../../types';

interface Props {
  artifact: CreativeArtifact;
  onClose: () => void;
  onApprove: (creativeArtifactId: string) => Promise<void>;
  onRequestChanges: (requestText: string, targetHint?: string) => Promise<void>;
  approving?: boolean;
  requesting?: boolean;
  locked?: boolean;
}

export function CreativeReviewDrawer({
  artifact,
  onClose,
  onApprove,
  onRequestChanges,
  approving,
  requesting,
  locked,
}: Props) {
  const [mode, setMode] = useState<'review' | 'changes'>('review');
  const [changesText, setChangesText] = useState('');
  const [targetHint, setTargetHint] = useState('');

  async function submitChanges() {
    if (!changesText.trim()) return;
    await onRequestChanges(changesText.trim(), targetHint.trim() || undefined);
    setChangesText('');
    setTargetHint('');
    setMode('review');
  }

  return (
    <>
      <button type="button" aria-label="Close" className="fixed inset-0 z-40 bg-black/20" onClick={onClose} />
      <div className="fixed right-0 top-0 z-50 flex h-full w-[720px] flex-col border-l border-[#E4E4E7] bg-white shadow-xl">
        <div className="flex shrink-0 items-center justify-between border-b border-[#E4E4E7] px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-[#09090B]">Creative Review</h2>
            <p className="text-sm text-[#09090B]">{artifact.title ?? artifact.contentKey}</p>
            <p className="text-xs text-[#71717A]">
              {artifact.channel} · {artifact.contentType} · {artifact.format.replaceAll('_', ' ').toLowerCase()}
              {' · '}Version {artifact.version}
            </p>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="rounded-lg p-1.5 text-[#71717A] hover:bg-[#FAFAFA]">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <CreativeContentView content={artifact.content} />
          {artifact.quality.warnings.length > 0 && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {artifact.quality.warnings.join(' · ')}
            </div>
          )}
        </div>

        {!locked && (
          <div className="shrink-0 border-t border-[#E4E4E7] px-5 py-4">
            {mode === 'review' ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={approving}
                  onClick={() => void onApprove(artifact.id)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#09090B] px-4 py-2 text-sm font-medium text-white hover:bg-[#18181B] disabled:opacity-50"
                >
                  <Check className="h-3.5 w-3.5" />
                  {approving ? 'Approving…' : 'Approve'}
                </button>
                <button
                  type="button"
                  onClick={() => setMode('changes')}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#E4E4E7] px-4 py-2 text-sm font-medium text-[#09090B] hover:bg-[#FAFAFA]"
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                  Request Changes
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <textarea
                  value={changesText}
                  onChange={(e) => setChangesText(e.target.value)}
                  placeholder="Describe the changes you want in plain English…"
                  rows={4}
                  className="w-full rounded-lg border border-[#E4E4E7] px-3 py-2 text-sm text-[#09090B]"
                />
                <input
                  value={targetHint}
                  onChange={(e) => setTargetHint(e.target.value)}
                  placeholder="Optional target (e.g. slide 5, subject line, hook)"
                  className="w-full rounded-lg border border-[#E4E4E7] px-3 py-2 text-sm text-[#09090B]"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={requesting || !changesText.trim()}
                    onClick={() => void submitChanges()}
                    className="rounded-lg bg-[#09090B] px-4 py-2 text-sm font-medium text-white hover:bg-[#18181B] disabled:opacity-50"
                  >
                    {requesting ? 'Submitting…' : 'Submit Changes'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode('review')}
                    className="rounded-lg border border-[#E4E4E7] px-4 py-2 text-sm text-[#71717A] hover:bg-[#FAFAFA]"
                  >
                    Cancel
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

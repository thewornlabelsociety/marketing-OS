import { Check, ChevronDown, ChevronUp, Image, Loader2, MessageSquare, Upload, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../services/api';
import type { CreativeArtifact, CreativeArtifactStatus, MediaAsset } from '../../types';

interface Props {
  campaignId: string;
  workspaceId: string;
  contentKey: string;
  artifact: CreativeArtifact;
  onClose: () => void;
  onArtifactChanged?: (updated: CreativeArtifact) => void;
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

const RATIO_LABELS: Record<string, string> = {
  '4:5': '4:5 Portrait',
  '1:1': '1:1 Square',
  '9:16': '9:16 Story',
  '16:9': '16:9 Landscape',
};

// Channels whose preferred ratios we recognise
const CHANNEL_RATIOS: Record<string, string[]> = {
  INSTAGRAM: ['4:5', '1:1', '9:16'],
  FACEBOOK: ['1:1', '4:5', '16:9'],
  TIKTOK: ['9:16'],
  LINKEDIN: ['1:1', '16:9'],
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function CreativeStudioDrawer({ campaignId, workspaceId, contentKey, artifact: initialArtifact, onClose, onArtifactChanged }: Props) {
  const [artifact, setArtifact] = useState<CreativeArtifact>(initialArtifact);
  const [media, setMedia] = useState<MediaAsset[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState<string | undefined>(initialArtifact.mediaAssetId);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [activeRatio, setActiveRatio] = useState<string>('original');
  const [renditions, setRenditions] = useState<Record<string, string>>({});
  const [loadingMedia, setLoadingMedia] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [approving, setApproving] = useState(false);
  const [showRequestChanges, setShowRequestChanges] = useState(false);
  const [changesText, setChangesText] = useState('');
  const [requesting, setRequesting] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [prepareError, setPrepareError] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const isLocked = artifact.status === 'APPROVED';
  const preferredRatios = CHANNEL_RATIOS[artifact.channel] ?? [];

  const loadMedia = useCallback(async () => {
    setLoadingMedia(true);
    try {
      const { assets } = await api.listCreativeMedia(workspaceId, artifact.id);
      setMedia(assets);
    } catch {
      // silently continue — user can still upload
    } finally {
      setLoadingMedia(false);
    }
  }, [workspaceId, artifact.id]);

  const loadPreview = useCallback(async (assetId: string) => {
    try {
      const { url } = await api.getMediaPreviewUrl(assetId, workspaceId);
      setPreviewUrl(url);
    } catch {
      setPreviewUrl(null);
    }
  }, [workspaceId]);

  useEffect(() => {
    void loadMedia();
  }, [loadMedia]);

  useEffect(() => {
    if (selectedAssetId) {
      void loadPreview(selectedAssetId);
      setActiveRatio('original');
      setRenditions({});
    } else {
      setPreviewUrl(null);
    }
  }, [selectedAssetId, loadPreview]);

  const handleFileSelect = async (file: File) => {
    if (!file.type.startsWith('image/jpeg') && !file.type.startsWith('image/png')) {
      setUploadError('Only JPEG and PNG images are supported.');
      return;
    }
    setUploadError('');
    setUploading(true);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const { asset } = await api.uploadMediaAsset({
        workspaceId,
        fileBase64: base64,
        mimeType: file.type,
        filename: file.name,
        campaignId,
        contentKey,
        creativeArtifactId: artifact.id,
        creativeVersion: artifact.version,
      });
      // Reload media list then select the new asset
      await loadMedia();
      await selectAsset(asset.id);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const selectAsset = async (assetId: string) => {
    setSelecting(true);
    try {
      const updated = await api.selectCreativeMedia(campaignId, contentKey, workspaceId, assetId);
      setArtifact(updated);
      setSelectedAssetId(assetId);
      onArtifactChanged?.(updated);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Failed to select media');
    } finally {
      setSelecting(false);
    }
  };

  const prepareRenditions = async () => {
    if (!previewUrl) return;
    setPrepareError('');
    setPreparing(true);
    try {
      // Fetch the current image as base64 via the signed URL
      const resp = await fetch(previewUrl);
      const blob = await resp.blob();
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      const { renditions: newRenditions } = await api.adaptImageDimensions(base64);
      setRenditions(newRenditions);
    } catch (err) {
      setPrepareError(err instanceof Error ? err.message : 'Preparation failed');
    } finally {
      setPreparing(false);
    }
  };

  const uploadRendition = async (ratio: string) => {
    const dataUrl = renditions[ratio];
    if (!dataUrl) return;
    setUploading(true);
    setUploadError('');
    try {
      const { asset } = await api.uploadMediaAsset({
        workspaceId,
        fileBase64: dataUrl,
        mimeType: 'image/jpeg',
        filename: `prepared-${ratio.replace(':', 'x')}.jpg`,
        campaignId,
        contentKey,
        creativeArtifactId: artifact.id,
        creativeVersion: artifact.version,
      });
      await loadMedia();
      await selectAsset(asset.id);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Failed to save prepared image');
    } finally {
      setUploading(false);
    }
  };

  const approve = async () => {
    setApproving(true);
    try {
      await api.approveCreative(campaignId, contentKey, workspaceId);
      const updated = await api.getCreative(campaignId, contentKey, workspaceId);
      setArtifact(updated);
      onArtifactChanged?.(updated);
    } catch {
      // ignore — artifact stays at current state
    } finally {
      setApproving(false);
    }
  };

  const requestChanges = async () => {
    if (!changesText.trim()) return;
    setRequesting(true);
    try {
      await api.requestCreativeRevision(campaignId, contentKey, workspaceId, changesText);
      const updated = await api.getCreative(campaignId, contentKey, workspaceId);
      setArtifact(updated);
      onArtifactChanged?.(updated);
      setShowRequestChanges(false);
      setChangesText('');
    } catch {
      // ignore
    } finally {
      setRequesting(false);
    }
  };

  const currentPreview = activeRatio !== 'original' ? (renditions[activeRatio] ?? previewUrl) : previewUrl;
  const hasRenditions = Object.keys(renditions).length > 0;

  // Determine copy context snippet from content
  const copySnippet = (() => {
    const c = artifact.content;
    if ('caption' in c) return c.caption?.slice(0, 120);
    if ('headline' in c && typeof c.headline === 'string') return c.headline.slice(0, 120);
    if ('subject' in c) return c.subject?.slice(0, 120);
    if ('title' in c && typeof c.title === 'string') return c.title.slice(0, 120);
    if ('body' in c && typeof c.body === 'string') return c.body.slice(0, 120);
    return null;
  })();

  return (
    <div className="fixed inset-0 flex flex-col bg-white" style={{ zIndex: 60 }}>
      {/* Header */}
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-[#E4E4E7] px-5">
        <div className="flex items-center gap-3">
          <Image className="h-4 w-4 text-[#71717A]" />
          <span className="text-sm font-semibold text-[#09090B]">Creative Studio</span>
          <span className="text-[11px] text-[#A1A1AA]">{artifact.channel} · {artifact.contentType}</span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_COLOR[artifact.status]}`}>
            {STATUS_LABEL[artifact.status]}
          </span>
        </div>
        <button type="button" onClick={onClose} className="rounded-md p-1.5 hover:bg-[#F4F4F5]">
          <X className="h-4 w-4 text-[#71717A]" />
        </button>
      </div>

      {/* Body */}
      <div className="flex min-h-0 flex-1">
        {/* Left: preview */}
        <div className="flex flex-1 flex-col items-center justify-center bg-[#FAFAFA] p-6 gap-4">
          {/* Ratio tabs */}
          {(previewUrl || hasRenditions) && (
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setActiveRatio('original')}
                className={`rounded px-3 py-1 text-xs font-medium ${activeRatio === 'original' ? 'bg-[#09090B] text-white' : 'border border-[#E4E4E7] text-[#71717A] hover:bg-[#F4F4F5]'}`}
              >
                Original
              </button>
              {hasRenditions && Object.keys(renditions).map(r => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setActiveRatio(r)}
                  className={`rounded px-3 py-1 text-xs font-medium ${activeRatio === r ? 'bg-[#09090B] text-white' : 'border border-[#E4E4E7] text-[#71717A] hover:bg-[#F4F4F5]'}`}
                >
                  {r}
                </button>
              ))}
            </div>
          )}

          {/* Preview area */}
          <div className="relative flex h-[480px] w-full max-w-[540px] items-center justify-center overflow-hidden rounded-xl border border-[#E4E4E7] bg-white">
            {currentPreview ? (
              <img src={currentPreview} alt="Creative preview" className="h-full w-full object-contain" />
            ) : (
              <div className="flex flex-col items-center gap-3 text-[#A1A1AA]">
                <Image className="h-12 w-12" />
                <p className="text-sm">No media attached</p>
                <p className="text-xs">Upload an image to preview it here</p>
              </div>
            )}
            {(uploading || selecting) && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/80">
                <Loader2 className="h-8 w-8 animate-spin text-[#71717A]" />
              </div>
            )}
          </div>

          {/* Copy context */}
          {copySnippet && (
            <p className="max-w-[540px] text-center text-xs text-[#71717A] italic">{copySnippet}{copySnippet.length === 120 ? '…' : ''}</p>
          )}
        </div>

        {/* Right: controls */}
        <div className="flex w-72 shrink-0 flex-col overflow-y-auto border-l border-[#E4E4E7] px-4 py-4 space-y-5">

          {/* Media assets */}
          <section>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#A1A1AA]">Media</p>

            {/* Upload button */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) void handleFileSelect(f); e.target.value = ''; }}
            />
            <button
              type="button"
              disabled={uploading || selecting}
              onClick={() => fileInputRef.current?.click()}
              className="flex w-full items-center gap-2 rounded-md border border-dashed border-[#D4D4D8] px-3 py-2.5 text-xs text-[#71717A] hover:border-[#A1A1AA] hover:text-[#09090B] disabled:opacity-50"
            >
              <Upload className="h-3.5 w-3.5 shrink-0" />
              {uploading ? 'Uploading…' : 'Upload image (JPEG / PNG)'}
            </button>
            {uploadError && <p className="mt-1.5 text-[11px] text-red-600">{uploadError}</p>}

            {/* Existing assets */}
            {loadingMedia ? (
              <div className="mt-2 flex justify-center"><Loader2 className="h-4 w-4 animate-spin text-[#D4D4D8]" /></div>
            ) : media.length > 0 ? (
              <div className="mt-2 space-y-1">
                {media.map(asset => {
                  const isSelected = asset.id === selectedAssetId;
                  return (
                    <button
                      key={asset.id}
                      type="button"
                      disabled={selecting || uploading}
                      onClick={() => !isSelected && void selectAsset(asset.id)}
                      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors ${isSelected ? 'bg-[#09090B] text-white' : 'border border-[#E4E4E7] text-[#09090B] hover:bg-[#FAFAFA]'} disabled:opacity-50`}
                    >
                      <Image className={`h-3.5 w-3.5 shrink-0 ${isSelected ? 'text-white' : 'text-[#71717A]'}`} />
                      <span className="min-w-0 flex-1 truncate">{asset.originalFilename ?? asset.id.slice(0, 16)}</span>
                      <span className={`shrink-0 ${isSelected ? 'text-white/70' : 'text-[#A1A1AA]'}`}>{formatBytes(asset.fileSize)}</span>
                      {isSelected && <Check className="h-3 w-3 shrink-0 text-white" />}
                    </button>
                  );
                })}
              </div>
            ) : !loadingMedia && (
              <p className="mt-2 text-[11px] text-[#A1A1AA]">No images yet. Upload one above.</p>
            )}
          </section>

          {/* Channel preparation */}
          {previewUrl && (
            <section>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#A1A1AA]">Prepare for channel</p>
              {preferredRatios.length > 0 && (
                <p className="mb-2 text-[11px] text-[#71717A]">
                  {artifact.channel} prefers: {preferredRatios.join(', ')}
                </p>
              )}
              {prepareError && <p className="mb-1.5 text-[11px] text-red-600">{prepareError}</p>}
              <button
                type="button"
                disabled={preparing || uploading}
                onClick={() => void prepareRenditions()}
                className="flex w-full items-center gap-1.5 rounded-md border border-[#E4E4E7] px-3 py-2 text-xs text-[#09090B] hover:bg-[#FAFAFA] disabled:opacity-50"
              >
                {preparing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                {preparing ? 'Preparing…' : 'Generate renditions'}
              </button>

              {hasRenditions && (
                <div className="mt-2 space-y-1">
                  {Object.entries(renditions).map(([ratio]) => (
                    <div key={ratio} className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setActiveRatio(ratio)}
                        className={`flex-1 rounded px-2 py-1 text-left text-xs ${activeRatio === ratio ? 'bg-[#F4F4F5] font-medium' : 'text-[#71717A] hover:bg-[#FAFAFA]'}`}
                      >
                        {RATIO_LABELS[ratio] ?? ratio}
                      </button>
                      <button
                        type="button"
                        disabled={uploading || selecting}
                        onClick={() => void uploadRendition(ratio)}
                        className="rounded px-2 py-1 text-[10px] font-medium text-[#71717A] hover:bg-[#F4F4F5] disabled:opacity-50"
                        title="Save this rendition as a media variant"
                      >
                        Save
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* Validation */}
          {selectedAssetId && (() => {
            const asset = media.find(a => a.id === selectedAssetId);
            if (!asset) return null;
            const isSupportedType = asset.mimeType === 'image/jpeg' || asset.mimeType === 'image/png';
            const hasRatio = preferredRatios.length === 0 || (asset.width && asset.height
              ? preferredRatios.some(r => {
                  const [rw, rh] = r.split(':').map(Number);
                  const ratio = asset.width! / asset.height!;
                  return Math.abs(ratio - rw / rh) < 0.05;
                })
              : false);
            return (
              <section>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#A1A1AA]">Validation</p>
                <div className="space-y-1 text-[11px]">
                  <div className={`flex items-center gap-1.5 ${isSupportedType ? 'text-green-700' : 'text-red-600'}`}>
                    {isSupportedType ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                    {isSupportedType ? 'JPEG / PNG' : `Unsupported type: ${asset.mimeType}`}
                  </div>
                  {preferredRatios.length > 0 && (
                    <div className={`flex items-center gap-1.5 ${hasRatio ? 'text-green-700' : 'text-[#A1A1AA]'}`}>
                      {hasRatio ? <Check className="h-3 w-3" /> : <Image className="h-3 w-3" />}
                      {hasRatio ? 'Aspect ratio matches channel' : 'Ratio unknown — use Prepare to resize'}
                    </div>
                  )}
                </div>
              </section>
            );
          })()}

          {/* Version history */}
          <section>
            <button
              type="button"
              onClick={() => setShowHistory(s => !s)}
              className="flex w-full items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-[#A1A1AA] hover:text-[#09090B]"
            >
              History
              {showHistory ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
            {showHistory && (
              <div className="mt-2 space-y-1">
                <div className="rounded-md border border-[#E4E4E7] px-3 py-2 text-xs">
                  <p className="font-medium text-[#09090B]">V{artifact.version} (current)</p>
                  <p className="mt-0.5 text-[#A1A1AA]">{artifact.mediaAssetId ? `Media: ${artifact.mediaAssetId.slice(0, 16)}…` : 'No media attached'}</p>
                  <p className="mt-0.5 text-[#A1A1AA]">{STATUS_LABEL[artifact.status]}</p>
                </div>
              </div>
            )}
          </section>

          {/* Review */}
          {!isLocked && (
            <section>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#A1A1AA]">Review</p>
              <div className="space-y-2">
                <button
                  type="button"
                  disabled={approving || !selectedAssetId}
                  onClick={() => void approve()}
                  title={!selectedAssetId ? 'Attach media before approving' : undefined}
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
                      onChange={e => setChangesText(e.target.value)}
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
                <p className="mt-0.5">Attach new media to re-enter review.</p>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

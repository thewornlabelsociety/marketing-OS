import { Monitor, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChannelPreview } from '../../features/studio/ChannelPreview';
import { api } from '../../services/api';
import type {
  CampaignCreativeSummary,
  ChannelCapability,
  CreativeArtifact,
  PreviewDescriptor,
  PreviewDevice,
} from '../../types';

interface Props {
  campaignId: string;
  workspaceId: string;
  summary: CampaignCreativeSummary;
  capabilities: ChannelCapability[];
  initialContentKey?: string;
  onClose: () => void;
}

function previewFormat(contentType: string): string {
  switch (contentType) {
    case 'CAROUSEL': return 'carousel';
    case 'STORY': return 'story';
    case 'SHORT_VIDEO': return 'short-video';
    case 'LONG_VIDEO': return 'video';
    case 'NEWSLETTER':
    case 'EMAIL': return 'newsletter';
    case 'ARTICLE': return 'article';
    case 'LANDING_PAGE': return 'landing';
    default: return 'feed';
  }
}

export function CreativePreviewDrawer({
  campaignId,
  workspaceId,
  summary,
  capabilities,
  initialContentKey,
  onClose,
}: Props) {
  const deliverables = summary.deliverables.filter((d) => d.hasCreative);
  const [contentKey, setContentKey] = useState(initialContentKey ?? deliverables[0]?.contentKey ?? '');
  const [artifact, setArtifact] = useState<CreativeArtifact | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [imageUrl, setImageUrl] = useState<string | undefined>(undefined);

  const row = deliverables.find((d) => d.contentKey === contentKey) ?? deliverables[0];
  const capability = capabilities.find((c) => c.channel === row?.channel);
  const [device, setDevice] = useState<PreviewDevice>('mobile');

  const validDevices = useMemo(() => {
    if (!capability) return ['mobile'] as PreviewDevice[];
    if (row?.contentType === 'STORY') {
      return capability.supportedDevices.filter((d) => d !== 'desktop');
    }
    return capability.supportedDevices;
  }, [capability, row?.contentType]);

  const activeDevice = validDevices.includes(device) ? device : validDevices[0];

  useEffect(() => {
    if (!contentKey) return;
    setLoading(true);
    setError('');
    setImageUrl(undefined);
    api.getCreative(campaignId, contentKey, workspaceId)
      .then(setArtifact)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [campaignId, contentKey, workspaceId]);

  const resolveImageUrl = useCallback(async (assetId: string) => {
    try {
      const { url } = await api.getMediaPreviewUrl(assetId, workspaceId);
      setImageUrl(url);
    } catch {
      setImageUrl(undefined);
    }
  }, [workspaceId]);

  useEffect(() => {
    if (artifact?.mediaAssetId) {
      void resolveImageUrl(artifact.mediaAssetId);
    } else {
      setImageUrl(undefined);
    }
  }, [artifact?.mediaAssetId, resolveImageUrl]);

  if (!row) return null;

  const descriptor: PreviewDescriptor = {
    channel: row.channel.toLowerCase() as PreviewDescriptor['channel'],
    format: previewFormat(row.contentType),
    device: activeDevice,
  };

  return (
    <>
      <button type="button" aria-label="Close preview" className="fixed inset-0 z-40 bg-black/10" onClick={onClose} />
      <aside className="fixed right-0 top-0 z-50 flex h-full w-[640px] flex-col border-l border-[#E4E4E7] bg-[#FAFAFA] shadow-xl">
        <header className="flex shrink-0 items-center justify-between border-b border-[#E4E4E7] bg-white px-5 py-4">
          <p className="text-sm font-semibold text-[#09090B]">Creative Preview</p>
          <button type="button" aria-label="Close" onClick={onClose} className="rounded-lg p-1.5 text-[#71717A] hover:bg-[#FAFAFA]">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="space-y-3 border-b border-[#E4E4E7] bg-white px-5 py-4">
          <label className="block text-[11px] font-medium uppercase tracking-wide text-[#A1A1AA]">
            Content
            <select
              value={row.contentKey}
              onChange={(e) => setContentKey(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[#E4E4E7] px-3 py-2 text-sm text-[#09090B]"
            >
              {deliverables.map((d) => (
                <option key={d.contentKey} value={d.contentKey}>{d.title}</option>
              ))}
            </select>
          </label>

          {validDevices.length > 1 && (
            <div className="flex gap-2">
              {validDevices.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDevice(d)}
                  className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs ${activeDevice === d ? 'bg-[#09090B] text-white' : 'border border-[#E4E4E7] text-[#71717A]'}`}
                >
                  {d === 'desktop' && <Monitor className="h-3 w-3" />}
                  {d}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
          <ChannelPreview descriptor={descriptor} creative={artifact?.content} imageUrl={imageUrl} loading={loading} />
        </div>
      </aside>
    </>
  );
}
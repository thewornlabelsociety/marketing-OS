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

function MetaRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-wide text-[#A1A1AA]">{label}</p>
      <p className="mt-0.5 text-xs leading-relaxed text-[#3F3F46]">{value}</p>
    </div>
  );
}

const CHANNEL_LABELS: Record<string, string> = {
  INSTAGRAM: 'Instagram',
  FACEBOOK: 'Facebook',
  TIKTOK: 'TikTok',
  LINKEDIN: 'LinkedIn',
  EMAIL: 'Email',
  WEBSITE: 'Website',
};

const CONTENT_TYPE_LABELS: Record<string, string> = {
  STATIC_POST: 'Post',
  CAROUSEL: 'Carousel',
  STORY: 'Story',
  SHORT_VIDEO: 'Reel',
  NEWSLETTER: 'Newsletter',
  EMAIL: 'Email',
};

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
  const [mediaItems, setMediaItems] = useState<string[]>([]);

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
    if (artifact?.carouselSlideImages?.length) {
      setMediaItems(artifact.carouselSlideImages.filter(Boolean));
      setImageUrl(undefined);
    } else if (artifact?.mediaAssetId) {
      setMediaItems([]);
      void resolveImageUrl(artifact.mediaAssetId);
    } else {
      setMediaItems([]);
      setImageUrl(undefined);
    }
  }, [artifact?.mediaAssetId, artifact?.carouselSlideImages, resolveImageUrl]);

  if (!row) return null;

  const descriptor: PreviewDescriptor = {
    channel: row.channel.toLowerCase() as PreviewDescriptor['channel'],
    format: previewFormat(row.contentType),
    device: activeDevice,
  };

  const channelLabel = CHANNEL_LABELS[row.channel] ?? row.channel;
  const typeLabel = CONTENT_TYPE_LABELS[row.contentType] ?? row.contentType.replaceAll('_', ' ');

  return (
    <>
      <button type="button" aria-label="Close preview" className="fixed inset-0 z-40 bg-black/10" onClick={onClose} />
      <aside className="fixed right-0 top-0 z-50 flex h-full w-[640px] flex-col border-l border-[#E4E4E7] bg-[#FAFAFA] shadow-xl">

        {/* Compact single-row header */}
        <header className="flex shrink-0 items-center gap-2.5 border-b border-[#E4E4E7] bg-white px-4 py-2.5">
          <p className="shrink-0 text-sm font-semibold text-[#09090B]">Creative Preview</p>
          <select
            value={row.contentKey}
            onChange={(e) => setContentKey(e.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-[#E4E4E7] bg-white px-2.5 py-1.5 text-xs text-[#09090B]"
          >
            {deliverables.map((d) => (
              <option key={d.contentKey} value={d.contentKey}>{d.title}</option>
            ))}
          </select>
          {validDevices.length > 1 && (
            <div className="flex shrink-0 gap-1">
              {validDevices.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDevice(d)}
                  className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs capitalize ${
                    activeDevice === d ? 'bg-[#09090B] text-white' : 'border border-[#E4E4E7] text-[#71717A]'
                  }`}
                >
                  {d === 'desktop' && <Monitor className="h-3 w-3" />}
                  {d}
                </button>
              ))}
            </div>
          )}
          <button type="button" aria-label="Close" onClick={onClose} className="shrink-0 rounded-lg p-1.5 text-[#71717A] hover:bg-[#FAFAFA]">
            <X className="h-4 w-4" />
          </button>
        </header>

        {/* Two-column body */}
        <div className="flex flex-1 overflow-hidden">

          {/* Left: creative metadata */}
          <div className="w-[210px] shrink-0 space-y-4 overflow-y-auto border-r border-[#E4E4E7] bg-white p-4">
            <MetaRow label="Channel" value={channelLabel} />
            <MetaRow label="Format" value={typeLabel} />
            <MetaRow label="Device" value={activeDevice} />
            {error && (
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wide text-red-400">Error</p>
                <p className="mt-0.5 text-xs text-red-600">{error}</p>
              </div>
            )}
          </div>

          {/* Right: platform preview */}
          <div className="flex-1 overflow-y-auto bg-zinc-50 p-5">
            <ChannelPreview
              descriptor={descriptor}
              creative={artifact?.content}
              imageUrl={imageUrl}
              mediaItems={mediaItems}
              loading={loading}
            />
          </div>
        </div>
      </aside>
    </>
  );
}

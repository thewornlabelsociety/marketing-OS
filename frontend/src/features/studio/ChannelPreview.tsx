import type { CreativeContent, PreviewDescriptor } from '../../types';
import { PlatformPreview, type PlatformPreviewPlanned } from '../../components/preview/PlatformPreview';

interface ChannelPreviewProps {
  descriptor: PreviewDescriptor;
  planned?: PlatformPreviewPlanned;
  creative?: CreativeContent | null;
  imageUrl?: string;
  mediaItems?: string[];
  loading?: boolean;
}

const CHANNEL_LABELS: Record<string, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  linkedin: 'LinkedIn',
  email: 'Email',
  website: 'Website',
};

export function ChannelPreview({ descriptor, planned, creative, imageUrl, mediaItems, loading }: ChannelPreviewProps) {
  const { channel, format, device } = descriptor;
  const channelLabel = CHANNEL_LABELS[channel] ?? channel;
  const isCreative = Boolean(creative);

  return (
    <div className="flex h-full flex-col items-center gap-4">
      <div className={`rounded-md border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-widest ${
        isCreative ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'
      }`}>
        {isCreative ? 'Creative preview' : 'Planned preview'}
      </div>
      <p className="text-xs text-[#71717A]">
        {channelLabel} · {format} · {device}
      </p>
      <PlatformPreview
        channel={channel}
        format={format}
        device={device}
        creative={creative}
        planned={planned}
        imageUrl={imageUrl}
        mediaItems={mediaItems}
        loading={loading}
      />
    </div>
  );
}

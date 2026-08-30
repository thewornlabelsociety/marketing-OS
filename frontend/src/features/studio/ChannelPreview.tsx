import type { PreviewDescriptor } from '../../types';

interface ChannelPreviewProps {
  descriptor: PreviewDescriptor;
}

const CHANNEL_LABELS: Record<string, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  linkedin: 'LinkedIn',
  email: 'Email',
  website: 'Website',
};

export function ChannelPreview({ descriptor }: ChannelPreviewProps) {
  const { channel, format, device } = descriptor;
  const channelLabel = CHANNEL_LABELS[channel] ?? channel;

  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-[#71717A]">
      <div className="rounded-md border border-[#E4E4E7] bg-[#FAFAFA] px-3 py-1.5 text-xs text-[#71717A]">
        {channelLabel} · {format} · {device}
      </div>
      <p className="text-xs">Preview renderer not yet implemented for this channel.</p>
    </div>
  );
}

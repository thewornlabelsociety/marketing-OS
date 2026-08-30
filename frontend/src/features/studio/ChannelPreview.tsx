import type { PreviewDescriptor } from '../../types';

interface PlannedPreview {
  title: string;
  purpose: string;
  hookDirection?: string;
  primaryMessage: string;
  mediaRequirement?: string;
  ctaRole?: string;
}

interface ChannelPreviewProps {
  descriptor: PreviewDescriptor;
  planned?: PlannedPreview;
}

const CHANNEL_LABELS: Record<string, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  linkedin: 'LinkedIn',
  email: 'Email',
  website: 'Website',
};

const FRAME: Record<string, string> = {
  'instagram-story': 'h-[420px] w-[236px] rounded-[28px]',
  'instagram-carousel': 'h-[360px] w-[288px] rounded-xl',
  'instagram-short-video': 'h-[420px] w-[236px] rounded-[28px]',
  'instagram-feed': 'h-[320px] w-[320px] rounded-xl',
  'email-newsletter': 'min-h-[280px] w-full max-w-[420px] rounded-lg',
  default: 'h-[280px] w-[240px] rounded-xl',
};

export function ChannelPreview({ descriptor, planned }: ChannelPreviewProps) {
  const { channel, format, device } = descriptor;
  const channelLabel = CHANNEL_LABELS[channel] ?? channel;
  const frameKey = `${channel}-${format}`;
  const frameClass = FRAME[frameKey] ?? FRAME.default;
  const emailWidth = channel === 'email' && device === 'desktop' ? 'max-w-[560px]' : '';

  return (
    <div className="flex h-full flex-col items-center gap-4">
      <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-widest text-amber-800">
        Planned preview
      </div>
      <div className="text-xs text-[#71717A]">
        {channelLabel} · {format} · {device}
      </div>
      <div className={`flex flex-col justify-between border border-[#E4E4E7] bg-white p-4 ${frameClass} ${emailWidth}`}>
        {planned ? (
          <>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wide text-[#A1A1AA]">Not final creative</p>
              <p className="mt-2 text-sm font-semibold text-[#09090B]">{planned.title}</p>
              <p className="mt-1 text-xs text-[#71717A]">{planned.purpose}</p>
            </div>
            <div className="mt-3 space-y-2 text-xs text-[#71717A]">
              {planned.hookDirection && (
                <p><span className="text-[#A1A1AA]">Hook direction · </span>{planned.hookDirection}</p>
              )}
              <p><span className="text-[#A1A1AA]">Primary message · </span>{planned.primaryMessage}</p>
              {planned.mediaRequirement && (
                <p><span className="text-[#A1A1AA]">Media · </span>{planned.mediaRequirement}</p>
              )}
              {planned.ctaRole && (
                <p><span className="text-[#A1A1AA]">CTA role · </span>{planned.ctaRole}</p>
              )}
            </div>
          </>
        ) : (
          <p className="text-xs text-[#71717A]">Preview renderer not yet implemented for this channel.</p>
        )}
      </div>
    </div>
  );
}

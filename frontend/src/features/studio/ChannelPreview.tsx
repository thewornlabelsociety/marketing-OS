import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { useState } from 'react';
import type { CreativeContent, PreviewDescriptor } from '../../types';
import { CreativeContentView } from './CreativeContentView';

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
  creative?: CreativeContent | null;
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

const FRAME: Record<string, string> = {
  'instagram-story': 'h-[420px] w-[236px] rounded-[28px]',
  'instagram-carousel': 'h-[360px] w-[288px] rounded-xl',
  'instagram-short-video': 'h-[420px] w-[236px] rounded-[28px]',
  'instagram-feed': 'h-[320px] w-[320px] rounded-xl',
  'email-newsletter': 'min-h-[280px] w-full max-w-[420px] rounded-lg',
  default: 'h-[280px] w-[240px] rounded-xl',
};

export function ChannelPreview({ descriptor, planned, creative, loading }: ChannelPreviewProps) {
  const { channel, format, device } = descriptor;
  const channelLabel = CHANNEL_LABELS[channel] ?? channel;
  const frameKey = `${channel}-${format}`;
  const frameClass = FRAME[frameKey] ?? FRAME.default;
  const emailWidth = channel === 'email' && device === 'desktop' ? 'max-w-[560px]' : '';
  const isCreative = Boolean(creative);
  const [slideIndex, setSlideIndex] = useState(0);

  const carouselSlides = creative?.kind === 'CAROUSEL' ? creative.slides : [];
  const storyFrames = creative?.kind === 'STORY' ? creative.frames : [];
  const activeSlide = carouselSlides[slideIndex];

  return (
    <div className="flex h-full flex-col items-center gap-4">
      <div className={`rounded-md border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-widest ${
        isCreative ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'
      }`}>
        {isCreative ? 'Creative preview' : 'Planned preview'}
      </div>
      <div className="text-xs text-[#71717A]">
        {channelLabel} · {format} · {device}
      </div>
      <div className={`flex flex-col border border-[#E4E4E7] bg-white p-4 ${frameClass} ${emailWidth}`}>
        {loading ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-[#A1A1AA]" />
          </div>
        ) : creative ? (
          <CreativePreviewBody
            creative={creative}
            format={format}
            activeSlide={activeSlide}
            slideIndex={slideIndex}
            slideCount={carouselSlides.length}
            frameCount={storyFrames.length}
            onPrevSlide={() => setSlideIndex((i) => Math.max(0, i - 1))}
            onNextSlide={() => setSlideIndex((i) => Math.min(carouselSlides.length - 1, i + 1))}
          />
        ) : planned ? (
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
      {isCreative && (
        <p className="text-[11px] text-[#A1A1AA]">Visual asset pending — copy and direction only</p>
      )}
    </div>
  );
}

function CreativePreviewBody({
  creative,
  format,
  activeSlide,
  slideIndex,
  slideCount,
  frameCount,
  onPrevSlide,
  onNextSlide,
}: {
  creative: CreativeContent;
  format: string;
  activeSlide?: { slideNumber: number; headline?: string; body?: string; visualDirection?: string };
  slideIndex: number;
  slideCount: number;
  frameCount: number;
  onPrevSlide: () => void;
  onNextSlide: () => void;
}) {
  if (creative.kind === 'CAROUSEL' && format === 'carousel') {
    return (
      <div className="flex h-full flex-col">
        <p className="text-xs text-[#71717A] line-clamp-3">{creative.caption}</p>
        <div className="mt-3 flex-1 rounded-md border border-dashed border-[#E4E4E7] bg-[#FAFAFA] p-3">
          {activeSlide ? (
            <>
              <p className="text-[10px] text-[#A1A1AA]">Slide {activeSlide.slideNumber}</p>
              {activeSlide.headline && <p className="mt-1 text-sm font-semibold">{activeSlide.headline}</p>}
              {activeSlide.body && <p className="mt-1 text-xs text-[#71717A]">{activeSlide.body}</p>}
              {activeSlide.visualDirection && (
                <p className="mt-2 text-[10px] text-[#A1A1AA]">{activeSlide.visualDirection}</p>
              )}
            </>
          ) : null}
        </div>
        {slideCount > 1 && (
          <div className="mt-2 flex items-center justify-between text-[#71717A]">
            <button type="button" onClick={onPrevSlide} disabled={slideIndex === 0} aria-label="Previous slide">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-[10px]">{slideIndex + 1} / {slideCount}</span>
            <button type="button" onClick={onNextSlide} disabled={slideIndex >= slideCount - 1} aria-label="Next slide">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    );
  }

  if (creative.kind === 'STORY') {
    const frame = creative.frames[0];
    return (
      <div className="flex h-full flex-col justify-between">
        <p className="text-[10px] text-[#A1A1AA]">Frame 1{frameCount > 1 ? ` of ${frameCount}` : ''}</p>
        {frame?.headline && <p className="mt-2 text-sm font-semibold">{frame.headline}</p>}
        {frame?.body && <p className="mt-1 text-xs text-[#71717A]">{frame.body}</p>}
        <p className="mt-auto text-[10px] text-[#A1A1AA]">{frame?.visualDirection ?? 'Visual direction pending'}</p>
      </div>
    );
  }

  if (creative.kind === 'SHORT_VIDEO' || creative.kind === 'LONG_VIDEO') {
    const scene = 'scenes' in creative ? creative.scenes[0] : undefined;
    return (
      <div className="space-y-2 text-xs">
        {'hook' in creative && creative.hook && <p className="font-medium text-[#09090B]">{creative.hook}</p>}
        {scene && (
          <div className="rounded border border-[#F4F4F5] p-2">
            <p className="text-[10px] text-[#A1A1AA]">Scene {scene.sceneNumber}</p>
            <p className="mt-1 text-[#71717A]">{scene.visualDirection}</p>
            {'spokenCopy' in scene && scene.spokenCopy && <p className="mt-1">Voice · {scene.spokenCopy}</p>}
          </div>
        )}
        <p className="text-[10px] text-[#A1A1AA]">Storyboard preview — not rendered video</p>
      </div>
    );
  }

  if (creative.kind === 'EMAIL' || creative.kind === 'NEWSLETTER') {
    return (
      <div className="space-y-2 text-xs">
        <p className="font-semibold text-[#09090B]">{creative.subject}</p>
        {'preheader' in creative && creative.preheader && (
          <p className="text-[#71717A]">{creative.preheader}</p>
        )}
        <div className="mt-2 text-[#71717A]">
          <CreativeContentView content={creative} />
        </div>
      </div>
    );
  }

  return <CreativeContentView content={creative} />;
}

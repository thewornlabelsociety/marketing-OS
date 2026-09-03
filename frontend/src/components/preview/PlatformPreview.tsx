import {
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Heart,
  ImageOff,
  Loader2,
  MessageCircle,
  MoreHorizontal,
  Send,
  ThumbsUp,
} from 'lucide-react';
import { useState } from 'react';
import { IPhoneFrame } from '../simulator/IPhoneFrame';
import type { CreativeContent } from '../../types';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PlatformPreviewPlanned {
  title: string;
  purpose: string;
  hookDirection?: string;
  primaryMessage: string;
  mediaRequirement?: string;
  ctaRole?: string;
}

interface Props {
  channel: string;
  format: string;
  device?: string;
  creative?: CreativeContent | null;
  planned?: PlatformPreviewPlanned;
  imageUrl?: string;
  loading?: boolean;
}

// ─── Image slot ───────────────────────────────────────────────────────────────

function ImageSlot({ imageUrl, className }: { imageUrl?: string; className?: string }) {
  if (imageUrl) {
    return <img src={imageUrl} alt="" className={`w-full object-cover ${className ?? ''}`} />;
  }
  return (
    <div className={`flex w-full items-center justify-center bg-gradient-to-br from-zinc-100 to-zinc-200 ${className ?? ''}`}>
      <ImageOff className="h-5 w-5 text-zinc-300" />
    </div>
  );
}

// ─── Instagram chrome elements ────────────────────────────────────────────────

function IGAvatar() {
  return (
    <div className="h-7 w-7 rounded-full bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 p-[2px]">
      <div className="h-full w-full rounded-full bg-white p-[1.5px]">
        <div className="h-full w-full rounded-full bg-zinc-200" />
      </div>
    </div>
  );
}

function IGHeader() {
  return (
    <div className="flex items-center justify-between px-2.5 py-2">
      <div className="flex items-center gap-1.5">
        <IGAvatar />
        <span className="text-[10px] font-semibold text-zinc-900">workspace</span>
      </div>
      <MoreHorizontal className="h-3.5 w-3.5 text-zinc-500" />
    </div>
  );
}

function IGActions() {
  return (
    <div className="flex items-center justify-between px-2.5 py-1.5">
      <div className="flex items-center gap-3">
        <Heart className="h-4 w-4 text-zinc-800" />
        <MessageCircle className="h-4 w-4 text-zinc-800" />
        <Send className="h-4 w-4 text-zinc-800" />
      </div>
      <Bookmark className="h-4 w-4 text-zinc-800" />
    </div>
  );
}

function IGTabBar() {
  return (
    <div className="flex items-center justify-around border-t border-zinc-100 py-2">
      <div className="h-4 w-4 rounded-sm bg-zinc-800" />
      <div className="h-4 w-4 rounded-full border-2 border-zinc-300" />
      <div className="h-4 w-4 rounded-sm border-2 border-zinc-300" />
      <div className="h-4 w-4 rounded-sm border-2 border-zinc-300" />
      <div className="h-4 w-4 rounded-full border-2 border-zinc-300" />
    </div>
  );
}

// ─── Instagram Feed (4:5) ─────────────────────────────────────────────────────

function InstagramFeedContent({ creative, imageUrl }: { creative?: CreativeContent | null; imageUrl?: string }) {
  const caption = creative?.kind === 'STATIC_POST' ? creative.caption : '';
  const hook = creative?.kind === 'STATIC_POST' ? creative.hook : undefined;
  return (
    <div className="flex flex-col bg-white">
      <IGHeader />
      <ImageSlot imageUrl={imageUrl} className="aspect-[4/5]" />
      <IGActions />
      {(hook || caption) && (
        <div className="px-2.5 pb-1.5">
          {hook && <span className="text-[9px] font-semibold text-zinc-900">{hook} </span>}
          {caption && <span className="text-[9px] leading-snug text-zinc-700 line-clamp-3">{caption}</span>}
        </div>
      )}
      <IGTabBar />
    </div>
  );
}

// ─── Instagram Carousel (4:5 per slide) ──────────────────────────────────────

function InstagramCarouselContent({ creative, imageUrl }: { creative?: CreativeContent | null; imageUrl?: string }) {
  const slides = creative?.kind === 'CAROUSEL' ? creative.slides : [];
  const caption = creative?.kind === 'CAROUSEL' ? creative.caption : '';
  const count = Math.max(slides.length, 1);
  const [idx, setIdx] = useState(0);
  const slide = slides[idx];

  return (
    <div className="flex flex-col bg-white">
      <IGHeader />
      <div className="relative">
        <ImageSlot imageUrl={imageUrl} className="aspect-[4/5]" />
        {slide && (
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-3 pb-3 pt-10">
            {slide.headline && <p className="text-[10px] font-bold leading-tight text-white">{slide.headline}</p>}
            {slide.body && <p className="mt-0.5 text-[9px] leading-snug text-white/80 line-clamp-2">{slide.body}</p>}
          </div>
        )}
        {count > 1 && (
          <>
            <button
              type="button"
              onClick={() => setIdx(i => Math.max(0, i - 1))}
              disabled={idx === 0}
              className="absolute left-1.5 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-0.5 text-white disabled:opacity-30"
            >
              <ChevronLeft className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={() => setIdx(i => Math.min(count - 1, i + 1))}
              disabled={idx >= count - 1}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-0.5 text-white disabled:opacity-30"
            >
              <ChevronRight className="h-3 w-3" />
            </button>
            <div className="absolute bottom-1.5 left-0 right-0 flex justify-center gap-1">
              {slides.map((_, i) => (
                <div key={i} className={`h-1 rounded-full transition-all ${i === idx ? 'w-3 bg-blue-400' : 'w-1 bg-white/50'}`} />
              ))}
            </div>
          </>
        )}
      </div>
      <IGActions />
      {caption && <p className="px-2.5 pb-1.5 text-[9px] leading-snug text-zinc-700 line-clamp-2">{caption}</p>}
      <IGTabBar />
    </div>
  );
}

// ─── Instagram Story (9:16 full-bleed) ───────────────────────────────────────

function InstagramStoryContent({ creative, imageUrl }: { creative?: CreativeContent | null; imageUrl?: string }) {
  const frames = creative?.kind === 'STORY' ? creative.frames : [];
  const count = Math.max(frames.length, 1);
  const [idx, setIdx] = useState(0);
  const frame = frames[idx];

  return (
    <div className="relative h-[480px] w-full overflow-hidden bg-zinc-900">
      {imageUrl ? (
        <img src={imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-80" />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-zinc-700 to-zinc-900" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30" />

      <div className="absolute inset-x-2 top-2 flex gap-1">
        {Array.from({ length: count }).map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setIdx(i)}
            className={`h-[2px] flex-1 rounded-full transition-all ${i <= idx ? 'bg-white' : 'bg-white/30'}`}
          />
        ))}
      </div>

      <div className="absolute inset-x-2 top-5 flex items-center gap-1.5">
        <IGAvatar />
        <span className="text-[9px] font-semibold text-white">workspace</span>
        <span className="text-[9px] text-white/50">· 2h</span>
      </div>

      {frame && (
        <div className="absolute inset-x-3 bottom-6">
          {frame.headline && <p className="text-sm font-bold leading-tight text-white drop-shadow-md">{frame.headline}</p>}
          {frame.body && <p className="mt-1 text-[10px] leading-snug text-white/80 drop-shadow line-clamp-3">{frame.body}</p>}
          {frame.cta && (
            <div className="mt-2 inline-block rounded-full bg-white px-3 py-1 text-[9px] font-semibold text-zinc-950">
              {frame.cta}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Reel / TikTok concept ────────────────────────────────────────────────────

function ReelContent({ creative, imageUrl }: { creative?: CreativeContent | null; imageUrl?: string }) {
  const hook = creative?.kind === 'SHORT_VIDEO' ? creative.hook : creative?.kind === 'STATIC_POST' ? creative.hook : '';
  const caption = creative?.kind === 'SHORT_VIDEO' ? (creative.caption ?? '') : '';

  return (
    <div className="relative h-[480px] w-full overflow-hidden bg-zinc-900">
      {imageUrl ? (
        <img src={imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-zinc-800 to-zinc-950" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />

      <div className="absolute bottom-20 right-2 flex flex-col items-center gap-4">
        {[
          { Icon: Heart, label: '12k' },
          { Icon: MessageCircle, label: '348' },
          { Icon: Bookmark, label: 'Save' },
          { Icon: Send, label: 'Share' },
        ].map(({ Icon, label }) => (
          <div key={label} className="flex flex-col items-center gap-0.5">
            <Icon className="h-5 w-5 text-white" />
            <span className="text-[8px] text-white/80">{label}</span>
          </div>
        ))}
      </div>

      <div className="absolute inset-x-3 bottom-6 pr-12">
        <div className="flex items-center gap-1.5">
          <IGAvatar />
          <span className="text-[9px] font-semibold text-white">workspace</span>
        </div>
        {hook && <p className="mt-1 text-[10px] font-bold leading-snug text-white drop-shadow-md line-clamp-2">{hook}</p>}
        {caption && <p className="mt-0.5 text-[9px] leading-snug text-white/70 line-clamp-2">{caption}</p>}
      </div>
    </div>
  );
}

// ─── Facebook Post ────────────────────────────────────────────────────────────

function FacebookPostContent({ creative, imageUrl }: { creative?: CreativeContent | null; imageUrl?: string }) {
  const caption = creative?.kind === 'STATIC_POST' ? creative.caption
    : creative?.kind === 'TEXT_POST' ? creative.body
    : '';
  const hook = creative?.kind === 'STATIC_POST' ? creative.hook : undefined;

  return (
    <div className="flex flex-col bg-white">
      <div className="flex items-start gap-2 px-2.5 pt-2.5 pb-1.5">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-600">
          <span className="text-[9px] font-bold text-white">W</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[9px] font-semibold leading-tight text-zinc-900">Workspace</p>
          <p className="text-[8px] text-zinc-400">Sponsored ·</p>
        </div>
        <MoreHorizontal className="h-3.5 w-3.5 text-zinc-400" />
      </div>
      {(hook || caption) && (
        <p className="px-2.5 pb-1.5 text-[9px] leading-snug text-zinc-800 line-clamp-3">
          {hook ? `${hook} ${caption}` : caption}
        </p>
      )}
      <ImageSlot imageUrl={imageUrl} className="aspect-[1.91/1]" />
      <div className="flex items-center justify-around border-t border-zinc-100 py-1.5">
        {([
          ['ThumbsUp', 'Like'],
          ['MessageCircle', 'Comment'],
          ['Send', 'Share'],
        ] as const).map(([, label]) => (
          <div key={label} className="flex items-center gap-1">
            {label === 'Like' && <ThumbsUp className="h-3 w-3 text-zinc-500" />}
            {label === 'Comment' && <MessageCircle className="h-3 w-3 text-zinc-500" />}
            {label === 'Share' && <Send className="h-3 w-3 text-zinc-500" />}
            <span className="text-[8px] text-zinc-500">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Email preview (full-width, no device frame) ──────────────────────────────

function EmailContent({ creative, imageUrl }: { creative?: CreativeContent | null; imageUrl?: string }) {
  const subject = creative?.kind === 'EMAIL' ? creative.subject
    : creative?.kind === 'NEWSLETTER' ? creative.subject
    : '';
  const preheader = creative && 'preheader' in creative ? (creative as { preheader?: string }).preheader : undefined;
  const headline = creative?.kind === 'EMAIL' ? creative.headline : undefined;
  const body = creative?.kind === 'EMAIL'
    ? (typeof creative.body === 'string' ? creative.body : creative.body.sections.map(s => s.body).join('\n'))
    : creative?.kind === 'NEWSLETTER'
    ? creative.sections.map(s => s.body).join('\n')
    : '';
  const cta = creative && 'cta' in creative && creative.cta ? (creative as { cta?: { label: string } }).cta : null;

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
      <div className="border-b border-zinc-100 bg-zinc-50 px-4 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Email preview</p>
        {subject && <p className="mt-1 text-xs font-semibold text-zinc-900">{subject}</p>}
        {preheader && <p className="mt-0.5 text-[10px] text-zinc-400">{preheader}</p>}
      </div>
      <div className="bg-zinc-950 px-5 py-4 text-white">
        {headline && <h2 className="text-base font-semibold leading-tight">{headline}</h2>}
        {!headline && <div className="h-5 w-2/3 rounded bg-zinc-800" />}
      </div>
      {imageUrl ? (
        <div className="aspect-[3/1] w-full overflow-hidden bg-zinc-100">
          <img src={imageUrl} alt="" className="h-full w-full object-cover" />
        </div>
      ) : (
        <div className="aspect-[3/1] w-full bg-gradient-to-br from-zinc-100 to-zinc-200" />
      )}
      <div className="px-5 py-4">
        {body ? (
          <p className="text-xs leading-relaxed text-zinc-700 line-clamp-6">{body}</p>
        ) : (
          <div className="space-y-2">
            {[1, 0.8, 0.9].map((w, i) => (
              <div key={i} className="h-3 rounded bg-zinc-100" style={{ width: `${w * 100}%` }} />
            ))}
          </div>
        )}
        {cta && (
          <div className="mt-4">
            <span className="inline-block rounded-full bg-zinc-950 px-4 py-2 text-xs font-semibold text-white">
              {cta.label}
            </span>
          </div>
        )}
      </div>
      <div className="border-t border-zinc-100 px-5 py-3">
        <p className="text-[10px] text-zinc-400">You received this because you subscribed.</p>
      </div>
    </div>
  );
}

// ─── Planned content badge ────────────────────────────────────────────────────

function PlannedBadge({ planned }: { planned: PlatformPreviewPlanned }) {
  return (
    <div className="w-full rounded-xl border border-amber-100 bg-amber-50 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-600">Content plan — not yet generated</p>
      <p className="mt-1.5 text-xs font-medium text-zinc-800">{planned.title}</p>
      <p className="mt-0.5 text-[10px] text-zinc-500">{planned.purpose}</p>
      {planned.primaryMessage && (
        <p className="mt-2 text-[10px] text-zinc-600"><span className="text-zinc-400">Message · </span>{planned.primaryMessage}</p>
      )}
      {planned.hookDirection && (
        <p className="mt-1 text-[10px] text-zinc-600"><span className="text-zinc-400">Hook · </span>{planned.hookDirection}</p>
      )}
    </div>
  );
}

// ─── Main dispatcher ──────────────────────────────────────────────────────────

export function PlatformPreview({ channel, format, device: _device, creative, planned, imageUrl, loading }: Props) {
  if (loading) {
    return (
      <div className="flex flex-col items-center">
        <IPhoneFrame>
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-zinc-300" />
          </div>
        </IPhoneFrame>
      </div>
    );
  }

  const ch = channel.toLowerCase();
  const fmt = format.toLowerCase();
  const isEmail = ch === 'email' || fmt === 'newsletter';

  if (isEmail) {
    return (
      <div className="flex flex-col gap-3">
        <EmailContent creative={creative} imageUrl={imageUrl} />
        {planned && <PlannedBadge planned={planned} />}
      </div>
    );
  }

  const isStory = fmt === 'story';
  const isCarousel = fmt === 'carousel';
  const isReel = fmt === 'short-video' || fmt === 'reel' || ch === 'tiktok';
  const isFacebook = ch === 'facebook';

  return (
    <div className="flex flex-col items-center gap-3">
      <IPhoneFrame>
        {isStory ? (
          <InstagramStoryContent creative={creative} imageUrl={imageUrl} />
        ) : isCarousel ? (
          <InstagramCarouselContent creative={creative} imageUrl={imageUrl} />
        ) : isReel ? (
          <ReelContent creative={creative} imageUrl={imageUrl} />
        ) : isFacebook ? (
          <FacebookPostContent creative={creative} imageUrl={imageUrl} />
        ) : (
          <InstagramFeedContent creative={creative} imageUrl={imageUrl} />
        )}
      </IPhoneFrame>
      {planned && <PlannedBadge planned={planned} />}
    </div>
  );
}

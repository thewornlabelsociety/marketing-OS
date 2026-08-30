import { Heart, MessageCircle, Send } from 'lucide-react';
import { useApp } from '../../app/AppContext';

export function InstagramFeedPreview() {
  const { dropDraft, activeEntity } = useApp();
  const brandKit = activeEntity?.brandKit;
  const bg = brandKit?.backgroundColor ?? '#F5F5F5';
  const accent = brandKit?.primaryColor ?? '#09090B';

  return (
    <div className="bg-white text-[#09090B]">
      <div className="flex items-center gap-2 border-b border-[#E4E4E7] px-3 py-2">
        <div
          className="flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold text-white"
          style={{ backgroundColor: accent }}
        >
          {(dropDraft.brand || activeEntity?.name || 'B').slice(0, 1)}
        </div>
        <div>
          <p className="text-xs font-semibold">{dropDraft.brand || activeEntity?.name || 'brand'}</p>
          <p className="text-[10px] text-[#71717A]">Sponsored</p>
        </div>
      </div>

      <div
        className="flex aspect-[4/5] items-center justify-center p-6 text-center"
        style={{ backgroundColor: bg }}
      >
        <div>
          <p className="text-[10px] uppercase tracking-widest text-[#71717A]">New drop</p>
          <p
            className="mt-2 text-sm font-semibold leading-snug"
            style={{ fontFamily: brandKit?.typography?.heading ?? 'inherit' }}
          >
            {dropDraft.title || 'Your drop title appears here'}
          </p>
          {dropDraft.price && (
            <p className="mt-2 text-xs font-medium" style={{ color: accent }}>
              {dropDraft.price}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex gap-3">
          <Heart className="h-4 w-4" />
          <MessageCircle className="h-4 w-4" />
          <Send className="h-4 w-4" />
        </div>
      </div>

      <div className="px-3 pb-4">
        <p className="text-xs font-semibold">{dropDraft.brand || activeEntity?.name}</p>
        <p className="mt-1 text-xs leading-relaxed text-[#52525B]">
          {dropDraft.hook || dropDraft.body || 'Hook and caption preview update as you type.'}
        </p>
      </div>
    </div>
  );
}

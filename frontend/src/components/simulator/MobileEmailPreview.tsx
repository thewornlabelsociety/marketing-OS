import { useApp } from '../../app/AppContext';

export function MobileEmailPreview() {
  const { dropDraft, activeEntity } = useApp();
  const brandKit = activeEntity?.brandKit;
  const accent = brandKit?.primaryColor ?? '#09090B';
  const bg = brandKit?.backgroundColor ?? '#FFFFFF';

  return (
    <div className="bg-[#FAFAFA] text-[#09090B]">
      <div className="border-b border-[#E4E4E7] bg-white px-3 py-3">
        <p className="text-[10px] text-[#71717A]">Inbox · {dropDraft.brand || activeEntity?.name}</p>
        <p className="mt-1 text-sm font-semibold">
          {dropDraft.title ? `New drop: ${dropDraft.title}` : 'Your email subject line'}
        </p>
        <p className="text-[10px] text-[#71717A]">Just now</p>
      </div>

      <div className="p-3">
        <div className="overflow-hidden rounded-xl border border-[#E4E4E7] bg-white">
          <div className="px-4 py-3" style={{ backgroundColor: accent }}>
            <p className="text-xs font-semibold text-white">
              {dropDraft.brand || activeEntity?.name || 'Brand'}
            </p>
          </div>
          <div className="space-y-3 p-4" style={{ backgroundColor: bg }}>
            <p
              className="text-sm font-semibold leading-snug"
              style={{ fontFamily: brandKit?.typography?.heading ?? 'inherit' }}
            >
              {dropDraft.hook || 'Your hook drives the open.'}
            </p>
            <p className="text-xs leading-relaxed text-[#52525B]">
              {dropDraft.body || 'Body copy preview for your mobile email campaign.'}
            </p>
            {dropDraft.price && (
              <p className="text-sm font-medium" style={{ color: accent }}>
                {dropDraft.price}
              </p>
            )}
            <div
              className="inline-block rounded-lg px-4 py-2 text-xs font-semibold text-white"
              style={{ backgroundColor: accent }}
            >
              Shop the drop
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

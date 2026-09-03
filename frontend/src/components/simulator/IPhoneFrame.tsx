import type { ReactNode } from 'react';

export function IPhoneFrame({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center">
      {title && <p className="mb-3 text-xs font-medium uppercase tracking-wide text-[#71717A]">{title}</p>}
      <div className="relative w-[260px] rounded-[2rem] border-[6px] border-[#09090B] bg-[#09090B] p-2 shadow-xl">
        <div className="absolute left-1/2 top-2 z-10 h-5 w-24 -translate-x-1/2 rounded-full bg-[#09090B]" />
        <div className="overflow-hidden rounded-[1.5rem] bg-white">
          <div className="flex items-center justify-between px-4 pb-1 pt-7 text-[10px] text-[#09090B]">
            <span>9:41</span>
            <div className="flex gap-1">
              <span className="h-2 w-2 rounded-full bg-[#09090B]" />
              <span className="h-2 w-3 rounded-sm bg-[#09090B]" />
            </div>
          </div>
          <div className="h-[480px] overflow-y-auto">{children}</div>
          <div className="flex justify-center py-2">
            <div className="h-1 w-24 rounded-full bg-[#E4E4E7]" />
          </div>
        </div>
      </div>
    </div>
  );
}

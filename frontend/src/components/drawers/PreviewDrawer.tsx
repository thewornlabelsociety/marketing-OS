import { Monitor, X } from 'lucide-react';
import { type ReactNode, useState } from 'react';

interface PreviewDrawerProps {
  children: ReactNode;
  label?: string;
}

// PreviewDrawer trigger — renders a small device icon that opens a right-side preview panel.
// Only render this component when there is actual content to preview.
export function PreviewDrawerTrigger({ children, label = 'Preview' }: PreviewDrawerProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        title={label}
        aria-label={label}
        onClick={() => setOpen(true)}
        className="inline-flex items-center justify-center rounded-lg border border-[#E4E4E7] p-2 text-[#71717A] transition hover:bg-[#FAFAFA] hover:text-[#09090B]"
      >
        <Monitor className="h-4 w-4" />
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Close preview"
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          <aside className="fixed right-0 top-0 z-50 flex h-full w-[600px] flex-col border-l border-[#E4E4E7] bg-[#FAFAFA] shadow-xl">
            <header className="flex shrink-0 items-center justify-between border-b border-[#E4E4E7] bg-white px-5 py-4">
              <p className="text-sm font-semibold text-[#09090B]">{label}</p>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setOpen(false)}
                className="rounded-lg p-1.5 text-[#71717A] hover:bg-[#FAFAFA]"
              >
                <X className="h-4 w-4" />
              </button>
            </header>
            <div className="flex-1 overflow-y-auto">
              {children}
            </div>
          </aside>
        </>
      )}
    </>
  );
}

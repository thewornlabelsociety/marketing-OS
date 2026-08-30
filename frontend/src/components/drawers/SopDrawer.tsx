import { CheckSquare, X } from 'lucide-react';
import { useState } from 'react';

interface SopStep {
  label: string;
  done: boolean;
}

interface SopDrawerProps {
  context?: string;
  steps?: SopStep[];
}

// SOP drawer trigger — renders as a header icon button that opens the context-aware SOP drawer.
export function SopDrawerTrigger({ context, steps }: SopDrawerProps) {
  const [open, setOpen] = useState(false);
  const total = steps?.length ?? 0;
  const done = steps?.filter((s) => s.done).length ?? 0;

  return (
    <>
      <button
        type="button"
        title="Standard operating procedure"
        onClick={() => setOpen(true)}
        className="relative inline-flex items-center justify-center rounded-lg border border-[#E4E4E7] p-2 text-[#71717A] transition hover:bg-[#FAFAFA] hover:text-[#09090B]"
      >
        <CheckSquare className="h-4 w-4" />
        {total > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#09090B] text-[9px] font-semibold text-white">
            {done}/{total}
          </span>
        )}
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Close"
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          <aside className="fixed right-0 top-0 z-50 flex h-full w-80 flex-col border-l border-[#E4E4E7] bg-white shadow-xl">
            <header className="flex items-center justify-between border-b border-[#E4E4E7] px-5 py-4">
              <div>
                <p className="text-sm font-semibold text-[#09090B]">SOP</p>
                {context && (
                  <p className="mt-0.5 text-xs text-[#71717A]">{context}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-1.5 text-[#71717A] hover:bg-[#FAFAFA]"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="flex-1 overflow-y-auto p-5">
              {(!steps || steps.length === 0) ? (
                <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                  <CheckSquare className="h-8 w-8 text-[#A1A1AA]" />
                  <p className="text-sm font-medium text-[#09090B]">No SOP for this context</p>
                  <p className="text-xs text-[#71717A]">SOPs will appear here once configured for this workspace.</p>
                </div>
              ) : (
                <ol className="space-y-3">
                  {steps.map((step, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <span
                        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                          step.done
                            ? 'bg-[#09090B] text-white'
                            : 'border border-[#E4E4E7] text-[#71717A]'
                        }`}
                      >
                        {step.done ? '✓' : i + 1}
                      </span>
                      <span className={`text-sm ${step.done ? 'line-through text-[#A1A1AA]' : 'text-[#09090B]'}`}>
                        {step.label}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </div>

            {total > 0 && (
              <footer className="border-t border-[#E4E4E7] px-5 py-3">
                <div className="flex items-center justify-between text-xs text-[#71717A]">
                  <span>{done} of {total} complete</span>
                  <div className="h-1.5 w-32 overflow-hidden rounded-full bg-[#F4F4F5]">
                    <div
                      className="h-full rounded-full bg-[#09090B] transition-all"
                      style={{ width: `${total > 0 ? (done / total) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              </footer>
            )}
          </aside>
        </>
      )}
    </>
  );
}

import { ChevronDown, Target } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Objective } from '../../types';

interface Props {
  objectives: Objective[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
}

export function ObjectivePicker({ objectives, value, onChange, placeholder = 'Select an objective…' }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = objectives.find((o) => o.id === value) ?? null;

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-lg border border-[#E4E4E7] px-3 py-2 text-sm text-left transition hover:bg-[#FAFAFA] focus:outline-none focus:border-[#A1A1AA]"
      >
        <div className="flex items-center gap-2 min-w-0">
          <Target className="h-4 w-4 shrink-0 text-[#71717A]" />
          {selected ? (
            <span className="truncate text-[#09090B]">{selected.name}</span>
          ) : (
            <span className="text-[#A1A1AA]">{placeholder}</span>
          )}
        </div>
        <ChevronDown className={`h-4 w-4 shrink-0 text-[#71717A] transition ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-80 overflow-y-auto rounded-xl border border-[#E4E4E7] bg-white shadow-lg">
          {objectives.length === 0 ? (
            <p className="px-4 py-3 text-sm text-[#A1A1AA]">No objectives available.</p>
          ) : (
            <>
              {['system', 'custom'].map((group) => {
                const items = objectives.filter((o) => (group === 'system' ? o.isSystem : !o.isSystem));
                if (items.length === 0) return null;
                return (
                  <div key={group}>
                    <p className="px-4 py-2 text-[10px] font-semibold uppercase tracking-widest text-[#A1A1AA]">
                      {group === 'system' ? 'System' : 'Custom'}
                    </p>
                    {items.map((obj) => (
                      <button
                        key={obj.id}
                        type="button"
                        onClick={() => { onChange(obj.id); setOpen(false); }}
                        className={`flex w-full flex-col items-start px-4 py-3 text-left transition hover:bg-[#FAFAFA] ${
                          obj.id === value ? 'bg-[#FAFAFA]' : ''
                        }`}
                      >
                        <span className="text-sm font-medium text-[#09090B]">{obj.name}</span>
                        {obj.description && (
                          <span className="mt-0.5 text-xs text-[#71717A]">{obj.description}</span>
                        )}
                        <span className="mt-1 text-[10px] uppercase tracking-wide text-[#A1A1AA]">
                          KPI: {obj.primaryKpi}
                        </span>
                      </button>
                    ))}
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}

      {selected && (
        <p className="mt-1.5 text-xs text-[#71717A]">
          Primary KPI: <span className="font-medium text-[#09090B]">{selected.primaryKpi}</span>
          {selected.description && <span> — {selected.description}</span>}
        </p>
      )}
    </div>
  );
}

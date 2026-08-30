import { ChevronDown } from 'lucide-react';
import { useState, type ReactNode } from 'react';

interface AdvancedSectionProps {
  label?: string;
  children: ReactNode;
  defaultOpen?: boolean;
}

export function AdvancedSection({ label = 'Advanced', children, defaultOpen = false }: AdvancedSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border-t border-[#E4E4E7] pt-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-sm font-medium text-[#71717A] hover:text-[#09090B] transition"
      >
        <ChevronDown
          className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`}
        />
        {label}
      </button>
      {open && <div className="mt-4 space-y-4">{children}</div>}
    </div>
  );
}

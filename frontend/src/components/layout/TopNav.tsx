import { Brain, Layers, Plus, Sparkles } from 'lucide-react';
import { useApp } from '../../app/AppContext';
import { EntitySwitcher } from './EntitySwitcher';

interface TopNavProps {
  showBrandControls: boolean;
  onCreateBrand: () => void;
}

export function TopNav({ showBrandControls, onCreateBrand }: TopNavProps) {
  const { setActiveTab } = useApp();

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-[#E4E4E7] bg-white px-5">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#E4E4E7] bg-white">
          <Sparkles className="h-4 w-4 text-[#09090B]" />
        </div>
        <div>
          <p className="text-sm font-semibold tracking-tight text-[#09090B]">Marketing OS</p>
          <p className="text-xs text-[#71717A]">Desktop Studio</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {showBrandControls ? (
          <>
            <EntitySwitcher />
            <button
              type="button"
              onClick={() => setActiveTab('brand-brain')}
              className="inline-flex items-center gap-2 rounded-lg border border-[#E4E4E7] px-3 py-1.5 text-sm font-medium text-[#09090B] transition hover:bg-[#FAFAFA]"
            >
              <Brain className="h-4 w-4" />
              Brand Brain
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={onCreateBrand}
            className="inline-flex items-center gap-2 rounded-lg bg-[#09090B] px-3 py-1.5 text-sm font-medium text-white transition hover:bg-[#27272A]"
          >
            <Plus className="h-4 w-4" />
            Create Brand
          </button>
        )}
        <div className="hidden items-center gap-2 rounded-lg border border-[#E4E4E7] px-3 py-1.5 text-xs text-[#71717A] md:flex">
          <Layers className="h-3.5 w-3.5" />
          v1.0
        </div>
      </div>
    </header>
  );
}

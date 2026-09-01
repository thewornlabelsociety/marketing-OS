import { Plus, Sparkles } from 'lucide-react';
import { useApp } from '../../app/AppContext';
import { WorkspaceMenu } from './WorkspaceMenu';

interface TopNavProps {
  showBrandControls: boolean;
  onCreateBrand: () => void;
}

export function TopNav({ showBrandControls, onCreateBrand }: TopNavProps) {
  const { newStudioSession } = useApp();

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-[#E4E4E7] bg-white px-5">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#09090B] text-white shadow-sm">
          <Sparkles className="h-4 w-4" />
        </div>
        <div>
          <p className="text-sm font-semibold tracking-tight text-[#09090B]">MarketingOS</p>
          <p className="text-[11px] text-[#71717A]">Creative operating system</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {showBrandControls ? (
          <>
            <button
              type="button"
              onClick={newStudioSession}
              className="inline-flex items-center gap-2 rounded-lg bg-[#09090B] px-3 py-1.5 text-sm font-medium text-white transition hover:bg-[#27272A]"
            >
              <Plus className="h-4 w-4" />
              Create
            </button>
            <WorkspaceMenu onCreateWorkspace={onCreateBrand} />
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
      </div>
    </header>
  );
}

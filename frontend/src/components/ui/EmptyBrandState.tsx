import { Layers, Plus } from 'lucide-react';

interface EmptyBrandStateProps {
  onCreateBrand: () => void;
}

export function EmptyBrandState({ onCreateBrand }: EmptyBrandStateProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center p-10 text-center">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-[#E4E4E7] bg-[#FAFAFA]">
        <Layers className="h-7 w-7 text-[#A1A1AA]" />
      </div>
      <h1 className="text-2xl font-semibold tracking-tight text-[#09090B]">Marketing OS</h1>
      <p className="mt-2 max-w-sm text-sm font-medium text-[#09090B]">
        Create your first brand workspace.
      </p>
      <p className="mt-3 max-w-sm text-sm leading-relaxed text-[#71717A]">
        Set up your brand voice, audience, visual rules and content preferences. Marketing OS will
        use these rules throughout your workspace.
      </p>
      <button
        type="button"
        onClick={onCreateBrand}
        className="mt-8 inline-flex items-center gap-2 rounded-lg bg-[#09090B] px-5 py-2.5 text-sm font-medium text-white transition hover:bg-[#27272A]"
      >
        <Plus className="h-4 w-4" />
        Create Brand
      </button>
    </div>
  );
}

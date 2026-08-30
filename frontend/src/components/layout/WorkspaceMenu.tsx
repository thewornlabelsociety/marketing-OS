import { Brain, Check, ChevronDown, Plug, Plus, Target } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useApp } from '../../app/AppContext';

interface Props {
  onCreateWorkspace: () => void;
}

export function WorkspaceMenu({ onCreateWorkspace }: Props) {
  const { entities, activeEntity, setActiveEntityId, setActiveTab } = useApp();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function navigate(tab: Parameters<typeof setActiveTab>[0]) {
    setActiveTab(tab);
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 rounded-lg border border-[#E4E4E7] px-3 py-1.5 text-sm font-medium text-[#09090B] transition hover:bg-[#FAFAFA] focus:outline-none"
      >
        <span className="max-w-[140px] truncate">{activeEntity?.name ?? 'Select workspace'}</span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-[#71717A] transition ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-56 overflow-hidden rounded-xl border border-[#E4E4E7] bg-white shadow-lg">
          {/* Workspace switcher */}
          {entities.length > 0 && (
            <div className="py-1">
              <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-widest text-[#A1A1AA]">
                Workspace
              </p>
              {entities.map((entity) => (
                <button
                  key={entity.id}
                  type="button"
                  onClick={() => { setActiveEntityId(entity.id); setOpen(false); }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-left hover:bg-[#FAFAFA]"
                >
                  <span className="flex-1 truncate text-[#09090B]">{entity.name}</span>
                  {entity.id === activeEntity?.id && (
                    <Check className="h-3.5 w-3.5 shrink-0 text-[#09090B]" />
                  )}
                </button>
              ))}
            </div>
          )}

          <div className="border-t border-[#E4E4E7] py-1">
            <button
              type="button"
              onClick={() => { onCreateWorkspace(); setOpen(false); }}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-left text-[#09090B] hover:bg-[#FAFAFA]"
            >
              <Plus className="h-4 w-4 shrink-0 text-[#71717A]" />
              Create workspace
            </button>
          </div>

          {/* Configuration */}
          {activeEntity && (
            <>
              <div className="border-t border-[#E4E4E7] py-1">
                <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-widest text-[#A1A1AA]">
                  Configuration
                </p>
                <button
                  type="button"
                  onClick={() => navigate('integrations')}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-left text-[#09090B] hover:bg-[#FAFAFA]"
                >
                  <Plug className="h-4 w-4 shrink-0 text-[#71717A]" />
                  Integrations
                </button>
                <button
                  type="button"
                  onClick={() => navigate('brand-brain')}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-left text-[#09090B] hover:bg-[#FAFAFA]"
                >
                  <Brain className="h-4 w-4 shrink-0 text-[#71717A]" />
                  Brand Brain
                </button>
                <button
                  type="button"
                  onClick={() => navigate('objectives')}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-left text-[#09090B] hover:bg-[#FAFAFA]"
                >
                  <Target className="h-4 w-4 shrink-0 text-[#71717A]" />
                  Objectives
                </button>
              </div>

              <div className="border-t border-[#E4E4E7] px-3 py-2">
                <p className="text-[10px] text-[#A1A1AA]">Marketing OS v1.0</p>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

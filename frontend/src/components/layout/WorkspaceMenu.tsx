import { Check, ChevronDown, Plus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useApp } from '../../app/AppContext';

interface Props {
  onCreateWorkspace: () => void;
}

export function WorkspaceMenu({ onCreateWorkspace }: Props) {
  const { entities, activeEntity, setActiveEntityId } = useApp();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const visibleEntities = entities.filter(entity => !isDevelopmentWorkspace(entity));

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
          {visibleEntities.length > 0 && (
            <div className="py-1">
              <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-widest text-[#A1A1AA]">
                Workspace
              </p>
              {visibleEntities.map((entity) => (
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

        </div>
      )}
    </div>
  );
}

function isDevelopmentWorkspace(entity: { id: string; name: string }): boolean {
  return entity.id.startsWith('ws_')
    || entity.id.startsWith('entity_test')
    || entity.id === 'entity_workspace_b_'
    || /^(workspace [ab]|empty workspace|test |brand ws$|[ab]$|ws[ _])/i.test(entity.name.trim());
}

import { ChevronDown } from 'lucide-react';
import { useApp } from '../../app/AppContext';

export function EntitySwitcher() {
  const { entities, activeEntity, setActiveEntityId, loading } = useApp();

  return (
    <div className="relative">
      <label className="sr-only" htmlFor="entity-switcher">
        Active entity
      </label>
      <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#71717A]">
        <ChevronDown className="h-4 w-4" />
      </div>
      <select
        id="entity-switcher"
        value={activeEntity?.id ?? ''}
        disabled={loading || entities.length === 0}
        onChange={(e) => setActiveEntityId(e.target.value)}
        className="appearance-none rounded-lg border border-[#E4E4E7] bg-white py-1.5 pl-9 pr-8 text-sm font-medium text-[#09090B] outline-none transition hover:bg-[#FAFAFA] focus:border-[#A1A1AA]"
      >
        {entities.map((entity) => (
          <option key={entity.id} value={entity.id}>
            {entity.name} · {entity.archetype}
          </option>
        ))}
      </select>
    </div>
  );
}

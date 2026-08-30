import { CalendarDays, BarChart3, PenSquare } from 'lucide-react';
import { useApp } from '../../app/AppContext';
import type { AppTab } from '../../types';

const tabs: { id: AppTab; label: string; icon: typeof PenSquare }[] = [
  { id: 'studio', label: 'Studio', icon: PenSquare },
  { id: 'calendar', label: 'Drop Calendar', icon: CalendarDays },
  { id: 'performance', label: 'Performance Logger', icon: BarChart3 },
];

export function SidebarNav() {
  const { activeTab, setActiveTab } = useApp();

  return (
    <nav className="flex w-56 shrink-0 flex-col border-r border-[#E4E4E7] bg-white p-4">
      <p className="mb-3 px-2 text-xs font-medium uppercase tracking-wide text-[#71717A]">
        Workspace
      </p>
      <div className="space-y-1">
        {tabs.map(({ id, label, icon: Icon }) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className={`flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition ${
                active
                  ? 'bg-[#09090B] text-white'
                  : 'text-[#09090B] hover:bg-[#FAFAFA]'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

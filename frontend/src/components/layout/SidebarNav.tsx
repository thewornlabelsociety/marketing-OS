import {
  BarChart3,
  CalendarDays,
  LayoutDashboard,
  Library,
  Rocket,
} from 'lucide-react';
import { useApp } from '../../app/AppContext';
import type { AppTab } from '../../types';

interface NavItem {
  id: AppTab;
  label: string;
  icon: typeof Rocket;
}

const PRIMARY_NAV: NavItem[] = [
  { id: 'campaigns', label: 'Campaigns', icon: Rocket },
  { id: 'calendar', label: 'Calendar', icon: CalendarDays },
  { id: 'performance', label: 'Performance', icon: BarChart3 },
];

export function SidebarNav() {
  const { activeTab, setActiveTab } = useApp();

  return (
    <nav className="flex w-48 shrink-0 flex-col border-r border-[#E4E4E7] bg-white">
      <div className="space-y-0.5 p-3 pt-4">
        {/* Disabled placeholder — Dashboard (not yet built) */}
        <div
          title="Coming soon"
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-[#A1A1AA] cursor-not-allowed select-none"
        >
          <LayoutDashboard className="h-4 w-4 shrink-0" />
          Dashboard
        </div>

        {PRIMARY_NAV.map(({ id, label, icon: Icon }) => {
          const active = activeTab === id || (id === 'campaigns' && activeTab === 'campaign-detail');
          return (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium transition ${
                active
                  ? 'bg-[#09090B] text-white'
                  : 'text-[#09090B] hover:bg-[#FAFAFA]'
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </button>
          );
        })}

        {/* Disabled placeholder — Library (not yet built) */}
        <div
          title="Coming soon"
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-[#A1A1AA] cursor-not-allowed select-none"
        >
          <Library className="h-4 w-4 shrink-0" />
          Library
        </div>
      </div>
    </nav>
  );
}

import {
  BarChart3,
  CalendarDays,
  CirclePlus,
  LayoutDashboard,
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
  { id: 'dashboard', label: 'Today', icon: LayoutDashboard },
  { id: 'create', label: 'Create', icon: CirclePlus },
  { id: 'campaigns', label: 'Campaigns', icon: Rocket },
  { id: 'calendar', label: 'Calendar', icon: CalendarDays },
  { id: 'learn', label: 'Learn', icon: BarChart3 },
];

export function SidebarNav() {
  const { activeTab, setActiveTab } = useApp();

  return (
    <nav className="flex w-52 shrink-0 flex-col border-r border-[#E4E4E7] bg-[#FAFAFA]">
      <div className="space-y-1 p-3 pt-5">
        {PRIMARY_NAV.map(({ id, label, icon: Icon }) => {
          const active = activeTab === id || (id === 'campaigns' && activeTab === 'campaign-detail');
          return (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
            className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition ${
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
      </div>
    </nav>
  );
}

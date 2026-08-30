import {
  BarChart3,
  BookOpen,
  Brain,
  CalendarDays,
  LayoutDashboard,
  Library,
  PenSquare,
  Rocket,
  Target,
} from 'lucide-react';
import { useApp } from '../../app/AppContext';
import type { AppTab } from '../../types';

interface NavItem {
  id: AppTab;
  label: string;
  icon: typeof LayoutDashboard;
  disabled?: boolean;
}

const PRIMARY_NAV: NavItem[] = [
  { id: 'campaigns', label: 'Campaigns', icon: Rocket },
  { id: 'create', label: 'Create', icon: PenSquare },
  { id: 'calendar', label: 'Calendar', icon: CalendarDays },
  { id: 'performance', label: 'Performance', icon: BarChart3 },
];

const PLACEHOLDER_NAV = [
  { label: 'Dashboard', icon: LayoutDashboard },
  { label: 'Library', icon: Library },
];

const WORKSPACE_NAV: NavItem[] = [
  { id: 'brand-brain', label: 'Brand Brain', icon: Brain },
  { id: 'objectives', label: 'Objectives', icon: Target },
  { id: 'studio', label: 'Studio', icon: BookOpen },
];

export function SidebarNav() {
  const { activeTab, setActiveTab } = useApp();

  function NavBtn({ id, label, icon: Icon }: NavItem) {
    const active = activeTab === id;
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
  }

  return (
    <nav className="flex w-52 shrink-0 flex-col border-r border-[#E4E4E7] bg-white">
      <div className="flex-1 space-y-6 p-3 pt-4">
        <div className="space-y-0.5">
          {PRIMARY_NAV.map((item) => (
            <NavBtn key={item.id} {...item} />
          ))}
          {PLACEHOLDER_NAV.map(({ label, icon: Icon }) => (
            <div
              key={label}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-[#A1A1AA] cursor-not-allowed select-none"
              title="Coming soon"
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </div>
          ))}
        </div>

        <div className="space-y-0.5">
          <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-widest text-[#A1A1AA]">
            Workspace
          </p>
          {WORKSPACE_NAV.map((item) => (
            <NavBtn key={item.id} {...item} />
          ))}
        </div>
      </div>
    </nav>
  );
}

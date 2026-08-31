import { useState } from 'react';
import { AppProvider, useApp } from './app/AppContext';
import { BrandKitDrawer } from './components/drawers/BrandKitDrawer';
import { SidebarNav } from './components/layout/SidebarNav';
import { TopNav } from './components/layout/TopNav';
import { SimulatorPanel } from './components/simulator/SimulatorPanel';
import { EmptyBrandState } from './components/ui/EmptyBrandState';
import CalendarPage from './features/calendar/CalendarPage';
import PerformancePage from './features/performance/PerformancePage';
import { StudioTab } from './features/studio/StudioTab';
import BrandSetupWizard from './features/brands/BrandSetupWizard';
import BrandBrainPage from './features/brands/BrandBrainPage';
import ObjectiveLibraryPage from './features/objectives/ObjectiveLibraryPage';
import CampaignsPage from './features/campaigns/CampaignsPage';
import CampaignLibraryPage from './features/archive/CampaignLibraryPage';
import CampaignDetailPage from './features/campaigns/CampaignDetailPage';
import DashboardPage from './features/dashboard/DashboardPage';
import IntegrationsPage from './features/integrations/IntegrationsPage';
import CreatePage from './features/create/CreatePage';
import LearnPage from './features/learn/LearnPage';

function AppShell() {
  const { activeTab, activeCampaignId, entities, loading, error } = useApp();
  const [showWizard, setShowWizard] = useState(false);

  const hasEntities = entities.length > 0;

  return (
    <div className="flex h-full flex-col bg-white">
      <TopNav
        showBrandControls={hasEntities}
        onCreateBrand={() => setShowWizard(true)}
      />

      <div className="flex min-h-0 flex-1">
        {hasEntities && <SidebarNav />}

        <main className="min-w-0 flex-1 overflow-y-auto bg-white">
          {loading && (
            <div className="flex h-full items-center justify-center p-10 text-sm text-[#71717A]">
              Loading workspace…
            </div>
          )}

          {!loading && error && (
            <div className="m-6 rounded-xl border border-[#E4E4E7] bg-white p-6">
              <p className="text-sm font-medium text-[#09090B]">Backend unavailable</p>
              <p className="mt-1 text-sm text-[#71717A]">
                Start the backend on port 4100, then refresh. {error}
              </p>
            </div>
          )}

          {!loading && !error && !hasEntities && (
            <EmptyBrandState onCreateBrand={() => setShowWizard(true)} />
          )}

          {!loading && !error && hasEntities && (
            <>
              {activeTab === 'dashboard' && <DashboardPage />}
              {activeTab === 'create' && <CreatePage />}
              {activeTab === 'campaigns' && <CampaignsPage />}
              {activeTab === 'campaign-detail' && <CampaignDetailPage campaignId={activeCampaignId} />}
              {activeTab === 'brand-brain' && <BrandBrainPage />}
              {activeTab === 'objectives' && <ObjectiveLibraryPage />}
              {activeTab === 'calendar' && <CalendarPage />}
              {activeTab === 'performance' && <PerformancePage />}
              {activeTab === 'library' && <CampaignLibraryPage />}
              {activeTab === 'integrations' && <IntegrationsPage />}
              {activeTab === 'studio' && <StudioTab />}
              {activeTab === 'learn' && <LearnPage />}
            </>
          )}
        </main>

        {hasEntities && activeTab === 'studio' && <SimulatorPanel />}
      </div>

      {hasEntities && <BrandKitDrawer />}
      {showWizard && <BrandSetupWizard onClose={() => setShowWizard(false)} />}
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppShell />
    </AppProvider>
  );
}

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..', 'src');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const checks = [];

function expect(label, file, pattern) {
  const source = read(file);
  const passed = typeof pattern === 'string' ? source.includes(pattern) : pattern.test(source);
  checks.push({ label, passed });
}

expect('Primary navigation follows Today → Create → Campaigns → Calendar → Learn', 'components/layout/SidebarNav.tsx', /Today[\s\S]*Create[\s\S]*Campaigns[\s\S]*Calendar[\s\S]*Learn/);
expect('Legacy analytics is not a primary destination', 'components/layout/SidebarNav.tsx', /const primaryItems[\s\S]*?];/);
expect('Worn Label is preferred when available', 'app/AppContext.tsx', "e.name.trim().toLowerCase() === 'worn label'");
expect('Development workspaces never enter the entity switcher', 'components/layout/WorkspaceMenu.tsx', "entity.id.startsWith('ws_')");
expect('Today has a clear starting action', 'features/dashboard/DashboardPage.tsx', 'Start here');
expect('Today keeps the empty state calm and actionable', 'features/dashboard/DashboardPage.tsx', 'Nothing scheduled yet. Create or approve content to begin planning the week.');
expect('Create uses the real campaign creation flow', 'features/create/CreatePage.tsx', 'CampaignCreateDrawer');
expect('Create supports continuing existing work', 'features/create/CreatePage.tsx', 'Add to existing work');
expect('Studio preview uses the same editable draft', 'components/drawers/ContentStudioDrawer.tsx', /<ChannelPreview[\s\S]*creative=\{draft\}/);
expect('Studio communicates unsaved preview state', 'components/drawers/ContentStudioDrawer.tsx', 'Previewing unsaved changes');
expect('Editing approved work clearly reopens review', 'components/drawers/ContentStudioDrawer.tsx', 'Editing this will send it back for review.');
expect('Scheduling offers plain-language publication modes', 'components/drawers/ScheduleItemDrawer.tsx', /I’ll publish this myself[\s\S]*Export for publishing[\s\S]*Publish automatically/);
expect('Unknown publication state is explained honestly', 'components/drawers/ScheduleItemDrawer.tsx', 'We’re not certain this published');
expect('Manual resolution requires verification evidence', 'components/drawers/ScheduleItemDrawer.tsx', /Verification evidence[\s\S]*text-red-600/);
expect('Calendar states the canonical timezone', 'features/calendar/CalendarPage.tsx', 'Times shown in {calendarTz}');
expect('Calendar humanizes internal content keys', 'features/calendar/CalendarPage.tsx', 'humanContentTitle(item.contentKey)');
expect('Learn uses real performance and blueprint data', 'features/learn/LearnPage.tsx', /getPerformanceSummary[\s\S]*getDashboard[\s\S]*getBlueprints/);
expect('Learn frames findings as decisions', 'features/learn/LearnPage.tsx', /Worth repeating[\s\S]*Needs a different approach/);
expect('Reduced-motion preferences are respected', 'index.css', '@media (prefers-reduced-motion: reduce)');
expect('App routes the five primary product areas', 'App.tsx', /activeTab === 'dashboard'[\s\S]*activeTab === 'create'[\s\S]*activeTab === 'campaigns'[\s\S]*activeTab === 'calendar'[\s\S]*activeTab === 'learn'/);

// The legacy labels may still exist in secondary campaign tools, but must not be primary navigation items.
const nav = read('components/layout/SidebarNav.tsx');
const primaryBlock = nav.match(/const primaryItems[\s\S]*?];/)?.[0] ?? '';
checks[1].passed = !/Performance|Library|Studio/.test(primaryBlock);

for (const check of checks) console.log(`${check.passed ? 'PASS' : 'FAIL'} ${check.label}`);
const failed = checks.filter((check) => !check.passed);
console.log(`\n${checks.length - failed.length}/${checks.length} Phase 3P checks passed.`);
if (failed.length) process.exit(1);

import { ArrowRight, FilePlus2, PenTool, Plus, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useApp } from '../../app/AppContext';
import { Button, EmptyState, PageHeader, StatusPill } from '../../components/ui/ProductUI';
import { CampaignCreateDrawer } from '../campaigns/CampaignCreateDrawer';
import { api } from '../../services/api';
import type { Campaign } from '../../types';

export default function CreatePage() {
  const { activeEntity, setActiveCampaignId, setActiveTab } = useApp();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  useEffect(() => { if (activeEntity) api.getCampaigns(activeEntity.id).then(setCampaigns).catch(() => setCampaigns([])); }, [activeEntity]);
  const unfinished = campaigns.filter(c => !['COMPLETE', 'CANCELLED', 'ARCHIVED'].includes(c.status)).slice(0, 4);
  const open = (id: string) => { setActiveCampaignId(id); setActiveTab('campaign-detail'); };
  return <div className="mos-page max-w-6xl">
    <PageHeader eyebrow={activeEntity?.name ?? 'Your workspace'} title="What are we making?" description="Start with the marketing job. MarketingOS will keep the campaign, creative, approval and publishing details connected underneath." />
    <section className="grid gap-px overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-200 lg:grid-cols-2">
      <button type="button" onClick={() => setShowCreate(true)} className="group bg-white p-7 text-left transition hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-zinc-950"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-zinc-950 text-white"><Plus className="h-5 w-5" /></span><h2 className="mt-8 text-xl font-semibold tracking-tight">Start a new campaign</h2><p className="mt-2 max-w-sm text-sm leading-6 text-zinc-500">Tell us what you are marketing and what you want people to do. Build the content from there.</p><span className="mt-6 inline-flex items-center gap-2 text-sm font-semibold">Start creating <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" /></span></button>
      <button type="button" onClick={() => setActiveTab('campaigns')} className="group bg-zinc-50 p-7 text-left transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-zinc-950"><span className="flex h-11 w-11 items-center justify-center rounded-xl border border-zinc-200 bg-white"><PenTool className="h-5 w-5" /></span><h2 className="mt-8 text-xl font-semibold tracking-tight">Add to existing work</h2><p className="mt-2 max-w-sm text-sm leading-6 text-zinc-500">Open a campaign, choose a planned piece, and continue directly in Studio.</p><span className="mt-6 inline-flex items-center gap-2 text-sm font-semibold">Choose a campaign <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" /></span></button>
    </section>
    <section><div className="mb-3 flex items-center justify-between"><div><p className="mos-eyebrow">Continue</p><h2 className="mt-1 text-lg font-semibold tracking-tight">Work already in motion</h2></div><Button variant="quiet" onClick={() => setActiveTab('campaigns')}>View all</Button></div>
      {unfinished.length ? <div className="divide-y divide-zinc-100 border-y border-zinc-200">{unfinished.map(c => <button key={c.id} type="button" onClick={() => open(c.id)} className="group flex w-full items-center gap-4 py-4 text-left hover:bg-zinc-50/70"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-100"><FilePlus2 className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{humanCampaignName(c)}</span><span className="mt-1 block truncate text-xs text-zinc-500">{c.sourceTitle} · {c.objectiveName ?? 'Marketing campaign'}</span></span><StatusPill>{humanStatus(c.status)}</StatusPill><ArrowRight className="h-4 w-4 text-zinc-400 transition group-hover:translate-x-1" /></button>)}</div> : <EmptyState icon={<Sparkles className="h-6 w-6" />} title="A clear place to begin" description="Start your first campaign, then its planned content will appear here ready for Studio." action={<Button onClick={() => setShowCreate(true)}>Create campaign</Button>} />}
    </section>{showCreate && <CampaignCreateDrawer onClose={() => setShowCreate(false)} />}
  </div>;
}
function humanCampaignName(c: Campaign): string { return c.name.startsWith('Campaign camp_') ? `${c.sourceTitle || 'Untitled'} campaign` : c.name; }
function humanStatus(status: string): string { return ({ DRAFTING:'In progress', READY_FOR_REVIEW:'Ready to review', READY_FOR_APPROVAL:'Ready to approve', APPROVED:'Ready to schedule', SCHEDULED:'Scheduled', PUBLISHED:'Published', MEASURING:'Learning', COMPLETE:'Complete' } as Record<string,string>)[status] ?? status.replaceAll('_',' ').toLowerCase(); }

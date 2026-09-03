import { AlertCircle, ArrowRight, CalendarDays, CheckCircle2, Lightbulb, Plus, Sparkles, X } from 'lucide-react';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useApp, type RecommendationSeed } from '../../app/AppContext';
import { Button, EmptyState, PageHeader } from '../../components/ui/ProductUI';
import { api } from '../../services/api';
import type { DashboardSnapshot, AttentionSignal } from '../../types/dashboard';
import { NewArrivalsSource } from '../sources/NewArrivalsSource';

interface RecommendationItem { id: string; recommendationType: string; title: string; summary: string; rationale: string; priority: number; primaryChannel: string; contentType: string | null; sourceProductIds: string[]; hook: string | null; angle: string | null; cta: string | null; talkingPoints: string[] | null; }

export default function DashboardPage() {
  const { activeEntity, setActiveTab, setActiveCampaignId, newStudioSession, launchFromRecommendation } = useApp();
  const [dashboard, setDashboard] = useState<DashboardSnapshot | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const [recommendations, setRecommendations] = useState<RecommendationItem[]>([]);
  const [recsLoading, setRecsLoading] = useState(false);
  const workspaceId = activeEntity?.id ?? '';
  const load = useCallback(async () => { if (!workspaceId) return; setLoading(true); setError(''); try { setDashboard(await api.getDashboard(workspaceId)); } catch (e) { setError((e as Error).message); } finally { setLoading(false); } }, [workspaceId]);
  useEffect(() => { void load(); }, [load]);
  // Mount: GET persisted recommendations only — zero AI calls, zero generation side effects
  useEffect(() => {
    if (!workspaceId) return;
    void api.getRecommendations().then(r => { setRecommendations((r.recommendations ?? []) as unknown as RecommendationItem[]); }).catch(() => {});
  }, [workspaceId]);
  // Explicit operator action only — POST /generate triggers AI generation
  const generateRecs = useCallback(async () => {
    if (recsLoading) return;
    setRecsLoading(true);
    try {
      const r = await api.generateRecommendations();
      setRecommendations((r.recommendations ?? []) as unknown as RecommendationItem[]);
    } catch { /* generation failures are silent — operator can retry */ }
    finally { setRecsLoading(false); }
  }, [recsLoading]);
  const navigate = (target: string) => { const [kind,id,section] = target.split(':'); if (kind === 'campaign') { setActiveCampaignId(id); if (section) sessionStorage.setItem('campaignDetailTab',section); setActiveTab('campaign-detail'); } else if (kind === 'library') setActiveTab('learn'); };
  const dismiss = async (id:string) => { await api.dismissAttentionSignal(id,workspaceId); await load(); };
  const dismissRec = async (id: string) => { await api.dismissRecommendation(id); setRecommendations(prev => prev.filter(r => r.id !== id)); };
  const launchRec = (rec: RecommendationItem) => {
    const seed: RecommendationSeed = { recommendationId: rec.id, recommendationType: rec.recommendationType, sourceProductIds: rec.sourceProductIds, contentType: rec.contentType, title: rec.title, hook: rec.hook, angle: rec.angle, cta: rec.cta, talkingPoints: rec.talkingPoints };
    launchFromRecommendation(seed);
  };
  if (loading) return <div className="mos-page max-w-6xl"><Header name={activeEntity?.name}/><div className="space-y-3"><div className="mos-skeleton h-28"/><div className="mos-skeleton h-16"/><div className="mos-skeleton h-16"/></div></div>;
  if (!dashboard) return <div className="mos-page max-w-6xl"><Header name={activeEntity?.name}/>{/* We couldn&apos;t load your dashboard */}<EmptyState icon={<AlertCircle className="h-6 w-6"/>} title="We couldn't load your dashboard" description="Your work is still safe. Check the connection and try again." action={<Button variant="secondary" onClick={()=>void load()}>Try again</Button>}/>{import.meta.env.DEV && error && <p className="text-xs text-zinc-400">{error}</p>}</div>;
  const firstAction = dashboard.needsAttention[0] ?? dashboard.readyForYou[0]; const insight = dashboard.performance.highPerforming[0] ?? dashboard.performance.underperforming[0];
  return <div className="mos-page max-w-6xl"><Header name={activeEntity?.name} action={<Button onClick={()=>newStudioSession()}><Plus className="h-4 w-4"/> Create content</Button>}/>
    {firstAction ? <button type="button" onClick={()=>firstAction.actionTarget && navigate(firstAction.actionTarget)} className="group flex w-full items-center gap-5 rounded-2xl bg-zinc-950 px-6 py-5 text-left text-white transition hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10"><ArrowRight className="h-5 w-5"/></span><span className="min-w-0 flex-1"><span className="text-[10px] font-bold uppercase tracking-[.16em] text-zinc-400">Start here</span><span className="mt-1 block text-lg font-semibold tracking-tight">{humanTitle(firstAction.title)}</span><span className="mt-1 block text-sm text-zinc-300">{humanSummary(firstAction.summary)}</span></span><ArrowRight className="h-5 w-5 transition group-hover:translate-x-1"/></button> : <div className="flex items-center gap-4 rounded-2xl bg-emerald-50 px-6 py-5 text-emerald-950"><CheckCircle2 className="h-6 w-6"/><div><p className="font-semibold">You're clear for now</p><p className="text-sm text-emerald-800">Nothing needs immediate attention.</p></div></div>}
    <section className="border-t border-zinc-200 pt-7">
      <div className="mb-4 flex items-end justify-between">
        <div><p className="mos-eyebrow">What to create next</p><h2 className="mt-1 text-xl font-semibold tracking-tight">Your marketing expert</h2></div>
        {recommendations.length > 0 && <button onClick={()=>void generateRecs()} disabled={recsLoading} className="text-xs text-zinc-400 hover:text-zinc-700 disabled:opacity-40">Refresh</button>}
      </div>
      {recommendations.length > 0
        ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{recommendations.slice(0,3).map(rec=><div key={rec.id} className="relative flex flex-col rounded-2xl border border-zinc-200 bg-white p-4"><button onClick={()=>void dismissRec(rec.id)} className="absolute right-3 top-3 rounded-full p-1 text-zinc-300 hover:text-zinc-600"><X className="h-3.5 w-3.5"/></button><span className="mb-2 inline-flex items-center gap-1.5 self-start rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-indigo-700">{rec.recommendationType.split('_').join(' ')}</span><p className="text-sm font-semibold leading-snug">{rec.title}</p><p className="mt-1 text-xs leading-5 text-zinc-500 line-clamp-2">{rec.summary}</p><div className="mt-auto pt-3"><button onClick={()=>launchRec(rec)} className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-zinc-950 px-3 py-2 text-xs font-semibold text-white transition hover:bg-zinc-800">Create this <ArrowRight className="h-3.5 w-3.5"/></button></div></div>)}</div>
        : <div className="flex items-center justify-between rounded-2xl border border-dashed border-zinc-200 px-6 py-5"><div><p className="text-sm font-semibold text-zinc-700">What should we market today?</p><p className="mt-1 text-xs text-zinc-500">Analyse your inventory, calendar and recent content to suggest what to create next.</p></div><Button variant="secondary" onClick={()=>void generateRecs()} disabled={recsLoading}>{recsLoading ? 'Thinking...' : 'Recommend what to create'}</Button></div>
      }
    </section>
    <div className="grid gap-10 lg:grid-cols-[1.3fr_.7fr]"><section>
      <div className="mb-3"><p className="mos-eyebrow">Today's work</p><h2 className="mt-1 text-xl font-semibold tracking-tight">What needs you</h2></div>
      <div className="divide-y divide-zinc-200 border-y border-zinc-200">
        {dashboard.needsAttention.slice(1,5).map(s=><Signal key={s.id} signal={s} onAction={navigate} onDismiss={dismiss}/>)}
        {dashboard.needsAttention.slice(1).length === 0 && <p className="py-7 text-sm text-zinc-500">Nothing needs immediate attention.</p>}
      </div>
      {dashboard.readyForYou.length > 0 && <>
        <p className="mos-eyebrow mt-6 mb-2">Worth doing next</p>
        <div className="divide-y divide-zinc-200 border-y border-zinc-200">
          {dashboard.readyForYou.slice(0,3).map(s=><Signal key={s.id} signal={s} onAction={navigate} onDismiss={dismiss}/>)}
        </div>
      </>}
      {(dashboard.counts.needsAttention + dashboard.counts.readyForReview) > 0 && <button onClick={()=>setActiveTab('campaigns')} className="mt-3 text-xs text-zinc-400 hover:text-zinc-700">View all work ({dashboard.counts.needsAttention + dashboard.counts.readyForReview})</button>}
    </section>
      <section><p className="mos-eyebrow">Coming next</p><h2 className="mt-1 text-xl font-semibold tracking-tight">On the calendar</h2><div className="mt-3 space-y-1">{dashboard.upcoming.slice(0,4).map(u=><button key={u.scheduleId} onClick={()=>setActiveTab('calendar')} className="flex w-full gap-3 rounded-xl px-2 py-3 text-left hover:bg-zinc-50"><CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400"/><span><span className="block text-sm font-medium">{friendlyName(u.campaignName,u.contentKey)}</span><span className="mt-1 block text-xs text-zinc-500">{u.localDayLabel} · {u.localTimeLabel} · {titleCase(u.channel)}</span></span></button>)}{dashboard.upcoming.length===0&&<p className="mt-3 rounded-xl bg-zinc-50 p-4 text-sm text-zinc-500">Nothing scheduled yet. Create or approve content to begin planning the week.</p>}</div></section></div>
    {sectionHasContent(insight) && <section className="grid gap-5 border-t border-zinc-200 pt-7 md:grid-cols-[auto_1fr_auto]"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-700"><Lightbulb className="h-5 w-5"/></span><div><p className="mos-eyebrow">Useful learning</p><p className="mt-1 text-base font-semibold">{insight.campaignName}</p><p className="mt-1 text-sm leading-6 text-zinc-500">{insight.reasons?.[0] ?? `${insight.primaryKpi} is the clearest signal so far.`}</p></div><Button variant="quiet" onClick={()=>setActiveTab('learn')}>See what worked <ArrowRight className="h-4 w-4"/></Button></section>}
    {activeEntity?.name.trim().toLowerCase()==='worn label'&&<NewArrivalsSource/>}
    {dashboard.empty && <EmptyState icon={<Sparkles className="h-7 w-7"/>} title="Your marketing week starts here" description="Create a campaign and MarketingOS will guide it from idea to published work." action={<Button onClick={()=>newStudioSession()}>Create your first content</Button>}/>}</div>;
}
function Header({name,action}:{name?:string;action?:ReactNode}) { const day = new Intl.DateTimeFormat('en-NZ',{weekday:'long',day:'numeric',month:'long'}).format(new Date()); return <PageHeader eyebrow={`${day} · ${name ?? 'Your workspace'}`} title="What needs your attention today?" description="A calm view of the decisions, publishing work and useful signals that move your marketing forward." action={action}/>; }
function Signal({signal,onAction,onDismiss}:{signal:AttentionSignal;onAction:(s:string)=>void;onDismiss:(s:string)=>void}) { return <div className="group flex items-start gap-4 py-4"><span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${signal.severity==='CRITICAL'||signal.severity==='HIGH'?'bg-red-500':'bg-amber-500'}`}/><div className="min-w-0 flex-1"><p className="text-sm font-semibold">{humanTitle(signal.title)}</p>{signal.summary&&<p className="mt-1 text-sm leading-5 text-zinc-500">{humanSummary(signal.summary)}</p>}</div>{signal.dismissible&&<button onClick={()=>onDismiss(signal.id)} className="text-xs text-zinc-400 hover:text-zinc-700">Dismiss</button>}{signal.actionTarget&&<button onClick={()=>onAction(signal.actionTarget!)} className="flex items-center gap-1 text-xs font-semibold">{signal.actionLabel??'Open'} <ArrowRight className="h-3 w-3"/></button>}</div>; }
function humanTitle(value:string){return value.replace(/Campaign camp_[\w-]+/g,'Campaign').replace(/Publishing failed/i,'Needs publishing attention').replace(/Media issue/i,'Creative needs media');}
function humanSummary(value?:string){return (value??'').replace(/Publish outcome unknown — reconciliation required/i,"We're not certain this published. Check the external post before taking action.").replace(/provider/gi,'connected platform');}
function friendlyName(campaign:string,key:string){if(!campaign.startsWith('Campaign camp_'))return campaign; return key.replaceAll('-',' ').replace(/\b\w/g,m=>m.toUpperCase());}
function titleCase(value:string){return value.toLowerCase().replace(/\b\w/g,m=>m.toUpperCase());}
function sectionHasContent<T>(value: T | null | undefined): value is T { return value !== null && value !== undefined; }

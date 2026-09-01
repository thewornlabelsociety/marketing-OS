import { ArrowRight, Check, ImageOff, PackageOpen } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../../app/AppContext';
import { api } from '../../services/api';
import type { BusinessIntegration, SourceProduct } from '../../types';
import { Button, EmptyState, StatusPill } from '../../components/ui/ProductUI';

const primaryFilters = [
  ['all','All available'],
  ['new_arrivals','New arrivals'],
  ['current','Current stock'],
  ['not_featured','Not featured'],
  ['sale','Sale'],
] as const;
const secondaryFilters = [['sold','History']] as const;

export function NewArrivalsSource() {
  const { activeEntity,setActiveTab,setSelectedSourceProductIds }=useApp(); const [products,setProducts]=useState<SourceProduct[]>([]); const [integration,setIntegration]=useState<BusinessIntegration|null>(null);
  const [filter,setFilter]=useState('all'); const [selected,setSelected]=useState<string[]>([]); const [loading,setLoading]=useState(true); const [error,setError]=useState(''); const workspaceId=activeEntity?.id??'';
  const load=useCallback(async()=>{if(!workspaceId)return;setLoading(true);setError('');try{await api.establishLocalOperatorSession();const [items,integrations]=await Promise.all([api.getSourceProducts(workspaceId,filter),api.getBusinessIntegrations(workspaceId)]);setProducts(items);setIntegration(integrations.find(item=>item.integrationType==='WORN_LABEL')??null);}catch(cause){setError((cause as Error).message);}finally{setLoading(false);}},[workspaceId,filter]);
  useEffect(()=>{void load();},[load]); const toggle=(id:string)=>setSelected(current=>current.includes(id)?current.filter(value=>value!==id):[...current,id]);
  const continueToCreate=()=>{setSelectedSourceProductIds(selected);setActiveTab('operator-studio');};
  const isSoldFilter=filter==='sold'; const isAvailableFilter=!isSoldFilter;
  const emptyTitle=!integration?'Worn Label is not configured':isSoldFilter?'No sold history in this source':'No products match this filter';
  const emptyDescription=!integration?'Add the server-side Worn Label settings to enable this read-only source. MarketingOS remains available.'
    :isSoldFilter?'Sold records will appear here as products sell over time.'
    :integration.lastSuccessfulSyncAt&&products.length===0&&filter==='all'?'This source has no available inventory right now. Sold records may be visible under History.'
    :'Products matching this filter will appear after the next sync.';
  return <section className="space-y-4 border-t border-zinc-200 pt-8"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="mos-eyebrow">Source</p><h2 className="mt-1 text-2xl font-semibold tracking-tight">New from Worn Label</h2><p className="mt-1 text-sm text-zinc-500">{integration?.lastSuccessfulSyncAt?`Last updated ${relativeTime(integration.lastSuccessfulSyncAt)}`:'Waiting for the first safe product sync.'}</p></div>{integration&&<StatusPill tone={integration.status==='CONNECTED'?'success':integration.status==='SYNCING'?'neutral':'warning'}>{healthLabel(integration.status)}</StatusPill>}</div>
    <div className="flex flex-wrap items-center gap-2" aria-label="Product filters">
      {primaryFilters.map(([value,label])=><button key={value} onClick={()=>setFilter(value)} className={`rounded-full px-3 py-1.5 text-xs font-medium ${filter===value?'bg-zinc-950 text-white':'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'}`}>{label}</button>)}
      <span className="mx-1 h-4 w-px bg-zinc-200 self-center" aria-hidden="true"/>
      {secondaryFilters.map(([value,label])=><button key={value} onClick={()=>setFilter(value)} className={`rounded-full px-3 py-1.5 text-xs font-medium ${filter===value?'bg-zinc-950 text-white':'bg-zinc-100 text-zinc-500 hover:bg-zinc-200'}`}>{label}</button>)}
    </div>
    {loading&&<div className="grid grid-cols-2 gap-4 md:grid-cols-4">{[1,2,3,4].map(i=><div key={i} className="mos-skeleton aspect-[4/5] rounded-2xl"/>)}</div>}
    {!loading&&error&&<EmptyState title="Worn Label products could not be loaded" description="Already synced products remain safe. Check the connection status and try again." action={<Button variant="secondary" onClick={()=>void load()}>Try again</Button>}/>}
    {!loading&&!error&&products.length===0&&<EmptyState icon={<PackageOpen className="h-6 w-6"/>} title={emptyTitle} description={emptyDescription}/>}
    {!loading&&products.length>0&&<div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">{products.map(product=>{const chosen=selected.includes(product.id);const brand=String((product.attributes as Record<string,unknown>).brand??'Worn Label');const bucket=product.marketingBucket;return <button key={product.id} type="button" onClick={()=>product.availability==='AVAILABLE'&&toggle(product.id)} aria-pressed={chosen} className={`group overflow-hidden rounded-2xl border text-left transition ${chosen?'border-zinc-950 ring-2 ring-zinc-950':'border-zinc-200 hover:border-zinc-400'}`}><div className="relative aspect-[4/5] overflow-hidden bg-zinc-100">{product.imageUrls[0]?<img src={product.imageUrls[0]} alt="" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"/>:<span className="flex h-full items-center justify-center text-zinc-400"><ImageOff/></span>}{chosen&&<span className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-zinc-950 text-white"><Check className="h-4 w-4"/></span>}{bucket&&isAvailableFilter&&<span className={`absolute left-3 top-3 rounded-full px-2 py-0.5 text-[10px] font-semibold ${bucket==='NEW'?'bg-emerald-500 text-white':bucket==='SALE'?'bg-amber-100 text-amber-800':'bg-zinc-100 text-zinc-600'}`}>{bucket==='NEW'?'New':'Sale'}</span>}{product.availability!=='AVAILABLE'&&<span className="absolute inset-x-3 bottom-3 rounded-full bg-white/90 px-3 py-1 text-center text-xs font-semibold">{product.availability==='SOLD'?'Sold':'Unavailable'}</span>}</div><span className="block p-3"><span className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400">{brand}</span><span className="mt-1 block truncate text-sm font-semibold">{product.title}</span><span className="mt-1 flex justify-between text-xs text-zinc-500"><span>{(product.attributes as Record<string,unknown>).size as string||''}</span><span>{formatPrice(product)}</span></span><span className="mt-2 block text-xs font-medium text-zinc-600">{usageLabel(product.usageStatus)}</span></span></button>})}</div>}
    {selected.length>0&&<div className="sticky bottom-4 flex items-center justify-between rounded-2xl bg-zinc-950 px-5 py-4 text-white shadow-xl"><p className="text-sm font-semibold">{selected.length} product{selected.length===1?'':'s'} selected</p><Button variant="secondary" onClick={continueToCreate}>Create content <ArrowRight className="h-4 w-4"/></Button></div>}</section>;
}
function formatPrice(product:SourceProduct){return product.priceAmount==null?'':new Intl.NumberFormat('en-NZ',{style:'currency',currency:product.priceCurrency??'NZD',maximumFractionDigits:0}).format(product.priceAmount);}
function usageLabel(status:SourceProduct['usageStatus']){const labels:{[k:string]:string}={NEVER_FEATURED:'Not featured',USED_IN_DRAFT:'Used in a draft',SCHEDULED:'Scheduled',PUBLISHED:'Featured'};return labels[status]??'';}
function healthLabel(status:BusinessIntegration['status']){const labels:{[k:string]:string}={CONNECTED:'Connected',SYNCING:'Updating',NEEDS_ATTENTION:'Needs attention',DISCONNECTED:'Disconnected'};return labels[status]??status;}
function relativeTime(value:string){const minutes=Math.max(0,Math.round((Date.now()-new Date(value).getTime())/60000));return minutes<1?'just now':minutes<60?`${minutes} min ago`:new Date(value).toLocaleString('en-NZ');}

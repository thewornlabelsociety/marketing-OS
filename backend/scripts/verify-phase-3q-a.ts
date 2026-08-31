import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

async function main() {
const tmp = path.join(os.tmpdir(), `marketing-os-3qa-${Date.now()}.db`);
process.env.SQLITE_PATH = tmp;
process.env.WORN_LABEL_API_BASE_URL = 'https://worn-label.test';
process.env.WORN_LABEL_SERVICE_TOKEN = 'test-secret-never-return';
process.env.WORN_LABEL_WORKSPACE_ID = 'worn-label';

const { initDatabase, db } = await import('../src/db/database');
const { businessIntegrationService } = await import('../src/services/business/BusinessIntegrationService');
const { sourceRecordService } = await import('../src/services/business/SourceRecordService');
const { resolveWornLabelIntegrationEnvironment } = await import('../src/config/businessIntegrationEnvironment');
initDatabase();
db.prepare("INSERT INTO entities (id,tenant_id,name,slug,brand_kit) VALUES ('worn-label','tenant_local','Worn Label','worn-label','{}'),('other','tenant_local','Other','other','{}')").run();

let mode: 'first'|'update'|'invalid'|'failure' = 'first';
let authHeader = '';
global.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
  authHeader = String((init?.headers as Record<string,string>)?.['X-Service-Token'] ?? '');
  if (mode === 'failure') return new Response('unavailable',{status:503});
  const base = { id:'101',title:'Silk Dress',brand:'Kowtow',category:'Dresses',size:'10',price:120,currency:'NZD',description:'Bias cut silk dress',publicUrl:'https://wornlabelsociety.co.nz/wls-public/product/101',primaryImageUrl:'https://images.test/101-main.jpg',images:['https://images.test/101-main.jpg'],publishedAt:'2026-08-31T01:00:00.000Z',updatedAt:mode==='first'?'2026-08-31T01:00:00.000Z':'2026-08-31T02:00:00.000Z',availability:mode==='update'?'SOLD':'AVAILABLE',condition:'Excellent'};
  const products:any[]=[mode==='update'?{...base,price:95,images:['https://images.test/101-new.jpg'],primaryImageUrl:'https://images.test/101-new.jpg'}:base];
  if(mode==='invalid')products.push({id:'bad',title:'',images:[],availability:'AVAILABLE'});
  return new Response(JSON.stringify({products,checkpoint:products[0].updatedAt}),{status:200,headers:{'content-type':'application/json'}});
}) as typeof fetch;

let passed=0; let failed=0; function check(name:string,fn:()=>void){try{fn();console.log(`PASS  ${name}`);passed++;}catch(error){console.error(`FAIL  ${name}:`,(error as Error).message);failed++;process.exitCode=1;}}

const integration=businessIntegrationService.connectWornLabelFromEnvironment('worn-label');
check('environment validates complete configuration',()=>assert.equal(resolveWornLabelIntegrationEnvironment().enabled,true));
check('capabilities are explicit and read-only',()=>assert.deepEqual(integration.capabilities,['READ_PRODUCTS','READ_AVAILABILITY']));
check('credential is absent from public integration',()=>assert.equal(JSON.stringify(integration).includes('test-secret-never-return'),false));
await businessIntegrationService.sync(integration.id,'worn-label');
check('connector uses service token privately',()=>assert.equal(authHeader,'test-secret-never-return'));
check('first import creates one product',()=>assert.equal(sourceRecordService.list('worn-label').length,1));
await businessIntegrationService.sync(integration.id,'worn-label');
check('repeated import is idempotent',()=>assert.equal(db.prepare('SELECT COUNT(*) n FROM source_records').get().n,1));
mode='update'; await businessIntegrationService.sync(integration.id,'worn-label');
check('price update changes existing snapshot',()=>assert.equal(db.prepare('SELECT price_amount FROM source_records').get().price_amount,95));
check('image update changes existing snapshot',()=>assert.match(String(db.prepare('SELECT image_urls FROM source_records').get().image_urls),/101-new/));
check('sold state updates current availability',()=>assert.equal(sourceRecordService.list('worn-label','sold')[0].availability,'SOLD'));

const now=new Date().toISOString();
db.prepare("INSERT INTO campaigns (id,workspace_id,objective_id,name,status,source_type,source_title,channels,created_at,updated_at) VALUES ('camp','worn-label','obj_sys_sales','New arrivals','DRAFTING','PRODUCT','New arrivals','[]',?,?)").run(now,now);
db.prepare("INSERT INTO creative_artifacts (id,workspace_id,campaign_id,source_content_plan_id,source_content_plan_version,content_key,deliverable_id,version,status,is_current,channel,content_type,format,title,content,quality,created_at,updated_at) VALUES ('art','worn-label','camp','plan',1,'arrival-101','del',1,'READY_FOR_REVIEW',1,'instagram','STATIC_POST','FEED_4_5','Silk Dress','{}','{}',?,?)").run(now,now);
const sourceId=`source_${integration.id}_101`;
db.prepare('INSERT INTO creative_source_links (creative_artifact_id,source_record_id,position,created_at) VALUES (?,?,0,?)').run('art',sourceId,now);
check('usage derives from production creative lineage',()=>assert.equal(sourceRecordService.list('worn-label','featured')[0].usageStatus,'USED_IN_DRAFT'));
check('sold update preserves historic creative relationship',()=>assert.equal(sourceRecordService.usage(sourceId,'worn-label').length,1));
check('not-featured filter excludes used product',()=>assert.equal(sourceRecordService.list('worn-label','not_featured').length,0));

mode='invalid'; const isolated=await businessIntegrationService.sync(integration.id,'worn-label');
check('invalid product is isolated while valid product continues',()=>assert.equal(isolated.failed,1));
const beforeFailure=db.prepare('SELECT COUNT(*) n FROM source_records').get().n;
mode='failure'; await assert.rejects(()=>businessIntegrationService.sync(integration.id,'worn-label'));
check('sync failure preserves prior products',()=>assert.equal(db.prepare('SELECT COUNT(*) n FROM source_records').get().n,beforeFailure));
check('sync failure records safe health state',()=>assert.equal(businessIntegrationService.list('worn-label')[0].status,'NEEDS_ATTENTION'));

mode='first'; const other=businessIntegrationService.connectWornLabelFromEnvironment('other'); await businessIntegrationService.sync(other.id,'other');
check('same external ID is isolated by integration',()=>assert.equal(db.prepare("SELECT COUNT(*) n FROM source_records WHERE external_id='101'").get().n,2));
check('workspace source records do not leak',()=>assert.equal(sourceRecordService.list('other').length,1));
check('API mapping excludes sensitive retail fields',()=>{const json=JSON.stringify(sourceRecordService.list('other'));assert.equal(/consignor|payout|customer|costPrice|serviceToken/i.test(json),false);});
check('missing configuration disables safely',()=>assert.equal(resolveWornLabelIntegrationEnvironment({}).enabled,false));

const routeSource=fs.readFileSync(path.resolve(__dirname,'../src/routes/businessSources.ts'),'utf8');
const sessionSource=fs.readFileSync(path.resolve(__dirname,'../src/middleware/localOperatorSession.ts'),'utf8');
check('business source routes require operator middleware',()=>assert.match(routeSource,/use\(requireLocalOperatorSession\)/));
check('local session is loopback-only and HTTP-only',()=>{assert.match(sessionSource,/isLoopback/);assert.match(sessionSource,/HttpOnly/);assert.match(sessionSource,/SameSite=Strict/);});
check('Worn Label connector has no write capability',()=>assert.equal(integration.capabilities.some((c:string)=>c.startsWith('WRITE_')),false));

console.log(`\nPhase 3Q-A verification: ${passed} passed, ${failed} failed`);
db.close(); for(const suffix of['','-wal','-shm'])try{fs.unlinkSync(tmp+suffix)}catch{}
}

void main().catch((error)=>{console.error(error);process.exitCode=1;});

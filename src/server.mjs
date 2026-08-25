import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8'};
const json=(res,status,data)=>{const body=JSON.stringify(data);res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(body);};
const body=async(req)=>{let raw='';for await(const c of req){raw+=c;if(raw.length>2_000_000)throw new Error('Request too large');}return raw?JSON.parse(raw):{};};
const attachment=(res,name,text,type='text/plain; charset=utf-8')=>{res.writeHead(200,{'content-type':type,'content-disposition':`attachment; filename="${name}"`,'cache-control':'no-store'});res.end(text);};
export const DIAGNOSTIC_EXPORT_MAX_BYTES=5_000_000;
export const DIAGNOSTIC_EXPORT_TARGET_BYTES=4_750_000;
const diagnosticPath=(o,path)=>path.reduce((v,k)=>v?.[k],o);
const trimDiagnosticArray=(d,path,keep)=>{const a=diagnosticPath(d,path);if(!Array.isArray(a)||a.length<=keep)return null;const before=a.length;a.length=keep;return {section:path.join('.'),available:before,included:keep,omitted:before-keep};};
export function serializeDiagnosticDownload(data,maxBytes=DIAGNOSTIC_EXPORT_MAX_BYTES){
  const hard=Math.max(100_000,Math.floor(Number(maxBytes)||DIAGNOSTIC_EXPORT_MAX_BYTES));
  const target=Math.min(hard,DIAGNOSTIC_EXPORT_TARGET_BYTES);
  let d=structuredClone(data||{});
  d.diagnosticExport={...(d.diagnosticExport||{}),version:'DX1',hardMaximumBytes:hard,targetMaximumBytes:target,serialization:'compact_json',hardCapEnforced:true,truncatedSections:[]};
  const encode=()=>JSON.stringify(d);
  let text=encode(),bytes=Buffer.byteLength(text,'utf8');
  const plan=[
    [['feederSignalIntelligence','records'],300],
    [['snapshots'],150],
    [['crashEpisodes'],250],
    [['patterns'],250],
    [['trackedMarkets'],250],
    [['liveMarkets'],75],
    [['openFeeders'],150],
    [['audit'],40],
    [['sports'],75],
    [['closedHunters'],150],
    [['crashLearning','states'],150],
    [['feederSignalIntelligence','records'],100],
  ];
  for(const [path,minimum] of plan){
    const a=diagnosticPath(d,path);if(!Array.isArray(a))continue;
    while(bytes>target&&a.length>minimum){const next=Math.max(minimum,Math.floor(a.length*0.7));const meta=trimDiagnosticArray(d,path,next);if(meta){const prev=d.diagnosticExport.truncatedSections.find((x)=>x.section===meta.section);if(prev){prev.included=meta.included;prev.omitted=prev.available-meta.included;}else d.diagnosticExport.truncatedSections.push(meta);}text=encode();bytes=Buffer.byteLength(text,'utf8');}
  }
  if(bytes>hard){
    const fsi=d.feederSignalIntelligence||{};
    const essential={
      settings:d.settings,riskControls:d.riskControls,health:d.health,balance:d.balance,brokerContext:d.brokerContext,
      performance:d.performance,conceptStats:d.conceptStats,feederSummary:d.feederSummary,goldenPipeline:d.goldenPipeline,goldenFeedSummary:d.goldenFeedSummary,
      entryPipeline:d.entryPipeline,entryPathConfiguration:d.entryPathConfiguration,openHunters:d.openHunters,closedHunters:Array.isArray(d.closedHunters)?d.closedHunters.slice(0,100):[],
      trackerSummary:d.trackerSummary,recoveryTracking:d.recoveryTracking,profitLearning:d.profitLearning,stopGuardRecoveryLearning:d.stopGuardRecoveryLearning,
      athena:d.athena,goldenEye:d.goldenEye,scanner:d.scanner,audit:Array.isArray(d.audit)?d.audit.slice(0,25):[],
      feederSignalIntelligence:{version:fsi.version,role:fsi.role,executionAuthority:fsi.executionAuthority,entryAuthority:fsi.entryAuthority,athenaDecisionAuthority:fsi.athenaDecisionAuthority,analysisStakeCents:fsi.analysisStakeCents,referenceProfitThresholdsCents:fsi.referenceProfitThresholdsCents,horizonMs:fsi.horizonMs,summary:fsi.summary,records:[],recordsAvailable:fsi.recordsAvailable||0,recordsIncluded:0,recordsOmitted:fsi.recordsAvailable||0,recordsCompact:true,rawObservationsIncluded:false},
      diagnosticExport:{...(d.diagnosticExport||{}),essentialFallback:true,truncatedSections:[...(d.diagnosticExport?.truncatedSections||[]),{section:'diagnostic_export',reason:'hard_cap_essential_fallback'}]},
    };
    d=essential;text=JSON.stringify(d);bytes=Buffer.byteLength(text,'utf8');
  }
  if(bytes>hard){
    d={settings:d.settings,riskControls:d.riskControls,health:d.health,performance:d.performance,conceptStats:d.conceptStats,entryPipeline:d.entryPipeline,stopGuardRecoveryLearning:d.stopGuardRecoveryLearning,scanner:d.scanner,diagnosticExport:{version:'DX1',hardMaximumBytes:hard,serialization:'compact_json',hardCapEnforced:true,emergencyMinimalFallback:true}};
    text=JSON.stringify(d);bytes=Buffer.byteLength(text,'utf8');
  }
  if(bytes>hard)throw new Error(`diagnostic_export_exceeds_hard_cap:${bytes}:${hard}`);
  for(let i=0;i<3;i+=1){d.diagnosticExport.actualBytes=bytes;text=JSON.stringify(d);const next=Buffer.byteLength(text,'utf8');if(next===bytes){bytes=next;break;}bytes=next;}
  if(bytes>hard){delete d.diagnosticExport.actualBytes;text=JSON.stringify(d);bytes=Buffer.byteLength(text,'utf8');}
  return {text,bytes,data:d};
}
const bootView=(runtime)=>({
  status:runtime.boot?.status||'unknown',
  startedAtMs:runtime.boot?.startedAtMs||0,
  lastAttemptMs:runtime.boot?.lastAttemptMs||0,
  attempts:runtime.boot?.attempts||0,
  lastError:runtime.boot?.lastError||null,
});

export function startServer(runtime,port,rootDir){const clients=new Set();let pushing=false;const push=async()=>{const engine=runtime.engine;if(pushing||!clients.size||!engine)return;pushing=true;try{const state=await engine.state();const msg=`data: ${JSON.stringify(state)}\n\n`;for(const r of clients)r.write(msg);}catch{}finally{pushing=false;}};const timer=setInterval(push,2000);
  const server=http.createServer(async(req,res)=>{try{const u=new URL(req.url,'http://localhost');const engine=runtime.engine;
    // Railway uses /health strictly as container liveness. Trading readiness is
    // intentionally separate so a slow Kalshi websocket or database retry can
    // never make Railway kill an otherwise healthy HTTP process.
    if(u.pathname==='/health')return json(res,200,{ok:true,processAlive:true,boot:bootView(runtime),engineReady:Boolean(engine),tradingReady:Boolean(engine&&!engine.health.degraded)});
    if(u.pathname==='/ready'){if(!engine)return json(res,503,{ok:false,ready:false,boot:bootView(runtime)});engine.recomputeHealth();const h=engine.health;return json(res,h.degraded?503:200,{ok:!h.degraded,ready:!h.degraded,restOk:h.restOk,websocketOk:h.websocketOk,websocketFresh:h.websocketFresh,reconciliationOk:h.reconciliationOk,protectionOk:h.protectionOk,protectionFresh:h.protectionFresh,scannerFresh:h.scannerFresh,lastWsMessageMs:h.lastWsMessageMs,lastProtectionMs:h.lastProtectionMs,lastFullScanMs:engine.lastFullScanMs,lastError:h.lastError||null});}
    if(u.pathname==='/api/events'){res.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-cache','connection':'keep-alive'});res.write('retry: 2000\n\n');clients.add(res);req.on('close',()=>clients.delete(res));return;}
    if(u.pathname.startsWith('/api/')&&!engine)return json(res,503,{error:'engine_booting',boot:bootView(runtime)});
    if(u.pathname==='/api/state'&&req.method==='GET')return json(res,200,await engine.state());
    if(u.pathname==='/api/settings'&&req.method==='PATCH')return json(res,200,await engine.patchSettings(await body(req)));
    if(u.pathname==='/api/mode'&&req.method==='POST'){const b=await body(req);return json(res,200,await engine.setMode(b.mode,b.confirmation||''));}
    if(u.pathname==='/api/engine'&&req.method==='POST'){const b=await body(req);return json(res,200,await engine.setEngine(Boolean(b.active)));}
    if(u.pathname==='/api/run-scan'&&req.method==='POST'){engine.requestScan();return json(res,202,{ok:true,requested:true});}
    if(u.pathname==='/api/reset-dashboard'&&req.method==='POST')return json(res,200,await engine.resetDashboard());
    if(u.pathname==='/api/reset-simulation'&&req.method==='POST')return json(res,200,{archived:await engine.resetSimulation()});
    if(u.pathname==='/api/manual-cashout'&&req.method==='POST')return json(res,200,await engine.manualCashout(await body(req)));
    if(u.pathname==='/api/credentials'&&req.method==='POST'){const b=await body(req);return json(res,200,await engine.saveCredentials(b.keyId,b.privateKeyPem));}
    if(u.pathname==='/api/test-connection'&&req.method==='POST')return json(res,200,await engine.testConnection());
    if(u.pathname==='/api/diagnostics'&&req.method==='GET')return json(res,200,await engine.diagnostics());
    if(u.pathname==='/api/diagnostics/download'&&req.method==='GET'){const d=await engine.diagnostics();const out=serializeDiagnosticDownload(d);return attachment(res,`sagittarius-diagnostics-${new Date().toISOString().replace(/[:.]/g,'-')}.json`,out.text,'application/json; charset=utf-8');}
    if(u.pathname==='/api/trading-logs/download'&&req.method==='GET')return attachment(res,`sagittarius-trading-logs-${new Date().toISOString().replace(/[:.]/g,'-')}.txt`,await engine.tradingLogText());
    if(u.pathname==='/api/athena/download'&&req.method==='GET'){const d=engine.athenaBrainDocument();return attachment(res,`SAGITTARIUS-ATHENA-B1-${d.brain.brainHash.slice(0,12)}.json`,JSON.stringify(d,null,2),'application/json; charset=utf-8');}
    if(u.pathname==='/api/athena/install'&&req.method==='POST')return json(res,200,await engine.installAthenaBrain(await body(req)));
    if(u.pathname==='/api/athena/rebuild'&&req.method==='POST')return json(res,200,await engine.rebuildAthenaBrain());
    if(req.method!=='GET')return json(res,404,{error:'not_found'});
    const rel=u.pathname==='/'?'index.html':normalize(u.pathname).replace(/^[/\\]+/,'');if(rel.includes('..'))return json(res,403,{error:'forbidden'});const file=join(rootDir,'public',rel);try{const data=await readFile(file);res.writeHead(200,{'content-type':mime[extname(file)]||'application/octet-stream','cache-control':extname(file)==='.html'?'no-store':'public, max-age=300'});res.end(data);}catch{const data=await readFile(join(rootDir,'public','index.html'));res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});res.end(data);}
  }catch(e){json(res,500,{error:String(e?.message||e)});}});
  server.listen(port,'0.0.0.0');server.on('close',()=>clearInterval(timer));return server;
}

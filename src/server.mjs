import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8'};
const json=(res,status,data)=>{const body=JSON.stringify(data);res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(body);};
const body=async(req)=>{let raw='';for await(const c of req){raw+=c;if(raw.length>2_000_000)throw new Error('Request too large');}return raw?JSON.parse(raw):{};};
const attachment=(res,name,text,type='text/plain; charset=utf-8')=>{const bytes=Buffer.byteLength(String(text??''),'utf8');res.writeHead(200,{'content-type':type,'content-disposition':`attachment; filename="${name}"`,'content-length':String(bytes),'cache-control':'no-store'});res.end(text);};
export const DIAGNOSTIC_EXPORT_MAX_BYTES=2_000_000;
export const DIAGNOSTIC_EXPORT_TARGET_BYTES=1_850_000;
export const TRADING_LOG_EXPORT_MAX_BYTES=2_000_000;
export const TRADING_LOG_EXPORT_TARGET_BYTES=1_900_000;
export const DIAGNOSTIC_COLLECTION_TIMEOUT_MS=5_000;
export const TRADING_LOG_COLLECTION_TIMEOUT_MS=5_000;

function deadline(promise,timeoutMs,label){
  const ms=Math.max(1,Math.floor(Number(timeoutMs)||1));
  let timer;
  const timeout=new Promise((_,reject)=>{
    timer=setTimeout(()=>reject(new Error(`${label}_timeout_after_${ms}ms`)),ms);
  });
  return Promise.race([Promise.resolve(promise),timeout]).finally(()=>clearTimeout(timer));
}

function runtimeOnlyIncidentDiagnostic(engine,error){
  const settings=engine?.settings&&typeof engine.settings==='object'?structuredClone(engine.settings):{};
  const health=engine?.health&&typeof engine.health==='object'?structuredClone(engine.health):{};
  const entryQueue=engine?.entryEvaluationQueue?.snapshot?.()||null;
  const protectionQueue=engine?.quoteProtectionQueue?.snapshot?.()||null;
  let entryPipeline=null,resourceUsage=null;
  try{entryPipeline=engine?.strategy?.entryPipelineSummary?.()||null;}catch{}
  try{resourceUsage=engine?.resourceUsageSnapshot?.()||null;}catch{}
  return {
    settings,health,resourceUsage,
    riskControls:{
      incidentDiagnosticFallback:'RUNTIME_ONLY_NO_DB',
      advisoryLockIsolation:'DEDICATED_LOCK_POOL',
      advisoryLockPoolMaximumConnections:2,
      resourceGovernor:resourceUsage?.version||'RGM4',
      resourceGovernorTradingAuthority:false,
      entryEvaluationBackpressure:entryQueue,
      quoteProtectionBackpressure:protectionQueue,
    },
    entryPipeline,
    incidentRuntime:{
      collectionComplete:false,
      reason:String(error?.message||error||'diagnostic_collection_failed'),
      capturedAtMs:Date.now(),
      lastError:engine?.lastError||health?.lastError||null,
      lastFullScanMs:Number(engine?.lastFullScanMs||0),
      scanRequested:Boolean(engine?.scanRequested),
      running:Boolean(engine?.running),
      protectedTickerCount:Number(engine?.protectedTickers?.size||0),
      recoveryPriorityTickerCount:Number(engine?.recoveryPriorityTickers?.size||0),
      feederPriorityTickerCount:Number(engine?.feederPriorityTickers?.size||0),
      crashPriorityTickerCount:Number(engine?.crashPriorityTickers?.size||0),
    },
    diagnosticExport:{
      version:'DX2',collectionComplete:false,incidentFallback:true,
      fallbackScope:'runtime_only_no_database_queries',
      hardMaximumBytes:DIAGNOSTIC_EXPORT_MAX_BYTES,targetMaximumBytes:DIAGNOSTIC_EXPORT_TARGET_BYTES,
    },
  };
}

export async function collectDiagnosticData(engine,{timeoutMs=DIAGNOSTIC_COLLECTION_TIMEOUT_MS}={}){
  // R54/RGM3: explicit historical diagnostics yield to open-trade safety under
  // memory pressure. Runtime-only incident evidence requires no history fanout.
  if(engine?.resourceResearchDeferred===true)return runtimeOnlyIncidentDiagnostic(engine,new Error('diagnostic_deferred_resource_pressure'));
  try{return await deadline(engine.diagnostics(),timeoutMs,'diagnostic_collection');}
  catch(error){return runtimeOnlyIncidentDiagnostic(engine,error);}
}

export async function collectTradingLogText(engine,{timeoutMs=TRADING_LOG_COLLECTION_TIMEOUT_MS}={}){
  if(engine?.resourceResearchDeferred===true){
    const e=runtimeOnlyIncidentDiagnostic(engine,new Error('trading_log_deferred_resource_pressure'));
    return [
      '=== SAGITTARIUS TRADING LOG EXPORT FALLBACK ===',
      'collection_complete=false',
      'fallback_scope=runtime_only_no_database_queries',
      `reason=${String(e.incidentRuntime.reason).replace(/[\r\n]+/g,' ')}`,
      `captured_at_ms=${e.incidentRuntime.capturedAtMs}`,
      `running=${e.incidentRuntime.running}`,
      `last_error=${String(e.incidentRuntime.lastError||'').replace(/[\r\n]+/g,' ')}`,
      `entry_backpressure=${JSON.stringify(e.riskControls.entryEvaluationBackpressure)}`,
      `protection_backpressure=${JSON.stringify(e.riskControls.quoteProtectionBackpressure)}`,
      `resource_usage=${JSON.stringify(e.resourceUsage||null)}`,
      'Full historical trade rows were deferred because RGM4 is protecting trading memory.',
    ].join('\n');
  }
  try{return await deadline(engine.tradingLogText(),timeoutMs,'trading_log_collection');}
  catch(error){
    const e=runtimeOnlyIncidentDiagnostic(engine,error);
    return [
      '=== SAGITTARIUS TRADING LOG EXPORT FALLBACK ===',
      'collection_complete=false',
      'fallback_scope=runtime_only_no_database_queries',
      `reason=${String(e.incidentRuntime.reason).replace(/[\r\n]+/g,' ')}`,
      `captured_at_ms=${e.incidentRuntime.capturedAtMs}`,
      `running=${e.incidentRuntime.running}`,
      `last_error=${String(e.incidentRuntime.lastError||'').replace(/[\r\n]+/g,' ')}`,
      `entry_backpressure=${JSON.stringify(e.riskControls.entryEvaluationBackpressure)}`,
      `protection_backpressure=${JSON.stringify(e.riskControls.quoteProtectionBackpressure)}`,
      `resource_usage=${JSON.stringify(e.resourceUsage||null)}`,
      'Full historical trade rows were unavailable within the bounded collection window; this file is an incident snapshot, not a complete trading log.',
    ].join('\n');
  }
}

function utf8Prefix(text,maxBytes){
  const value=String(text??'');
  const buf=Buffer.from(value,'utf8');
  if(buf.length<=maxBytes)return value;
  let end=Math.max(0,Math.min(buf.length,maxBytes));
  while(end>0 && end<buf.length && (buf[end]&0xc0)===0x80)end-=1;
  return buf.subarray(0,end).toString('utf8');
}

export function serializeTradingLogDownload(text,maxBytes=TRADING_LOG_EXPORT_MAX_BYTES){
  const hard=Math.min(TRADING_LOG_EXPORT_MAX_BYTES,Math.max(100_000,Math.floor(Number(maxBytes)||TRADING_LOG_EXPORT_MAX_BYTES)));
  const target=Math.min(hard,TRADING_LOG_EXPORT_TARGET_BYTES);
  const source=String(text??'');
  const sourceBytes=Buffer.byteLength(source,'utf8');
  if(sourceBytes<=hard)return{text:source,bytes:sourceBytes,truncated:false,sourceBytes};
  const footer=(kept,omitted)=>`\n=== EXPORT COMPACTED ===\nTLX1 hard cap: ${hard} bytes | source bytes: ${sourceBytes} | kept bytes: ${kept} | omitted bytes: ${omitted}\nOlder/lower-priority detail was omitted to keep this download browser-safe. Open positions and newest records are emitted first.\n`;
  let reserve=Buffer.byteLength(footer(0,sourceBytes),'utf8')+256;
  let prefix=utf8Prefix(source,Math.max(1,Math.min(target,hard-reserve)));
  const newline=prefix.lastIndexOf('\n');
  if(newline>0)prefix=prefix.slice(0,newline);
  let kept=Buffer.byteLength(prefix,'utf8');
  let out=prefix+footer(kept,Math.max(0,sourceBytes-kept));
  let bytes=Buffer.byteLength(out,'utf8');
  if(bytes>hard){
    const fixedFooter=footer(0,sourceBytes);
    prefix=utf8Prefix(prefix,Math.max(1,hard-Buffer.byteLength(fixedFooter,'utf8')-64));
    const nl=prefix.lastIndexOf('\n');if(nl>0)prefix=prefix.slice(0,nl);
    kept=Buffer.byteLength(prefix,'utf8');out=prefix+footer(kept,Math.max(0,sourceBytes-kept));bytes=Buffer.byteLength(out,'utf8');
  }
  if(bytes>hard)throw new Error(`trading_log_export_exceeds_hard_cap:${bytes}:${hard}`);
  return{text:out,bytes,truncated:true,sourceBytes};
}
const diagnosticPath=(o,path)=>path.reduce((v,k)=>v?.[k],o);
function compactDiagnosticValue(value,depth=0){
  if(value==null||typeof value==='number'||typeof value==='boolean')return value;
  if(typeof value==='string')return value.length<=512?value:`${value.slice(0,500)}...[truncated ${value.length-500} chars]`;
  if(depth>=5)return Array.isArray(value)?`[array ${value.length} items]`:'[object compacted]';
  if(Array.isArray(value))return value.slice(0,50).map((x)=>compactDiagnosticValue(x,depth+1));
  if(typeof value==='object'){const out={};for(const [k,v] of Object.entries(value).slice(0,80))out[k]=compactDiagnosticValue(v,depth+1);return out;}
  return String(value).slice(0,512);
}
const trimDiagnosticArray=(d,path,keep)=>{const a=diagnosticPath(d,path);if(!Array.isArray(a)||a.length<=keep)return null;const before=a.length;a.length=keep;return {section:path.join('.'),available:before,included:keep,omitted:before-keep};};
export function serializeDiagnosticDownload(data,maxBytes=DIAGNOSTIC_EXPORT_MAX_BYTES){
  const hard=Math.min(DIAGNOSTIC_EXPORT_MAX_BYTES,Math.max(100_000,Math.floor(Number(maxBytes)||DIAGNOSTIC_EXPORT_MAX_BYTES)));
  const target=Math.min(hard,DIAGNOSTIC_EXPORT_TARGET_BYTES);
  let d=structuredClone(data||{});
  d.diagnosticExport={...(d.diagnosticExport||{}),version:'DX2',hardMaximumBytes:hard,targetMaximumBytes:target,serialization:'compact_json',hardCapEnforced:true,truncatedSections:[]};
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
      settings:d.settings,riskControls:d.riskControls,health:d.health,resourceUsage:d.resourceUsage,balance:d.balance,brokerContext:d.brokerContext,
      performance:d.performance,conceptStats:d.conceptStats,feederSummary:d.feederSummary,goldenPipeline:d.goldenPipeline,goldenFeedSummary:d.goldenFeedSummary,
      entryPipeline:d.entryPipeline,entryCandidateFunnel:d.entryCandidateFunnel,entryPathConfiguration:d.entryPathConfiguration,openHunters:d.openHunters,closedHunters:Array.isArray(d.closedHunters)?d.closedHunters.slice(0,100):[],
      trackerSummary:d.trackerSummary,recoveryTracking:d.recoveryTracking,profitLearning:d.profitLearning,stopGuardRecoveryLearning:d.stopGuardRecoveryLearning,
      athena:d.athena,goldenEye:d.goldenEye,scanner:d.scanner,audit:Array.isArray(d.audit)?d.audit.slice(0,25):[],
      feederSignalIntelligence:{version:fsi.version,role:fsi.role,executionAuthority:fsi.executionAuthority,entryAuthority:fsi.entryAuthority,athenaDecisionAuthority:fsi.athenaDecisionAuthority,analysisStakeCents:fsi.analysisStakeCents,referenceProfitThresholdsCents:fsi.referenceProfitThresholdsCents,horizonMs:fsi.horizonMs,summary:fsi.summary,records:[],recordsAvailable:fsi.recordsAvailable||0,recordsIncluded:0,recordsOmitted:fsi.recordsAvailable||0,recordsCompact:true,rawObservationsIncluded:false},
      diagnosticExport:{...(d.diagnosticExport||{}),version:'DX2',essentialFallback:true,truncatedSections:[...(d.diagnosticExport?.truncatedSections||[]),{section:'diagnostic_export',reason:'hard_cap_essential_fallback'}]},
    };
    d=essential;text=JSON.stringify(d);bytes=Buffer.byteLength(text,'utf8');
  }
  if(bytes>hard){
    d=compactDiagnosticValue({settings:d.settings,riskControls:d.riskControls,health:d.health,resourceUsage:d.resourceUsage,balance:d.balance,brokerContext:d.brokerContext,performance:d.performance,conceptStats:d.conceptStats,feederSummary:d.feederSummary,entryPipeline:d.entryPipeline,entryCandidateFunnel:d.entryCandidateFunnel,entryPathConfiguration:d.entryPathConfiguration,auroraExecution:d.auroraExecution,atomicThunderBolt:d.atomicThunderBolt,infinityBreak:d.infinityBreak,legacyAtomicThunder:d.legacyAtomicThunder,openHunters:Array.isArray(d.openHunters)?d.openHunters.slice(0,50):[],stopGuardRecoveryLearning:d.stopGuardRecoveryLearning,profitLearning:d.profitLearning,athena:d.athena,goldenEye:d.goldenEye,scanner:d.scanner,audit:Array.isArray(d.audit)?d.audit.slice(0,10):[],diagnosticExport:{version:'DX2',hardMaximumBytes:hard,targetMaximumBytes:target,serialization:'compact_json',hardCapEnforced:true,emergencyMinimalFallback:true,priority:'safety_runtime_open_positions_profit_loss_authorities_then_recent_research'}});
    text=JSON.stringify(d);bytes=Buffer.byteLength(text,'utf8');
  }
  if(bytes>hard){
    d=compactDiagnosticValue({settings:d.settings,riskControls:d.riskControls,health:d.health,resourceUsage:d.resourceUsage,performance:d.performance,openHunters:Array.isArray(d.openHunters)?d.openHunters.slice(0,25):[],auroraExecution:d.auroraExecution,atomicThunderBolt:d.atomicThunderBolt,infinityBreak:d.infinityBreak,legacyAtomicThunder:d.legacyAtomicThunder,entryPipeline:d.entryPipeline,entryCandidateFunnel:d.entryCandidateFunnel,stopGuardRecoveryLearning:d.stopGuardRecoveryLearning,scanner:d.scanner,diagnosticExport:{version:'DX2',hardMaximumBytes:hard,targetMaximumBytes:target,serialization:'compact_json',hardCapEnforced:true,ultraMinimalFallback:true,priority:'open_positions_and_safety_authorities'}});
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

export function startServer(runtime,port,rootDir){const clients=new Set();let pushing=false,lastPushAtMs=0;const push=async()=>{const engine=runtime.engine;if(pushing||!clients.size||!engine)return;const pressure=String(engine.resourcePressureState||'GREEN');const cadence=['PRESSURE','TRADE_PRIORITY','HARD_RESEARCH_SHED'].includes(pressure)?5000:pressure==='COMPACT'?3000:2000;const now=Date.now();if(now-lastPushAtMs<cadence)return;pushing=true;try{const state=await engine.state();lastPushAtMs=Date.now();const msg=`data: ${JSON.stringify(state)}\n\n`;for(const r of clients)r.write(msg);}catch{}finally{pushing=false;}};const timer=setInterval(push,1000);
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
    if(u.pathname==='/api/emergency-exit'&&req.method==='POST')return json(res,200,await engine.emergencyExit(await body(req)));
    if(u.pathname==='/api/manual-cashout'&&req.method==='POST')return json(res,200,await engine.manualCashout(await body(req)));
    if(u.pathname==='/api/credentials'&&req.method==='POST'){const b=await body(req);return json(res,200,await engine.saveCredentials(b.keyId,b.privateKeyPem));}
    if(u.pathname==='/api/test-connection'&&req.method==='POST')return json(res,200,await engine.testConnection());
    if(u.pathname==='/api/diagnostics'&&req.method==='GET')return json(res,200,await collectDiagnosticData(engine));
    if(u.pathname==='/api/diagnostics/download'&&req.method==='GET'){const d=await collectDiagnosticData(engine);const out=serializeDiagnosticDownload(d);return attachment(res,`sagittarius-diagnostics-${new Date().toISOString().replace(/[:.]/g,'-')}.json`,out.text,'application/json; charset=utf-8');}
    if(u.pathname==='/api/trading-logs/download'&&req.method==='GET'){const out=serializeTradingLogDownload(await collectTradingLogText(engine));return attachment(res,`sagittarius-trading-logs-${new Date().toISOString().replace(/[:.]/g,'-')}.txt`,out.text);}
    if(u.pathname==='/api/athena/download'&&req.method==='GET'){const d=engine.athenaBrainDocument();return attachment(res,`SAGITTARIUS-ATHENA-A3-ECONOMIC-SURVIVAL-MEMORY.json`,JSON.stringify(d,null,2),'application/json; charset=utf-8');}
    if(u.pathname==='/api/athena/install'&&req.method==='POST')return json(res,200,await engine.installAthenaBrain(await body(req)));
    if(u.pathname==='/api/athena/rebuild'&&req.method==='POST')return json(res,200,await engine.rebuildAthenaBrain());
    if(req.method!=='GET')return json(res,404,{error:'not_found'});
    const rel=u.pathname==='/'?'index.html':normalize(u.pathname).replace(/^[/\\]+/,'');if(rel.includes('..'))return json(res,403,{error:'forbidden'});const file=join(rootDir,'public',rel);try{const data=await readFile(file);res.writeHead(200,{'content-type':mime[extname(file)]||'application/octet-stream','cache-control':'no-store'});res.end(data);}catch{const data=await readFile(join(rootDir,'public','index.html'));res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});res.end(data);}
  }catch(e){json(res,500,{error:String(e?.message||e)});}});
  server.listen(port,'0.0.0.0');server.on('close',()=>clearInterval(timer));return server;
}

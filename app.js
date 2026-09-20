const SITE_UI_VERSION='2.1';
const state={overview:null,reports:[],events:[],metrics:null,thirty:null,sources:[],runs:[],briefing:null,actorFilter:'all',mapDays:30,langFilter:'all',range:30,voices:[],speaking:false,readerRunning:false,readerPaused:false,readerIndex:0,readerCycle:0,readerRange:30,readerQueue:[],readerSession:0};
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const fmtTime=v=>{if(!v)return '—'; const d=new Date(v); return isNaN(d)?'—':d.toLocaleString()};
const relTime=v=>{if(!v)return 'never';const d=new Date(v),s=Math.max(0,(Date.now()-d)/1000);if(s<60)return `${Math.round(s)}s ago`;if(s<3600)return `${Math.round(s/60)}m ago`;if(s<86400)return `${Math.round(s/3600)}h ago`;return `${Math.round(s/86400)}d ago`};
async function data(name){const r=await fetch(`./data/${name}.json?ts=${Date.now()}`,{cache:'no-store'}); if(!r.ok)throw new Error(`${r.status} ${name}`); return r.json();}
function setText(id,v){const e=document.getElementById(id);if(e)e.textContent=v;}
function statusClass(s){s=(s||'OFFLINE').toLowerCase();return s==='live'?'live':s==='degraded'?'degraded':'offline'}
function applyStatus(status,detail){['systemBadge','opsBadge'].forEach(id=>{const e=document.getElementById(id);if(!e)return;e.textContent=status;e.className=`status ${statusClass(status)}`});setText('heartbeat',detail||'');}
function pct(t){if(!t)return '—';if(t.change_pct===null||t.change_pct===undefined)return t.current>0?'▲ NEW':'—';const n=Number(t.change_pct)||0;return `${n>0?'▲':n<0?'▼':'•'} ${Math.abs(n).toFixed(1)}%`}
function trendClass(t){if(!t||t.change_pct===null||t.change_pct===undefined)return t&&t.current>0?'up':'flat';return t.change_pct>1?'up':t.change_pct<-1?'down':'flat'}
function actorColor(a){return a==='JNIM'?'#ef6262':a==='IS Sahel'?'#b47cff':a==='State'?'#e7ad53':'#63a8ff'}
function clock(){setText('clock',new Date().toLocaleTimeString([], {hour12:false}));} setInterval(clock,1000);clock();
function applyTheme(theme){
  const mode=theme==='light'?'light':'dark';
  document.documentElement.dataset.theme=mode;
  try{localStorage.setItem('sicTheme',mode)}catch(e){}
  const b=$('#themeToggle');if(b){b.textContent=mode==='dark'?'☀ LIGHT':'☾ DARK';b.setAttribute('aria-label',mode==='dark'?'Switch to light mode':'Switch to dark mode')}
  const meta=document.querySelector('meta[name="theme-color"]');if(meta)meta.content=mode==='dark'?'#061019':'#f3f7f9';
}
applyTheme(document.documentElement.dataset.theme||'dark');
const themeButton=$('#themeToggle');if(themeButton)themeButton.onclick=()=>applyTheme(document.documentElement.dataset.theme==='light'?'dark':'light');

$$('.tab').forEach(b=>b.onclick=()=>{$$('.tab').forEach(x=>x.classList.remove('active'));b.classList.add('active');$$('.view').forEach(v=>v.classList.remove('active'));$(`#view-${b.dataset.view}`).classList.add('active');if(b.dataset.view==='quant')renderQuant();if(b.dataset.view==='sources')renderOps();});
$$('.filter').forEach(b=>b.onclick=()=>{$$('.filter').forEach(x=>x.classList.remove('active'));b.classList.add('active');state.actorFilter=b.dataset.actor;renderMap();});
$$('.lang').forEach(b=>b.onclick=()=>{$$('.lang').forEach(x=>x.classList.remove('active'));b.classList.add('active');state.langFilter=b.dataset.lang;renderFeeds();});
$$('.range').forEach(b=>b.onclick=()=>{$$('.range').forEach(x=>x.classList.remove('active'));b.classList.add('active');state.range=Number(b.dataset.days);renderQuant();});
$$('.map-range').forEach(b=>b.onclick=()=>{$$('.map-range').forEach(x=>x.classList.remove('active'));b.classList.add('active');state.mapDays=b.dataset.days==='all'?'all':Number(b.dataset.days);renderMap();});

async function refresh(){
  try{
    const [overview,reports,events,metrics,sources,runs,briefing,thirty]=await Promise.all([
      data('overview'),data('reports'),data('events'),data('metrics'),data('sources'),data('runs'),data('briefing'),
      data('thirty_day').catch(()=>null)
    ]);
    Object.assign(state,{overview,reports,events,metrics,sources,runs,briefing,thirty});
    renderOverview();renderMap();renderActors();renderFeeds();renderBriefing();renderThirty();updateReaderStatus();
    const active=$('.view.active')?.id;
    if(active==='view-quant')renderQuant();
    if(active==='view-sources')renderOps();
  }catch(e){
    applyStatus('OFFLINE',`Dashboard data error: ${e.message}`);
    console.error(e);
  }
}
function renderOverview(){const o=state.overview||{};let status=o.status||'OFFLINE',detail=o.status_detail||'';const patch=o.site_patch_version||SITE_UI_VERSION;setText('patchBadge',`PATCH v${patch}`);const pb=$('#patchBadge');if(pb)pb.title=`Site patch v${patch} • Collector ${o.collector_version||'unknown'} • Classifier ${o.classifier_version||'unknown'}`;if(o.last_collection){const age=(Date.now()-new Date(o.last_collection))/60000;if(age>90){status='OFFLINE';detail=`Last automated collection was ${relTime(o.last_collection)}. Scheduled collection may be disabled or failing.`}else if(age>40&&status==='LIVE'){status='DEGRADED';detail=`Last automated collection was ${relTime(o.last_collection)}. GitHub scheduled jobs can be delayed.`}}applyStatus(status,detail);setText('reports24',o.reports_24h??0);setText('sources24',o.distinct_sources_24h??0);setText('mapped24',o.mapped_24h??0);setText('configuredSources',o.sources_configured??33);setText('liveSources',o.sources_live??0);setText('degradedSources',o.sources_degraded??0);setText('failedSources',o.sources_failed??0);const r=o.last_run;if(r){$('#runBox').innerHTML=`Last cycle ${esc(relTime(o.last_collection))}<br>${r.sources_success}/${o.sources_configured} sources reached • ${r.documents_discovered} links discovered • ${r.documents_retained} relevant documents retained • ${r.translations} translations • ${r.event_changes} event changes`;}else{$('#runBox').textContent='Awaiting first collection run. The interface will not claim LIVE until the worker finishes a real cycle.'}}

function reportCard(r){const english=r.translated_title||r.title;const hasTranslation=r.translated_title&&r.translated_title!==r.title;const excerpt=r.translated_excerpt||'';const published=r.published_at?fmtTime(r.published_at):'publication time unavailable';const collected=r.discovered_at?relTime(r.discovered_at):'unknown';const trans=r.language==='en'?'EN original':(r.translation_status==='success'?'EN translated':r.translation_status==='failed'?'translation failed / retry queued':'translation pending');const reasons=(r.relevance_reasons||[]).slice(0,6).join(' • ');const type=r.candidate_event?'CANDIDATE EVENT':'CONTEXT REPORT';return `<article class="report"><div class="report-top"><span class="badge">${esc((r.language||'').toUpperCase())}</span><span class="badge">${esc(r.actor_bucket||'GENERAL')}</span><span class="badge">${esc(type)}</span><span class="report-meta">${esc(r.source)}</span></div><h3>${esc(english)}</h3>${excerpt?`<p>${esc(excerpt.slice(0,520))}${excerpt.length>520?'…':''}</p>`:''}<div class="report-meta">Published: ${esc(published)} • Collected: ${esc(collected)} • ${esc(trans)}</div><div class="report-meta">${esc([r.city,r.country,r.event_type].filter(Boolean).join(' • ')||'No structured event')} • relevance ${esc(r.relevance_score??'—')} • ${esc(r.fetch_status)}</div>${hasTranslation?`<details class="original"><summary>Original ${esc((r.language||'').toUpperCase())}</summary><p>${esc(r.title)}</p></details>`:''}${reasons?`<details class="original"><summary>Why retained?</summary><p>${esc(reasons)}</p></details>`:''}<a href="${esc(r.url)}" target="_blank" rel="noopener">OPEN SOURCE ↗</a></article>`}
function renderFeeds(){const filter=r=>state.langFilter==='all'||r.language===state.langFilter;const rows=state.reports.filter(filter);$('#feedPreview').innerHTML=rows.slice(0,7).map(reportCard).join('')||'<div class="runbox">No relevant reports have been retained yet.</div>';$('#fullFeed').innerHTML=rows.map(reportCard).join('')||'<div class="runbox">No reports yet. Wait for the first collector cycle.</div>';}

function svgEl(tag,attrs={}){const e=document.createElementNS('http://www.w3.org/2000/svg',tag);Object.entries(attrs).forEach(([k,v])=>e.setAttribute(k,v));return e}
const MAP_FOCUS={minLon:-13.0,maxLon:16.6,minLat:9.0,maxLat:25.5};
const COUNTRY_LABELS=[
  {name:'MALI',lat:22.4866,lng:-6.1772,anchor:'start'},
  {name:'BURKINA FASO',lat:11.0102,lng:-1.6595,anchor:'middle'},
  {name:'NIGER',lat:21.1015,lng:12.7713,anchor:'end'}
];
// City coordinates are pinned to known populated-place coordinates rather than inferred from article text.
const CITY_LABELS=[
  {name:'Bamako',country:'Mali',lat:12.60915,lng:-7.97522,dx:7,dy:-7,anchor:'start'},
  {name:'Timbuktu',country:'Mali',lat:16.77348,lng:-3.00742,dx:-7,dy:-7,anchor:'end'},
  {name:'Gao',country:'Mali',lat:16.27167,lng:-0.04472,dx:7,dy:-7,anchor:'start'},
  {name:'Mopti',country:'Mali',lat:14.48430,lng:-4.18296,dx:-7,dy:-7,anchor:'end'},
  {name:'Ménaka',country:'Mali',lat:15.91531,lng:2.40203,dx:7,dy:-6,anchor:'start'},
  {name:'Kidal',country:'Mali',lat:18.44345,lng:1.40921,dx:7,dy:-7,anchor:'start'},
  {name:'Ségou',country:'Mali',lat:13.44032,lng:-6.25947,dx:7,dy:12,anchor:'start'},
  {name:'Sikasso',country:'Mali',lat:11.31755,lng:-5.66654,dx:7,dy:12,anchor:'start'},

  {name:'Ouagadougou',country:'Burkina Faso',lat:12.36566,lng:-1.53388,dx:7,dy:-8,anchor:'start'},
  {name:'Dori',country:'Burkina Faso',lat:14.03326,lng:-0.03333,dx:7,dy:-7,anchor:'start'},
  {name:'Djibo',country:'Burkina Faso',lat:14.09864,lng:-1.62665,dx:-7,dy:-7,anchor:'end'},
  {name:'Kaya',country:'Burkina Faso',lat:13.08830,lng:-1.08368,dx:7,dy:12,anchor:'start'},
  {name:"Fada N'Gourma",country:'Burkina Faso',lat:12.06157,lng:0.35843,dx:7,dy:12,anchor:'start'},
  {name:'Ouahigouya',country:'Burkina Faso',lat:13.57690,lng:-2.41786,dx:-7,dy:-7,anchor:'end'},
  {name:'Bobo-Dioulasso',country:'Burkina Faso',lat:11.18064,lng:-4.29489,dx:-7,dy:-7,anchor:'end'},

  {name:'Niamey',country:'Niger',lat:13.51366,lng:2.10980,dx:7,dy:12,anchor:'start'},
  {name:'Tillabéri',country:'Niger',lat:14.20711,lng:1.45418,dx:-7,dy:-7,anchor:'end'},
  {name:'Tahoua',country:'Niger',lat:14.88880,lng:5.26920,dx:7,dy:-7,anchor:'start'},
  {name:'Agadez',country:'Niger',lat:16.97333,lng:7.99111,dx:7,dy:-7,anchor:'start'},
  {name:'Maradi',country:'Niger',lat:13.50000,lng:7.10174,dx:7,dy:12,anchor:'start'},
  {name:'Zinder',country:'Niger',lat:13.80716,lng:8.98810,dx:7,dy:-7,anchor:'start'},
  {name:'Dosso',country:'Niger',lat:13.04900,lng:3.19370,dx:7,dy:12,anchor:'start'},
  {name:'Arlit',country:'Niger',lat:18.73694,lng:7.38528,dx:7,dy:-7,anchor:'start'}
];
function project(lng,lat,w=1000,h=560){const b=MAP_FOCUS;return [(lng-b.minLon)/(b.maxLon-b.minLon)*w,h-(lat-b.minLat)/(b.maxLat-b.minLat)*h]}
function geometryPath(g){const polys=g.type==='Polygon'?[g.coordinates]:g.coordinates;return polys.map(poly=>poly.map(ring=>ring.map((p,i)=>{const [x,y]=project(p[0],p[1]);return `${i?'L':'M'}${x.toFixed(1)},${y.toFixed(1)}`}).join(' ')+' Z').join(' ')).join(' ')}
function eventInWindow(e,days){
  if(days==='all')return true;
  if(!e?.event_date)return false;
  const d=new Date(`${e.event_date}T23:59:59Z`);
  return !isNaN(d) && (Date.now()-d.getTime()) <= Number(days)*86400000;
}
function renderMap(){
  const host=$('#map');if(!host||!window.SAHEL_MAP_DATA)return;
  host.innerHTML='<div class="maptip" id="maptip"></div>';
  const svg=svgEl('svg',{viewBox:'0 0 1000 560',preserveAspectRatio:'xMidYMid meet'});
  svg.appendChild(svgEl('rect',{x:0,y:0,width:1000,height:560,class:'map-bg'}));

  // Borders first: the full Mali, Burkina Faso and Niger polygons now fit inside MAP_FOCUS.
  window.SAHEL_MAP_DATA.countries.forEach(f=>svg.appendChild(svgEl('path',{d:geometryPath(f.geometry),class:`country ${f.properties.aes?'aes':'context'}`})));


  let events=state.events.filter(e=>Number.isFinite(Number(e.lat))&&Number.isFinite(Number(e.lng))&&eventInWindow(e,state.mapDays));
  if(state.actorFilter!=='all')events=events.filter(e=>e.actor===state.actorFilter);
  events.slice(0,400).forEach(e=>{
    const [x,y]=project(Number(e.lng),Number(e.lat));
    if(x<0||x>1000||y<0||y>560)return;
    const g=svgEl('g');const c=actorColor(e.actor);
    g.appendChild(svgEl('circle',{cx:x,cy:y,r:13,fill:c,class:'eventhalo'}));
    const dot=svgEl('circle',{cx:x,cy:y,r:6.2,fill:c,class:'eventdot'});
    g.appendChild(dot);g.addEventListener('mouseenter',ev=>showTip(ev,e));g.addEventListener('mouseleave',()=>hideTip());svg.appendChild(g)
  });

  // Cities: text is restored, but only at pinned coordinates with per-city offsets.
  const cityLayer=svgEl('g',{'aria-label':'city-labels'});
  CITY_LABELS.forEach(c=>{
    const [x,y]=project(c.lng,c.lat);
    if(x<0||x>1000||y<0||y>560)return;
    cityLayer.appendChild(svgEl('circle',{cx:x,cy:y,r:2.5,class:'city-dot'}));
    const label=svgEl('text',{x:x+(c.dx||0),y:y+(c.dy||0),class:'city-label','text-anchor':c.anchor||'start'});
    label.textContent=c.name;cityLayer.appendChild(label);
  });
  svg.appendChild(cityLayer);

  // Country labels are deliberately placed exactly where requested and drawn last.
  const countryLayer=svgEl('g',{'aria-label':'country-labels'});
  COUNTRY_LABELS.forEach(l=>{
    const [x,y]=project(l.lng,l.lat);
    const t=svgEl('text',{x,y,class:'map-label aes','text-anchor':l.anchor||'middle'});
    t.textContent=l.name;countryLayer.appendChild(t)
  });
  svg.appendChild(countryLayer);
  host.appendChild(svg);

  const visibleEvents=state.events.filter(e=>eventInWindow(e,state.mapDays)&&(state.actorFilter==='all'||e.actor===state.actorFilter));
  const mapped=visibleEvents.filter(e=>Number.isFinite(Number(e.lat))&&Number.isFinite(Number(e.lng)));
  const countCountry=name=>mapped.filter(e=>e.country===name).length;
  const unmapped=visibleEvents.filter(e=>!Number.isFinite(Number(e.lat))||!Number.isFinite(Number(e.lng))).length;
  setText('mapCountryCounts',`Mapped candidate events • Mali ${countCountry('Mali')} • Burkina Faso ${countCountry('Burkina Faso')} • Niger ${countCountry('Niger')} • Unmapped ${unmapped}`);
}
function showTip(ev,e){const tip=$('#maptip');tip.style.display='block';const rect=$('#map').getBoundingClientRect();tip.style.left=Math.min(rect.width-290,Math.max(8,ev.clientX-rect.left+10))+'px';tip.style.top=Math.min(rect.height-120,Math.max(8,ev.clientY-rect.top+10))+'px';tip.innerHTML=`<strong>${esc(e.actor)} • ${esc(e.event_type)}</strong><br>${esc([e.city,e.country].filter(Boolean).join(', '))}<br>${esc(e.title)}<br><span class="report-meta">${esc(e.source_count)} monitored source${e.source_count===1?'':'s'} • ${esc(e.corroboration)}</span>`}
function hideTip(){const t=$('#maptip');if(t)t.style.display='none'}

function lineSVG(seriesList,{height=100,showAxes=false}={}){const width=800,pad=showAxes?32:4;const vals=seriesList.flatMap(s=>s.values);const max=Math.max(1,...vals),min=0;const n=Math.max(2,...seriesList.map(s=>s.values.length));const sx=i=>pad+(i/(n-1))*(width-pad*2);const sy=v=>height-pad-(v-min)/(max-min||1)*(height-pad*2);let grid='';if(showAxes){for(let i=0;i<5;i++){const y=pad+i*(height-pad*2)/4;grid+=`<line x1="${pad}" y1="${y}" x2="${width-pad}" y2="${y}" stroke="var(--chart-grid)" stroke-width="1"/><text x="4" y="${y+3}" fill="var(--chart-axis)" font-size="9">${Math.round(max*(1-i/4))}</text>`}}const lines=seriesList.map(s=>{if(!s.values.length)return'';const pts=s.values.map((v,i)=>`${sx(i)},${sy(v)}`).join(' ');return `<polyline fill="none" stroke="${s.color}" stroke-width="2.2" points="${pts}" vector-effect="non-scaling-stroke"/>`}).join('');return `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">${grid}${lines}</svg>`}
function renderActors(){const m=state.metrics;if(!m)return;const ids={'JNIM':['jnim7','jnimChange','jnimSpark'],'IS Sahel':['is7','isChange','isSpark'],'State':['state7','stateChange','stateSpark']};Object.entries(ids).forEach(([a,[countId,chgId,sparkId]])=>{const t=m.trends_7d?.[a],rows=m.series?.[a]||[];setText(countId,t?.current??0);const ch=$(`#${chgId}`);ch.textContent=pct(t);ch.className=trendClass(t);$(`#${sparkId}`).innerHTML=lineSVG([{values:rows.slice(-30).map(x=>x.count),color:actorColor(a)}],{height:72})});}
function renderQuant(){
  const m=state.metrics;if(!m)return;
  const series=['JNIM','IS Sahel','State'].map(a=>({label:a,color:actorColor(a),values:(m.series?.[a]||[]).slice(-state.range).map(x=>x.count)}));
  $('#actorChart').innerHTML=lineSVG(series,{height:330,showAxes:true});
  setText('metricNote',m.method_note||'');
  [
    ['JNIM','qJnim','qJnimChange','qJnim30','qJnim30Change'],
    ['IS Sahel','qIs','qIsChange','qIs30','qIs30Change'],
    ['State','qState','qStateChange','qState30','qState30Change']
  ].forEach(([a,cid,xid,c30,x30])=>{
    const t7=m.trends_7d?.[a],t30=m.trends_30d?.[a];
    setText(cid,t7?.current??0);const e7=$(`#${xid}`);e7.textContent=pct(t7);e7.className=`quantchange ${trendClass(t7)}`;
    setText(c30,t30?.current??0);const e30=$(`#${x30}`);e30.textContent=pct(t30);e30.className=`quantchange ${trendClass(t30)}`;
  });
}
function kvBars(obj,limit=8){
  const entries=Object.entries(obj||{}).sort((a,b)=>b[1]-a[1]).slice(0,limit);
  const max=Math.max(1,...entries.map(x=>Number(x[1])||0));
  return entries.map(([k,v])=>`<div class="barrow"><span>${esc(k)}</span><div><i style="width:${Math.max(4,(Number(v)||0)/max*100)}%"></i></div><strong>${esc(v)}</strong></div>`).join('')||'<div class="muted-empty">No data in this window.</div>';
}
function renderThirty(){
  const t=state.thirty;if(!t)return;
  setText('thirtyStamp',`through ${fmtTime(t.generated_at)}`);
  const summary=[
    ['Relevant reports',t.reports??0],['Candidate events',t.candidate_events??0],['Corroborated',t.corroborated_events??0],
    ['Mapped events',t.mapped_events??0],['Sources represented',t.distinct_sources??0],
    ['JNIM',t.by_actor?.['JNIM']??0],['IS Sahel',t.by_actor?.['IS Sahel']??0],['State',t.by_actor?.['State']??0],['Other',t.by_actor?.['Other']??0]
  ];
  $('#thirtySummary').innerHTML=summary.map(([k,v])=>`<div class="opscard"><span>${esc(k)}</span><strong>${esc(v)}</strong></div>`).join('');
  $('#thirtyActors').innerHTML=kvBars(t.by_actor,8);
  $('#thirtyCountries').innerHTML=kvBars(t.by_country,8);
  $('#thirtyTypes').innerHTML=kvBars(t.by_event_type,10);
  $('#thirtyLanguages').innerHTML=kvBars(t.by_language,8);
  const srcObj=Object.fromEntries((t.top_sources||[]).map(x=>[x.source,x.count]));
  $('#thirtySources').innerHTML=kvBars(srcObj,10);
  const reportSeries=(t.daily||[]).map(x=>x.reports||0),eventSeries=(t.daily||[]).map(x=>x.events||0);
  $('#thirtyChart').innerHTML=lineSVG([{values:reportSeries,color:'#59c3d8'},{values:eventSeries,color:'#e7ad53'}],{height:180,showAxes:true})+
    '<div class="chartlegend"><span><i class="dot" style="background:#59c3d8"></i>Relevant reports</span><span><i class="dot state"></i>Candidate events</span></div>';
  $('#thirtyTimeline').innerHTML=(t.latest_events||[]).slice(0,24).map(e=>`<div class="timeline-row"><span>${esc(e.event_date||'—')}</span><b style="color:${actorColor(e.actor)}">${esc(e.actor||'Other')}</b><span>${esc(e.event_type||'event')}</span><span>${esc([e.city,e.country].filter(Boolean).join(', ')||'Location unresolved')}</span><strong>${esc(e.source_count??1)} src</strong><p>${esc(e.title||'')}</p></div>`).join('')||'<div class="runbox">No candidate events currently fall inside the 30-day window.</div>';
  $('#thirtyReports').innerHTML=(t.latest_reports||[]).slice(0,28).map(r=>`<div class="timeline-row report-row"><span>${esc(r.published_at?new Date(r.published_at).toLocaleDateString():'undated')}</span><b>${esc((r.language||'').toUpperCase())}</b><span>${esc(r.candidate_event?'EVENT':'REPORT')}</span><span>${esc([r.city,r.country].filter(Boolean).join(', ')||'Regional')}</span><strong>${esc(r.source||'')}</strong><p>${esc(r.title||'')}</p></div>`).join('')||'<div class="runbox">No relevant reports currently fall inside the 30-day window.</div>';
  setText('thirtyNote',t.method_note||'');
}

function renderBriefing(){const b=state.briefing;if(!b)return;setText('briefStamp',`${b.method} • ${fmtTime(b.generated_at)}`);setText('briefing',b.text||'No briefing generated.');}

function renderOps(){const o=state.overview||{},r=o.last_run||{};$('#opsSummary').innerHTML=[['Patch',o.site_patch_version||SITE_UI_VERSION],['Collector',o.collector_version||'—'],['Classifier',o.classifier_version||'—'],['Sources',o.sources_configured??33],['Live',o.sources_live??0],['Degraded',o.sources_degraded??0],['Failed',o.sources_failed??0],['Links discovered',r.documents_discovered??0],['Articles attempted',r.documents_selected??0],['New relevant',r.documents_retained??0],['Archive total',r.archive_reports??state.reports.length],['Candidate events',r.candidate_events_archive??state.events.length],['Events 7D',r.candidate_events_7d??0],['Events 30D',r.candidate_events_30d??state.thirty?.candidate_events??0],['Reports 30D',r.reports_30d??state.thirty?.reports??0],['Archive rejects',r.archive_rejected_by_precision_rules??0],['Translations',r.translations??0],['Translation fails',r.translation_failures??0]].map(([k,v])=>`<div class="opscard"><span>${esc(k)}</span><strong>${esc(v)}</strong></div>`).join('');$('#sourceRows').innerHTML=state.sources.map(s=>`<tr><td><a href="${esc(s.homepage)}" target="_blank" rel="noopener">${esc(s.name)}</a></td><td>${esc((s.language||'').toUpperCase())}</td><td>${esc(s.focus)}</td><td class="statuscell ${statusClass(s.status)}">${esc(s.status)}</td><td>${esc(relTime(s.last_checked_at))}</td><td>${esc(s.last_discovered_candidates??0)}</td><td>${esc(s.last_new_documents??0)}</td><td>${esc((s.translation_success_archive??0)+'/'+(s.translation_eligible_archive??0))}</td><td>${esc(s.last_error||'')}</td></tr>`).join('');$('#runHistory').innerHTML=state.runs.map(r=>`<div class="runrow"><span>${esc(fmtTime(r.finished_at||r.started_at))}</span><strong>${esc(r.status)}</strong><span>${r.sources_success}/${r.sources_total} sources</span><span>${r.documents_discovered} discovered</span><span>${r.documents_retained} new relevant</span><span>${r.archive_reports??"—"} archive reports</span><span>${r.candidate_events_archive??"—"} candidate events</span><span>${r.archive_rejected_by_precision_rules??0} archive rejects</span><span>${r.translations??0}/${r.translations_attempted??0} translated</span><span>${r.translation_failures??0} translation failures</span><span>${r.event_changes} event changes</span></div>`).join('')||'<div class="runbox">No completed runs yet.</div>';}

function loadVoices(){state.voices=speechSynthesis.getVoices();const sel=$('#voiceSelect');if(!sel)return;const prior=sel.value;sel.innerHTML='';state.voices.forEach((v,i)=>{const o=document.createElement('option');o.value=i;o.textContent=v.name;sel.appendChild(o)});let idx=prior!==''?Number(prior):-1;if(!Number.isFinite(idx)||!state.voices[idx])idx=state.voices.findIndex(v=>/Microsoft Ava Online \(Natural\)/i.test(v.name));if(idx<0)idx=state.voices.findIndex(v=>/Ava/i.test(v.name));if(idx<0)idx=state.voices.findIndex(v=>v.lang&&v.lang.toLowerCase().startsWith('en'));if(idx>=0)sel.value=idx;setText('voiceStatus',idx>=0?state.voices[idx].name:'default browser voice')}
if('speechSynthesis'in window){loadVoices();speechSynthesis.onvoiceschanged=loadVoices;}
function sentenceChunks(text){const parts=(text||'').match(/[^.!?]+[.!?]+|[^.!?]+$/g)||[];const out=[];let cur='';for(const p of parts){if((cur+' '+p).length>430&&cur){out.push(cur.trim());cur=p}else cur+=' '+p}if(cur.trim())out.push(cur.trim());return out}
function selectedVoice(){const sel=$('#voiceSelect');return state.voices[Number(sel?.value)]||null}
function reportTimestamp(r){const d=new Date(r.published_at||r.discovered_at||0);return isNaN(d)?0:d.getTime()}
function reportInReaderWindow(r){if(state.readerRange==='all')return true;const ts=reportTimestamp(r);if(!ts)return false;return Date.now()-ts<=Number(state.readerRange)*86400000}
function isReadableReport(r){return Boolean(r&&r.title&&((r.language==='en')||(r.translated_title&&r.translation_status==='success')))}
function buildReaderQueue(){return state.reports.filter(r=>isReadableReport(r)&&reportInReaderWindow(r)).sort((a,b)=>reportTimestamp(b)-reportTimestamp(a))}
function readerText(r,index,total){const translated=r.language!=='en'&&r.translated_title;const title=translated?r.translated_title:r.title;const body=translated?(r.translated_excerpt||''):(r.excerpt||'');const location=[r.city,r.country].filter(Boolean).join(', ');const kind=r.candidate_event?'candidate event':'context report';const lang=translated?`translated from ${(r.language||'').toUpperCase()}`:'English original';const bits=[`Source ${index+1} of ${total}.`,r.source?`From ${r.source}.`:'',location?`${location}.`:'',`${kind}.`,`${lang}.`,title?`${title}.`:'',body&&body!==title?body:''];return bits.filter(Boolean).join(' ')}
function updateReaderStatus(){const readable=buildReaderQueue();const waiting=state.reports.filter(r=>r.language!=='en'&&!r.translated_title).length;const rangeLabel=state.readerRange==='all'?'archive':`${state.readerRange}D`;if(state.readerRunning){const current=Math.min(state.readerIndex+1,Math.max(1,state.readerQueue.length));setText('readerStatus',state.readerPaused?`Paused • ${current}/${state.readerQueue.length} • ${rangeLabel}`:`Reading ${current}/${state.readerQueue.length} • cycle ${state.readerCycle+1} • ${rangeLabel}`)}else setText('readerStatus',`${readable.length} readable English/translated reports • ${waiting} awaiting translation • ${rangeLabel}`)}
async function speakChunk(chunk,mode='briefing',session=null){if(!chunk)return;await new Promise(resolve=>{let done=false;const finish=()=>{if(done)return;done=true;clearInterval(guard);resolve()};const u=new SpeechSynthesisUtterance(chunk);const voice=selectedVoice();if(voice)u.voice=voice;u.rate=.95;u.pitch=1;u.onend=finish;u.onerror=finish;const guard=setInterval(()=>{if(mode==='reader'&&(!state.readerRunning||session!==state.readerSession))finish();if(mode==='briefing'&&!state.speaking)finish()},200);if(mode==='reader'&&(!state.readerRunning||session!==state.readerSession))return finish();speechSynthesis.speak(u)})}
async function speakText(text,mode='briefing',session=null){for(const chunk of sentenceChunks(text)){if(mode==='reader'&&(!state.readerRunning||session!==state.readerSession))break;if(mode==='briefing'&&!state.speaking)break;while(mode==='reader'&&state.readerPaused&&state.readerRunning&&session===state.readerSession)await new Promise(r=>setTimeout(r,250));if(mode==='reader'&&(!state.readerRunning||session!==state.readerSession))break;await speakChunk(chunk,mode,session)}}
function stopAudio(){state.speaking=false;state.readerRunning=false;state.readerPaused=false;state.readerIndex=0;state.readerSession+=1;if('speechSynthesis'in window)speechSynthesis.cancel();const p=$('#pauseLoopBtn');if(p)p.textContent='Ⅱ PAUSE';updateReaderStatus()}
async function speakBriefing(){if(!('speechSynthesis'in window)||!state.briefing?.text)return;stopAudio();state.speaking=true;await speakText(state.briefing.text,'briefing');state.speaking=false}
async function startReaderLoop(){if(!('speechSynthesis'in window))return;stopAudio();const session=++state.readerSession;state.readerRunning=true;state.readerPaused=false;state.readerCycle=0;state.readerIndex=0;state.readerQueue=buildReaderQueue();if(!state.readerQueue.length){setText('readerStatus','No English originals or successful translations are available in this window.');state.readerRunning=false;return}while(state.readerRunning&&session===state.readerSession){if(!state.readerQueue.length){setText('readerStatus','No readable sources. Waiting for the next collector refresh…');await new Promise(r=>setTimeout(r,15000));state.readerQueue=buildReaderQueue();continue}for(state.readerIndex=0;state.readerIndex<state.readerQueue.length&&state.readerRunning&&session===state.readerSession;state.readerIndex++){while(state.readerPaused&&state.readerRunning&&session===state.readerSession)await new Promise(r=>setTimeout(r,250));if(!state.readerRunning||session!==state.readerSession)break;const currentReport=state.readerQueue[state.readerIndex];setText('readerNow',`${currentReport.source||'Unknown source'} • ${currentReport.translated_title||currentReport.title||''}`);updateReaderStatus();await speakText(readerText(currentReport,state.readerIndex,state.readerQueue.length),'reader',session);if(state.readerRunning&&!state.readerPaused)await new Promise(r=>setTimeout(r,700))}if(!state.readerRunning||session!==state.readerSession)break;state.readerCycle+=1;setText('readerStatus',`Completed cycle ${state.readerCycle}. Refreshing sources…`);await refresh();state.readerQueue=buildReaderQueue();state.readerIndex=0;await new Promise(r=>setTimeout(r,1200))}if(session===state.readerSession){setText('readerNow','');updateReaderStatus()}}
function toggleReaderPause(){if(!state.readerRunning)return;state.readerPaused=!state.readerPaused;const b=$('#pauseLoopBtn');if(state.readerPaused){if('speechSynthesis'in window)speechSynthesis.pause();if(b)b.textContent='▶ RESUME'}else{if('speechSynthesis'in window)speechSynthesis.resume();if(b)b.textContent='Ⅱ PAUSE'}updateReaderStatus()}
$('#briefBtn').onclick=speakBriefing;$('#sourceLoopBtn').onclick=startReaderLoop;$('#pauseLoopBtn').onclick=toggleReaderPause;$('#stopBtn').onclick=stopAudio;
$('#readerRange').onchange=e=>{state.readerRange=e.target.value==='all'?'all':Number(e.target.value);localStorage.setItem('sicReaderRange',String(e.target.value));updateReaderStatus()};
const savedReaderRange=localStorage.getItem('sicReaderRange');if(savedReaderRange){state.readerRange=savedReaderRange==='all'?'all':Number(savedReaderRange);const rs=$('#readerRange');if(rs)rs.value=savedReaderRange}
setInterval(()=>{if(state.readerRunning&&!state.readerPaused&&'speechSynthesis'in window&&speechSynthesis.paused)speechSynthesis.resume()},10000);

refresh();setInterval(refresh,30000);

/* Interactive map for the existing Sahel Intel frontend. No collector changes required. */
(() => {
  'use strict';
  const STYLE_ROOT = 'https://tiles.openfreemap.org/styles/';
  const STYLES = new Set(['positron', 'bright', 'dark']);
  const AES = new Set(['Mali', 'Burkina Faso', 'Niger']);
  const empty = () => ({type:'FeatureCollection',features:[]});
  const byId = id => document.getElementById(id);
  const goodCoord = (lat,lng) => lat !== null && lng !== null && lat !== '' && lng !== '' && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)) && Math.abs(Number(lat)) <= 90 && Math.abs(Number(lng)) <= 180 && !(Number(lat) === 0 && Number(lng) === 0);
  let map, lastState, callbacks, currentFeatures=empty(), recordIndex=new Map(), visibleEvents=[], dates=[], layersReady=false, markerHandlers=false;
  let showMarkers=true, showBorders=true, styleName='positron';
  const startBounds=[[-17.8,9.0],[16.4,25.0]];

  function status(message){const el=byId('mapLoadStatus');if(!el)return;el.hidden=!message;el.textContent=message||''}
  function initialize(){
    if(map)return;
    const host=byId('map');if(!host||!window.maplibregl)return;
    try{
      map=new maplibregl.Map({container:host,style:STYLE_ROOT+styleName,center:[0.1,16.1],zoom:4,fitBoundsOptions:{padding:35},attributionControl:true,maxZoom:16});
      map.addControl(new maplibregl.NavigationControl({showCompass:false}),'bottom-right');
      map.fitBounds(startBounds,{padding:32,duration:0});
      map.on('style.load', installLayers);
      map.on('error', e => {if(!layersReady)status('The map tiles could not load. Check your internet connection and refresh.');console.warn('Map tile error',e.error||e)});
      byId('mapStyle').onchange=e=>{if(!STYLES.has(e.target.value))return;styleName=e.target.value;layersReady=false;map.setStyle(STYLE_ROOT+styleName)};
      bindSearch();bindTimeline();
      byId('mapMarkersLayer').onchange=e=>{showMarkers=e.target.checked;applyVisibility()};
      byId('mapBordersLayer').onchange=e=>{showBorders=e.target.checked;applyVisibility()};
    }catch(error){map=null;status('The interactive map could not start.');console.error(error)}
  }
  function installLayers(){
    if(!map||!map.isStyleLoaded()||map.getSource('sahel-events'))return;
    layersReady=true;status('');
    const countries=(window.SAHEL_MAP_DATA?.countries||[]).filter(f=>AES.has(f.properties?.name));
    map.addSource('sahel-borders',{type:'geojson',data:{type:'FeatureCollection',features:countries}});
    map.addLayer({id:'sahel-border-lines',type:'line',source:'sahel-borders',paint:{'line-color':'#dd6758','line-width':['interpolate',['linear'],['zoom'],3,1.2,8,2.4],'line-opacity':0.78}});
    map.addSource('sahel-events',{type:'geojson',data:currentFeatures,cluster:true,clusterRadius:43,clusterMaxZoom:11});
    map.addLayer({id:'sahel-clusters',type:'circle',source:'sahel-events',filter:['has','point_count'],paint:{'circle-color':'#b85e3e','circle-radius':['step',['get','point_count'],18,8,23,30,29],'circle-stroke-color':'#ffffff','circle-stroke-width':2,'circle-opacity':0.95}});
    map.addLayer({id:'sahel-cluster-count',type:'symbol',source:'sahel-events',filter:['has','point_count'],layout:{'text-field':['get','point_count_abbreviated'],'text-size':13},paint:{'text-color':'#ffffff'}});
    map.addLayer({id:'sahel-points',type:'circle',source:'sahel-events',filter:['!', ['has','point_count']],paint:{'circle-radius':['interpolate',['linear'],['zoom'],4,7,10,11],'circle-color':['match',['get','actor'],'JNIM','#df625b','IS Sahel','#a977d8','State','#d39646','#588dbd'],'circle-stroke-color':'#ffffff','circle-stroke-width':2.2}});
    if(!markerHandlers){
      markerHandlers=true;
      map.on('click','sahel-clusters',async ev=>{
        const f=ev.features?.[0];if(!f)return;
        try{const zoom=await map.getSource('sahel-events').getClusterExpansionZoom(f.properties.cluster_id);map.easeTo({center:f.geometry.coordinates,zoom:Math.min(zoom,13),duration:420})}catch(err){console.warn(err)}
      });
      map.on('click','sahel-points',ev=>{
        const key=ev.features?.[0]?.properties?.key;const e=recordIndex.get(key);
        if(e){callbacks.showEventDetail(e);enhanceDetails(e);}
      });
      ['sahel-clusters','sahel-points'].forEach(layer=>{
        map.on('mouseenter',layer,()=>map.getCanvas().style.cursor='pointer');
        map.on('mouseleave',layer,()=>map.getCanvas().style.cursor='');
      });
    }
    applyVisibility();
  }
  function applyVisibility(){
    if(!map||!layersReady)return;
    for(const id of ['sahel-clusters','sahel-cluster-count','sahel-points'])if(map.getLayer(id))map.setLayoutProperty(id,'visibility',showMarkers?'visible':'none');
    if(map.getLayer('sahel-border-lines'))map.setLayoutProperty('sahel-border-lines','visibility',showBorders?'visible':'none');
  }
  function render(state, api){
    lastState=state;callbacks=api;initialize();
    if(!Array.isArray(state.events))return;
    visibleEvents=state.events.filter(e=>api.eventInWindow(e,state.mapDays)&&(!state.timelineDate||e.event_date===state.timelineDate)&& (state.actorFilter==='all'||e.actor===state.actorFilter));
    const features=[],missing=[];recordIndex=new Map();
    visibleEvents.forEach((e,i)=>{
      const locations=Array.isArray(e.incident_locations)&&e.incident_locations.length?e.incident_locations:Array.isArray(e.locations)&&e.locations.length?e.locations:[];
      const valid=locations.filter(l=>goodCoord(l?.lat,l?.lng));
      const points=valid.length?valid:goodCoord(e.lat,e.lng)?[{lat:e.lat,lng:e.lng,name:e.city,country:e.country}]:[];
      if(!points.length){missing.push(e);return}
      points.forEach((l,j)=>{
        const key=`${i}-${j}`;recordIndex.set(key,{...e,city:l.name||e.city,country:l.country||e.country,lat:Number(l.lat),lng:Number(l.lng)});
        features.push({type:'Feature',geometry:{type:'Point',coordinates:[Number(l.lng),Number(l.lat)]},properties:{key,actor:e.actor||'Other'}})
      });
    });
    currentFeatures={type:'FeatureCollection',features};
    if(layersReady&&map.getSource('sahel-events'))map.getSource('sahel-events').setData(currentFeatures);
    const count=byId('mapExplorerCount');if(count)count.textContent=`${visibleEvents.length} candidate events · ${features.length} map locations`;
    const totals=byId('mapCountryCounts');if(totals)totals.textContent=`${state.mapDays==='all'?'All available dates':state.mapDays===1?'Last 24 hours':`Last ${state.mapDays} days`} · ${visibleEvents.length} candidate events · ${features.length} map locations · ${missing.length} without precise coordinates`;
    const country=byId('mapCountryOnly');if(country){country.innerHTML=missing.length?`<h4>Location not precise (${missing.length})</h4><p>These records have no usable coordinates. They are listed here without a map pin.</p>${missing.slice(0,12).map((e,i)=>`<button type="button" data-missing="${i}">${api.esc([e.city,e.country].filter(Boolean).join(', ')||'Location unresolved')} · ${api.esc(e.event_date||'Date unresolved')}</button>`).join('')}`:'';country.querySelectorAll('[data-missing]').forEach(b=>b.onclick=()=>{const e=missing[Number(b.dataset.missing)];api.showEventDetail(e);enhanceDetails(e)})}
    updateTimeline(state);
  }
  function enhanceDetails(e){
    const el=byId('mapEventDetail');if(!el)return;
    el.hidden=false;
    const precision=goodCoord(e.lat,e.lng)?(e.city?'Town-level point (not an exact site)':'Approximate reported position'):'No precise position';
    const annotation=document.createElement('div');annotation.className='map-precision';annotation.textContent=`Map precision: ${precision} · Open-source candidate, not independently verified`;
    el.append(annotation);
    const urls=Array.isArray(e.report_urls)?e.report_urls:[];
    if(urls.length){const box=document.createElement('div');box.className='map-source-links';urls.slice(0,6).forEach((url,i)=>{try{const u=new URL(url);if(!['http:','https:'].includes(u.protocol))return;const a=document.createElement('a');a.href=u.href;a.target='_blank';a.rel='noopener noreferrer';a.textContent=`Source ${i+1}: ${u.hostname} ↗`;box.append(a)}catch(_){}});el.append(box)}
    el.scrollIntoView({behavior:'smooth',block:'nearest'});
  }
  function updateTimeline(state){
    dates=[...new Set((state.events||[]).map(e=>e.event_date).filter(x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)))].sort().slice(-21);
    const slider=byId('mapTimeline'),label=byId('mapTimelineLabel'),clear=byId('mapTimelineClear');if(!slider||!label||!clear)return;
    slider.disabled=dates.length===0;slider.max=String(Math.max(0,dates.length-1));slider.value=String(Math.max(0,dates.indexOf(state.timelineDate)));
    label.textContent=state.timelineDate?`Reported event date: ${state.timelineDate}`:'Select a reported event date';clear.hidden=!state.timelineDate;
  }
  function bindTimeline(){
    const slider=byId('mapTimeline'),clear=byId('mapTimelineClear');
    slider.oninput=()=>{if(!lastState||!dates.length)return;lastState.timelineDate=dates[Number(slider.value)];lastState.mapDays='all';document.querySelectorAll('.map-range').forEach(b=>b.classList.toggle('active',b.dataset.days==='all'));render(lastState,callbacks)};
    clear.onclick=()=>{if(!lastState)return;lastState.timelineDate=null;render(lastState,callbacks)};
  }
  function bindSearch(){
    const input=byId('mapPlaceSearch'),results=byId('mapSearchResults');if(!input||!results)return;
    const cities=typeof CITY_LABELS!=='undefined'?CITY_LABELS:[];
    const search=()=>{
      const term=input.value.trim().toLocaleLowerCase();results.replaceChildren();
      if(term.length<2){results.hidden=true;return}
      const matches=cities.filter(c=>c.name.toLocaleLowerCase().includes(term)).slice(0,7);
      results.hidden=matches.length===0;
      for(const c of matches){const b=document.createElement('button');b.type='button';b.textContent=c.name;b.onclick=()=>{input.value=c.name;results.hidden=true;map?.flyTo({center:[Number(c.lng),Number(c.lat)],zoom:9,essential:true})};results.append(b)}
    };
    input.addEventListener('input',search);input.addEventListener('keydown',ev=>{if(ev.key==='Escape')results.hidden=true;if(ev.key==='Enter'){const b=results.querySelector('button');if(b)b.click()}});
    document.addEventListener('click',ev=>{if(!ev.target.closest('.map-search'))results.hidden=true});
  }
  function resize(){if(map)map.resize()}
  window.SAHEL_MAP_UI={render,resize};
})();

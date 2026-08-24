const demoEvents=[];

const map=L.map('map',{zoomControl:true}).setView([54.7,39.5],6);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18,attribution:'&copy; OpenStreetMap'}).addTo(map);
const layer=L.layerGroup().addTo(map);
const historyLayer=L.layerGroup().addTo(map);
const markers=new Map();
let events=[];
let selectedId=null;
let historyOverlayEnabled=false;
let corridorMode=false;
let refreshTimer=null;

const CORRIDOR_REGIONS=new Set([
  'Белгородская область','Курская область','Брянская область','Орловская область',
  'Калужская область','Тульская область','Москва и Московская область',
  'Владимирская область','Рязанская область','Нижегородская область'
]);
const CORRIDOR_BOUNDS=L.latLngBounds([[50.0,31.0],[57.2,46.5]]);

const feed=document.getElementById('feed');
const detail=document.getElementById('detail');
const regionFilter=document.getElementById('regionFilter');
const sourceFilter=document.getElementById('sourceFilter');
const typeFilter=document.getElementById('typeFilter');
const timeFilter=document.getElementById('timeFilter');
const timeline=document.getElementById('timeline');
const historyOverlayToggle=document.getElementById('historyOverlayToggle');
const historyWindow=document.getElementById('historyWindow');
const todayPreset=document.getElementById('todayPreset');
const corridorPreset=document.getElementById('corridorPreset');
const refreshData=document.getElementById('refreshData');

function populateSelect(el,values){el.querySelectorAll('option:not([value="all"])').forEach(o=>o.remove());[...new Set(values.filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ru')).forEach(v=>{const o=document.createElement('option');o.value=v;o.textContent=v;el.appendChild(o);});}
function markerColor(e){if(e.type==='cancel'||e.status==='cancel')return '#72808b';if(e.type==='defense'||e.status==='defense')return '#b96762';if((e.confirmations||1)>1)return '#70947f';if(e.type==='alert'||e.status==='alert')return '#8b7b9f';return '#d5a252';}
function markerRadius(e){return (e.confirmations||1)>1?9:7;}
function eventDate(e){return new Date(e.published_at||e.timestamp||0);}
function ageMinutes(e){const t=eventDate(e).getTime();return Number.isFinite(t)?Math.max(0,Math.round((Date.now()-t)/60000)):Infinity;}
function localDayKey(value){const d=new Date(value);if(Number.isNaN(d.getTime()))return '';return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function isToday(e){return localDayKey(eventDate(e))===localDayKey(new Date());}
function ageText(m){if(!Number.isFinite(m))return 'время не определено';if(m<1)return 'только что';if(m<60)return `${m} мин назад`;const h=Math.floor(m/60),r=m%60;if(h<24)return r?`${h} ч ${r} мин назад`:`${h} ч назад`;return `${Math.floor(h/24)} дн. назад`;}
function normalizedType(e){return e.type||e.status||'fix';}
function passesCorridor(e){return !corridorMode||CORRIDOR_REGIONS.has(e.region);}
function filteredEvents(){
  const r=regionFilter.value,s=sourceFilter.value,t=typeFilter.value,period=timeFilter.value;
  const p=Number(timeline.value);const all=events.map(e=>({...e,minutesAgo:ageMinutes(e)}));
  const finiteAges=all.map(e=>e.minutesAgo).filter(Number.isFinite);const oldest=Math.max(1,...finiteAges);
  const timelineLimit=p===100?Infinity:Math.max(1,Math.round(oldest*p/100));
  return all.filter(e=>{
    if(!passesCorridor(e))return false;
    if(r!=='all'&&e.region!==r)return false;
    if(s!=='all'&&e.source!==s)return false;
    if(t!=='all'&&normalizedType(e)!==t)return false;
    if(period==='today'&&!isToday(e))return false;
    if(period!=='all'&&period!=='today'&&e.minutesAgo>Number(period))return false;
    return e.minutesAgo<=timelineLimit;
  });
}
function archivedEvents(){const days=Number(historyWindow?.value||30);const minAge=24*60,maxAge=days*24*60,r=regionFilter.value;return events.filter(e=>Number.isFinite(e.lat)&&Number.isFinite(e.lon)&&ageMinutes(e)>=minAge&&ageMinutes(e)<=maxAge&&(r==='all'||e.region===r)&&passesCorridor(e));}
function renderHistoryOverlay(){historyLayer.clearLayers();if(!historyOverlayEnabled)return;const grouped=new Map();archivedEvents().forEach(e=>{const key=`${Number(e.lat).toFixed(3)}|${Number(e.lon).toFixed(3)}`;(grouped.get(key)||grouped.set(key,[]).get(key)).push(e);});grouped.forEach(group=>{const e=group[0],count=group.length,radius=Math.min(18,5+Math.sqrt(count)*3);L.circleMarker([e.lat,e.lon],{radius,weight:1,opacity:.55,fillOpacity:.16,dashArray:'3 4'}).bindPopup(`<b>Исторические наблюдения</b><br>${e.place||'Населённый пункт'}<br>${e.region||''}<br>Архивных событий: ${count}<br><small>Только накопленная статистика старше 24 часов</small>`).addTo(historyLayer);});}
function showDetail(e){selectedId=e.id;detail.innerHTML=`<h2>Выбранная точка</h2><p><b>${e.place||'Населённый пункт не определён'}</b></p><div class="meta">${e.region||'Регион не определён'}<br>${e.status||e.type}<br>${ageText(ageMinutes(e))}<br>Источник: ${e.source||'—'}<br>Подтверждений: ${e.confirmations||1}${e.approximate?'<br>Координата населённого пункта/района приблизительная':''}${e.text?`<br><br>${e.text}`:''}</div>`;document.querySelectorAll('.event').forEach(n=>n.classList.toggle('active',String(n.dataset.id)===String(e.id)));}
function makeIcon(e){return L.divIcon({className:'',html:`<div style="width:${markerRadius(e)*2}px;height:${markerRadius(e)*2}px;border-radius:50%;background:${markerColor(e)};border:2px solid white;box-shadow:0 0 0 4px ${markerColor(e)}33"></div>`,iconSize:[22,22],iconAnchor:[11,11]});}
function updateFreshness(){
  const newest=events.map(eventDate).filter(d=>!Number.isNaN(d.getTime())).sort((a,b)=>b-a)[0];
  const lastUpdate=document.getElementById('lastUpdate');
  const freshness=document.getElementById('freshness');
  const geo=document.getElementById('geoCoverage');
  if(newest){
    const mins=Math.max(0,Math.round((Date.now()-newest.getTime())/60000));
    lastUpdate.textContent=newest.toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
    freshness.textContent=`Свежесть данных: ${ageText(mins)}`;
    freshness.classList.toggle('stale',mins>30);
  }else{lastUpdate.textContent='—';freshness.textContent='Свежесть данных: —';freshness.classList.add('stale');}
  const withCoords=events.filter(e=>Number.isFinite(e.lat)&&Number.isFinite(e.lon)).length;
  geo.textContent=`Координаты: ${withCoords}/${events.length}`;
}
function render(){
  const items=filteredEvents();layer.clearLayers();markers.clear();feed.innerHTML='';
  items.sort((a,b)=>eventDate(b)-eventDate(a)).forEach(e=>{
    if(Number.isFinite(e.lat)&&Number.isFinite(e.lon)){const marker=L.marker([e.lat,e.lon],{icon:makeIcon(e)}).addTo(layer);marker.bindPopup(`<b>${e.place||'Населённый пункт'}</b><br>${e.region||''}<br>${e.status||e.type}<br>${e.source||''}<br>${ageText(ageMinutes(e))}`);marker.on('click',()=>showDetail(e));markers.set(e.id,marker);}
    const div=document.createElement('button');div.type='button';div.className='event';div.dataset.id=e.id;div.innerHTML=`<b>${e.place||'Населённый пункт не определён'}${(e.confirmations||1)>1?`<span class="badge">${e.confirmations} источника</span>`:''}</b><div class="meta">${e.region||'Регион не определён'}<br>${e.status||e.type} · ${ageText(ageMinutes(e))}<br>${e.source||'—'}${Number.isFinite(e.lat)&&Number.isFinite(e.lon)?'':'<br>координата пока не определена'}</div>`;div.addEventListener('click',()=>{if(markers.has(e.id)){map.setView([e.lat,e.lon],9);markers.get(e.id).openPopup();}showDetail(e);});feed.appendChild(div);
  });
  document.getElementById('events').textContent=items.length;
  document.getElementById('todayCount').textContent=events.filter(isToday).length;
  document.getElementById('regions').textContent=new Set(items.map(e=>e.region).filter(Boolean)).size;
  document.getElementById('visibleCount').textContent=`${items.filter(e=>Number.isFinite(e.lat)&&Number.isFinite(e.lon)).length} точек`;
  document.getElementById('feedCount').textContent=`${items.length}`;
  const pts=items.filter(e=>Number.isFinite(e.lat)&&Number.isFinite(e.lon));
  if(corridorMode){map.fitBounds(CORRIDOR_BOUNDS,{padding:[18,18]});}
  else if(pts.length){const bounds=L.latLngBounds(pts.map(e=>[e.lat,e.lon]));if(bounds.isValid())map.fitBounds(bounds.pad(.15),{maxZoom:8});}
  if(selectedId&&!items.some(e=>String(e.id)===String(selectedId))){selectedId=null;detail.innerHTML='<h2>Выбранная точка</h2><p class="muted">Нажмите на маркер или событие в ленте.</p>';}
  document.getElementById('timelineLabel').textContent=Number(timeline.value)===100?'все события':'ограниченный исторический диапазон';
  renderHistoryOverlay();updateFreshness();
}
async function loadEvents({silent=false}={}){
  const status=document.getElementById('status');
  if(!silent)status.textContent='● загрузка…';
  try{
    const res=await fetch(`../data/events.json?ts=${Date.now()}`,{cache:'no-store'});if(!res.ok)throw new Error('events unavailable');
    const fresh=await res.json();if(!Array.isArray(fresh))throw new Error('invalid events');
    events=fresh.map((e,i)=>({id:e.id||`event-${i}`,type:e.type||e.status||'fix',status:e.status||e.type||'fix',confirmations:e.confirmations||1,...e}));
    status.textContent='● данные загружены';status.classList.remove('error');
    populateSelect(regionFilter,events.map(e=>e.region));populateSelect(sourceFilter,events.map(e=>e.source));render();
  }catch(err){
    if(!events.length)events=demoEvents;
    status.textContent='● данные недоступны';status.classList.add('error');render();
  }
}
function startAutoRefresh(){if(refreshTimer)clearInterval(refreshTimer);refreshTimer=setInterval(()=>loadEvents({silent:true}),60000);}
[regionFilter,sourceFilter,typeFilter,timeFilter,timeline].forEach(el=>el.addEventListener(el===timeline?'input':'change',render));
if(historyOverlayToggle)historyOverlayToggle.addEventListener('click',()=>{historyOverlayEnabled=!historyOverlayEnabled;historyOverlayToggle.setAttribute('aria-pressed',String(historyOverlayEnabled));historyOverlayToggle.textContent=historyOverlayEnabled?'🕘 Исторический слой: вкл':'🕘 Исторический слой: выкл';renderHistoryOverlay();});
if(historyWindow)historyWindow.addEventListener('change',renderHistoryOverlay);
if(todayPreset)todayPreset.addEventListener('click',()=>{corridorMode=false;corridorPreset?.classList.remove('active-preset');timeFilter.value='today';regionFilter.value='all';timeline.value='100';render();});
if(corridorPreset)corridorPreset.addEventListener('click',()=>{corridorMode=!corridorMode;corridorPreset.classList.toggle('active-preset',corridorMode);regionFilter.value='all';timeFilter.value='today';timeline.value='100';render();});
if(refreshData)refreshData.addEventListener('click',()=>loadEvents());
document.getElementById('resetFilters').addEventListener('click',()=>{corridorMode=false;corridorPreset?.classList.remove('active-preset');regionFilter.value='all';sourceFilter.value='all';typeFilter.value='all';timeFilter.value='today';timeline.value='100';historyOverlayEnabled=false;if(historyOverlayToggle){historyOverlayToggle.setAttribute('aria-pressed','false');historyOverlayToggle.textContent='🕘 Исторический слой: выкл';}render();});
loadEvents().then(startAutoRefresh);
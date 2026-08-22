const fallbackEvents=[
{id:'demo-dzerzhinsk',place:'Дзержинск',region:'Нижегородская область',source:'@nn52signal',status:'fix',published_at:new Date(Date.now()-18*60000).toISOString(),lat:56.238,lon:43.46,confirmations:2,approximate:false},
{id:'demo-semiluki',place:'Семилуки',region:'Воронежская область',source:'@vrv_radar',status:'fix',published_at:new Date(Date.now()-28*60000).toISOString(),lat:51.69,lon:39.03,confirmations:1,approximate:false}
];

const map=L.map('map',{zoomControl:true}).setView([55.1,43.5],6);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18,attribution:'&copy; OpenStreetMap'}).addTo(map);
const layer=L.layerGroup().addTo(map);
const markers=new Map();

const feed=document.getElementById('feed');
const detail=document.getElementById('detail');
const regionFilter=document.getElementById('regionFilter');
const sourceFilter=document.getElementById('sourceFilter');
const typeFilter=document.getElementById('typeFilter');
const timeFilter=document.getElementById('timeFilter');
const timeline=document.getElementById('timeline');
let events=[];
let selectedId=null;

function normalizeEvent(e){const ts=new Date(e.published_at);const minutesAgo=Math.max(0,Math.round((Date.now()-ts.getTime())/60000));return {...e,type:e.status||'unknown',timestamp:ts,minutesAgo,statusLabel:({fix:'фиксация',alert:'опасность',defense:'ПВО / сбитие',cancel:'отбой / отмена'})[e.status]||e.status||'неизвестно'};}
function populateSelect(el,values){el.querySelectorAll('option:not([value="all"])').forEach(o=>o.remove());[...new Set(values)].sort().forEach(v=>{const o=document.createElement('option');o.value=v;o.textContent=v;el.appendChild(o);});}
function markerColor(e){if(e.type==='cancel')return '#72808b';if(e.type==='defense')return '#b96762';if(e.confirmations>1)return '#70947f';if(e.type==='alert')return '#8b7b9f';return '#d5a252';}
function markerRadius(e){return e.confirmations>1?9:7;}
function ageText(m){if(m<60)return `${m} мин назад`;const h=Math.floor(m/60),r=m%60;return r?`${h} ч ${r} мин назад`:`${h} ч назад`;}
function filteredEvents(){const r=regionFilter.value,s=sourceFilter.value,t=typeFilter.value,limit=Number(timeFilter.value);const timelinePercent=Number(timeline.value);const oldest=Math.max(1,...events.map(e=>e.minutesAgo));const timelineLimit=timelinePercent===100?Infinity:Math.max(1,Math.round(oldest*timelinePercent/100));return events.filter(e=>(r==='all'||e.region===r)&&(s==='all'||e.source===s)&&(t==='all'||e.type===t)&&(!limit||e.minutesAgo<=limit)&&(e.minutesAgo<=timelineLimit));}
function showDetail(e){selectedId=e.id;detail.innerHTML=`<h2>Выбранная точка</h2><p><b>${e.place}</b></p><div class="meta">${e.region}<br>${e.statusLabel}<br>${ageText(e.minutesAgo)}<br>Источник: ${e.source}<br>Подтверждений: ${e.confirmations||1}${e.approximate?'<br>Координата приблизительная':''}</div>`;document.querySelectorAll('.event').forEach(n=>n.classList.toggle('active',n.dataset.id===String(e.id)));}
function makeIcon(e){return L.divIcon({className:'',html:`<div style="width:${markerRadius(e)*2}px;height:${markerRadius(e)*2}px;border-radius:50%;background:${markerColor(e)};border:2px solid white;box-shadow:0 0 0 4px ${markerColor(e)}33"></div>`,iconSize:[22,22],iconAnchor:[11,11]});}
function render(){const items=filteredEvents();layer.clearLayers();markers.clear();feed.innerHTML='';items.forEach(e=>{const marker=L.marker([e.lat,e.lon],{icon:makeIcon(e)}).addTo(layer);marker.bindPopup(`<b>${e.place}</b><br>${e.region}<br>${e.statusLabel}<br>${e.source}<br>${ageText(e.minutesAgo)}`);marker.on('click',()=>showDetail(e));markers.set(e.id,marker);const div=document.createElement('div');div.className='event';div.dataset.id=e.id;div.innerHTML=`<b>${e.place}${(e.confirmations||1)>1?`<span class="badge">${e.confirmations} источника</span>`:''}</b><div class="meta">${e.region}<br>${e.statusLabel} · ${ageText(e.minutesAgo)}<br>${e.source}</div>`;div.addEventListener('click',()=>{map.setView([e.lat,e.lon],9);marker.openPopup();showDetail(e);});feed.appendChild(div);});document.getElementById('events').textContent=items.length;document.getElementById('regions').textContent=new Set(items.map(e=>e.region)).size;document.getElementById('sources').textContent=new Set(items.map(e=>e.source)).size;document.getElementById('confirmed').textContent=items.filter(e=>(e.confirmations||1)>1).length;document.getElementById('visibleCount').textContent=`${items.length} точек`;document.getElementById('feedCount').textContent=`${items.length}`;if(items.length){const bounds=L.latLngBounds(items.map(e=>[e.lat,e.lon]));if(bounds.isValid())map.fitBounds(bounds.pad(.15),{maxZoom:8});}if(selectedId&&!items.some(e=>String(e.id)===String(selectedId))){selectedId=null;detail.innerHTML='<h2>Выбранная точка</h2><p class="muted">Нажмите на маркер или событие в ленте.</p>';}const p=Number(timeline.value);const oldest=Math.max(1,...events.map(e=>e.minutesAgo));document.getElementById('timelineLabel').textContent=p===100?'все события':`до ${Math.round(oldest*p/100)} мин`;}
async function loadEvents(){const status=document.getElementById('status');try{const res=await fetch('../data/events.json',{cache:'no-store'});if(!res.ok)throw new Error('events.json unavailable');events=(await res.json()).map(normalizeEvent);status.textContent='● данные из публичных источников';}catch(err){events=fallbackEvents.map(normalizeEvent);status.textContent='● demo fallback';}populateSelect(regionFilter,events.map(e=>e.region));populateSelect(sourceFilter,events.map(e=>e.source));render();}
[regionFilter,sourceFilter,typeFilter,timeFilter,timeline].forEach(el=>el.addEventListener(el===timeline?'input':'change',render));
document.getElementById('resetFilters').addEventListener('click',()=>{regionFilter.value='all';sourceFilter.value='all';typeFilter.value='all';timeFilter.value='all';timeline.value='100';render();});
loadEvents();
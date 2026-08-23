const demoEvents=[
{id:1,place:'Дзержинск',region:'Нижегородская область',source:'@nn52signal',type:'fix',status:'фиксация',lat:56.238,lon:43.46,published_at:'2026-08-22T10:00:00+03:00',confirmations:2,text:'Публичное сообщение о фиксации в населённом пункте.'},
{id:2,place:'Выкса',region:'Нижегородская область',source:'@radar_nizhniinovgorod',type:'cancel',status:'отбой / опровержение',lat:55.32,lon:42.17,published_at:'2026-08-21T22:20:00+03:00',confirmations:1,text:'Ранее опубликованное сообщение позднее было снято источником.'},
{id:3,place:'Семилуки',region:'Воронежская область',source:'@vrv_radar',type:'fix',status:'фиксация',lat:51.69,lon:39.03,published_at:'2026-08-21T19:40:00+03:00',confirmations:1,text:'Публичное сообщение о фиксации.'}
];

const map=L.map('map',{zoomControl:true}).setView([55.1,43.5],6);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18,attribution:'&copy; OpenStreetMap'}).addTo(map);
const layer=L.layerGroup().addTo(map);
const markers=new Map();
let events=[];
let selectedId=null;

const feed=document.getElementById('feed');
const detail=document.getElementById('detail');
const regionFilter=document.getElementById('regionFilter');
const sourceFilter=document.getElementById('sourceFilter');
const typeFilter=document.getElementById('typeFilter');
const timeFilter=document.getElementById('timeFilter');
const timeline=document.getElementById('timeline');

function populateSelect(el,values){el.querySelectorAll('option:not([value="all"])').forEach(o=>o.remove());[...new Set(values.filter(Boolean))].sort().forEach(v=>{const o=document.createElement('option');o.value=v;o.textContent=v;el.appendChild(o);});}
function markerColor(e){if(e.type==='cancel'||e.status==='cancel')return '#72808b';if(e.type==='defense'||e.status==='defense')return '#b96762';if((e.confirmations||1)>1)return '#70947f';if(e.type==='alert'||e.status==='alert')return '#8b7b9f';return '#d5a252';}
function markerRadius(e){return (e.confirmations||1)>1?9:7;}
function eventDate(e){return new Date(e.published_at||e.timestamp||Date.now());}
function ageMinutes(e){return Math.max(0,Math.round((Date.now()-eventDate(e).getTime())/60000));}
function ageText(m){if(m<60)return `${m} мин назад`;const h=Math.floor(m/60),r=m%60;if(h<24)return r?`${h} ч ${r} мин назад`:`${h} ч назад`;return `${Math.floor(h/24)} дн. назад`;}
function normalizedType(e){return e.type||e.status||'fix';}
function filteredEvents(){const r=regionFilter.value,s=sourceFilter.value,t=typeFilter.value,limit=timeFilter.value==='all'?0:Number(timeFilter.value);const p=Number(timeline.value);const all=events.map(e=>({...e,minutesAgo:ageMinutes(e)}));const oldest=Math.max(1,...all.map(e=>e.minutesAgo));const timelineLimit=p===100?Infinity:Math.max(1,Math.round(oldest*p/100));return all.filter(e=>(r==='all'||e.region===r)&&(s==='all'||e.source===s)&&(t==='all'||normalizedType(e)===t)&&(!limit||e.minutesAgo<=limit)&&e.minutesAgo<=timelineLimit);}
function showDetail(e){selectedId=e.id;detail.innerHTML=`<h2>Выбранная точка</h2><p><b>${e.place||'Населённый пункт не определён'}</b></p><div class="meta">${e.region||'Регион не определён'}<br>${e.status||e.type}<br>${ageText(ageMinutes(e))}<br>Источник: ${e.source}<br>Подтверждений: ${e.confirmations||1}${e.approximate?'<br>Координата населённого пункта/района приблизительная':''}${e.text?`<br><br>${e.text}`:''}</div>`;document.querySelectorAll('.event').forEach(n=>n.classList.toggle('active',String(n.dataset.id)===String(e.id)));}
function makeIcon(e){return L.divIcon({className:'',html:`<div style="width:${markerRadius(e)*2}px;height:${markerRadius(e)*2}px;border-radius:50%;background:${markerColor(e)};border:2px solid white;box-shadow:0 0 0 4px ${markerColor(e)}33"></div>`,iconSize:[22,22],iconAnchor:[11,11]});}
function render(){const items=filteredEvents();layer.clearLayers();markers.clear();feed.innerHTML='';items.sort((a,b)=>eventDate(b)-eventDate(a)).forEach(e=>{if(Number.isFinite(e.lat)&&Number.isFinite(e.lon)){const marker=L.marker([e.lat,e.lon],{icon:makeIcon(e)}).addTo(layer);marker.bindPopup(`<b>${e.place||'Населённый пункт'}</b><br>${e.region||''}<br>${e.status||e.type}<br>${e.source}<br>${ageText(ageMinutes(e))}`);marker.on('click',()=>showDetail(e));markers.set(e.id,marker);}const div=document.createElement('button');div.type='button';div.className='event';div.dataset.id=e.id;div.innerHTML=`<b>${e.place||'Населённый пункт не определён'}${(e.confirmations||1)>1?`<span class="badge">${e.confirmations} источника</span>`:''}</b><div class="meta">${e.region||'Регион не определён'}<br>${e.status||e.type} · ${ageText(ageMinutes(e))}<br>${e.source}${Number.isFinite(e.lat)&&Number.isFinite(e.lon)?'':'<br>координата пока не определена'}</div>`;div.addEventListener('click',()=>{if(markers.has(e.id)){map.setView([e.lat,e.lon],9);markers.get(e.id).openPopup();}showDetail(e);});feed.appendChild(div);});
 document.getElementById('events').textContent=items.length;document.getElementById('regions').textContent=new Set(items.map(e=>e.region).filter(Boolean)).size;document.getElementById('sources').textContent=new Set(items.map(e=>e.source).filter(Boolean)).size;document.getElementById('confirmed').textContent=items.filter(e=>(e.confirmations||1)>1).length;document.getElementById('visibleCount').textContent=`${items.filter(e=>Number.isFinite(e.lat)&&Number.isFinite(e.lon)).length} точек`;document.getElementById('feedCount').textContent=`${items.length}`;
 const pts=items.filter(e=>Number.isFinite(e.lat)&&Number.isFinite(e.lon));if(pts.length){const bounds=L.latLngBounds(pts.map(e=>[e.lat,e.lon]));if(bounds.isValid())map.fitBounds(bounds.pad(.15),{maxZoom:8});}
 if(selectedId&&!items.some(e=>String(e.id)===String(selectedId))){selectedId=null;detail.innerHTML='<h2>Выбранная точка</h2><p class="muted">Нажмите на маркер или событие в ленте.</p>';}
 document.getElementById('timelineLabel').textContent=Number(timeline.value)===100?'все события':'ограниченный исторический диапазон';}
async function loadEvents(){try{const res=await fetch('../data/events.json',{cache:'no-store'});if(!res.ok)throw new Error('events unavailable');events=await res.json();document.getElementById('status').textContent='● data mode';}catch(err){events=demoEvents;document.getElementById('status').textContent='● demo fallback';}events=events.map((e,i)=>({id:e.id||`event-${i}`,type:e.type||e.status||'fix',status:e.status||e.type||'fix',confirmations:e.confirmations||1,...e}));populateSelect(regionFilter,events.map(e=>e.region));populateSelect(sourceFilter,events.map(e=>e.source));render();}
[regionFilter,sourceFilter,typeFilter,timeFilter,timeline].forEach(el=>el.addEventListener(el===timeline?'input':'change',render));
document.getElementById('resetFilters').addEventListener('click',()=>{regionFilter.value='all';sourceFilter.value='all';typeFilter.value='all';timeFilter.value='all';timeline.value='100';render();});
loadEvents();
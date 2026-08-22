const now=Date.now();
const demoEvents=[
{id:1,place:'Дзержинск',region:'Нижегородская область',source:'@nn52signal',type:'fix',status:'фиксация',lat:56.238,lon:43.46,minutesAgo:18,confirmations:2,text:'Публичное сообщение о фиксации в населённом пункте.'},
{id:2,place:'Выкса',region:'Нижегородская область',source:'@radar_nizhniinovgorod',type:'cancel',status:'отбой / опровержение',lat:55.32,lon:42.17,minutesAgo:46,confirmations:1,text:'Ранее опубликованное сообщение позднее было снято источником.'},
{id:3,place:'Шатки',region:'Нижегородская область',source:'@radar_nizhniinovgorod',type:'fix',status:'фиксация',lat:55.19,lon:44.13,minutesAgo:63,confirmations:1,text:'Публичное сообщение о фиксации в районе.'},
{id:4,place:'Семилуки',region:'Воронежская область',source:'@vrv_radar',type:'fix',status:'фиксация',lat:51.69,lon:39.03,minutesAgo:28,confirmations:1,text:'Публичное сообщение о фиксации.'},
{id:5,place:'Новая Усмань',region:'Воронежская область',source:'@radar_voronezh',type:'fix',status:'несколько сообщений',lat:51.64,lon:39.41,minutesAgo:35,confirmations:3,text:'Несколько публичных сообщений по одному району.'},
{id:6,place:'Воронеж',region:'Воронежская область',source:'@vrv_radar',type:'alert',status:'опасность',lat:51.67,lon:39.20,minutesAgo:12,confirmations:1,text:'Публичное предупреждение об опасности БПЛА.'},
{id:7,place:'Павлово',region:'Нижегородская область',source:'@nn52signal',type:'defense',status:'ПВО / сбитие',lat:55.97,lon:43.09,minutesAgo:97,confirmations:1,text:'Публичное сообщение о работе ПВО.'}
].map(e=>({...e,timestamp:new Date(now-e.minutesAgo*60000)}));

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
let selectedId=null;

function populateSelect(el,values){[...new Set(values)].sort().forEach(v=>{const o=document.createElement('option');o.value=v;o.textContent=v;el.appendChild(o);});}
populateSelect(regionFilter,demoEvents.map(e=>e.region));
populateSelect(sourceFilter,demoEvents.map(e=>e.source));

function markerColor(e){if(e.type==='cancel')return '#72808b';if(e.type==='defense')return '#b96762';if(e.confirmations>1)return '#70947f';if(e.type==='alert')return '#8b7b9f';return '#d5a252';}
function markerRadius(e){return e.confirmations>1?9:7;}
function ageText(m){if(m<60)return `${m} мин назад`;const h=Math.floor(m/60),r=m%60;return r?`${h} ч ${r} мин назад`:`${h} ч назад`;}
function filteredEvents(){const r=regionFilter.value,s=sourceFilter.value,t=typeFilter.value,limit=Number(timeFilter.value);const timelinePercent=Number(timeline.value);const oldest=Math.max(...demoEvents.map(e=>e.minutesAgo));const timelineLimit=timelinePercent===100?Infinity:Math.max(1,Math.round(oldest*timelinePercent/100));return demoEvents.filter(e=>(r==='all'||e.region===r)&&(s==='all'||e.source===s)&&(t==='all'||e.type===t)&&(!limit||e.minutesAgo<=limit)&&(e.minutesAgo<=timelineLimit));}
function showDetail(e){selectedId=e.id;detail.innerHTML=`<h2>Выбранная точка</h2><p><b>${e.place}</b></p><div class="meta">${e.region}<br>${e.status}<br>${ageText(e.minutesAgo)}<br>Источник: ${e.source}<br>Независимых подтверждений: ${e.confirmations}<br><br>${e.text}</div>`;document.querySelectorAll('.event').forEach(n=>n.classList.toggle('active',Number(n.dataset.id)===e.id));}
function makeIcon(e){return L.divIcon({className:'',html:`<div style="width:${markerRadius(e)*2}px;height:${markerRadius(e)*2}px;border-radius:50%;background:${markerColor(e)};border:2px solid white;box-shadow:0 0 0 4px ${markerColor(e)}33"></div>`,iconSize:[22,22],iconAnchor:[11,11]});}
function render(){const items=filteredEvents();layer.clearLayers();markers.clear();feed.innerHTML='';items.forEach(e=>{const marker=L.marker([e.lat,e.lon],{icon:makeIcon(e)}).addTo(layer);marker.bindPopup(`<b>${e.place}</b><br>${e.region}<br>${e.status}<br>${e.source}<br>${ageText(e.minutesAgo)}`);marker.on('click',()=>showDetail(e));markers.set(e.id,marker);const div=document.createElement('div');div.className='event';div.dataset.id=e.id;div.innerHTML=`<b>${e.place}${e.confirmations>1?`<span class="badge">${e.confirmations} источника</span>`:''}</b><div class="meta">${e.region}<br>${e.status} · ${ageText(e.minutesAgo)}<br>${e.source}</div>`;div.addEventListener('click',()=>{map.setView([e.lat,e.lon],9);marker.openPopup();showDetail(e);});feed.appendChild(div);});
 document.getElementById('events').textContent=items.length;document.getElementById('regions').textContent=new Set(items.map(e=>e.region)).size;document.getElementById('sources').textContent=new Set(items.map(e=>e.source)).size;document.getElementById('confirmed').textContent=items.filter(e=>e.confirmations>1).length;document.getElementById('visibleCount').textContent=`${items.length} точек`;document.getElementById('feedCount').textContent=`${items.length}`;
 if(items.length){const bounds=L.latLngBounds(items.map(e=>[e.lat,e.lon]));if(bounds.isValid())map.fitBounds(bounds.pad(.15),{maxZoom:8});}if(selectedId&&!items.some(e=>e.id===selectedId)){selectedId=null;detail.innerHTML='<h2>Выбранная точка</h2><p class="muted">Нажмите на маркер или событие в ленте.</p>';}
 const p=Number(timeline.value);document.getElementById('timelineLabel').textContent=p===100?'все события':`до ${Math.round(Math.max(...demoEvents.map(e=>e.minutesAgo))*p/100)} мин`;}

[regionFilter,sourceFilter,typeFilter,timeFilter,timeline].forEach(el=>el.addEventListener(el===timeline?'input':'change',render));
document.getElementById('resetFilters').addEventListener('click',()=>{regionFilter.value='all';sourceFilter.value='all';typeFilter.value='all';timeFilter.value='all';timeline.value='100';render();});
render();
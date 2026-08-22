const demoEvents=[
{place:'Дзержинск',region:'Нижегородская область',source:'@nn52signal',status:'фиксация',lat:56.238,lon:43.46},
{place:'Выкса',region:'Нижегородская область',source:'@radar_nizhniinovgorod',status:'проверка',lat:55.32,lon:42.17},
{place:'Семилуки',region:'Воронежская область',source:'@vrv_radar',status:'фиксация',lat:51.69,lon:39.03}
];

const map=L.map('map').setView([55.7,45],5);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18}).addTo(map);

const feed=document.getElementById('feed');

demoEvents.forEach(e=>{
 const marker=L.marker([e.lat,e.lon]).addTo(map);
 marker.bindPopup(`<b>${e.place}</b><br>${e.region}<br>${e.source}<br>${e.status}`);

 const item=document.createElement('div');
 item.className='event';
 item.innerHTML=`<b>${e.place}</b><br>${e.region}<br>${e.source}<br>${e.status}`;
 item.onclick=()=>{
   map.setView([e.lat,e.lon],9);
   marker.openPopup();
 };
 feed.appendChild(item);
});

document.getElementById('events').textContent=demoEvents.length;
document.getElementById('regions').textContent=new Set(demoEvents.map(x=>x.region)).size;
document.getElementById('sources').textContent=new Set(demoEvents.map(x=>x.source)).size;

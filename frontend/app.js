const demoEvents=[
{place:'Дзержинск',region:'Нижегородская область',source:'@nn52signal',status:'фиксация'},
{place:'Выкса',region:'Нижегородская область',source:'@radar_nizhniinovgorod',status:'проверка'},
{place:'Семилуки',region:'Воронежская область',source:'@vrv_radar',status:'фиксация'}
];
const feed=document.getElementById('feed');
const points=document.getElementById('points');
demoEvents.forEach(e=>{
 const item=document.createElement('div');
 item.className='event';
 item.innerHTML=`<b>${e.place}</b><br>${e.region}<br>${e.source}<br>${e.status}`;
 feed.appendChild(item);
 const p=document.createElement('span');
 p.className='point';
 p.title=e.place;
 points.appendChild(p);
});
document.getElementById('events').textContent=demoEvents.length;
document.getElementById('regions').textContent=new Set(demoEvents.map(x=>x.region)).size;
document.getElementById('sources').textContent=new Set(demoEvents.map(x=>x.source)).size;
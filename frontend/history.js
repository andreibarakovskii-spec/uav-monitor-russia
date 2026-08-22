// Historical analytics dashboard

let historyData = null;

async function loadHistoricalAnalytics() {
  try {
    const response = await fetch('../data/historical_analysis.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('history unavailable');
    return await response.json();
  } catch (error) {
    return null;
  }
}

function renderHistoryPage(data) {
  if (!data) return;
  historyData = data;

  setText('total', data.total_events || 0);
  setText('regions', Object.keys(data.regions || {}).length);
  setText('sources', Object.keys(data.sources || {}).length);
  setText('updated', new Date().toLocaleString('ru-RU'));

  renderHistoryList('regionsList', data.regions || {});
  renderHistoryList('sourcesList', data.sources || {});
  renderDailyChart(data.daily || data.timeline || {});
  renderArchiveFilters(data);
}

function setText(id,value){
  const el=document.getElementById(id);
  if(el) el.textContent=value;
}

function renderHistoryList(id,obj){
  const el=document.getElementById(id);
  if(!el)return;
  el.innerHTML='';
  Object.entries(obj).sort((a,b)=>b[1]-a[1]).slice(0,20).forEach(([name,count])=>{
    const item=document.createElement('div');
    item.className='event';
    item.innerHTML=`<b>${name}</b><div class="meta">${count} событий</div>`;
    el.appendChild(item);
  });
}

function renderDailyChart(data){
  const el=document.getElementById('dailyChart');
  if(!el)return;
  const entries=Object.entries(data||{}).slice(-60);
  const max=Math.max(...entries.map(x=>x[1]),1);
  el.innerHTML=entries.map(([date,value])=>{
    const width=Math.round(value/max*100);
    return `<div class="chart-row"><span>${date}</span><div class="chart-line"><i style="width:${width}%"></i></div><b>${value}</b></div>`;
  }).join('');
}

function renderArchiveFilters(data){
  const host=document.getElementById('historyFilters');
  if(!host)return;
  const regions=Object.keys(data.regions||{});
  host.innerHTML=`<select id="regionFilter"><option value="">Все регионы</option>${regions.map(r=>`<option>${r}</option>`).join('')}</select>`;
}

loadHistoricalAnalytics().then(renderHistoryPage);
window.HistoricalAnalytics={loadHistoricalAnalytics};

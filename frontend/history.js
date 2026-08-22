// Historical analytics viewer helper

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

  const total = document.getElementById('total');
  const regions = document.getElementById('regions');
  const sources = document.getElementById('sources');
  const updated = document.getElementById('updated');

  if (total) total.textContent = data.total_events || 0;
  if (regions) regions.textContent = Object.keys(data.regions || {}).length;
  if (sources) sources.textContent = Object.keys(data.sources || {}).length;
  if (updated) updated.textContent = new Date().toLocaleString('ru-RU');

  renderHistoryList('regionsList', data.regions || {});
  renderHistoryList('sourcesList', data.sources || {});
  renderDailyChart(data.daily || data.timeline || {});
}

function renderHistoryList(id, obj) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = '';

  Object.entries(obj).sort((a,b)=>b[1]-a[1]).slice(0,20).forEach(([name,count])=>{
    const item=document.createElement('div');
    item.className='event';
    item.innerHTML=`<b>${name}</b><div class="meta">${count} событий</div>`;
    el.appendChild(item);
  });
}

function renderDailyChart(data) {
  const el = document.getElementById('dailyChart');
  if (!el || !data || !Object.keys(data).length) return;

  const entries = Object.entries(data).slice(-30);
  const max = Math.max(...entries.map(x=>x[1]), 1);

  el.innerHTML = entries.map(([date,value]) => {
    const width = Math.round((value / max) * 100);
    return `<div class="chart-row"><span>${date}</span><div class="bar" style="width:${width}%"></div><b>${value}</b></div>`;
  }).join('');
}

loadHistoricalAnalytics().then(renderHistoryPage);

window.HistoricalAnalytics = { loadHistoricalAnalytics };

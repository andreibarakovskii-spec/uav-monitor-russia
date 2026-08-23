// Historical analytics dashboard

let historyData = null;
let archiveEvents = [];
let map = null;
let mapLayer = null;

async function loadJson(path) {
  try {
    const response = await fetch(path, { cache: 'no-store' });
    if (!response.ok) throw new Error(path + ' unavailable');
    return await response.json();
  } catch (error) {
    return null;
  }
}

async function loadHistoricalAnalytics() {
  return loadJson('../data/historical_analysis.json');
}

async function loadArchiveEvents() {
  const data = await loadJson('../data/events.json');
  if (!Array.isArray(data)) return [];
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  return data.filter(e => {
    const t = new Date(e.published_at || 0).getTime();
    return Number.isFinite(t) && t <= cutoff;
  });
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function formatDate(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('ru-RU');
}

function renderHistoryList(id, obj) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = '';
  Object.entries(obj || {}).sort((a,b)=>b[1]-a[1]).slice(0,20).forEach(([name,count])=>{
    const item = document.createElement('div');
    item.className = 'event';
    item.innerHTML = `<b>${name}</b><div class="meta">${count} событий</div>`;
    el.appendChild(item);
  });
}

function renderDailyChart(data) {
  const el = document.getElementById('dailyChart');
  if (!el) return;
  const entries = Object.entries(data || {}).sort((a,b)=>String(a[0]).localeCompare(String(b[0]))).slice(-60);
  if (!entries.length) {
    el.innerHTML = '<p class="muted">Пока недостаточно архивных данных.</p>';
    return;
  }
  const max = Math.max(...entries.map(x => Number(x[1]) || 0), 1);
  el.innerHTML = entries.map(([date,value]) => {
    const v = Number(value) || 0;
    const width = Math.max(2, Math.round(v / max * 100));
    return `<div class="chart-row"><span>${date}</span><div class="chart-line"><i style="width:${width}%"></i></div><b>${v}</b></div>`;
  }).join('');
}

function uniqueYears(events) {
  return [...new Set(events.map(e => new Date(e.published_at).getFullYear()).filter(Number.isFinite))].sort((a,b)=>b-a);
}

function uniqueMonths(events, year) {
  return [...new Set(events.filter(e => !year || new Date(e.published_at).getFullYear() === Number(year)).map(e => new Date(e.published_at).getMonth()+1))].sort((a,b)=>a-b);
}

function uniqueRegions(events) {
  return [...new Set(events.map(e => e.region).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ru'));
}

function renderArchiveFilters() {
  const host = document.getElementById('historyFilters');
  if (!host) return;
  const years = uniqueYears(archiveEvents);
  const regions = uniqueRegions(archiveEvents);
  host.innerHTML = `
    <label>Год<select id="historyYear"><option value="">Все</option>${years.map(y=>`<option value="${y}">${y}</option>`).join('')}</select></label>
    <label>Месяц<select id="historyMonth"><option value="">Все</option></select></label>
    <label>Регион<select id="historyRegion"><option value="">Все регионы</option>${regions.map(r=>`<option value="${r}">${r}</option>`).join('')}</select></label>
  `;
  const year = document.getElementById('historyYear');
  const month = document.getElementById('historyMonth');
  const region = document.getElementById('historyRegion');
  const refreshMonths = () => {
    const months = uniqueMonths(archiveEvents, year.value);
    month.innerHTML = `<option value="">Все</option>${months.map(m=>`<option value="${m}">${String(m).padStart(2,'0')}</option>`).join('')}`;
  };
  year.addEventListener('change', () => { refreshMonths(); renderArchive(); });
  month.addEventListener('change', renderArchive);
  region.addEventListener('change', renderArchive);
  refreshMonths();
}

function filteredArchiveEvents() {
  const year = document.getElementById('historyYear')?.value || '';
  const month = document.getElementById('historyMonth')?.value || '';
  const region = document.getElementById('historyRegion')?.value || '';
  return archiveEvents.filter(e => {
    const d = new Date(e.published_at || 0);
    if (Number.isNaN(d.getTime())) return false;
    if (year && d.getFullYear() !== Number(year)) return false;
    if (month && d.getMonth()+1 !== Number(month)) return false;
    if (region && e.region !== region) return false;
    return true;
  });
}

function ensureMap() {
  if (map || !window.L) return;
  map = L.map('historyMap').setView([55.5, 45], 4);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '&copy; OpenStreetMap' }).addTo(map);
  mapLayer = L.layerGroup().addTo(map);
}

function renderArchiveMap(items) {
  ensureMap();
  if (!map || !mapLayer) return;
  mapLayer.clearLayers();
  const points = [];
  items.forEach(e => {
    if (!Number.isFinite(e.lat) || !Number.isFinite(e.lon)) return;
    const marker = L.circleMarker([e.lat,e.lon], { radius: 6, weight: 1, fillOpacity: .8 });
    marker.bindPopup(`<b>${e.place || 'Без НП'}</b><br>${e.region || ''}<br>${formatDate(e.published_at)}<br>${e.source || ''}`);
    marker.addTo(mapLayer);
    points.push([e.lat,e.lon]);
  });
  setText('historyMapCount', `${points.length} точек`);
  if (points.length) map.fitBounds(points, { padding: [24,24], maxZoom: 8 });
}

function renderCalendar(items) {
  const el = document.getElementById('calendarList');
  if (!el) return;
  const byDay = {};
  items.forEach(e => {
    const d = new Date(e.published_at || 0);
    if (Number.isNaN(d.getTime())) return;
    const key = d.toISOString().slice(0,10);
    (byDay[key] ||= []).push(e);
  });
  const days = Object.entries(byDay).sort((a,b)=>b[0].localeCompare(a[0])).slice(0,90);
  if (!days.length) {
    el.innerHTML = '<p class="muted">Нет событий в выбранном периоде.</p>';
    return;
  }
  el.innerHTML = days.map(([date,events]) => {
    const regs = new Set(events.map(e=>e.region).filter(Boolean)).size;
    return `<button type="button" class="calendar-day"><b>${date}</b><span>${events.length} событий · ${regs} регионов</span></button>`;
  }).join('');
}

function renderSourceQuality(items) {
  const el = document.getElementById('sourceQuality');
  if (!el) return;
  const stats = {};
  items.forEach(e => {
    if (!e.source) return;
    const s = stats[e.source] ||= { total:0, confirmed:0, regions:new Set(), first:null, last:null };
    s.total += 1;
    if ((e.confirmations || 1) > 1) s.confirmed += 1;
    if (e.region) s.regions.add(e.region);
    const t = new Date(e.published_at || 0).getTime();
    if (Number.isFinite(t)) {
      s.first = s.first === null ? t : Math.min(s.first,t);
      s.last = s.last === null ? t : Math.max(s.last,t);
    }
  });
  const rows = Object.entries(stats).sort((a,b)=>b[1].total-a[1].total).slice(0,24);
  el.innerHTML = rows.map(([name,s]) => {
    const rate = s.total ? Math.round(s.confirmed/s.total*100) : 0;
    return `<div class="quality-card"><b>${name}</b><span>${s.total} сообщений</span><span>${s.regions.size} регионов</span><span>${rate}% с повторным подтверждением</span></div>`;
  }).join('') || '<p class="muted">Нет данных.</p>';
}

function renderArchive() {
  const items = filteredArchiveEvents();
  renderArchiveMap(items);
  renderCalendar(items);
  renderSourceQuality(items);
}

async function renderHistoryPage(data) {
  historyData = data || {};
  setText('total', historyData.total_events || archiveEvents.length);
  setText('regions', Object.keys(historyData.regions || {}).length || uniqueRegions(archiveEvents).length);
  setText('sources', Object.keys(historyData.sources || {}).length || new Set(archiveEvents.map(e=>e.source).filter(Boolean)).size);
  setText('updated', historyData.generated_at ? formatDate(historyData.generated_at) : new Date().toLocaleString('ru-RU'));
  renderHistoryList('regionsList', historyData.regions || {});
  renderHistoryList('sourcesList', historyData.sources || {});
  renderDailyChart(historyData.daily || historyData.timeline || {});
  renderArchiveFilters();
  renderArchive();
}

Promise.all([loadHistoricalAnalytics(), loadArchiveEvents()]).then(([analytics, events]) => {
  archiveEvents = events;
  renderHistoryPage(analytics);
});

document.getElementById('resetHistory')?.addEventListener('click', () => {
  const year = document.getElementById('historyYear');
  const month = document.getElementById('historyMonth');
  const region = document.getElementById('historyRegion');
  if (year) year.value = '';
  if (month) month.value = '';
  if (region) region.value = '';
  renderArchiveFilters();
  renderArchive();
});

window.HistoricalAnalytics = { loadHistoricalAnalytics };

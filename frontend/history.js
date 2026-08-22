// Historical analytics viewer helper
// Reads archived analytics when available and renders summary blocks.

async function loadHistoricalAnalytics() {
  try {
    const response = await fetch('../data/historical_analysis.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('history unavailable');
    return await response.json();
  } catch (error) {
    return null;
  }
}

function formatHistorySummary(data) {
  if (!data) return 'Историческая аналитика недоступна';

  const regions = Object.entries(data.regions || {})
    .slice(0, 5)
    .map(([name, count]) => `${name}: ${count}`)
    .join('\n');

  return `Всего событий: ${data.total_events || 0}\n\nТоп регионов:\n${regions}`;
}

window.HistoricalAnalytics = {
  loadHistoricalAnalytics,
  formatHistorySummary
};

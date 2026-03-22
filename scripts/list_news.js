#!/usr/bin/env node
/**
 * List Taiwan traffic news (highway + freeway)
 *
 * @security { env: ["TDX_CLIENT_ID", "TDX_CLIENT_SECRET"], endpoints: ["tdx.transportdata.tw"], files: { read: [], write: [] } }
 */
'use strict';
const { tdxGet, parseArgs, TDX_PATHS } = require('./api_client');

const args = parseArgs();

if (args.help) {
  console.log(JSON.stringify({
    usage: 'node list_news.js [--type=highway|freeway|all] [--search=keyword] [--limit=20]',
    description: 'List Taiwan traffic news from TDX',
    options: {
      type: 'highway (省道), freeway (國道), all (default)',
      search: 'Filter by keyword in news title/description',
      limit: 'Max results (default: 20)',
    },
  }, null, 2));
  process.exit(0);
}

const type = args.type || 'all';
const search = (args.search || '').toLowerCase();
const limit = parseInt(args.limit || '20', 10);

function parseNews(item, source) {
  return {
    newsId: item.NewsID || item.NewsId || '',
    title: item.Title || '',
    description: item.Description || item.NewsContent || '',
    publishTime: item.PublishTime || item.StartTime || null,
    endTime: item.EndTime || null,
    department: item.Department || null,
    roadName: item.RoadName || null,
    direction: item.Direction || null,
    region: item.Region || null,
    source,
  };
}

async function main() {
  const results = [];

  if (type === 'all' || type === 'highway') {
    try {
      const data = await tdxGet(TDX_PATHS.highwayNews + '?$format=JSON');
      const list = Array.isArray(data) ? data : (data.Newses || data.data || []);
      results.push(...list.map((item) => parseNews(item, 'highway')));
    } catch (e) {
      // Highway news may not always be available
      results.push({ _warning: `Highway news fetch failed: ${e.message}`, source: 'highway' });
    }
  }

  if (type === 'all' || type === 'freeway') {
    try {
      const data = await tdxGet(TDX_PATHS.freewayNews + '?$format=JSON');
      const list = Array.isArray(data) ? data : (data.Newses || data.data || []);
      results.push(...list.map((item) => parseNews(item, 'freeway')));
    } catch (e) {
      results.push({ _warning: `Freeway news fetch failed: ${e.message}`, source: 'freeway' });
    }
  }

  // Filter out warning entries for counting
  const news = results.filter((r) => !r._warning);
  const warnings = results.filter((r) => r._warning);

  const filtered = search
    ? news.filter((n) =>
        n.title.toLowerCase().includes(search) ||
        n.description.toLowerCase().includes(search) ||
        (n.roadName || '').toLowerCase().includes(search)
      )
    : news;

  // Sort by publish time (newest first)
  filtered.sort((a, b) => {
    const ta = a.publishTime ? new Date(a.publishTime).getTime() : 0;
    const tb = b.publishTime ? new Date(b.publishTime).getTime() : 0;
    return tb - ta;
  });

  const limited = filtered.slice(0, limit);

  const output = {
    total: news.length,
    matched: filtered.length,
    returned: limited.length,
    type,
    news: limited,
  };

  if (warnings.length > 0) {
    output.warnings = warnings;
  }

  console.log(JSON.stringify(output, null, 2));
}

main().catch((err) => {
  console.log(JSON.stringify({ error: true, message: err.message }));
  process.exit(1);
});

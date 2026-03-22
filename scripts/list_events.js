#!/usr/bin/env node
/**
 * List Taiwan road events (construction, accidents, disasters)
 *
 * @security { env: ["TDX_CLIENT_ID", "TDX_CLIENT_SECRET"], endpoints: ["tdx.transportdata.tw"], files: { read: [], write: [] } }
 */
'use strict';
const { tdxGet, parseArgs, TDX_PATHS } = require('./api_client');

const args = parseArgs();

if (args.help) {
  console.log(JSON.stringify({
    usage: 'node list_events.js [--type=highway|freeway|all] [--search=keyword] [--limit=20]',
    description: 'List active road events (construction, accidents, weather closures)',
    options: {
      type: 'highway (省道), freeway (國道), all (default)',
      search: 'Filter by keyword in event description',
      limit: 'Max results (default: 20)',
    },
  }, null, 2));
  process.exit(0);
}

const type = args.type || 'all';
const search = (args.search || '').toLowerCase();
const limit = parseInt(args.limit || '20', 10);

function parseEvent(item, source) {
  return {
    eventId: item.LiveEventID || item.EventID || '',
    type: item.Type || item.EventType || null,
    level: item.Level || null,
    description: item.Description || '',
    roadName: item.RoadName || null,
    direction: item.Direction || null,
    region: item.Region || null,
    startTime: item.StartTime || null,
    endTime: item.EndTime || null,
    updateTime: item.UpdateTime || null,
    longitude: item.PositionLon ?? null,
    latitude: item.PositionLat ?? null,
    source,
  };
}

async function main() {
  const results = [];

  if (type === 'all' || type === 'highway') {
    try {
      const data = await tdxGet(TDX_PATHS.highwayEvents + '?$format=JSON');
      const list = Array.isArray(data) ? data : (data.LiveEvents || data.data || []);
      results.push(...list.map((item) => parseEvent(item, 'highway')));
    } catch (e) {
      results.push({ _warning: `Highway events fetch failed: ${e.message}`, source: 'highway' });
    }
  }

  if (type === 'all' || type === 'freeway') {
    try {
      const data = await tdxGet(TDX_PATHS.freewayEvents + '?$format=JSON');
      const list = Array.isArray(data) ? data : (data.LiveEvents || data.data || []);
      results.push(...list.map((item) => parseEvent(item, 'freeway')));
    } catch (e) {
      results.push({ _warning: `Freeway events fetch failed: ${e.message}`, source: 'freeway' });
    }
  }

  const events = results.filter((r) => !r._warning);
  const warnings = results.filter((r) => r._warning);

  const filtered = search
    ? events.filter((e) =>
        e.description.toLowerCase().includes(search) ||
        (e.roadName || '').toLowerCase().includes(search) ||
        (e.type || '').toLowerCase().includes(search)
      )
    : events;

  // Sort by update/start time (newest first)
  filtered.sort((a, b) => {
    const ta = new Date(a.updateTime || a.startTime || 0).getTime();
    const tb = new Date(b.updateTime || b.startTime || 0).getTime();
    return tb - ta;
  });

  const limited = filtered.slice(0, limit);
  const output = {
    total: events.length,
    matched: filtered.length,
    returned: limited.length,
    type,
    events: limited,
  };
  if (warnings.length > 0) output.warnings = warnings;

  console.log(JSON.stringify(output, null, 2));
}

main().catch((err) => {
  console.log(JSON.stringify({ error: true, message: err.message }));
  process.exit(1);
});

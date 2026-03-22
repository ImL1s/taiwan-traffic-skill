#!/usr/bin/env node
/**
 * List Taiwan CCTV cameras (highway + freeway)
 *
 * @security { env: ["TDX_CLIENT_ID", "TDX_CLIENT_SECRET"], endpoints: ["tdx.transportdata.tw"], files: { read: [], write: [] } }
 */
'use strict';
const { tdxGet, parseArgs, parseCctv, TDX_PATHS } = require('./api_client');

const args = parseArgs();

if (args.help) {
  console.log(JSON.stringify({
    usage: 'node list_cctv.js [--type=highway|freeway|all] [--search=keyword] [--road=roadname] [--limit=20]',
    description: 'List Taiwan traffic CCTV cameras',
    options: {
      type: 'highway (省道), freeway (國道/高速公路), all (default)',
      search: 'Filter by keyword in camera name/location',
      road: 'Filter by road name (e.g. 台1線, 國道1號)',
      limit: 'Max results to return (default: 20)',
    },
  }, null, 2));
  process.exit(0);
}

const type = args.type || 'all';
const search = args.search || '';
const road = args.road || '';
const limit = parseInt(args.limit || '20', 10);

function matchesFilter(cctv) {
  const searchLower = search.toLowerCase();
  const roadLower = road.toLowerCase();

  if (search && !(
    cctv.name.toLowerCase().includes(searchLower) ||
    (cctv.roadName || '').toLowerCase().includes(searchLower) ||
    cctv.id.toLowerCase().includes(searchLower) ||
    (cctv.locationMile || '').toLowerCase().includes(searchLower)
  )) return false;

  if (road && !(cctv.roadName || '').toLowerCase().includes(roadLower)) return false;

  return true;
}

async function main() {
  const results = [];

  if (type === 'all' || type === 'highway') {
    const data = await tdxGet(TDX_PATHS.highwayCctv + '?$format=JSON');
    const list = Array.isArray(data) ? data : (data.CCTVs || data.data || []);
    results.push(...list.map((item) => parseCctv(item, 'highway')));
  }

  if (type === 'all' || type === 'freeway') {
    const data = await tdxGet(TDX_PATHS.freewayCctv + '?$format=JSON');
    const list = Array.isArray(data) ? data : (data.CCTVs || data.data || []);
    results.push(...list.map((item) => parseCctv(item, 'freeway')));
  }

  const filtered = results.filter(matchesFilter);
  const limited = filtered.slice(0, limit);

  console.log(JSON.stringify({
    total: results.length,
    matched: filtered.length,
    returned: limited.length,
    limit,
    type,
    filters: { search: search || null, road: road || null },
    cameras: limited,
  }, null, 2));
}

main().catch((err) => {
  console.log(JSON.stringify({ error: true, message: err.message }));
  process.exit(1);
});

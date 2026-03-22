#!/usr/bin/env node
/**
 * Get CCTV stream URL by ID
 *
 * @security { env: ["TDX_CLIENT_ID", "TDX_CLIENT_SECRET"], endpoints: ["tdx.transportdata.tw"], files: { read: [], write: [] } }
 */
'use strict';
const { tdxGet, parseArgs, parseCctv, TDX_PATHS } = require('./api_client');

const args = parseArgs();

if (args.help || !args.id) {
  console.log(JSON.stringify({
    usage: 'node get_stream.js --id=CCTV_ID',
    description: 'Get the video stream URL for a specific CCTV camera',
    options: {
      id: '(required) CCTV camera ID (e.g. nfb-08-043.6-M-90 or cctvid from list_cctv)',
    },
  }, null, 2));
  process.exit(args.help ? 0 : 1);
}

const targetId = args.id;

async function main() {
  // Search both highway and freeway
  for (const [source, path] of [['highway', TDX_PATHS.highwayCctv], ['freeway', TDX_PATHS.freewayCctv]]) {
    const data = await tdxGet(path + '?$format=JSON');
    const list = Array.isArray(data) ? data : (data.CCTVs || data.data || []);

    const match = list.find((c) =>
      (c.CCTVID || '').toLowerCase() === targetId.toLowerCase()
    );

    if (match) {
      console.log(JSON.stringify({
        found: true,
        camera: parseCctv(match, source),
      }, null, 2));
      return;
    }
  }

  console.log(JSON.stringify({
    found: false,
    message: `No CCTV found with ID: ${targetId}`,
    suggestion: 'Use list_cctv.js --search=keyword to find valid camera IDs',
  }, null, 2));
}

main().catch((err) => {
  console.log(JSON.stringify({ error: true, message: err.message }));
  process.exit(1);
});

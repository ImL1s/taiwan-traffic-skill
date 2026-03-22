#!/usr/bin/env node
/**
 * Find nearby CCTV cameras by coordinates
 *
 * @security { env: ["TDX_CLIENT_ID", "TDX_CLIENT_SECRET"], endpoints: ["tdx.transportdata.tw"], files: { read: [], write: [] } }
 */
'use strict';
const { tdxGet, parseArgs, parseCctv, haversineKm, TDX_PATHS } = require('./api_client');

const args = parseArgs();

if (args.help || !args.lat || !args.lon) {
  console.log(JSON.stringify({
    usage: 'node nearby_cctv.js --lat=25.033 --lon=121.565 [--radius=5] [--type=all] [--limit=10]',
    description: 'Find nearby CCTV cameras by GPS coordinates',
    options: {
      lat: '(required) Latitude in decimal degrees',
      lon: '(required) Longitude in decimal degrees',
      radius: 'Search radius in km (default: 5)',
      type: 'highway, freeway, or all (default)',
      limit: 'Max results (default: 10)',
    },
  }, null, 2));
  process.exit(args.help ? 0 : 1);
}

const lat = parseFloat(args.lat);
const lon = parseFloat(args.lon);
const radius = parseFloat(args.radius || '5');
const type = args.type || 'all';
const limit = parseInt(args.limit || '10', 10);

if (isNaN(lat) || isNaN(lon)) {
  console.log(JSON.stringify({ error: true, message: 'Invalid lat/lon values' }));
  process.exit(1);
}

async function main() {
  const rawCameras = [];

  if (type === 'all' || type === 'highway') {
    const data = await tdxGet(TDX_PATHS.highwayCctv + '?$format=JSON');
    const list = Array.isArray(data) ? data : (data.CCTVs || data.data || []);
    rawCameras.push(...list.map((c) => ({ raw: c, source: 'highway' })));
  }

  if (type === 'all' || type === 'freeway') {
    const data = await tdxGet(TDX_PATHS.freewayCctv + '?$format=JSON');
    const list = Array.isArray(data) ? data : (data.CCTVs || data.data || []);
    rawCameras.push(...list.map((c) => ({ raw: c, source: 'freeway' })));
  }

  // Parse, calculate distance, filter, sort
  const nearby = rawCameras
    .map(({ raw, source }) => {
      const camera = parseCctv(raw, source);
      const distance = haversineKm(lat, lon, camera.lat, camera.lon);
      return { ...camera, distanceKm: Math.round(distance * 100) / 100 };
    })
    .filter((c) => c.distanceKm <= radius)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, limit);

  console.log(JSON.stringify({
    searchPoint: { lat, lon },
    radiusKm: radius,
    found: nearby.length,
    cameras: nearby,
  }, null, 2));
}

main().catch((err) => {
  console.log(JSON.stringify({ error: true, message: err.message }));
  process.exit(1);
});

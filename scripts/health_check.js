#!/usr/bin/env node
/**
 * Health check — verify TDX + CWA connectivity
 *
 * @security { env: ["TDX_CLIENT_ID", "TDX_CLIENT_SECRET", "CWA_API_KEY"], endpoints: ["tdx.transportdata.tw", "opendata.cwa.gov.tw"], files: { read: [], write: [] } }
 */
'use strict';
const { getTdxToken, tdxGet, cwaGet, TDX_PATHS } = require('./api_client');

async function main() {
  const checks = {
    tdxCredentials: false,
    tdxToken: false,
    tdxApiAccess: false,
    cwaCredentials: false,
    cwaApiAccess: false,
  };
  const details = {};

  // 1. Check TDX credentials
  if (process.env.TDX_CLIENT_ID && process.env.TDX_CLIENT_SECRET) {
    checks.tdxCredentials = true;
  } else {
    details.tdxCredentials = 'Set TDX_CLIENT_ID and TDX_CLIENT_SECRET. Register: https://tdx.transportdata.tw/';
  }

  // 2. Try TDX token
  if (checks.tdxCredentials) {
    try {
      const token = await getTdxToken();
      checks.tdxToken = !!token;
    } catch (e) {
      details.tdxToken = `Token failed: ${e.message}`;
    }
  }

  // 3. Try TDX API call (small request)
  if (checks.tdxToken) {
    try {
      const data = await tdxGet(TDX_PATHS.highwayCctv + '?$top=1&$format=JSON');
      const list = Array.isArray(data) ? data : (data.CCTVs || data.data || []);
      checks.tdxApiAccess = list.length > 0;
      details.tdxSample = list.length > 0
        ? `OK — got ${list[0].CCTVID || 'camera'}`
        : 'API returned empty data';
    } catch (e) {
      details.tdxApiAccess = `API call failed: ${e.message}`;
    }
  }

  // 4. Check CWA credentials
  if (process.env.CWA_API_KEY) {
    checks.cwaCredentials = true;
  } else {
    details.cwaCredentials = 'Optional. Set CWA_API_KEY for weather data. Register: https://opendata.cwa.gov.tw/';
  }

  // 5. Try CWA API
  if (checks.cwaCredentials) {
    try {
      const data = await cwaGet('/v1/rest/datastore/O-A0001-001?format=JSON&limit=1');
      const stations = data?.records?.Station || data?.records?.location || [];
      checks.cwaApiAccess = stations.length > 0;
      details.cwaSample = stations.length > 0
        ? `OK — got station: ${stations[0].StationName || 'unknown'}`
        : 'API returned empty data';
    } catch (e) {
      details.cwaApiAccess = `CWA call failed: ${e.message}`;
    }
  }

  const allRequired = checks.tdxCredentials && checks.tdxToken && checks.tdxApiAccess;
  const allOptional = checks.cwaCredentials && checks.cwaApiAccess;

  console.log(JSON.stringify({
    healthy: allRequired,
    weatherAvailable: allOptional,
    checks,
    details,
    summary: allRequired
      ? (allOptional
        ? '✅ All systems operational (TDX + CWA)'
        : '✅ TDX operational. ⚠️ CWA weather not configured (optional).')
      : '❌ TDX connection failed. Check credentials.',
  }, null, 2));

  process.exit(allRequired ? 0 : 1);
}

main().catch((err) => {
  console.log(JSON.stringify({ error: true, message: err.message }));
  process.exit(1);
});

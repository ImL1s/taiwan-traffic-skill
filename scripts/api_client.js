#!/usr/bin/env node
/**
 * TDX + CWA API Client — Zero Dependencies
 *
 * Shared HTTP client for Taiwan Traffic OpenClaw Skill.
 * Uses only Node.js built-ins (https, querystring).
 *
 * @security { env: ["TDX_CLIENT_ID", "TDX_CLIENT_SECRET", "CWA_API_KEY"], endpoints: ["tdx.transportdata.tw", "opendata.cwa.gov.tw"], files: { read: [], write: [] } }
 */
'use strict';
const https = require('https');
const querystring = require('querystring');

// ── TDX Constants (public endpoints) ──

const TDX_AUTH_URL = 'https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token';
const TDX_API_BASE = 'https://tdx.transportdata.tw/api';

// ── CWA Constants (public endpoints) ──

const CWA_API_BASE = 'https://opendata.cwa.gov.tw/api';

// ── Token cache (in-memory, per process) ──

let _tokenCache = { token: null, expiresAt: 0 };

/**
 * Generic HTTPS GET request (zero deps)
 */
function httpsGet(url, headers = {}, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = https.request(parsed, { method: 'GET', headers }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        if (res.statusCode >= 400) {
          return reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 300)}`));
        }
        try { resolve(JSON.parse(data)); }
        catch { resolve(data); }
      });
    });
    req.on('error', (e) => reject(e));
    req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error('Request timeout')); });
    req.end();
  });
}

/**
 * HTTPS POST (form-encoded, for OAuth)
 */
function httpsPost(url, formData, headers = {}, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const body = querystring.stringify(formData);
    const parsed = new URL(url);
    const req = https.request(parsed, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
        ...headers,
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        if (res.statusCode >= 400) {
          return reject(new Error(`OAuth failed (HTTP ${res.statusCode}): ${data.slice(0, 300)}`));
        }
        try { resolve(JSON.parse(data)); }
        catch { resolve(data); }
      });
    });
    req.on('error', (e) => reject(e));
    req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error('OAuth timeout')); });
    req.write(body);
    req.end();
  });
}

/**
 * Get TDX OAuth access token (cached per process)
 */
async function getTdxToken() {
  const clientId = process.env.TDX_CLIENT_ID;
  const clientSecret = process.env.TDX_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('TDX_CLIENT_ID and TDX_CLIENT_SECRET must be set. Register at https://tdx.transportdata.tw/');
  }

  // Return cached token if still valid (with 60s buffer)
  if (_tokenCache.token && Date.now() < _tokenCache.expiresAt - 60000) {
    return _tokenCache.token;
  }

  const result = await httpsPost(TDX_AUTH_URL, {
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
  });

  _tokenCache = {
    token: result.access_token,
    expiresAt: Date.now() + (result.expires_in || 86400) * 1000,
  };

  return _tokenCache.token;
}

/**
 * TDX API GET request (auto-handles auth)
 */
async function tdxGet(path) {
  const token = await getTdxToken();
  return httpsGet(`${TDX_API_BASE}${path}`, {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
  });
}

/**
 * CWA API GET request
 */
async function cwaGet(path) {
  const apiKey = process.env.CWA_API_KEY;
  if (!apiKey) {
    throw new Error('CWA_API_KEY must be set. Register at https://opendata.cwa.gov.tw/');
  }
  const separator = path.includes('?') ? '&' : '?';
  return httpsGet(`${CWA_API_BASE}${path}${separator}Authorization=${apiKey}`, {
    Accept: 'application/json',
  });
}

/**
 * Parse CLI args from process.argv (--key=value format)
 */
function parseArgs() {
  return Object.fromEntries(
    process.argv.slice(2).map((a) => {
      const [k, ...rest] = a.replace(/^--/, '').split('=');
      return [k, rest.join('=') || true];
    })
  );
}

/**
 * Haversine distance (km) between two lat/lon points
 */
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Shared CCTV Parser ──

const DIRECTION_MAP = { N: '北向', S: '南向', E: '東向', W: '西向' };

/**
 * Parse TDX CCTV item into normalized object
 */
function parseCctv(item, source) {
  const roadSection = item.RoadSection || {};
  const start = roadSection.Start || '';
  const end = roadSection.End || '';
  let name = item.CCTVID || 'unknown';
  if (start && end) {
    name = `${start} - ${end}`;
    if (item.LocationMile) name += ` (${item.LocationMile})`;
  }
  return {
    id: item.CCTVID || '',
    name,
    lat: item.PositionLat || 0,
    lon: item.PositionLon || 0,
    streamUrl: item.VideoStreamURL || null,
    roadName: item.RoadName || null,
    direction: DIRECTION_MAP[item.RoadDirection] || item.RoadDirection || null,
    locationMile: item.LocationMile || null,
    source,
  };
}

// ── TDX API Paths ──

const TDX_PATHS = {
  highwayCctv: '/basic/v2/Road/Traffic/CCTV/Highway',
  freewayCctv: '/basic/v2/Road/Traffic/CCTV/Freeway',
  highwayNews: '/basic/v2/Road/Traffic/Live/News/Highway',
  freewayNews: '/basic/v2/Road/Traffic/Live/News/Freeway',
  highwayEvents: '/basic/v1/Traffic/RoadEvent/LiveEvent/Highway',
  freewayEvents: '/basic/v1/Traffic/RoadEvent/LiveEvent/Freeway',
};

module.exports = {
  httpsGet,
  httpsPost,
  getTdxToken,
  tdxGet,
  cwaGet,
  parseArgs,
  haversineKm,
  parseCctv,
  DIRECTION_MAP,
  TDX_PATHS,
  TDX_API_BASE,
  CWA_API_BASE,
};

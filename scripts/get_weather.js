#!/usr/bin/env node
/**
 * Get Taiwan weather observations from CWA (Central Weather Administration)
 *
 * @security { env: ["CWA_API_KEY"], endpoints: ["opendata.cwa.gov.tw"], files: { read: [], write: [] } }
 */
'use strict';
const { cwaGet, parseArgs, haversineKm } = require('./api_client');

const args = parseArgs();

if (args.help) {
  console.log(JSON.stringify({
    usage: 'node get_weather.js [--station=StationName] [--lat=25.0 --lon=121.5] [--limit=10]',
    description: 'Get Taiwan weather observations from CWA',
    options: {
      station: 'Filter by station name (e.g. 臺北, 高雄)',
      lat: 'Find stations near this latitude (requires --lon)',
      lon: 'Find stations near this longitude (requires --lat)',
      limit: 'Max results (default: 10)',
    },
    note: 'Requires CWA_API_KEY. Register at https://opendata.cwa.gov.tw/',
  }, null, 2));
  process.exit(0);
}

const stationFilter = (args.station || '').toLowerCase();
const lat = args.lat ? parseFloat(args.lat) : null;
const lon = args.lon ? parseFloat(args.lon) : null;
const limit = parseInt(args.limit || '10', 10);

function parseStation(station) {
  const weather = station.WeatherElement || {};
  const geo = station.GeoInfo || {};
  return {
    stationId: station.StationId || '',
    stationName: station.StationName || station.ObsGroup?.Station?.StationName || '',
    lat: geo.Coordinates?.[0]?.StationLatitude ?? station.StationLatitude ?? 0,
    lon: geo.Coordinates?.[0]?.StationLongitude ?? station.StationLongitude ?? 0,
    county: geo.CountyName || null,
    township: geo.TownName || null,
    weather: {
      temperature: weather.AirTemperature ?? null,
      humidity: weather.RelativeHumidity ?? null,
      windSpeed: weather.WindSpeed ?? null,
      windDirection: weather.WindDirection ?? null,
      rainfall: weather.Now?.Precipitation ?? null,
      pressure: weather.AirPressure ?? null,
      weatherDescription: weather.Weather || null,
    },
    observationTime: station.ObsTime?.DateTime || null,
  };
}

async function main() {
  // CWA 自動觀測站資料 (O-A0001-001) — 即時天氣觀測
  const data = await cwaGet('/v1/rest/datastore/O-A0001-001?format=JSON');

  const records = data?.records?.Station || data?.records?.location || [];
  if (!Array.isArray(records) || records.length === 0) {
    console.log(JSON.stringify({
      error: true,
      message: 'No weather data returned. Check CWA_API_KEY validity.',
    }));
    process.exit(1);
  }

  let stations = records.map(parseStation);

  // Filter by station name
  if (stationFilter) {
    stations = stations.filter((s) =>
      s.stationName.toLowerCase().includes(stationFilter) ||
      (s.county || '').toLowerCase().includes(stationFilter)
    );
  }

  // Sort by distance if lat/lon provided
  if (lat !== null && lon !== null) {
    stations = stations.map((s) => ({
      ...s,
      distanceKm: Math.round(haversineKm(lat, lon, s.lat, s.lon) * 100) / 100,
    }));
    stations.sort((a, b) => a.distanceKm - b.distanceKm);
  }

  const limited = stations.slice(0, limit);

  console.log(JSON.stringify({
    total: records.length,
    matched: stations.length,
    returned: limited.length,
    stations: limited,
  }, null, 2));
}

main().catch((err) => {
  console.log(JSON.stringify({ error: true, message: err.message }));
  process.exit(1);
});

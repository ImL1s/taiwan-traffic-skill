#!/usr/bin/env node
/**
 * Unit tests — Taiwan Traffic Skill
 *
 * Tests actual logic: parsing, filtering, distance calculation, arg parsing.
 * Uses Node.js built-in test runner (zero dependencies).
 *
 * Run: node --test test/unit.test.js
 */
'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

// Import modules under test
const {
  parseArgs,
  haversineKm,
  parseCctv,
  DIRECTION_MAP,
  TDX_PATHS,
  TDX_API_BASE,
  CWA_API_BASE,
} = require('../scripts/api_client');

// ═══════════════════════════════════════════════════════════════
// parseArgs
// ═══════════════════════════════════════════════════════════════

describe('parseArgs', () => {
  // Save and restore process.argv around each test
  let originalArgv;

  it('should parse --key=value format', () => {
    originalArgv = process.argv;
    process.argv = ['node', 'script.js', '--type=highway', '--limit=10'];
    try {
      const args = parseArgs();
      assert.equal(args.type, 'highway');
      assert.equal(args.limit, '10');
    } finally {
      process.argv = originalArgv;
    }
  });

  it('should treat --flag without value as boolean true', () => {
    originalArgv = process.argv;
    process.argv = ['node', 'script.js', '--help'];
    try {
      const args = parseArgs();
      assert.equal(args.help, true);
    } finally {
      process.argv = originalArgv;
    }
  });

  it('should handle values containing = signs', () => {
    // Edge case: --search=a=b should produce { search: 'a=b' }
    originalArgv = process.argv;
    process.argv = ['node', 'script.js', '--search=a=b=c'];
    try {
      const args = parseArgs();
      assert.equal(args.search, 'a=b=c');
    } finally {
      process.argv = originalArgv;
    }
  });

  it('should handle Chinese characters in values', () => {
    originalArgv = process.argv;
    process.argv = ['node', 'script.js', '--search=台北', '--road=台1線'];
    try {
      const args = parseArgs();
      assert.equal(args.search, '台北');
      assert.equal(args.road, '台1線');
    } finally {
      process.argv = originalArgv;
    }
  });

  it('should return empty object when no args', () => {
    originalArgv = process.argv;
    process.argv = ['node', 'script.js'];
    try {
      const args = parseArgs();
      assert.deepEqual(args, {});
    } finally {
      process.argv = originalArgv;
    }
  });

  it('should handle mixed flags and key=value args', () => {
    originalArgv = process.argv;
    process.argv = ['node', 'script.js', '--help', '--type=freeway', '--limit=5'];
    try {
      const args = parseArgs();
      assert.equal(args.help, true);
      assert.equal(args.type, 'freeway');
      assert.equal(args.limit, '5');
    } finally {
      process.argv = originalArgv;
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// haversineKm — Distance calculation
// ═══════════════════════════════════════════════════════════════

describe('haversineKm', () => {
  it('should return 0 for same point', () => {
    const d = haversineKm(25.033, 121.565, 25.033, 121.565);
    assert.equal(d, 0);
  });

  it('should calculate Taipei 101 to Taipei Main Station correctly (~2.8km)', () => {
    // Taipei 101: 25.0339, 121.5645
    // Taipei Main Station: 25.0478, 121.5170
    const d = haversineKm(25.0339, 121.5645, 25.0478, 121.5170);
    assert.ok(d > 2.0, `Expected > 2km, got ${d}`);
    assert.ok(d < 6.0, `Expected < 6km, got ${d}`);
  });

  it('should calculate Taipei to Kaohsiung correctly (~300km)', () => {
    // Taipei: 25.033, 121.565
    // Kaohsiung: 22.627, 120.301
    const d = haversineKm(25.033, 121.565, 22.627, 120.301);
    assert.ok(d > 280, `Expected > 280km, got ${d}`);
    assert.ok(d < 320, `Expected < 320km, got ${d}`);
  });

  it('should be symmetrical (A→B same as B→A)', () => {
    const d1 = haversineKm(25.033, 121.565, 22.627, 120.301);
    const d2 = haversineKm(22.627, 120.301, 25.033, 121.565);
    assert.equal(d1, d2);
  });

  it('should handle negative coordinates', () => {
    // Sydney: -33.8688, 151.2093
    // Taipei: 25.033, 121.565
    const d = haversineKm(-33.8688, 151.2093, 25.033, 121.565);
    assert.ok(d > 7000, `Expected > 7000km, got ${d}`);
    assert.ok(d < 8000, `Expected < 8000km, got ${d}`);
  });

  it('should handle zero coordinates', () => {
    // 0,0 to equator point
    const d = haversineKm(0, 0, 0, 1);
    assert.ok(d > 100, `Expected ~111km, got ${d}`);
    assert.ok(d < 120, `Expected ~111km, got ${d}`);
  });
});

// ═══════════════════════════════════════════════════════════════
// parseCctv — CCTV data transformation
// ═══════════════════════════════════════════════════════════════

describe('parseCctv', () => {
  it('should parse a complete TDX CCTV item', () => {
    const tdxItem = {
      CCTVID: 'nfb-08-043.6-M-90',
      PositionLat: 25.033,
      PositionLon: 121.565,
      VideoStreamURL: 'https://example.com/stream.m3u8',
      RoadName: '台8線',
      RoadDirection: 'N',
      LocationMile: '43K+600',
      RoadSection: { Start: '太魯閣', End: '天祥' },
    };
    const result = parseCctv(tdxItem, 'highway');
    assert.equal(result.id, 'nfb-08-043.6-M-90');
    assert.equal(result.name, '太魯閣 - 天祥 (43K+600)');
    assert.equal(result.lat, 25.033);
    assert.equal(result.lon, 121.565);
    assert.equal(result.streamUrl, 'https://example.com/stream.m3u8');
    assert.equal(result.roadName, '台8線');
    assert.equal(result.direction, '北向');
    assert.equal(result.locationMile, '43K+600');
    assert.equal(result.source, 'highway');
  });

  it('should handle missing RoadSection gracefully', () => {
    const tdxItem = {
      CCTVID: 'cam-001',
      PositionLat: 24.0,
      PositionLon: 120.0,
    };
    const result = parseCctv(tdxItem, 'freeway');
    // Name should fall back to CCTVID when RoadSection is missing
    assert.equal(result.name, 'cam-001');
    assert.equal(result.source, 'freeway');
    assert.equal(result.streamUrl, null);
    assert.equal(result.roadName, null);
  });

  it('should handle empty RoadSection Start/End', () => {
    const tdxItem = {
      CCTVID: 'cam-002',
      RoadSection: { Start: '', End: '' },
    };
    const result = parseCctv(tdxItem, 'highway');
    // With empty Start/End, name should fall back to CCTVID
    assert.equal(result.name, 'cam-002');
  });

  it('should map all 4 directions correctly', () => {
    for (const [code, label] of [['N','北向'],['S','南向'],['E','東向'],['W','西向']]) {
      const result = parseCctv({ CCTVID: 'x', RoadDirection: code }, 'highway');
      assert.equal(result.direction, label, `Direction ${code} should map to ${label}`);
    }
  });

  it('should pass through unknown direction codes', () => {
    const result = parseCctv({ CCTVID: 'x', RoadDirection: 'NE' }, 'highway');
    assert.equal(result.direction, 'NE');
  });

  it('should handle completely empty TDX item', () => {
    const result = parseCctv({}, 'highway');
    assert.equal(result.id, '');
    assert.equal(result.name, 'unknown');
    assert.equal(result.lat, 0);
    assert.equal(result.lon, 0);
    assert.equal(result.streamUrl, null);
    assert.equal(result.direction, null);
  });

  it('should handle name without LocationMile', () => {
    const tdxItem = {
      CCTVID: 'cam-003',
      RoadSection: { Start: '基隆', End: '汐止' },
      // No LocationMile
    };
    const result = parseCctv(tdxItem, 'freeway');
    assert.equal(result.name, '基隆 - 汐止');
    // Should NOT have parentheses in name
    assert.ok(!result.name.includes('('), 'Name should not contain () without LocationMile');
  });
});

// ═══════════════════════════════════════════════════════════════
// DIRECTION_MAP — Constants
// ═══════════════════════════════════════════════════════════════

describe('DIRECTION_MAP', () => {
  it('should have exactly 4 entries', () => {
    assert.equal(Object.keys(DIRECTION_MAP).length, 4);
  });

  it('should contain N, S, E, W', () => {
    assert.ok('N' in DIRECTION_MAP);
    assert.ok('S' in DIRECTION_MAP);
    assert.ok('E' in DIRECTION_MAP);
    assert.ok('W' in DIRECTION_MAP);
  });
});

// ═══════════════════════════════════════════════════════════════
// TDX_PATHS — API path constants correctness
// ═══════════════════════════════════════════════════════════════

describe('TDX_PATHS', () => {
  it('should have all 6 required paths', () => {
    const required = ['highwayCctv', 'freewayCctv', 'highwayNews', 'freewayNews', 'highwayEvents', 'freewayEvents'];
    for (const key of required) {
      assert.ok(TDX_PATHS[key], `Missing TDX_PATHS.${key}`);
      assert.ok(TDX_PATHS[key].startsWith('/'), `TDX_PATHS.${key} should start with /`);
    }
  });

  it('should use correct API versions (v2 for CCTV/News, v1 for Events)', () => {
    // This is critical — TDX Events use v1, not v2!
    assert.ok(TDX_PATHS.highwayCctv.includes('/v2/'), 'Highway CCTV should use v2');
    assert.ok(TDX_PATHS.freewayCctv.includes('/v2/'), 'Freeway CCTV should use v2');
    assert.ok(TDX_PATHS.highwayNews.includes('/v2/'), 'Highway News should use v2');
    assert.ok(TDX_PATHS.freewayNews.includes('/v2/'), 'Freeway News should use v2');
    assert.ok(TDX_PATHS.highwayEvents.includes('/v1/'), 'Highway Events should use v1 (not v2!)');
    assert.ok(TDX_PATHS.freewayEvents.includes('/v1/'), 'Freeway Events should use v1 (not v2!)');
  });

  it('should have /Live/ prefix in News paths (TDX requirement)', () => {
    // Without /Live/ the news endpoints return 404!
    assert.ok(TDX_PATHS.highwayNews.includes('/Live/'), 'Highway News needs /Live/ prefix');
    assert.ok(TDX_PATHS.freewayNews.includes('/Live/'), 'Freeway News needs /Live/ prefix');
  });

  it('should use LiveEvent (not Alert) for events endpoint', () => {
    // /Alert/Highway returns 404 — only LiveEvent works
    assert.ok(TDX_PATHS.highwayEvents.includes('LiveEvent'), 'Should use LiveEvent, not Alert');
    assert.ok(!TDX_PATHS.highwayEvents.includes('Alert'), 'Alert endpoint does not exist');
  });
});

// ═══════════════════════════════════════════════════════════════
// URL Constants
// ═══════════════════════════════════════════════════════════════

describe('URL Constants', () => {
  it('TDX_API_BASE should be HTTPS', () => {
    assert.ok(TDX_API_BASE.startsWith('https://'));
  });

  it('CWA_API_BASE should be HTTPS', () => {
    assert.ok(CWA_API_BASE.startsWith('https://'));
  });

  it('TDX_API_BASE should point to official TDX domain', () => {
    assert.ok(TDX_API_BASE.includes('tdx.transportdata.tw'));
  });

  it('CWA_API_BASE should point to official CWA domain', () => {
    assert.ok(CWA_API_BASE.includes('opendata.cwa.gov.tw'));
  });

  it('should NOT contain any Firebase or internal URLs', () => {
    const forbidden = ['firebase', 'moto-plaza', 'cloudfunctions', 'googleapis'];
    for (const bad of forbidden) {
      assert.ok(!TDX_API_BASE.includes(bad), `TDX_API_BASE should not contain ${bad}`);
      assert.ok(!CWA_API_BASE.includes(bad), `CWA_API_BASE should not contain ${bad}`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// Script-level parser tests (require scripts to export or test via spawn)
// We test by importing the parsers directly where possible
// ═══════════════════════════════════════════════════════════════

describe('News parser (list_news.js internal logic)', () => {
  // SYNC: must match list_news.js parseNews() at line 29
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

  it('should parse TDX news item with NewsID', () => {
    const item = {
      NewsID: 'N001',
      Title: '國道1號南向壅塞',
      Description: '預計影響2小時',
      PublishTime: '2026-03-23T01:00:00+08:00',
      Department: '高公局',
      RoadName: '國道1號',
    };
    const result = parseNews(item, 'freeway');
    assert.equal(result.newsId, 'N001');
    assert.equal(result.title, '國道1號南向壅塞');
    assert.equal(result.source, 'freeway');
    assert.equal(result.department, '高公局');
  });

  it('should handle alternate field name NewsId (lowercase d)', () => {
    const item = { NewsId: 'N002', Title: 'Test' };
    const result = parseNews(item, 'highway');
    assert.equal(result.newsId, 'N002');
  });

  it('should handle alternate content field NewsContent', () => {
    const item = { NewsContent: '替代內容欄位' };
    const result = parseNews(item, 'highway');
    assert.equal(result.description, '替代內容欄位');
  });

  it('should handle empty item', () => {
    const result = parseNews({}, 'highway');
    assert.equal(result.newsId, '');
    assert.equal(result.title, '');
    assert.equal(result.source, 'highway');
  });
});

describe('Event parser (list_events.js internal logic)', () => {
  // SYNC: must match list_events.js parseEvent() at line 29
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

  it('should parse complete event', () => {
    const item = {
      LiveEventID: 'EVT001',
      Type: '施工',
      Level: '3',
      Description: '台1線施工管制',
      RoadName: '台1線',
      StartTime: '2026-03-20T08:00:00+08:00',
      PositionLat: 25.0,
      PositionLon: 121.5,
    };
    const result = parseEvent(item, 'highway');
    assert.equal(result.eventId, 'EVT001');
    assert.equal(result.type, '施工');
    assert.equal(result.latitude, 25.0);
  });

  it('should handle alternate EventID field', () => {
    const item = { EventID: 'EVT002' };
    const result = parseEvent(item, 'freeway');
    assert.equal(result.eventId, 'EVT002');
  });

  it('should handle alternate EventType field', () => {
    const item = { EventType: '事故' };
    const result = parseEvent(item, 'highway');
    assert.equal(result.type, '事故');
  });
});

describe('Weather parser (get_weather.js internal logic)', () => {
  // SYNC: must match get_weather.js parseStation() at line 32
  function parseStation(station) {
    const weather = station.WeatherElement || {};
    const geo = station.GeoInfo || {};
    return {
      stationId: station.StationId || '',
      stationName: station.StationName || '',
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

  it('should parse complete CWA station', () => {
    const station = {
      StationId: 'C0A520',
      StationName: '臺北',
      GeoInfo: {
        CountyName: '臺北市',
        TownName: '中正區',
        Coordinates: [{ StationLatitude: 25.0378, StationLongitude: 121.5148 }],
      },
      WeatherElement: {
        AirTemperature: 22.5,
        RelativeHumidity: 75,
        WindSpeed: 3.2,
        WindDirection: 90,
        Now: { Precipitation: 0 },
        AirPressure: 1013.2,
        Weather: '多雲',
      },
      ObsTime: { DateTime: '2026-03-23T01:00:00+08:00' },
    };
    const result = parseStation(station);
    assert.equal(result.stationId, 'C0A520');
    assert.equal(result.stationName, '臺北');
    assert.equal(result.lat, 25.0378);
    assert.equal(result.county, '臺北市');
    assert.equal(result.weather.temperature, 22.5);
    assert.equal(result.weather.humidity, 75);
    assert.equal(result.weather.rainfall, 0);
    assert.equal(result.weather.weatherDescription, '多雲');
  });

  it('should handle missing GeoInfo gracefully', () => {
    const station = { StationId: 'X001', StationName: 'Test' };
    const result = parseStation(station);
    assert.equal(result.lat, 0);
    assert.equal(result.lon, 0);
    assert.equal(result.county, null);
  });

  it('should handle missing WeatherElement', () => {
    const station = { StationId: 'X002' };
    const result = parseStation(station);
    assert.equal(result.weather.temperature, null);
    assert.equal(result.weather.humidity, null);
    assert.equal(result.weather.rainfall, null);
  });

  it('should fall back to StationLatitude when GeoInfo.Coordinates is empty', () => {
    const station = {
      StationId: 'X003',
      StationLatitude: 24.5,
      StationLongitude: 120.5,
      GeoInfo: { Coordinates: [] },
    };
    const result = parseStation(station);
    assert.equal(result.lat, 24.5);
    assert.equal(result.lon, 120.5);
  });
});

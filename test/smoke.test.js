#!/usr/bin/env node
/**
 * E2E Smoke tests — Taiwan Traffic Skill
 *
 * Actually spawns each script and validates:
 * - --help outputs valid JSON with expected fields
 * - Missing required args produce structured error
 * - Scripts don't crash on startup
 * - Output JSON schema matches expectations
 *
 * Does NOT require API keys — tests only offline behavior.
 * For live API tests, set TDX_CLIENT_ID, TDX_CLIENT_SECRET, CWA_API_KEY.
 *
 * Run: node --test test/smoke.test.js
 */
'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('child_process');
const path = require('path');

const SCRIPTS_DIR = path.join(__dirname, '..', 'scripts');

/**
 * Run a script with given args, return { stdout, stderr, exitCode }
 * Always captures output, never throws.
 */
function runScript(scriptName, args = [], env = {}) {
  const scriptPath = path.join(SCRIPTS_DIR, scriptName);
  const spawnEnv = { ...process.env, ...env };
  // Clear TDX/CWA credentials to test offline behavior by default
  if (!env.TDX_CLIENT_ID) {
    delete spawnEnv.TDX_CLIENT_ID;
    delete spawnEnv.TDX_CLIENT_SECRET;
  }
  if (!env.CWA_API_KEY) {
    delete spawnEnv.CWA_API_KEY;
  }

  try {
    const stdout = execFileSync('node', [scriptPath, ...args], {
      env: spawnEnv,
      encoding: 'utf8',
      timeout: 10000,
    });
    return { stdout, exitCode: 0 };
  } catch (err) {
    return {
      stdout: err.stdout || '',
      stderr: err.stderr || '',
      exitCode: err.status || 1,
    };
  }
}

/**
 * Parse stdout as JSON, fail with clear message if not valid JSON
 */
function parseJSON(stdout, context) {
  try {
    return JSON.parse(stdout);
  } catch {
    assert.fail(`${context}: Output is not valid JSON.\nGot: ${stdout.slice(0, 500)}`);
  }
}

// ═══════════════════════════════════════════════════════════════
// --help flag: every script should output valid JSON with usage
// ═══════════════════════════════════════════════════════════════

describe('--help flag (all scripts)', () => {
  const scripts = [
    'list_cctv.js',
    'nearby_cctv.js',
    'get_stream.js',
    'list_news.js',
    'list_events.js',
    'get_weather.js',
  ];

  for (const script of scripts) {
    it(`${script} --help should output valid JSON with usage field`, () => {
      const { stdout, exitCode } = runScript(script, ['--help']);
      assert.equal(exitCode, 0, `${script} --help should exit 0`);
      const json = parseJSON(stdout, `${script} --help`);
      assert.ok(json.usage, `${script} --help should have 'usage' field`);
      assert.ok(json.description, `${script} --help should have 'description' field`);
      assert.ok(json.options, `${script} --help should have 'options' field`);
    });
  }
});

// ═══════════════════════════════════════════════════════════════
// Missing credentials: should produce clean JSON error, not crash
// ═══════════════════════════════════════════════════════════════

describe('Missing TDX credentials (clean error handling)', () => {
  // Scripts that hard-fail on missing creds (exit 1 + JSON error)
  const hardFailScripts = [
    { name: 'list_cctv.js', args: [] },
    { name: 'nearby_cctv.js', args: ['--lat=25.0', '--lon=121.5'] },
    { name: 'get_stream.js', args: ['--id=test'] },
  ];

  for (const { name, args } of hardFailScripts) {
    it(`${name} without TDX creds should return JSON error (not crash)`, () => {
      const { stdout, exitCode } = runScript(name, args);
      assert.equal(exitCode, 1, `${name} should exit 1 without credentials`);
      const json = parseJSON(stdout, `${name} missing creds`);
      assert.equal(json.error, true, `${name} should have error: true`);
      assert.ok(json.message, `${name} should have error message`);
      assert.ok(
        json.message.includes('TDX_CLIENT_ID') || json.message.includes('must be set'),
        `${name} error message should mention TDX credentials`
      );
    });
  }

  // Scripts that use graceful degradation (try/catch per source)
  // These exit 0 but include warnings in the response
  const gracefulScripts = [
    { name: 'list_news.js', args: [], dataKey: 'news' },
    { name: 'list_events.js', args: [], dataKey: 'events' },
  ];

  for (const { name, args, dataKey } of gracefulScripts) {
    it(`${name} without TDX creds should exit 0 with warnings (graceful degradation)`, () => {
      const { stdout, exitCode } = runScript(name, args);
      assert.equal(exitCode, 0, `${name} uses graceful degradation, should exit 0`);
      const json = parseJSON(stdout, `${name} graceful`);
      assert.ok(json.warnings, `${name} should include warnings array`);
      assert.ok(json.warnings.length > 0, `${name} should have at least one warning`);
      assert.ok(json[dataKey], `${name} should still have ${dataKey} array (empty)`);
      assert.equal(json[dataKey].length, 0, `${name} ${dataKey} should be empty without creds`);
      // Warnings should mention TDX credentials
      const warningText = json.warnings.map(w => w._warning).join(' ');
      assert.ok(warningText.includes('TDX_CLIENT_ID'), `${name} warning should mention TDX_CLIENT_ID`);
    });
  }
});

describe('Missing CWA credentials', () => {
  it('get_weather.js without CWA_API_KEY should return JSON error', () => {
    const { stdout, exitCode } = runScript('get_weather.js', []);
    assert.equal(exitCode, 1);
    const json = parseJSON(stdout, 'get_weather.js missing creds');
    assert.equal(json.error, true);
    assert.ok(json.message.includes('CWA_API_KEY'));
  });
});

// ═══════════════════════════════════════════════════════════════
// Missing required args: should show help or structured error
// ═══════════════════════════════════════════════════════════════

describe('Missing required args', () => {
  it('nearby_cctv.js without --lat/--lon should show help and exit 1', () => {
    const { stdout, exitCode } = runScript('nearby_cctv.js', []);
    assert.equal(exitCode, 1, 'Should exit 1 when required args missing');
    const json = parseJSON(stdout, 'nearby_cctv.js no args');
    assert.ok(json.usage, 'Should show usage when required args missing');
  });

  it('nearby_cctv.js with only --lat should show help (both lat AND lon required)', () => {
    // This was a real bug we found — the original code used && instead of ||
    const { stdout, exitCode } = runScript('nearby_cctv.js', ['--lat=25.0']);
    assert.equal(exitCode, 1, 'Should exit 1 when --lon is missing');
    const json = parseJSON(stdout, 'nearby_cctv.js only lat');
    assert.ok(json.usage, 'Should show usage when --lon is missing');
  });

  it('nearby_cctv.js with only --lon should show help', () => {
    const { stdout, exitCode } = runScript('nearby_cctv.js', ['--lon=121.5']);
    assert.equal(exitCode, 1, 'Should exit 1 when --lat is missing');
    const json = parseJSON(stdout, 'nearby_cctv.js only lon');
    assert.ok(json.usage, 'Should show usage when --lat is missing');
  });

  it('get_stream.js without --id should show help and exit 1', () => {
    const { stdout, exitCode } = runScript('get_stream.js', []);
    assert.equal(exitCode, 1);
    const json = parseJSON(stdout, 'get_stream.js no id');
    assert.ok(json.usage);
  });
});

// ═══════════════════════════════════════════════════════════════
// Invalid args: should not crash
// ═══════════════════════════════════════════════════════════════

describe('Invalid argument handling', () => {
  it('nearby_cctv.js with non-numeric lat/lon should return JSON error', () => {
    const { stdout, exitCode } = runScript('nearby_cctv.js', ['--lat=abc', '--lon=def']);
    assert.equal(exitCode, 1);
    const json = parseJSON(stdout, 'nearby_cctv.js invalid coords');
    assert.equal(json.error, true);
    assert.ok(json.message.includes('Invalid') || json.message.includes('invalid') || json.message.includes('NaN'),
      `Error message should mention invalid values, got: ${json.message}`);
  });
});

// ═══════════════════════════════════════════════════════════════
// health_check.js — specific behavior
// ═══════════════════════════════════════════════════════════════

describe('health_check.js', () => {
  it('should return structured JSON even without any credentials', () => {
    const { stdout, exitCode } = runScript('health_check.js', []);
    assert.equal(exitCode, 1, 'Should exit 1 when TDX creds missing');
    const json = parseJSON(stdout, 'health_check.js no creds');

    // Verify output schema
    assert.ok('healthy' in json, 'Should have healthy field');
    assert.ok('checks' in json, 'Should have checks field');
    assert.ok('details' in json, 'Should have details field');
    assert.ok('summary' in json, 'Should have summary field');

    // Verify specific values
    assert.equal(json.healthy, false, 'Should not be healthy without creds');
    assert.equal(json.checks.tdxCredentials, false);
    assert.equal(json.checks.tdxToken, false);
    assert.equal(json.checks.tdxApiAccess, false);
  });

  it('should report CWA as optional', () => {
    const { stdout } = runScript('health_check.js', []);
    const json = parseJSON(stdout, 'health_check.js cwa check');
    assert.ok(
      json.details.cwaCredentials?.includes('Optional'),
      'CWA should be described as optional'
    );
  });
});

// ═══════════════════════════════════════════════════════════════
// Output never uses console.error (OpenClaw spec requirement)
// ═══════════════════════════════════════════════════════════════

describe('OpenClaw spec compliance', () => {
  it('health_check.js errors go to stdout (not stderr)', () => {
    const { stdout, stderr } = runScript('health_check.js', []);
    assert.ok(stdout.length > 0, 'Should have stdout output');
    // stderr should be empty (no console.error)
    assert.equal((stderr || '').trim(), '', 'stderr should be empty — OpenClaw requires console.log only');
  });

  const allScripts = [
    { name: 'list_cctv.js', args: [] },
    { name: 'nearby_cctv.js', args: ['--lat=25.0', '--lon=121.5'] },
    { name: 'get_stream.js', args: ['--id=nonexistent'] },
    { name: 'list_news.js', args: [] },
    { name: 'list_events.js', args: [] },
    { name: 'get_weather.js', args: [] },
  ];

  for (const { name, args } of allScripts) {
    it(`${name} should not write to stderr`, () => {
      const { stderr } = runScript(name, args);
      assert.equal((stderr || '').trim(), '', `${name} should not use console.error`);
    });
  }
});

// ═══════════════════════════════════════════════════════════════
// Security: no hardcoded sensitive data in script files
// ═══════════════════════════════════════════════════════════════

describe('Security — no hardcoded sensitive data', () => {
  const fs = require('fs');
  const scriptsToCheck = fs.readdirSync(SCRIPTS_DIR).filter(f => f.endsWith('.js'));

  const sensitivePatterns = [
    { name: 'Firebase URL', regex: /firebase|cloudfunctions/i },
    { name: 'Internal project', regex: /moto-plaza|taiwan-traffic-app/i },
    { name: 'API key value', regex: /AIzaSy[A-Za-z0-9_-]{33}/i },
    { name: 'Email address', regex: /[a-z0-9]+@[a-z0-9]+\.[a-z]{2,}/i },
    { name: 'GCP project', regex: /googleapis\.com|asia-east1/i },
    { name: 'Package name', regex: /com\.cbstudio/i },
  ];

  for (const script of scriptsToCheck) {
    const content = fs.readFileSync(path.join(SCRIPTS_DIR, script), 'utf8');
    for (const { name, regex } of sensitivePatterns) {
      it(`${script} should not contain ${name}`, () => {
        assert.ok(!regex.test(content), `${script} contains ${name}! This is a security issue.`);
      });
    }
  }
});

// ═══════════════════════════════════════════════════════════════
// Live API E2E (only runs when credentials are available)
// ═══════════════════════════════════════════════════════════════

const hasTdxCreds = !!(process.env.TDX_CLIENT_ID && process.env.TDX_CLIENT_SECRET);
const hasCwaCreds = !!process.env.CWA_API_KEY;

describe('Live TDX API E2E', { skip: !hasTdxCreds ? 'TDX credentials not set' : false }, () => {
  it('health_check.js should report healthy with valid TDX creds', () => {
    const { stdout, exitCode } = runScript('health_check.js', [], {
      TDX_CLIENT_ID: process.env.TDX_CLIENT_ID,
      TDX_CLIENT_SECRET: process.env.TDX_CLIENT_SECRET,
    });
    assert.equal(exitCode, 0, 'Should exit 0 with valid creds');
    const json = parseJSON(stdout, 'health_check live');
    assert.equal(json.healthy, true);
    assert.equal(json.checks.tdxToken, true);
    assert.equal(json.checks.tdxApiAccess, true);
  });

  it('list_cctv.js should return cameras with correct schema', () => {
    const { stdout, exitCode } = runScript('list_cctv.js', ['--type=freeway', '--limit=3'], {
      TDX_CLIENT_ID: process.env.TDX_CLIENT_ID,
      TDX_CLIENT_SECRET: process.env.TDX_CLIENT_SECRET,
    });
    assert.equal(exitCode, 0);
    const json = parseJSON(stdout, 'list_cctv live');
    assert.ok(json.total > 0, 'Should have cameras');
    assert.ok(json.cameras.length <= 3, 'Should respect limit');
    // Verify camera schema
    const cam = json.cameras[0];
    assert.ok('id' in cam, 'Camera should have id');
    assert.ok('name' in cam, 'Camera should have name');
    assert.ok('lat' in cam, 'Camera should have lat');
    assert.ok('lon' in cam, 'Camera should have lon');
    assert.ok('source' in cam, 'Camera should have source');
    assert.equal(cam.source, 'freeway');
  });

  it('nearby_cctv.js should find cameras near Taipei and sort by distance', () => {
    const { stdout, exitCode } = runScript('nearby_cctv.js',
      ['--lat=25.0339', '--lon=121.5645', '--radius=50', '--limit=5'],
      {
        TDX_CLIENT_ID: process.env.TDX_CLIENT_ID,
        TDX_CLIENT_SECRET: process.env.TDX_CLIENT_SECRET,
      }
    );
    assert.equal(exitCode, 0);
    const json = parseJSON(stdout, 'nearby_cctv live');
    assert.ok(json.cameras.length > 0, 'Should find cameras near Taipei');
    // Verify sorted by distance
    for (let i = 1; i < json.cameras.length; i++) {
      assert.ok(
        json.cameras[i].distanceKm >= json.cameras[i-1].distanceKm,
        'Cameras should be sorted by distance ascending'
      );
    }
    // All within radius
    for (const cam of json.cameras) {
      assert.ok(cam.distanceKm <= 50, `Camera ${cam.id} should be within 50km radius`);
    }
  });

  it('list_news.js should return news with correct schema', () => {
    const { stdout, exitCode } = runScript('list_news.js', ['--limit=3'], {
      TDX_CLIENT_ID: process.env.TDX_CLIENT_ID,
      TDX_CLIENT_SECRET: process.env.TDX_CLIENT_SECRET,
    });
    assert.equal(exitCode, 0);
    const json = parseJSON(stdout, 'list_news live');
    assert.ok('total' in json);
    assert.ok('news' in json);
    if (json.news.length > 0) {
      const item = json.news[0];
      assert.ok('newsId' in item || '_warning' in item);
      assert.ok('source' in item);
    }
  });

  it('list_events.js should return events with correct schema', () => {
    const { stdout, exitCode } = runScript('list_events.js', ['--limit=3'], {
      TDX_CLIENT_ID: process.env.TDX_CLIENT_ID,
      TDX_CLIENT_SECRET: process.env.TDX_CLIENT_SECRET,
    });
    assert.equal(exitCode, 0);
    const json = parseJSON(stdout, 'list_events live');
    assert.ok('total' in json);
    assert.ok('events' in json);
  });
});

describe('Live CWA API E2E', { skip: !hasCwaCreds ? 'CWA_API_KEY not set' : false }, () => {
  it('get_weather.js should return weather stations', () => {
    const { stdout, exitCode } = runScript('get_weather.js', ['--station=臺北', '--limit=3'], {
      CWA_API_KEY: process.env.CWA_API_KEY,
    });
    assert.equal(exitCode, 0);
    const json = parseJSON(stdout, 'get_weather live');
    assert.ok(json.stations.length > 0, 'Should find Taipei stations');
    const station = json.stations[0];
    assert.ok('stationName' in station);
    assert.ok('weather' in station);
    assert.ok('temperature' in station.weather);
  });
});

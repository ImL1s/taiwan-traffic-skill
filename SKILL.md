---
name: taiwan-traffic
description: >
  Taiwan real-time traffic data: CCTV cameras, traffic news, road events, weather observations.
  Query 1500+ highway and freeway cameras, search by location or coordinates, get live stream URLs.
  Triggers on: Taiwan traffic, CCTV, 路況, 攝影機, 台灣交通, 國道, 省道, road camera, 即時影像,
  traffic news, road events, 交通新聞, 道路事件, 天氣, weather Taiwan.
homepage: https://github.com/ImL1s/taiwan-traffic-skill
metadata:
  openclaw:
    emoji: "🚦"
    primaryEnv: TDX_CLIENT_ID
    requires:
      bins: [node]
      env: [TDX_CLIENT_ID, TDX_CLIENT_SECRET]
    install:
      - id: "node-brew"
        kind: "brew"
        formula: "node"
        bins: ["node"]
        label: "Install Node.js (brew)"
---

# Taiwan Traffic Skill 🚦

Query Taiwan's real-time traffic infrastructure: 1500+ CCTV cameras, traffic news, road events, and weather.

## Prerequisites

### Required: TDX Account (Free)
1. Register at [TDX](https://tdx.transportdata.tw/)
2. Create an application to get `TDX_CLIENT_ID` and `TDX_CLIENT_SECRET`
3. Free tier: 50 requests/day, sufficient for normal use

### Optional: CWA Account (Free, for weather)
1. Register at [CWA Open Data](https://opendata.cwa.gov.tw/)
2. Get `CWA_API_KEY` from your account dashboard

## Health Check

Run this first to verify connectivity:

```bash
node {baseDir}/scripts/health_check.js
```

## Commands

### 1. List CCTV Cameras

```bash
# List all cameras (default limit 20)
node {baseDir}/scripts/list_cctv.js

# Highway (省道) cameras only
node {baseDir}/scripts/list_cctv.js --type=highway

# Freeway (國道) cameras only
node {baseDir}/scripts/list_cctv.js --type=freeway

# Search by keyword
node {baseDir}/scripts/list_cctv.js --search=台北 --limit=10

# Search by road name
node {baseDir}/scripts/list_cctv.js --road=台1線
```

### 2. Find Nearby Cameras

```bash
# Find cameras within 5km of Taipei 101
node {baseDir}/scripts/nearby_cctv.js --lat=25.0339 --lon=121.5645

# Custom radius (10km) and limit
node {baseDir}/scripts/nearby_cctv.js --lat=24.1477 --lon=120.6736 --radius=10 --limit=5

# Freeway cameras only
node {baseDir}/scripts/nearby_cctv.js --lat=25.0 --lon=121.5 --type=freeway
```

### 3. Get Camera Stream URL

```bash
# Get stream URL by camera ID
node {baseDir}/scripts/get_stream.js --id=nfb-08-043.6-M-90
```

### 4. Traffic News

```bash
# All recent traffic news
node {baseDir}/scripts/list_news.js

# Freeway news only
node {baseDir}/scripts/list_news.js --type=freeway

# Search news
node {baseDir}/scripts/list_news.js --search=事故 --limit=5
```

### 5. Road Events (Accidents / Construction)

```bash
# All active road events
node {baseDir}/scripts/list_events.js

# Highway events only
node {baseDir}/scripts/list_events.js --type=highway

# Search for specific events
node {baseDir}/scripts/list_events.js --search=施工
```

### 6. Weather Observations

```bash
# Find weather near coordinates
node {baseDir}/scripts/get_weather.js --lat=25.033 --lon=121.565

# Search by station/city name
node {baseDir}/scripts/get_weather.js --station=臺北

# List more stations
node {baseDir}/scripts/get_weather.js --limit=20
```

## Output Interpretation

| Field | How to Interpret |
|-------|-----------------|
| `cameras[].streamUrl` | Direct video stream URL. Present as clickable link. Note: many are MJPEG or RTSP streams that may not play in browser. |
| `cameras[].source` = `highway` | 省道 (Provincial Highway) camera — managed by DGH (公路總局) |
| `cameras[].source` = `freeway` | 國道 (Freeway) camera — managed by TANFB (高公局) |
| `cameras[].direction` | Road direction: 北向(N), 南向(S), 東向(E), 西向(W) |
| `cameras[].distanceKm` | Distance from search point in km (only in nearby search) |
| `news[].publishTime` | When the news was published. Show in local time (UTC+8). |
| `events[].type` | Event type: construction (施工), accident (事故), weather (天候), etc. |
| `events[].level` | Severity level. Higher = more serious. |
| `stations[].weather` | Weather data object with temperature (°C), humidity (%), wind speed (m/s), rainfall (mm). |
| `error` = true | Show error message and suggest running health_check.js |
| `warnings` array | Partial failures. Show data that succeeded + mention failures. |
| `total` vs `returned` | If total >> returned, mention user can increase --limit or refine --search. |

## Data Sources

| Source | API | Update Frequency |
|--------|-----|-----------------|
| Highway CCTV (省道) | TDX v2 | Camera list: rarely changes |
| Freeway CCTV (國道) | TDX v2 | Camera list: rarely changes |
| Traffic News | TDX v2 | Hourly |
| Road Events | TDX v1 | Every 15 min |
| Weather | CWA Open Data | Every 10 min |

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `TDX_CLIENT_ID and TDX_CLIENT_SECRET must be set` | Missing credentials | Register at https://tdx.transportdata.tw/ and set env vars |
| `OAuth failed (HTTP 401)` | Invalid credentials | Verify client ID/secret are correct |
| `OAuth failed (HTTP 429)` | Rate limited | TDX free tier: 50 req/day. Wait or upgrade plan |
| `CWA_API_KEY must be set` | Missing weather key | Register at https://opendata.cwa.gov.tw/ (optional for weather) |
| `HTTP 403` | IP blocked or quota exceeded | Check TDX dashboard for usage |
| `Request timeout` | Network issue | Retry. TDX servers are in Taiwan, may be slow from other regions |

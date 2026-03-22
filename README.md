# Taiwan Traffic 🚦

OpenClaw skill for querying Taiwan's real-time traffic infrastructure.

## Features

- 📹 **1500+ CCTV Cameras** — Highway (省道) and Freeway (國道) cameras with live stream URLs
- 📍 **Nearby Search** — Find cameras near any GPS coordinates (Haversine distance)
- 📰 **Traffic News** — Real-time traffic news from TDX
- 🚧 **Road Events** — Construction, accidents, weather closures
- 🌤️ **Weather** — CWA weather observations from 700+ stations

## Prerequisites

1. **TDX Account** (required, free): [Register here](https://tdx.transportdata.tw/)
   - Get `TDX_CLIENT_ID` and `TDX_CLIENT_SECRET`
2. **CWA Account** (optional, for weather): [Register here](https://opendata.cwa.gov.tw/)
   - Get `CWA_API_KEY`

## Install

### Option 1: ClawHub (recommended)
```bash
npx clawhub install taiwan-traffic
```

### Option 2: Git clone
```bash
git clone https://github.com/ImL1s/taiwan-traffic-skill.git ~/.openclaw/workspace/skills/taiwan-traffic
```

### Option 3: Let the agent install it
> "Install the taiwan-traffic skill from https://github.com/ImL1s/taiwan-traffic-skill"

## Setup

Set environment variables:
```bash
# Required
export TDX_CLIENT_ID=your_client_id
export TDX_CLIENT_SECRET=your_client_secret

# Optional (for weather)
export CWA_API_KEY=your_cwa_key
```

Or configure via OpenClaw:
```bash
openclaw skills onboard
```

## Quick Test

```bash
# Verify connectivity
node scripts/health_check.js

# List cameras
node scripts/list_cctv.js --type=freeway --limit=5

# Find nearby cameras (Taipei 101)
node scripts/nearby_cctv.js --lat=25.0339 --lon=121.5645

# Traffic news
node scripts/list_news.js --limit=5
```

## Data Sources

| Data | Source | Auth |
|------|--------|------|
| CCTV Cameras | [TDX 運輸資料流通服務](https://tdx.transportdata.tw/) | OAuth 2.0 |
| Traffic News | TDX Highway/Freeway News API | OAuth 2.0 |
| Road Events | TDX LiveEvent API (v1) | OAuth 2.0 |
| Weather | [CWA 氣象開放資料](https://opendata.cwa.gov.tw/) | API Key |

## License

MIT — see [LICENSE](./LICENSE)

## Disclaimer

This skill accesses government open data. Data accuracy depends on the upstream agencies (DGH, TANFB, CWA). Not for safety-critical applications.

# Fuel Consumption Dashboard — NestJS Backend

## Setup

```bash
cd fuel-backend
npm install
# Edit .env with your DB credentials
npm run start:dev    # development (hot reload)
npm run start:prod   # production
```

## API Reference

### Auth
```
POST /auth/login
Body: { "username": "admin", "password": "yourpassword" }
→ { "token": "jwt...", "expiresIn": "24h" }
```

All other endpoints require: `Authorization: Bearer <token>`

### Health
```
GET /health  → { "status": "ok" }
```

### Vehicles
```
GET /vehicles  → list of user's vehicles with online/offline status
```

### Fuel
```
GET /vehicles/:imei/fuel/current
GET /vehicles/:imei/fuel/history?from=2026-04-01T00:00:00Z&to=2026-04-10T00:00:00Z&interval=hour
GET /vehicles/:imei/fuel/consumption?from=...&to=...
GET /vehicles/:imei/fuel/refuels?from=...&to=...
GET /vehicles/:imei/fuel/debug?from=...&to=...
```

Intervals: `5min` | `15min` | `hour` | `day`

### Dashboard
```
GET /dashboard/summary?from=2026-04-01T00:00:00Z&to=2026-04-10T00:00:00Z
```

## Key Notes

- Passwords: supports both plain-text and MD5-hashed passwords from `gs_users`
- Formula evaluation: uses `expr-eval` (no `eval()`)
- Calibration: linear interpolation with clamp on out-of-range values
- Consumption: drops < 0.5L ignored (noise), gains > 3L treated as refuel
- All timestamps in UTC; optional `?tz=Asia/Karachi` for output conversion
- IMEI ownership enforced on every vehicle route — no cross-user data access

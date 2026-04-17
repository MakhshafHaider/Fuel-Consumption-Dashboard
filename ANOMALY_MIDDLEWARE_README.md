# Fuel Anomaly Detection Middleware

## Overview

This middleware automatically detects **fake refuel spikes** and **sensor glitches** in fuel data. It intercepts API responses and adds anomaly metadata to help distinguish between real refueling events and sensor artifacts.

## What It Detects

| Anomaly Type | Description | Confidence |
|-------------|-------------|------------|
| `fake_spike` | Fuel rose then fell back within 7-14 minutes | 85% |
| `sensor_reset` | Dip then recover to previous level (sensor reset) | 90% |
| `unsustained_rise` | Fuel didn't stay at new level for 15+ minutes | 80% |
| `movement_during_refuel` | Vehicle moving during refuel window (>10 km/h) | 75% |
| `no_stationary_period` | Never stopped moving (can't be at a station) | 65% |

## Files Created

### Backend
- `fuel-backend/src/common/middleware/fuel-anomaly.middleware.ts` - Main middleware
- `fuel-backend/src/common/middleware/fuel-anomaly.types.ts` - TypeScript types

### Frontend
- `fuel-dashboard/src/lib/fuelAnomalyUtils.ts` - Utility functions
- `fuel-dashboard/src/components/refuel/RefuelAnomalyBadge.tsx` - UI components
- `fuel-dashboard/src/components/refuel/index.ts` - Exports
- `fuel-dashboard/src/lib/types.ts` - Updated with anomaly types

## How It Works

```
Request → FuelController → FuelService → [MIDDLEWARE] → Response
                                              ↓
                                    Analyzes refuels
                                    Detects fake spikes
                                    Adds _anomaly metadata
```

## API Response Format

After enabling the middleware, fuel API responses now include:

```json
{
  "imei": "123456789",
  "refueled": 228.6,
  "refuels": [
    {
      "at": "2024-01-15T08:28:00Z",
      "added": 193.5,
      "fuelBefore": 101.5,
      "fuelAfter": 295.0,
      "_anomaly": {
        "isAnomaly": true,
        "anomalyType": "fake_spike",
        "confidence": 85,
        "reason": "Fuel rose 193.5L but fell back 50.0L within 7 minutes",
        "details": {
          "sustainedMinutes": 3,
          "fallbackAmount": 50.0,
          "maxSpeedDuring": 0,
          "maxSpeedAfter": 45
        }
      },
      "isVerified": false,
      "reliabilityScore": 0
    }
  ],
  "_anomalyMeta": {
    "summary": {
      "total": 2,
      "verified": 0,
      "anomalous": 2,
      "byType": { "fake_spike": 2 }
    },
    "detectionVersion": "1.0.0",
    "checkedAt": "2024-01-15T10:00:00Z"
  }
}
```

## Usage Examples

### 1. Display Refuels with Anomaly Badges

```tsx
import { RefuelListItem, RefuelAnomalySummary } from "@/components/refuel";

function FuelEventsPage({ data }) {
  return (
    <div>
      <RefuelAnomalySummary refuels={data.refuels} />
      {data.refuels.map((refuel, i) => (
        <RefuelListItem key={i} refuel={refuel} index={i} />
      ))}
    </div>
  );
}
```

### 2. Filter Out Anomalies

```tsx
import { filterVerifiedRefuels } from "@/lib/fuelAnomalyUtils";

const verifiedRefuels = filterVerifiedRefuels(data.refuels);
const verifiedTotal = verifiedRefuels.reduce((sum, r) => sum + r.added, 0);
```

### 3. Get Anomaly Statistics

```tsx
import { getAnomalySummary, logAnomalies } from "@/lib/fuelAnomalyUtils";

const stats = getAnomalySummary(data.refuels);
console.log(`${stats.verified} verified, ${stats.anomalous} suspicious`);

logAnomalies(data.refuels, data.imei); // Console logging
```

## Detection Algorithm

The middleware performs 4-layer validation:

### Layer 1: Movement Check
- Analyzes vehicle speed during refuel window (±7 minutes)
- If moving >10 km/h during refuel → likely not at a station

### Layer 2: Sustained Level Check
- Monitors fuel level for 15 minutes after rise
- Must stay within 3L of peak for 70% of readings
- Unsustained = sensor glitch

### Layer 3: Fallback Check
- Checks if fuel fell back 7-14 minutes after rise
- Fallback >3.5L = fake spike confirmed

### Layer 4: Recovery Pattern Check
- Detects "dip then recover" to previous level
- Indicates sensor reset, not real refuel

## Thresholds (Configurable)

```typescript
RISE_THRESHOLD = 8.0;              // Minimum rise to analyze (L)
SPIKE_WINDOW_MINUTES = 7;          // Analysis window (min)
POST_VERIFY_MINUTES = 7;          // Post-rise verification (min)
SUSTAINED_MIN_MINUTES = 15;       // Minimum sustained time (min)
RISE_GATING_MAX_SPEED_KMH = 10;   // Max speed for valid refuel
SUSTAINED_EPSILON_LITERS = 3.0;   // Tolerance for sustained check
FALLBACK_EPSILON_LITERS = 3.5;    // Fallback detection threshold
```

## Integration Checklist

- [x] Middleware created and registered in `fuel.module.ts`
- [x] Types updated in `types.ts`
- [x] Utility functions created
- [x] UI components built
- [x] Backend compiles successfully
- [x] Frontend compiles successfully

## Testing

To test the middleware:

1. **Start the backend:**
   ```bash
   cd fuel-backend
   npm run start:dev
   ```

2. **Make an API request:**
   ```bash
   curl "http://localhost:3000/fuel/consumption?imei=YOUR_IMEI&from=2024-01-01&to=2024-01-31"
   ```

3. **Check the logs:**
   - Look for `[AnomalyMiddleware]` log entries
   - Anomalies are logged with 🚨 emoji

4. **Inspect the response:**
   - Check `_anomalyMeta.summary` for statistics
   - Each refuel has `_anomaly` object

## Future Enhancements

1. **Database Logging** - Store anomalies for analysis
2. **Machine Learning** - Train model on verified vs anomalous patterns
3. **Gas Station Database** - Cross-reference with known station locations
4. **Voltage Analysis** - Detect sensor voltage glitches
5. **Temperature Compensation** - Account for fuel expansion/contraction

## Troubleshooting

### No anomaly data in response
- Verify middleware is registered in `fuel.module.ts`
- Check that response contains `refuels` array
- Look for `[AnomalyMiddleware]` debug logs

### False positives (real refuels marked as anomalies)
- Adjust `SUSTAINED_MIN_MINUTES` threshold
- Check vehicle actually stopped at station
- Verify fuel truly stayed at new level

### Missing anomalies (fake spikes not detected)
- Check fuel readings have sufficient density
- Verify speed data is accurate
- Increase `FALLBACK_EPSILON_LITERS` threshold

/**
 * USAGE EXAMPLE: How to use the Fuel Anomaly Detection
 *
 * This is an example showing how to integrate the anomaly detection
 * middleware results into your fuel monitoring pages.
 */

/*

1. BASIC USAGE - Display refuels with anomaly badges:

import { RefuelListItem, RefuelAnomalySummary } from "@/components/refuel";
import { filterVerifiedRefuels, getAnomalySummary } from "@/lib/fuelAnomalyUtils";

function FuelEventsPage({ data }: { data: FuelConsumptionData }) {
  const [showVerifiedOnly, setShowVerifiedOnly] = useState(false);

  // Filter to show only verified refuels
  const displayRefuels = showVerifiedOnly
    ? filterVerifiedRefuels(data.refuels || [])
    : data.refuels || [];

  return (
    <div className="space-y-4">
      {/* Anomaly Summary Card *\/}
      <RefuelAnomalySummary
        refuels={data.refuels || []}
        showFilterButton={true}
        onFilterToggle={setShowVerifiedOnly}
        filterActive={showVerifiedOnly}
      />

      {/* Refuel List *\/}
      <div className="space-y-3">
        {displayRefuels.map((refuel, index) => (
          <RefuelListItem
            key={`${refuel.at}-${index}`}
            refuel={refuel}
            index={index}
            showAnomaly={true}
          />
        ))}
      </div>
    </div>
  );
}

2. PROGRAMMATIC FILTERING - Calculate totals excluding anomalies:

import {
  processConsumptionWithAnomalyFilter,
  calculateVerifiedRefueled,
  logAnomalies,
} from "@/lib/fuelAnomalyUtils";

function AnalyticsPage({ data }: { data: FuelConsumptionData }) {
  // Process data to filter anomalies
  const processed = processConsumptionWithAnomalyFilter(data);

  // Log anomalies for debugging
  logAnomalies(data.refuels || [], data.imei);

  return (
    <div>
      <div className="grid grid-cols-3 gap-4">
        <StatCard
          label="Total Refueled (Raw)"
          value={data.refueled.toFixed(1)}
          unit="L"
        />
        <StatCard
          label="Verified Refueled"
          value={processed.data.refueled.toFixed(1)}
          unit="L"
          highlight={processed.hasAnomalies}
        />
        <StatCard
          label="Filtered Out"
          value={processed.filteredAmount.toFixed(1)}
          unit="L"
          color={processed.hasAnomalies ? "red" : "gray"}
        />
      </div>

      {processed.hasAnomalies && (
        <AlertBanner>
          ⚠️ Detected {processed.originalRefuelCount - processed.filteredRefuelCount}{" "}
          suspicious refuel events that were filtered out
        </AlertBanner>
      )}
    </div>
  );
}

3. DETAILED ANOMALY INSPECTION:

import { getAnomalousRefuels } from "@/lib/fuelAnomalyUtils";

function AnomalyInspector({ data }: { data: FuelConsumptionData }) {
  const anomalies = getAnomalousRefuels(data.refuels || []);

  if (anomalies.length === 0) {
    return <p>No anomalies detected. All refuels verified.</p>;
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-red-600">
        ⚠️ {anomalies.length} Anomalous Refuel(s) Detected
      </h3>

      {anomalies.map((refuel, index) => (
        <div key={index} className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex justify-between">
            <span className="font-medium">{new Date(refuel.at).toLocaleString()}</span>
            <RefuelAnomalyBadge refuel={refuel} />
          </div>
          <p className="text-sm text-gray-600 mt-2">
            Amount: +{refuel.added.toFixed(1)} L
          </p>
          <p className="text-sm text-red-600 mt-1">
            {refuel._anomaly?.reason}
          </p>
          <pre className="text-xs bg-white p-2 rounded mt-2 overflow-auto">
            {JSON.stringify(refuel._anomaly?.details, null, 2)}
          </pre>
        </div>
      ))}
    </div>
  );
}

4. UPDATING EXISTING COMPONENTS:

// In your existing fuel events display, just add the badge:

function YourExistingRefuelCard({ refuel }: { refuel: FuelRefuelDetail }) {
  return (
    <div className="fuel-event-card">
      <div className="flex justify-between">
        <span>+{refuel.added.toFixed(1)} L</span>
        {/* ADD THIS LINE: *\/}
        <RefuelAnomalyBadge refuel={refuel} size="sm" />
      </div>
      <time>{new Date(refuel.at).toLocaleString()}</time>
    </div>
  );
}

5. API RESPONSE HANDLING:

// The middleware automatically adds _anomalyMeta to responses:

async function fetchFuelData(imei: string, from: string, to: string) {
  const response = await fetch(
    `/api/fuel/consumption?imei=${imei}&from=${from}&to=${to}`
  );
  const data: FuelConsumptionData = await response.json();

  // Check anomaly metadata
  if (data._anomalyMeta) {
    console.log("Anomaly Detection Results:", data._anomalyMeta.summary);

    if (data._anomalyMeta.summary.anomalous > 0) {
      console.warn(
        `⚠️ ${data._anomalyMeta.summary.anomalous} suspicious refuels detected`
      );
    }
  }

  return data;
}

*/

export {}; // Make this a module

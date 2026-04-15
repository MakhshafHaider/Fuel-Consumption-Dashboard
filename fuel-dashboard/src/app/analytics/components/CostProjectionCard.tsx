"use client";

import { memo } from "react";
import { TrendingUp, TrendingDown, PiggyBank, ArrowRight } from "lucide-react";

interface CostProjectionCardProps {
  currentCost: number;
  projectedCost: number;
  potentialSavings: number;
  timeRange?: string;
  detailed?: boolean;
}

function CostProjectionCardComponent({
  currentCost,
  projectedCost,
  potentialSavings,
  timeRange = "Next 30 days",
  detailed = false,
}: CostProjectionCardProps) {
  const difference = projectedCost - currentCost;
  const percentChange = currentCost > 0 ? (difference / currentCost) * 100 : 0;
  const isIncreasing = difference > 0;

  const formatCurrency = (value: number) => {
    return `₹${value.toLocaleString("en-PK", { maximumFractionDigits: 0 })}`;
  };

  return (
    <div className="bg-white rounded-2xl p-6 border border-gray-100">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center">
          <span className="text-xl font-bold text-green-600">₹</span>
        </div>
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Cost Projection</h3>
          <p className="text-sm text-gray-500">{timeRange}</p>
        </div>
      </div>

      {/* Main Numbers */}
      <div className="space-y-4">
        <div className="p-4 bg-gray-50 rounded-xl">
          <p className="text-sm text-gray-500 mb-1">Current Period</p>
          <p className="text-2xl font-bold text-gray-900">{formatCurrency(currentCost)}</p>
        </div>

        <div className="flex items-center justify-center">
          <ArrowRight className="w-5 h-5 text-gray-400" />
        </div>

        <div className={`p-4 rounded-xl ${isIncreasing ? "bg-red-50" : "bg-green-50"}`}>
          <div className="flex items-center justify-between">
            <div>
              <p className={`text-sm mb-1 ${isIncreasing ? "text-red-600" : "text-green-600"}`}>
                Projected
              </p>
              <p className={`text-2xl font-bold ${isIncreasing ? "text-red-700" : "text-green-700"}`}>
                {formatCurrency(projectedCost)}
              </p>
            </div>
            <div
              className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium ${
                isIncreasing ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"
              }`}
            >
              {isIncreasing ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              {Math.abs(percentChange).toFixed(1)}%
            </div>
          </div>
        </div>
      </div>

      {/* Savings Section */}
      <div className="mt-6 pt-6 border-t border-gray-100">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
            <PiggyBank className="w-4 h-4 text-amber-600" />
          </div>
          <span className="font-medium text-gray-900">Potential Savings</span>
        </div>
        <p className="text-3xl font-bold text-amber-600">{formatCurrency(potentialSavings)}</p>
        <p className="text-sm text-gray-500 mt-1">
          By optimizing routes and reducing idle time
        </p>
      </div>

      {/* Detailed Breakdown */}
      {detailed && (
        <div className="mt-6 pt-6 border-t border-gray-100 space-y-3">
          <p className="text-sm font-medium text-gray-900 mb-3">Savings Breakdown</p>
          {[
            { label: "Route Optimization", value: potentialSavings * 0.4, color: "bg-blue-500" },
            { label: "Idle Time Reduction", value: potentialSavings * 0.35, color: "bg-amber-500" },
            { label: "Speed Optimization", value: potentialSavings * 0.25, color: "bg-green-500" },
          ].map((item) => (
            <div key={item.label} className="flex items-center gap-3">
              <div className={`w-2 h-2 rounded-full ${item.color}`} />
              <span className="text-sm text-gray-600 flex-1">{item.label}</span>
              <span className="text-sm font-medium text-gray-900">{formatCurrency(item.value)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export const CostProjectionCard = memo(CostProjectionCardComponent);

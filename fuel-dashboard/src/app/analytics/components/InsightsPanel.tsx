"use client";

import { memo } from "react";
import { LucideIcon, ArrowRight } from "lucide-react";

interface Insight {
  type: "positive" | "warning" | "negative" | "info";
  title: string;
  description: string;
  icon: LucideIcon;
}

interface InsightsPanelProps {
  insights: Insight[];
}

const typeConfig: Record<string, { bg: string; border: string; iconBg: string; iconColor: string }> = {
  positive: {
    bg: "bg-green-50",
    border: "border-green-200",
    iconBg: "bg-green-100",
    iconColor: "text-green-600",
  },
  warning: {
    bg: "bg-amber-50",
    border: "border-amber-200",
    iconBg: "bg-amber-100",
    iconColor: "text-amber-600",
  },
  negative: {
    bg: "bg-red-50",
    border: "border-red-200",
    iconBg: "bg-red-100",
    iconColor: "text-red-600",
  },
  info: {
    bg: "bg-blue-50",
    border: "border-blue-200",
    iconBg: "bg-blue-100",
    iconColor: "text-blue-600",
  },
};

function InsightsPanelComponent({ insights }: InsightsPanelProps) {
  return (
    <div className="bg-white rounded-2xl p-5 border border-gray-100">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center">
          <svg className="w-4 h-4 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-gray-900">AI Insights</h3>
      </div>

      {/* Insights List */}
      <div className="space-y-3">
        {insights.map((insight, index) => {
          const config = typeConfig[insight.type];
          const Icon = insight.icon;

          return (
            <div
              key={index}
              className={`p-4 rounded-xl border ${config.bg} ${config.border} transition-all hover:shadow-md cursor-pointer group`}
            >
              <div className="flex items-start gap-3">
                <div className={`w-8 h-8 rounded-lg ${config.iconBg} flex items-center justify-center flex-shrink-0`}>
                  <Icon className={`w-4 h-4 ${config.iconColor}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-semibold text-gray-900 mb-1">{insight.title}</h4>
                  <p className="text-sm text-gray-600 leading-relaxed">{insight.description}</p>
                </div>
                <ArrowRight className="w-4 h-4 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="mt-4 pt-4 border-t border-gray-100">
        <button className="flex items-center gap-2 text-sm font-medium text-purple-600 hover:text-purple-700 transition-colors">
          View all insights
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export const InsightsPanel = memo(InsightsPanelComponent);

"use client";

import { useState, useMemo } from "react";
import { Trophy, TrendingUp, TrendingDown, Medal, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, ArrowUpDown } from "lucide-react";

interface RankingItem {
  rank: number;
  id: string;
  name: string;
  subtitle?: string;
  score: number;
  change?: number;
  badge?: "best" | "worst" | "top3";
  metrics: { label: string; value: string | number; unit?: string; sortable?: boolean }[];
}

interface RankingTableProps {
  title: string;
  subtitle?: string;
  items: RankingItem[];
  isLoading?: boolean;
  maxHeight?: number;
  sortable?: boolean;
  paginated?: boolean;
  pageSize?: number;
  showRankChange?: boolean;
}

type SortKey = "rank" | "score" | `metric-${number}`;
type SortDir = "asc" | "desc";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function RankingTable({
  title,
  subtitle,
  items,
  isLoading,
  maxHeight = 400,
  sortable = true,
  paginated = true,
  pageSize = 10,
  showRankChange = true,
}: RankingTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("rank");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [currentPage, setCurrentPage] = useState(1);

  // Reset page when items change
  useMemo(() => {
    setCurrentPage(1);
  }, [items.length]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
    setCurrentPage(1);
  };

  const sortedItems = useMemo(() => {
    if (!sortable) return items;

    return [...items].sort((a, b) => {
      let valA: number | string = 0;
      let valB: number | string = 0;

      if (sortKey === "rank") {
        valA = a.rank;
        valB = b.rank;
      } else if (sortKey === "score") {
        valA = a.score;
        valB = b.score;
      } else if (sortKey.startsWith("metric-")) {
        const metricIdx = parseInt(sortKey.split("-")[1]);
        const metricA = a.metrics[metricIdx];
        const metricB = b.metrics[metricIdx];
        if (metricA && metricB) {
          valA = parseFloat(String(metricA.value)) || 0;
          valB = parseFloat(String(metricB.value)) || 0;
        }
      }

      if (typeof valA === "number" && typeof valB === "number") {
        return sortDir === "asc" ? valA - valB : valB - valA;
      }
      return sortDir === "asc" ? String(valA).localeCompare(String(valB)) : String(valB).localeCompare(String(valA));
    });
  }, [items, sortKey, sortDir, sortable]);

  const totalPages = Math.ceil(sortedItems.length / pageSize);
  const paginatedItems = useMemo(() => {
    if (!paginated) return sortedItems;
    const start = (currentPage - 1) * pageSize;
    return sortedItems.slice(start, start + pageSize);
  }, [sortedItems, currentPage, pageSize, paginated]);

  const getBadgeIcon = (badge?: string) => {
    switch (badge) {
      case "best":
        return <Trophy size={16} className="text-yellow-500" />;
      case "top3":
        return <Medal size={16} className="text-blue-500" />;
      case "worst":
        return <TrendingDown size={16} className="text-red-500" />;
      default:
        return null;
    }
  };

  const getRankStyle = (rank: number, badge?: string) => {
    if (badge === "best" || rank === 1) {
      return {
        background: "linear-gradient(135deg, #FEF3C7, #FDE68A)",
        color: "#92400E",
        border: "1px solid #F59E0B",
      };
    }
    if (badge === "worst") {
      return {
        background: "linear-gradient(135deg, #FEE2E2, #FECACA)",
        color: "#991B1B",
        border: "1px solid #EF4444",
      };
    }
    if (rank <= 3) {
      return {
        background: "linear-gradient(135deg, #DBEAFE, #93C5FD)",
        color: "#1E40AF",
        border: "1px solid #3B82F6",
      };
    }
    return {
      background: "#F3F4F6",
      color: "#6B7280",
      border: "1px solid #E5E7EB",
    };
  };

  const SortButton = ({ label, sortKey: key, active }: { label: string; sortKey: SortKey; active?: boolean }) => (
    <button
      onClick={() => handleSort(key)}
      className="flex items-center gap-1 text-xs font-medium transition-colors hover:text-gray-900"
      style={{ color: active ? "#1A1A2E" : "#9CA3AF" }}
    >
      {label}
      {sortKey === key ? (
        sortDir === "asc" ? <ChevronUp size={14} /> : <ChevronDown size={14} />
      ) : (
        <ArrowUpDown size={14} style={{ opacity: 0.5 }} />
      )}
    </button>
  );

  if (isLoading) {
    return (
      <div
        className="rounded-xl p-4 animate-pulse"
        style={{
          background: "rgba(255, 255, 255, 0.9)",
          backdropFilter: "blur(20px)",
          border: "1px solid rgba(255, 255, 255, 0.8)",
          boxShadow: "0 2px 12px rgba(0, 0, 0, 0.03)",
        }}
      >
        <div className="h-4 w-40 rounded-lg bg-gray-100 mb-3" />
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-gray-100" />
              <div className="flex-1 h-10 rounded-lg bg-gray-100" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const firstMetric = items[0]?.metrics[0];
  const secondMetric = items[0]?.metrics[1];

  return (
    <div
      className="rounded-xl overflow-hidden flex flex-col"
      style={{
        background: "rgba(255, 255, 255, 0.95)",
        backdropFilter: "blur(20px)",
        border: "1px solid rgba(255, 255, 255, 0.8)",
        boxShadow: "0 2px 12px rgba(0, 0, 0, 0.03)",
        maxHeight: "100%",
      }}
    >
      {/* Header */}
      <div className="p-4 border-b flex-shrink-0" style={{ borderColor: "rgba(240, 239, 239, 0.8)" }}>
        <div className="flex items-center gap-2">
          <Trophy size={20} style={{ color: "#E84040" }} />
          <div>
            <h3 className="font-semibold text-base" style={{ color: "#1A1A2E" }}>
              {title}
            </h3>
            {subtitle && (
              <p className="text-xs" style={{ color: "#9CA3AF" }}>
                {subtitle}
              </p>
            )}
          </div>
        </div>

        {/* Sort controls */}
        {sortable && items.length > 1 && (
          <div className="flex items-center gap-4 mt-3 pt-3 border-t" style={{ borderColor: "rgba(240, 239, 239, 0.6)" }}>
            <span className="text-xs" style={{ color: "#9CA3AF" }}>Sort by:</span>
            <SortButton label="Rank" sortKey="rank" active={sortKey === "rank"} />
            <SortButton label="Score" sortKey="score" active={sortKey === "score"} />
            {firstMetric && (
              <SortButton label={firstMetric.label} sortKey="metric-0" active={sortKey === "metric-0"} />
            )}
            {secondMetric && (
              <SortButton label={secondMetric.label} sortKey="metric-1" active={sortKey === "metric-1"} />
            )}
          </div>
        )}
      </div>

      {/* Items */}
      <div className="overflow-auto flex-1" style={{ maxHeight }}>
        <div className="divide-y" style={{ borderColor: "rgba(240, 239, 239, 0.6)" }}>
          {paginatedItems.map((item) => (
            <div
              key={item.id}
              className="p-3 flex items-center gap-3 hover:bg-white/60 transition-colors"
            >
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center font-bold text-sm flex-shrink-0"
                style={getRankStyle(item.rank, item.badge)}
              >
                {getBadgeIcon(item.badge) || item.rank}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="font-medium text-base truncate" style={{ color: "#1A1A2E" }}>
                    {item.name}
                  </p>
                  {showRankChange && item.change !== undefined && item.change !== 0 && (
                    <span
                      className="flex items-center gap-0.5 text-xs font-medium px-1.5 py-0.5 rounded-full"
                      style={{
                        background: item.change > 0 ? "#DCFCE7" : "#FEE2E2",
                        color: item.change > 0 ? "#166534" : "#991B1B",
                      }}
                    >
                      {item.change > 0 ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      {Math.abs(item.change)}
                    </span>
                  )}
                </div>
                {item.subtitle && (
                  <p className="text-xs truncate" style={{ color: "#9CA3AF" }}>
                    {item.subtitle}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-4">
                {item.metrics.slice(0, 2).map((metric, i) => (
                  <div key={i} className="text-right hidden sm:block">
                    <p className="text-xs" style={{ color: "#9CA3AF" }}>
                      {metric.label}
                    </p>
                    <p className="text-sm font-semibold" style={{ color: "#1A1A2E" }}>
                      {metric.value}
                      {metric.unit && (
                        <span className="text-xs font-normal ml-0.5" style={{ color: "#9CA3AF" }}>
                          {metric.unit}
                        </span>
                      )}
                    </p>
                  </div>
                ))}
              </div>

              <div
                className="w-12 h-12 rounded-lg flex flex-col items-center justify-center flex-shrink-0"
                style={{
                  background:
                    item.score >= 80
                      ? "linear-gradient(135deg, #DCFCE7, #BBF7D0)"
                      : item.score >= 60
                      ? "linear-gradient(135deg, #DBEAFE, #BFDBFE)"
                      : item.score >= 40
                      ? "linear-gradient(135deg, #FFEDD5, #FED7AA)"
                      : "linear-gradient(135deg, #FEE2E2, #FECACA)",
                }}
              >
                <span
                  className="text-base font-bold"
                  style={{
                    color:
                      item.score >= 80
                        ? "#166534"
                        : item.score >= 60
                        ? "#1E40AF"
                        : item.score >= 40
                        ? "#9A3412"
                        : "#991B1B",
                  }}
                >
                  {item.score}
                </span>
                <span className="text-[9px] uppercase tracking-wider" style={{ color: "#6B7280" }}>
                  Score
                </span>
              </div>
            </div>
          ))}
        </div>

        {paginatedItems.length === 0 && (
          <div className="p-8 text-center">
            <p className="text-sm" style={{ color: "#9CA3AF" }}>No items to display</p>
          </div>
        )}
      </div>

      {/* Pagination */}
      {paginated && totalPages > 1 && (
        <div className="px-4 py-3 border-t flex items-center justify-between" style={{ borderColor: "rgba(240, 239, 239, 0.8)" }}>
          <div className="text-xs" style={{ color: "#9CA3AF" }}>
            Showing {(currentPage - 1) * pageSize + 1} - {Math.min(currentPage * pageSize, items.length)} of {items.length}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-1.5 rounded-lg transition-colors disabled:opacity-30 hover:bg-gray-100"
              style={{ color: "#6B7280" }}
            >
              <ChevronLeft size={18} />
            </button>
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum = currentPage;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (currentPage <= 3) {
                  pageNum = i + 1;
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = currentPage - 2 + i;
                }
                return (
                  <button
                    key={pageNum}
                    onClick={() => setCurrentPage(pageNum)}
                    className="w-8 h-8 rounded-lg text-xs font-medium transition-colors"
                    style={{
                      background: currentPage === pageNum ? "#E84040" : "transparent",
                      color: currentPage === pageNum ? "white" : "#6B7280",
                    }}
                  >
                    {pageNum}
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-1.5 rounded-lg transition-colors disabled:opacity-30 hover:bg-gray-100"
              style={{ color: "#6B7280" }}
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

export function ShimmerStyle() {
  return (
    <style>{`
      @keyframes shimmer {
        0%   { background-position: -200% 0; }
        100% { background-position:  200% 0; }
      }
      .skeleton {
        background: linear-gradient(90deg,rgba(148,163,184,0.1) 0%,rgba(148,163,184,0.22) 50%,rgba(148,163,184,0.1) 100%);
        background-size: 200% 100%;
        animation: shimmer 1.6s infinite;
        border-radius: 8px;
      }
    `}</style>
  );
}

export function KpiCardSkeleton() {
  return (
    <div className="glass-card p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="skeleton w-10 h-10 rounded-xl" />
        <div className="skeleton w-16 h-5 rounded-full" />
      </div>
      <div className="skeleton w-28 h-7 mb-2 rounded-lg" />
      <div className="skeleton w-20 h-4 rounded-lg" />
    </div>
  );
}

export function ChartSkeleton() {
  return (
    <div className="glass-card p-5">
      <div className="flex items-center justify-between mb-5">
        <div><div className="skeleton w-44 h-5 mb-2 rounded-lg" /><div className="skeleton w-32 h-4 rounded-lg" /></div>
        <div className="skeleton w-24 h-9 rounded-full" />
      </div>
      <div className="skeleton w-full h-44 rounded-2xl" />
    </div>
  );
}

export function CardSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="glass-card p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="skeleton w-28 h-5 rounded-lg" />
        <div className="skeleton w-12 h-5 rounded-full" />
      </div>
      <div className="flex flex-col gap-3">
        {Array.from({ length: lines }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="skeleton w-9 h-9 rounded-xl flex-shrink-0" />
            <div className="flex-1">
              <div className="skeleton w-full h-4 mb-1.5 rounded" />
              <div className="skeleton w-2/3 h-3 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

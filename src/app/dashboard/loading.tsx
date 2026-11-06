export default function DashboardLoading() {
  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50 dark:bg-[#1D2125] p-6 animate-pulse">
      {/* Top Header Skeleton */}
      <div className="flex items-center justify-between pb-6 border-b border-slate-200 dark:border-[#2C333A]">
        <div className="space-y-2">
          <div className="h-6 w-48 bg-slate-200 dark:bg-[#22272B] rounded" />
          <div className="h-4 w-72 bg-slate-100 dark:bg-[#161A1D] rounded" />
        </div>
        <div className="flex items-center gap-3">
          <div className="h-9 w-28 bg-slate-200 dark:bg-[#22272B] rounded-lg" />
          <div className="h-9 w-32 bg-slate-200 dark:bg-[#22272B] rounded-lg" />
        </div>
      </div>

      {/* Grid / Board Skeleton */}
      <div className="flex-1 flex gap-4 mt-6 overflow-hidden">
        {[1, 2, 3, 4].map((col) => (
          <div
            key={col}
            className="flex-1 min-w-[280px] bg-slate-100/70 dark:bg-[#161A1D] rounded-xl p-3 flex flex-col gap-3"
          >
            <div className="h-5 w-24 bg-slate-200 dark:bg-[#22272B] rounded" />
            {[1, 2, 3].map((card) => (
              <div
                key={card}
                className="h-28 bg-white dark:bg-[#22272B] rounded-lg p-3 border border-slate-200/80 dark:border-[#2C333A]"
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

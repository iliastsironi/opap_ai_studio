import React from 'react';

export const GlobalLoadingSkeleton: React.FC = () => {
  return (
    <div className="w-full space-y-6 animate-pulse p-2">
      {/* Top Banner Skeleton */}
      <div className="h-28 bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 rounded-2xl border border-slate-200/60 p-6 flex items-center justify-between">
        <div className="space-y-3">
          <div className="h-6 w-48 bg-slate-300 rounded-md"></div>
          <div className="h-4 w-72 bg-slate-200 rounded-md"></div>
        </div>
        <div className="h-10 w-32 bg-slate-300 rounded-xl"></div>
      </div>

      {/* KPI Cards Skeleton Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="p-5 bg-white rounded-2xl border border-slate-200/80 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div className="h-3.5 w-24 bg-slate-200 rounded"></div>
              <div className="h-8 w-8 bg-slate-100 rounded-lg"></div>
            </div>
            <div className="h-7 w-32 bg-slate-300 rounded-md"></div>
            <div className="h-3 w-20 bg-slate-200 rounded"></div>
          </div>
        ))}
      </div>

      {/* Table / List Section Skeleton */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 space-y-4">
        <div className="flex justify-between items-center pb-4 border-b border-slate-100">
          <div className="h-5 w-40 bg-slate-300 rounded"></div>
          <div className="flex space-x-2">
            <div className="h-9 w-24 bg-slate-200 rounded-lg"></div>
            <div className="h-9 w-28 bg-slate-200 rounded-lg"></div>
          </div>
        </div>

        <div className="space-y-3 pt-2">
          {[1, 2, 3, 4, 5].map((row) => (
            <div key={row} className="flex items-center justify-between py-3 px-4 bg-slate-50 rounded-xl">
              <div className="flex items-center space-x-3">
                <div className="h-8 w-8 bg-slate-200 rounded-full"></div>
                <div className="space-y-1.5">
                  <div className="h-4 w-36 bg-slate-300 rounded"></div>
                  <div className="h-3 w-24 bg-slate-200 rounded"></div>
                </div>
              </div>
              <div className="h-5 w-20 bg-slate-300 rounded"></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

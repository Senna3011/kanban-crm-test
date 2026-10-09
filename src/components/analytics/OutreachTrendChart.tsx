'use client';

import { useState, useEffect, useMemo } from 'react';

interface TimePoint {
  date: string;
  label: string;
  sourced: number;
  verified: number;
  dispatched: number;
  replied: number;
  value: number;
}

interface AnalyticsData {
  rangeDays: number;
  timeSeries: TimePoint[];
  summary: {
    totalSourced: number;
    totalVerified: number;
    totalDispatched: number;
    totalReplied: number;
    totalValue: number;
    replyRate: string;
    verifyRate: string;
  };
}

export default function OutreachTrendChart() {
  const [days, setDays] = useState<7 | 14 | 30>(14);
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [activeMetric, setActiveMetric] = useState<'dispatched' | 'sourced' | 'replied'>('dispatched');

  useEffect(() => {
    fetchData(days);
  }, [days]);

  async function fetchData(range: number) {
    setLoading(true);
    try {
      const res = await fetch(`/api/outreach/analytics?days=${range}`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error('Failed to load outreach analytics:', err);
    } finally {
      setLoading(false);
    }
  }

  const series = data?.timeSeries || [];

  // SVG Chart Geometry Calculation
  const chartHeight = 160;
  const chartWidth = 600;
  const paddingX = 20;
  const paddingY = 25;

  const maxValue = useMemo(() => {
    if (!series.length) return 10;
    const values = series.map((s) => Math.max(s.sourced, s.dispatched, s.replied, 5));
    return Math.max(...values, 10);
  }, [series]);

  const points = useMemo(() => {
    if (!series.length) return [];
    const step = (chartWidth - paddingX * 2) / Math.max(series.length - 1, 1);
    return series.map((pt, idx) => {
      const x = paddingX + idx * step;
      const val = pt[activeMetric] || 0;
      const y = chartHeight - paddingY - (val / maxValue) * (chartHeight - paddingY * 2);
      return { x, y, pt, val };
    });
  }, [series, activeMetric, maxValue]);

  const linePath = useMemo(() => {
    if (!points.length) return '';
    return points.reduce((acc, curr, idx) => {
      return idx === 0 ? `M ${curr.x} ${curr.y}` : `${acc} L ${curr.x} ${curr.y}`;
    }, '');
  }, [points]);

  const areaPath = useMemo(() => {
    if (!points.length) return '';
    const first = points[0];
    const last = points[points.length - 1];
    const bottomY = chartHeight - paddingY;
    return `${linePath} L ${last.x} ${bottomY} L ${first.x} ${bottomY} Z`;
  }, [linePath, points]);

  const metricColors = {
    dispatched: {
      stroke: '#6366f1',
      fillStart: 'rgba(99, 102, 241, 0.28)',
      fillEnd: 'rgba(99, 102, 241, 0.01)',
      label: 'Emails Dispatched',
      badge: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    },
    sourced: {
      stroke: '#3b82f6',
      fillStart: 'rgba(59, 130, 246, 0.28)',
      fillEnd: 'rgba(59, 130, 246, 0.01)',
      label: 'Leads Sourced',
      badge: 'bg-blue-50 text-blue-700 border-blue-200',
    },
    replied: {
      stroke: '#10b981',
      fillStart: 'rgba(16, 185, 129, 0.28)',
      fillEnd: 'rgba(16, 185, 129, 0.01)',
      label: 'Replies & CRM Inbound',
      badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    },
  };

  const currentTheme = metricColors[activeMetric];

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 space-y-4">
      {/* Top Header & Range Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-base">📈</span>
            <h3 className="text-sm font-bold text-slate-900 tracking-tight">Outreach & Conversion Performance</h3>
            <span className="text-[10px] font-semibold text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full">
              Live Time-Series
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Track daily outbound email velocity, prospect replies, and CRM pipeline progression.
          </p>
        </div>

        {/* Metric Switcher & Day Selector */}
        <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
          <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-50 text-xs">
            <button
              type="button"
              onClick={() => setActiveMetric('dispatched')}
              className={`px-2.5 py-1 font-semibold rounded-md transition-all ${
                activeMetric === 'dispatched' ? 'bg-white shadow-2xs text-indigo-600 font-bold' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Dispatched
            </button>
            <button
              type="button"
              onClick={() => setActiveMetric('replied')}
              className={`px-2.5 py-1 font-semibold rounded-md transition-all ${
                activeMetric === 'replied' ? 'bg-white shadow-2xs text-emerald-600 font-bold' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Replies
            </button>
            <button
              type="button"
              onClick={() => setActiveMetric('sourced')}
              className={`px-2.5 py-1 font-semibold rounded-md transition-all ${
                activeMetric === 'sourced' ? 'bg-white shadow-2xs text-blue-600 font-bold' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Sourced
            </button>
          </div>

          <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-50 text-xs">
            <button
              type="button"
              onClick={() => setDays(7)}
              className={`px-2 py-1 font-semibold rounded-md transition-all ${
                days === 7 ? 'bg-white shadow-2xs text-slate-900 font-bold' : 'text-slate-500'
              }`}
            >
              7D
            </button>
            <button
              type="button"
              onClick={() => setDays(14)}
              className={`px-2 py-1 font-semibold rounded-md transition-all ${
                days === 14 ? 'bg-white shadow-2xs text-slate-900 font-bold' : 'text-slate-500'
              }`}
            >
              14D
            </button>
            <button
              type="button"
              onClick={() => setDays(30)}
              className={`px-2 py-1 font-semibold rounded-md transition-all ${
                days === 30 ? 'bg-white shadow-2xs text-slate-900 font-bold' : 'text-slate-500'
              }`}
            >
              30D
            </button>
          </div>
        </div>
      </div>

      {/* KPI Cards Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3 bg-indigo-50/50 rounded-xl border border-indigo-100">
          <p className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider">Emails Dispatched</p>
          <p className="text-xl font-extrabold text-indigo-950 mt-0.5">{data?.summary.totalDispatched || 0}</p>
          <p className="text-[10px] text-indigo-600/80 mt-0.5 font-medium">Last {days} days total</p>
        </div>

        <div className="p-3 bg-emerald-50/50 rounded-xl border border-emerald-100">
          <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">Replies / Converted</p>
          <div className="flex items-baseline gap-1.5 mt-0.5">
            <span className="text-xl font-extrabold text-emerald-950">{data?.summary.totalReplied || 0}</span>
            <span className="text-xs font-bold text-emerald-700">({data?.summary.replyRate || '0.0'}%)</span>
          </div>
          <p className="text-[10px] text-emerald-600/80 mt-0.5 font-medium">Conversion rate</p>
        </div>

        <div className="p-3 bg-blue-50/50 rounded-xl border border-blue-100">
          <p className="text-[10px] font-bold text-blue-700 uppercase tracking-wider">Verified Safe Leads</p>
          <div className="flex items-baseline gap-1.5 mt-0.5">
            <span className="text-xl font-extrabold text-blue-950">{data?.summary.totalVerified || 0}</span>
            <span className="text-xs font-bold text-blue-700">({data?.summary.verifyRate || '0.0'}%)</span>
          </div>
          <p className="text-[10px] text-blue-600/80 mt-0.5 font-medium">{data?.summary.totalSourced || 0} sourced</p>
        </div>

        <div className="p-3 bg-purple-50/50 rounded-xl border border-purple-100">
          <p className="text-[10px] font-bold text-purple-700 uppercase tracking-wider">Pipeline Revenue</p>
          <p className="text-xl font-extrabold text-purple-950 mt-0.5">
            ${(data?.summary.totalValue || 0).toLocaleString()}
          </p>
          <p className="text-[10px] text-purple-600/80 mt-0.5 font-medium">Generated value</p>
        </div>
      </div>

      {/* Interactive SVG Chart */}
      <div className="relative pt-2">
        {loading ? (
          <div className="h-40 flex items-center justify-center text-xs text-slate-400">
            <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mr-2" />
            Loading trend metrics...
          </div>
        ) : series.length === 0 ? (
          <div className="h-40 flex items-center justify-center text-xs text-slate-400">
            No activity recorded in this time range.
          </div>
        ) : (
          <div className="w-full overflow-x-auto scrollbar-none">
            <svg
              viewBox={`0 0 ${chartWidth} ${chartHeight}`}
              className="w-full h-44 overflow-visible cursor-crosshair select-none"
              onMouseLeave={() => setHoverIndex(null)}
            >
              <defs>
                <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={currentTheme.fillStart} />
                  <stop offset="100%" stopColor={currentTheme.fillEnd} />
                </linearGradient>
              </defs>

              {/* Background Grid Lines */}
              <line
                x1={paddingX}
                y1={paddingY}
                x2={chartWidth - paddingX}
                y2={paddingY}
                stroke="#f1f5f9"
                strokeDasharray="4 4"
                strokeWidth={1}
              />
              <line
                x1={paddingX}
                y1={chartHeight / 2}
                x2={chartWidth - paddingX}
                y2={chartHeight / 2}
                stroke="#f1f5f9"
                strokeDasharray="4 4"
                strokeWidth={1}
              />
              <line
                x1={paddingX}
                y1={chartHeight - paddingY}
                x2={chartWidth - paddingX}
                y2={chartHeight - paddingY}
                stroke="#e2e8f0"
                strokeWidth={1}
              />

              {/* Area & Line */}
              <path d={areaPath} fill="url(#chartGradient)" />
              <path d={linePath} fill="none" stroke={currentTheme.stroke} strokeWidth={2.5} strokeLinecap="round" />

              {/* Data Points & Hover Targets */}
              {points.map((p, idx) => {
                const isHovered = hoverIndex === idx;
                return (
                  <g key={idx} onMouseEnter={() => setHoverIndex(idx)}>
                    {/* Vertical Highlight Bar on Hover */}
                    {isHovered && (
                      <line
                        x1={p.x}
                        y1={paddingY}
                        x2={p.x}
                        y2={chartHeight - paddingY}
                        stroke="#cbd5e1"
                        strokeDasharray="2 2"
                        strokeWidth={1.5}
                      />
                    )}

                    {/* Point Circle */}
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r={isHovered ? 5 : 3.5}
                      fill="#ffffff"
                      stroke={currentTheme.stroke}
                      strokeWidth={isHovered ? 3 : 2}
                      className="transition-all duration-150"
                    />

                    {/* Transparent Hover Hitbox */}
                    <rect
                      x={p.x - 12}
                      y={0}
                      width={24}
                      height={chartHeight}
                      fill="transparent"
                      className="cursor-pointer"
                    />
                  </g>
                );
              })}

              {/* Bottom Date Labels */}
              {points.map((p, idx) => {
                // Show label on every few points depending on range
                const stepModulo = days > 14 ? 4 : 2;
                if (idx % stepModulo !== 0 && idx !== points.length - 1) return null;
                return (
                  <text
                    key={idx}
                    x={p.x}
                    y={chartHeight - 6}
                    textAnchor="middle"
                    className="text-[9px] fill-slate-400 font-medium font-mono"
                  >
                    {p.pt.label}
                  </text>
                );
              })}
            </svg>

            {/* Hover Tooltip Overlay */}
            {hoverIndex !== null && points[hoverIndex] && (
              <div className="flex items-center justify-between p-2.5 bg-slate-900 text-white rounded-xl shadow-lg text-xs mt-2 transition-all animate-in fade-in duration-150">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-indigo-300">📅 {points[hoverIndex].pt.label}:</span>
                  <span className="font-semibold text-slate-200">
                    {points[hoverIndex].val} {currentTheme.label.toLowerCase()}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-[11px] text-slate-300">
                  <span>✉️ Sent: <b>{points[hoverIndex].pt.dispatched}</b></span>
                  <span>💬 Replies: <b>{points[hoverIndex].pt.replied}</b></span>
                  <span>🎯 Leads: <b>{points[hoverIndex].pt.sourced}</b></span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

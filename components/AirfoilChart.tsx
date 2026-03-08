import React from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Brush
} from 'recharts';
import { AirfoilPolar } from '../types';

interface Props {
  polar: AirfoilPolar;
  isDark?: boolean;
}

const AirfoilChart: React.FC<Props> = ({ polar, isDark = false }) => {
  // Aviation Themed Color Palettes
  const colors = {
    lift: isDark ? '#38bdf8' : '#2563eb', // Sky blue / Navy
    drag: isDark ? '#fb7185' : '#e11d48', // Soft red / Bold red
    eff: isDark ? '#34d399' : '#059669',  // Emerald
    grid: isDark ? '#1e293b' : '#f1f5f9',
    text: isDark ? '#94a3b8' : '#64748b',
    axis: isDark ? '#334155' : '#cbd5e1',
    tooltipBg: isDark ? '#0f172a' : '#ffffff',
    tooltipBorder: isDark ? '#334155' : '#e2e8f0',
  };

  return (
    <div className="space-y-8 mt-6">
      {/* Main Polar Chart - CL vs Alpha */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 transition-all">
        <div className="flex items-center justify-between mb-4">
          <div className="flex flex-col">
            <h3 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">Lift Coefficient Polar (Cl vs &alpha;)</h3>
            <div className="flex items-center gap-2 mt-1">
              <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
              <span className="text-[10px] font-bold text-slate-700 dark:text-slate-400 mono">TELEMETRY: STABLE</span>
            </div>
          </div>
          <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest bg-slate-50 dark:bg-slate-800 px-3 py-1 rounded border border-slate-200 dark:border-slate-700">
            HUD Scale: Auto
          </div>
        </div>

        <ResponsiveContainer width="100%" height={400}>
          <LineChart data={polar.data} margin={{ top: 10, right: 30, left: 10, bottom: 20 }}>
            <CartesianGrid strokeDasharray="2 2" vertical={false} stroke={colors.grid} />
            <XAxis
              dataKey="alpha"
              stroke={colors.axis}
              tick={{ fontSize: 10, fill: colors.text, fontWeight: 600 }}
              label={{ value: 'Angle of Attack (deg)', position: 'insideBottom', offset: -10, fontSize: 10, fill: colors.text, fontWeight: 800 }}
            />
            <YAxis
              stroke={colors.axis}
              tick={{ fontSize: 10, fill: colors.text, fontWeight: 600 }}
              label={{ value: 'CL', angle: -90, position: 'insideLeft', offset: 10, fontSize: 10, fill: colors.text, fontWeight: 800 }}
              domain={['auto', 'auto']}
            />
            <Tooltip
              isAnimationActive={false}
              contentStyle={{
                borderRadius: '8px',
                border: `1px solid ${colors.tooltipBorder}`,
                backgroundColor: colors.tooltipBg,
                boxShadow: isDark ? '0 10px 15px -3px rgba(0,0,0,0.5)' : '0 10px 15px -3px rgba(0,0,0,0.1)',
                color: isDark ? '#f1f5f9' : '#1e293b'
              }}
              labelStyle={{ fontWeight: '900', color: isDark ? '#38bdf8' : '#2563eb', fontSize: '12px' }}
              formatter={(value: any) => [parseFloat(value).toFixed(4), 'CL']}
            />
            <Line
              type="monotone"
              dataKey="cl"
              stroke={colors.lift}
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 6, strokeWidth: 2, stroke: isDark ? '#0f172a' : '#fff', fill: colors.lift }}
              animationDuration={500}
            />
            <Brush
              dataKey="alpha"
              height={40}
              stroke={colors.lift}
              fill={isDark ? '#1e293b' : '#f8fafc'}
              travellerWidth={10}
              style={{ fontSize: '10px', fontWeight: 'bold' }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Drag Chart */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800">
          <h3 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-4">Drag Response (Cd vs &alpha;)</h3>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={polar.data} margin={{ top: 5, right: 30, left: 10, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={colors.grid} />
              <XAxis dataKey="alpha" stroke={colors.axis} tick={{ fontSize: 9, fill: colors.text }} />
              <YAxis stroke={colors.axis} tick={{ fontSize: 9, fill: colors.text }} domain={['auto', 'auto']} />
              <Tooltip
                contentStyle={{ borderRadius: '8px', border: `1px solid ${colors.tooltipBorder}`, backgroundColor: colors.tooltipBg }}
                formatter={(value: any) => [parseFloat(value).toFixed(5), 'CD']}
              />
              <Line type="monotone" dataKey="cd" stroke={colors.drag} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
              <Brush dataKey="alpha" height={20} stroke={colors.drag} fill={isDark ? '#450a0a' : '#fff5f5'} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* L/D Chart */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-xl border border-slate-200 dark:border-slate-800">
          <h3 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-4">Efficiency Gradient (L/D)</h3>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={polar.data} margin={{ top: 5, right: 30, left: 10, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={colors.grid} />
              <XAxis dataKey="alpha" stroke={colors.axis} tick={{ fontSize: 9, fill: colors.text }} />
              <YAxis stroke={colors.axis} tick={{ fontSize: 9, fill: colors.text }} domain={['auto', 'auto']} />
              <Tooltip
                contentStyle={{ borderRadius: '8px', border: `1px solid ${colors.tooltipBorder}`, backgroundColor: colors.tooltipBg }}
                formatter={(value: any) => [parseFloat(value).toFixed(2), 'L/D']}
              />
              <Line type="monotone" dataKey="clcd" stroke={colors.eff} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
              <Brush dataKey="alpha" height={20} stroke={colors.eff} fill={isDark ? '#064e3b' : '#f0fdf4'} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};

export default AirfoilChart;
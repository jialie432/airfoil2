
import React from 'react';
import { SearchFilters as FilterType } from '../types';

interface Props {
  filters: FilterType;
  setFilters: React.Dispatch<React.SetStateAction<FilterType>>;
  onSearch: () => void;
}

const REYNOLDS_PRESETS = [50000, 100000, 200000, 500000, 1000000];

const SearchFilters: React.FC<Props> = ({ filters, setFilters, onSearch }) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFilters(prev => ({
      ...prev,
      [name]: value === '' ? null : parseFloat(value)
    }));
  };

  const handleReynoldsSelect = (value: number) => {
    setFilters(prev => ({
      ...prev,
      reynolds: prev.reynolds === value ? null : value
    }));
  };

  const handleReset = () => {
    setFilters({
      reynolds: null,
      alphaMin: null,
      alphaMax: null,
      clMin: null,
      clMax: null,
      cdMin: null,
      cdMax: null,
      clcdMin: null,
      clcdMax: null
    });
  };

  return (
    <div className="bg-white dark:bg-slate-900 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 transition-colors">
      <div className="flex items-center justify-between mb-8">
        <h2 className="text-sm font-black text-slate-800 dark:text-slate-200 flex items-center gap-2 uppercase tracking-[0.2em]">
          <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"/></svg>
          Filter Parameters
        </h2>
        <button onClick={handleReset} className="text-[10px] font-black text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 uppercase tracking-widest transition-colors">Clear Deck</button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {/* Reynolds Number Selection */}
        <div className="space-y-3 lg:col-span-3">
          <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block">Operational Reynolds (Re)</label>
          <div className="flex flex-wrap gap-2">
            {REYNOLDS_PRESETS.map((re) => (
              <button
                key={re}
                onClick={() => handleReynoldsSelect(re)}
                className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all border ${
                  filters.reynolds === re 
                    ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-500/30' 
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-blue-400 hover:text-blue-600 dark:hover:border-blue-900'
                }`}
              >
                {re >= 1000000 ? `${re / 1000000}M` : `${re / 1000}k`}
              </button>
            ))}
          </div>
        </div>

        {/* Alpha Range */}
        <div className="space-y-2">
          <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block">Alpha Bound (&alpha;)</label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              name="alphaMin"
              value={filters.alphaMin ?? ''}
              onChange={handleChange}
              placeholder="Min"
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all dark:text-white"
            />
            <span className="text-slate-400 text-xs font-black uppercase">to</span>
            <input
              type="number"
              name="alphaMax"
              value={filters.alphaMax ?? ''}
              onChange={handleChange}
              placeholder="Max"
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all dark:text-white"
            />
          </div>
        </div>

        {/* Cl Range */}
        <div className="space-y-2">
          <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block">Cl Limit (Lift)</label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              step="0.01"
              name="clMin"
              value={filters.clMin ?? ''}
              onChange={handleChange}
              placeholder="Min"
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all dark:text-white"
            />
            <span className="text-slate-400 text-xs font-black uppercase">to</span>
            <input
              type="number"
              step="0.01"
              name="clMax"
              value={filters.clMax ?? ''}
              onChange={handleChange}
              placeholder="Max"
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all dark:text-white"
            />
          </div>
        </div>

        {/* Cd Range */}
        <div className="space-y-2">
          <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block">Cd Limit (Drag)</label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              step="0.001"
              name="cdMin"
              value={filters.cdMin ?? ''}
              onChange={handleChange}
              placeholder="Min"
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all dark:text-white"
            />
            <span className="text-slate-400 text-xs font-black uppercase">to</span>
            <input
              type="number"
              step="0.001"
              name="cdMax"
              value={filters.cdMax ?? ''}
              onChange={handleChange}
              placeholder="Max"
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all dark:text-white"
            />
          </div>
        </div>

        {/* Cl/Cd Range */}
        <div className="space-y-2 lg:col-span-3">
          <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block">L/D Efficiency Thresh</label>
          <div className="flex items-center gap-2 max-w-sm">
            <input
              type="number"
              step="0.1"
              name="clcdMin"
              value={filters.clcdMin ?? ''}
              onChange={handleChange}
              placeholder="Min Ratio"
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all dark:text-white"
            />
            <span className="text-slate-400 text-xs font-black uppercase">to</span>
            <input
              type="number"
              step="0.1"
              name="clcdMax"
              value={filters.clcdMax ?? ''}
              onChange={handleChange}
              placeholder="Max Ratio"
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all dark:text-white"
            />
          </div>
        </div>
      </div>

      <div className="mt-10 flex justify-end">
        <button
          onClick={onSearch}
          className="bg-slate-900 dark:bg-blue-600 hover:bg-slate-800 dark:hover:bg-blue-500 text-white font-black py-3 px-12 rounded-xl shadow-xl hover:scale-[1.02] active:scale-95 transition-all flex items-center gap-3 uppercase text-xs tracking-[0.2em]"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
          Commit Search
        </button>
      </div>
    </div>
  );
};

export default SearchFilters;

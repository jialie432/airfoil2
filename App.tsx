import React, { useState, useEffect } from 'react';
import { AirfoilPolar, SearchFilters as FilterType } from './types';
import { searchAirfoils, getAllAirfoils } from './services/airfoilService';
import SearchFilters from './components/SearchFilters';
import AirfoilChart from './components/AirfoilChart';
import AirfoilShape from './components/AirfoilShape';

const App: React.FC = () => {
  const [isDark, setIsDark] = useState(true); // Default to Dark Mode for aviation feel
  const [filters, setFilters] = useState<FilterType>({
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

  const [results, setResults] = useState<AirfoilPolar[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedAirfoil, setSelectedAirfoil] = useState<AirfoilPolar | null>(null);

  // Sync theme with document element
  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  useEffect(() => {
    const loadInitialData = async () => {
      try {
        const all = await getAllAirfoils();
        setResults(all);
        if (all.length > 0) setSelectedAirfoil(all[0]);
      } catch (err) {
        console.error('Error loading initial airfoils:', err);
      }
    };
    
    loadInitialData();
  }, []);

  const handleSearch = async () => {
    setLoading(true);
    try {
      const data = await searchAirfoils(filters);
      setResults(data);
      if (data.length > 0) {
        setSelectedAirfoil(data[0]);
      } else {
        setSelectedAirfoil(null);
      }
    } catch (err) {
      console.error("Search failed", err);
    } finally {
      setLoading(false);
    }
  };

  const toggleTheme = () => setIsDark(!isDark);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#020617] text-slate-900 dark:text-slate-100 flex flex-col transition-colors duration-500">
      {/* HUD Header */}
      <header className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 sticky top-0 z-[100]">
        <div className="max-w-[1600px] mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-2 bg-blue-600 rounded shadow-lg shadow-blue-500/20">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z"/>
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-black tracking-tighter uppercase">Aero<span className="text-blue-600">Dynamics</span>.AI</h1>
              <p className="text-[8px] font-black tracking-[0.4em] text-slate-400 uppercase">Avionics Grade Analysis Tool</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button 
              onClick={toggleTheme}
              className="p-2.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-yellow-400 border border-slate-200 dark:border-slate-700 hover:scale-105 transition-all"
            >
              {isDark ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m12.728 0l-.707-.707M6.343 6.343l-.707-.707M12 5a7 7 0 100 14 7 7 0 000-14z"/></svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"/></svg>
              )}
            </button>
            <div className="h-8 w-[1px] bg-slate-200 dark:bg-slate-800 hidden md:block"></div>
            <div className="hidden md:flex flex-col text-right">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">System Time</span>
              <span className="text-xs font-bold mono">{new Date().toLocaleTimeString([], { hour12: false })} UTC</span>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-grow max-w-[1600px] mx-auto w-full p-6 space-y-6">
        <SearchFilters filters={filters} setFilters={setFilters} onSearch={handleSearch} />

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          {/* Results Selection Sidebar */}
          <div className="xl:col-span-3">
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
              <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20 flex items-center justify-between">
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Target Index</span>
                <span className="text-[10px] font-black bg-blue-600 text-white px-2 py-0.5 rounded">{results.length} Airfoils</span>
              </div>
              <div className="max-h-[700px] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                {results.map((polar) => (
                  <button
                    key={polar.polarKey}
                    onClick={() => setSelectedAirfoil(polar)}
                    className={`w-full text-left p-5 transition-all group relative ${selectedAirfoil?.polarKey === polar.polarKey ? 'bg-blue-50/40 dark:bg-blue-900/20' : 'hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                  >
                    {selectedAirfoil?.polarKey === polar.polarKey && (
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-600"></div>
                    )}
                    <div className="flex justify-between items-start mb-2">
                      <span className={`text-sm font-black tracking-tight ${selectedAirfoil?.polarKey === polar.polarKey ? 'text-blue-600 dark:text-blue-400' : 'text-slate-700 dark:text-slate-300'}`}>
                        {polar.airfoilName.toUpperCase()}
                      </span>
                      <span className="text-[10px] font-bold text-slate-400 mono">Re {polar.reynolds / 1000}k</span>
                    </div>
                    <div className="flex gap-2">
                      <div className="text-[9px] font-black text-slate-400 uppercase tracking-tighter bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-200/50 dark:border-slate-700">L/D {polar.maxClCd.toFixed(1)}</div>
                      <div className="text-[9px] font-black text-slate-400 uppercase tracking-tighter bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-200/50 dark:border-slate-700">NC {polar.ncrit}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Main Content Area */}
          <div className="xl:col-span-9">
            {selectedAirfoil ? (
              <div className="space-y-6 animate-in fade-in zoom-in-95 duration-500">
                {/* Profile Summary HUD */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-8 shadow-sm">
                  <div className="flex flex-col md:flex-row justify-between items-start gap-4 mb-8">
                    <div>
                      <div className="flex items-center gap-3 mb-2">
                        <span className="px-2 py-0.5 bg-blue-600 text-white rounded-[4px] text-[10px] font-black uppercase tracking-[0.2em]">Live Analysis</span>
                        <span className="text-[10px] text-slate-400 font-bold tracking-widest uppercase">ID: {selectedAirfoil.polarKey}</span>
                      </div>
                      <h2 className="text-5xl font-black tracking-tighter text-slate-900 dark:text-white">{selectedAirfoil.airfoilName}</h2>
                    </div>
                    <div className="flex flex-col items-end">
                      <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">Operating Status</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-emerald-500 font-black text-xs uppercase tracking-widest">Nominal</span>
                        <div className="w-3 h-3 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]"></div>
                      </div>
                    </div>
                  </div>

                  {/* Avionics Grid Sensors */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                    {[
                      { label: 'Reynolds Number', value: selectedAirfoil.reynolds.toLocaleString(), sub: 'Re' },
                      { label: 'Max L/D Ratio', value: selectedAirfoil.maxClCd.toFixed(4), sub: 'Efficiency' },
                      { label: 'Critical Alpha', value: `${selectedAirfoil.maxClCdAlpha.toFixed(2)}°`, sub: 'Peak AOA' },
                      { label: 'Mach Profile', value: selectedAirfoil.mach.toFixed(2), sub: 'Velocity' }
                    ].map((sensor, i) => (
                      <div key={i} className="p-5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
                        <p className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">{sensor.label}</p>
                        <p className="text-2xl font-black text-slate-900 dark:text-blue-400 mono">{sensor.value}</p>
                        <p className="text-[8px] font-black text-blue-500 uppercase mt-1 tracking-widest">{sensor.sub}</p>
                      </div>
                    ))}
                  </div>

                  {/* Airfoil Shape SVG */}
                  <div className="mb-8">
                    <AirfoilShape 
                      airfoilName={selectedAirfoil.airfoilName} 
                      isDark={isDark}
                      width={800}
                      height={400}
                    />
                  </div>

                  <AirfoilChart polar={selectedAirfoil} isDark={isDark} />
                </div>

                {/* Technical Log Table */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20">
                    <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Static Polar Log (XFOIL Data)</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead className="text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 bg-slate-50/50 dark:bg-slate-800/30 border-b border-slate-100 dark:border-slate-800">
                        <tr>
                          <th className="px-6 py-4">Alpha</th>
                          <th className="px-6 py-4 text-blue-500">Cl (Lift)</th>
                          <th className="px-6 py-4 text-rose-500">Cd (Drag)</th>
                          <th className="px-6 py-4 text-emerald-500">Efficiency</th>
                          <th className="px-6 py-4">Moment</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs mono">
                        {selectedAirfoil.data.map((pt, idx) => (
                          <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                            <td className="px-6 py-3 font-bold">{pt.alpha.toFixed(3)}°</td>
                            <td className="px-6 py-3 text-blue-500 font-bold">{pt.cl.toFixed(4)}</td>
                            <td className="px-6 py-3 text-rose-500/80">{pt.cd.toFixed(5)}</td>
                            <td className="px-6 py-3 text-emerald-500 font-black">{pt.clcd.toFixed(2)}</td>
                            <td className="px-6 py-3 text-slate-400">{pt.cm.toFixed(4)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-full min-h-[500px] flex flex-col items-center justify-center bg-white dark:bg-slate-900 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-800 p-12 text-center">
                 <div className="w-20 h-20 bg-blue-50 dark:bg-blue-900/20 rounded-full flex items-center justify-center mb-6">
                    <svg className="w-10 h-10 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"/></svg>
                 </div>
                 <h3 className="text-xl font-black uppercase tracking-widest text-slate-800 dark:text-slate-200">System Ready</h3>
                 <p className="text-slate-400 dark:text-slate-500 mt-2 max-w-sm text-sm font-medium">Please initiate search parameters to load aerodynamic profiles into the HUD.</p>
              </div>
            )}
          </div>
        </div>
      </main>

      <footer className="py-12 px-8 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-[#020617] transition-colors">
        <div className="max-w-[1600px] mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
           <div className="flex items-center gap-3">
              <span className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-400">© 2024 AeroLabs Instrument Systems</span>
           </div>
           <div className="flex gap-8">
              {['Safety Protocols', 'V2.14.0', 'Gnd Status: Online'].map((tag, i) => (
                <span key={i} className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500 dark:text-slate-600 cursor-pointer hover:text-blue-500 transition-colors">
                  {tag}
                </span>
              ))}
           </div>
        </div>
      </footer>

      {loading && (
        <div className="fixed inset-0 bg-slate-900/40 dark:bg-slate-950/80 backdrop-blur-md z-[200] flex items-center justify-center animate-in fade-in duration-300">
           <div className="bg-white dark:bg-slate-900 p-10 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col items-center">
              <div className="w-16 h-16 relative">
                <div className="absolute inset-0 border-4 border-blue-600/20 rounded-full"></div>
                <div className="absolute inset-0 border-4 border-t-blue-600 rounded-full animate-spin"></div>
              </div>
              <p className="mt-6 text-[11px] font-black text-slate-800 dark:text-white uppercase tracking-[0.3em] animate-pulse">Scanning Airfoil Database</p>
           </div>
        </div>
      )}
    </div>
  );
};

export default App;
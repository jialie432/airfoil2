import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabaseClient';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PolarMeta {
  id: number;
  airfoil_name: string;
  reynolds: number;
}

interface DataPoint {
  alpha: number;
  cl: number;
  cd: number;
}

interface LiftDragResult {
  cl: number;
  cd: number;
  lift: number;   // Newtons
  drag: number;   // Newtons
}

// ─── Constants ────────────────────────────────────────────────────────────────

const REYNOLDS_OPTIONS = [50000, 100000, 200000, 500000, 1000000];
const AIR_DENSITY_SEA_LEVEL = 1.225; // kg/m³

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatReynolds(re: number): string {
  return re >= 1_000_000 ? `${re / 1_000_000}M` : `${re / 1000}k`;
}

function interpolateCl(dataPoints: DataPoint[], alpha: number): { cl: number; cd: number } | null {
  if (dataPoints.length === 0) return null;

  // Sort by alpha just in case
  const sorted = [...dataPoints].sort((a, b) => a.alpha - b.alpha);

  // Exact match
  const exact = sorted.find(p => Math.abs(p.alpha - alpha) < 1e-6);
  if (exact) return { cl: exact.cl, cd: exact.cd };

  // Find surrounding points for linear interpolation
  for (let i = 0; i < sorted.length - 1; i++) {
    if (sorted[i].alpha <= alpha && sorted[i + 1].alpha >= alpha) {
      const t = (alpha - sorted[i].alpha) / (sorted[i + 1].alpha - sorted[i].alpha);
      return {
        cl: sorted[i].cl + t * (sorted[i + 1].cl - sorted[i].cl),
        cd: sorted[i].cd + t * (sorted[i + 1].cd - sorted[i].cd),
      };
    }
  }

  // Out of range — clamp to nearest
  if (alpha < sorted[0].alpha) return { cl: sorted[0].cl, cd: sorted[0].cd };
  return { cl: sorted[sorted.length - 1].cl, cd: sorted[sorted.length - 1].cd };
}

// ─── Component ────────────────────────────────────────────────────────────────

const LiftDragCalculator: React.FC<{ isDark: boolean }> = ({ isDark }) => {
  // ── Selector state
  const [selectedReynolds, setSelectedReynolds] = useState<number | null>(null);
  const [airfoilOptions, setAirfoilOptions] = useState<string[]>([]);
  const [selectedAirfoil, setSelectedAirfoil] = useState<string>('');
  const [alphaOptions, setAlphaOptions] = useState<number[]>([]);
  const [selectedAlpha, setSelectedAlpha] = useState<number | null>(null);

  // ── DB lookup result (Cl/Cd)
  const [lookupResult, setLookupResult] = useState<{ cl: number; cd: number } | null>(null);

  // ── Physical inputs
  const [airSpeed, setAirSpeed] = useState<string>('');          // m/s
  const [chordLength, setChordLength] = useState<string>('10');  // m
  const [wingSpan, setWingSpan] = useState<string>('');          // m

  // ── Computed
  const [result, setResult] = useState<LiftDragResult | null>(null);

  // ── Loading
  const [loadingAirfoils, setLoadingAirfoils] = useState(false);
  const [loadingAlphas, setLoadingAlphas] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ─── Step 1: Load airfoil names for the selected Reynolds number ────────────
  useEffect(() => {
    if (selectedReynolds === null) {
      setAirfoilOptions([]);
      setSelectedAirfoil('');
      setAlphaOptions([]);
      setSelectedAlpha(null);
      setLookupResult(null);
      setResult(null);
      return;
    }

    setLoadingAirfoils(true);
    setError(null);

    supabase
      .from('airfoil_polars_metadata')
      .select('airfoil_name')
      .eq('reynolds', selectedReynolds)
      .order('airfoil_name', { ascending: true })
      .then(({ data, error: err }) => {
        setLoadingAirfoils(false);
        if (err) {
          setError('Failed to load airfoil list.');
          return;
        }
        const names = [...new Set((data || []).map((r: { airfoil_name: string }) => r.airfoil_name))];
        setAirfoilOptions(names);
        setSelectedAirfoil('');
        setAlphaOptions([]);
        setSelectedAlpha(null);
        setLookupResult(null);
        setResult(null);
      });
  }, [selectedReynolds]);

  // ─── Step 2: Load alpha values for selected airfoil + Reynolds ─────────────
  const loadAlphas = useCallback(async (airfoil: string, reynolds: number) => {
    setLoadingAlphas(true);
    setError(null);
    setAlphaOptions([]);
    setSelectedAlpha(null);
    setLookupResult(null);
    setResult(null);

    // Get the polar metadata id
    const { data: metaData, error: metaErr } = await supabase
      .from('airfoil_polars_metadata')
      .select('id')
      .eq('airfoil_name', airfoil)
      .eq('reynolds', reynolds)
      .limit(1)
      .single();

    if (metaErr || !metaData) {
      setLoadingAlphas(false);
      setError('Failed to load polar metadata.');
      return;
    }

    const { data: dpData, error: dpErr } = await supabase
      .from('airfoil_polar_data_points')
      .select('alpha')
      .eq('polar_metadata_id', (metaData as PolarMeta).id)
      .order('alpha', { ascending: true });

    setLoadingAlphas(false);
    if (dpErr || !dpData) {
      setError('Failed to load alpha values.');
      return;
    }

    const alphas = (dpData as { alpha: number }[]).map(r => r.alpha);
    setAlphaOptions(alphas);
  }, []);

  useEffect(() => {
    if (selectedAirfoil && selectedReynolds !== null) {
      loadAlphas(selectedAirfoil, selectedReynolds);
    }
  }, [selectedAirfoil, selectedReynolds, loadAlphas]);

  // ─── Step 3: Fetch Cl & Cd when alpha is selected ──────────────────────────
  useEffect(() => {
    if (selectedAlpha === null || !selectedAirfoil || selectedReynolds === null) {
      setLookupResult(null);
      setResult(null);
      return;
    }

    (async () => {
      const { data: metaData } = await supabase
        .from('airfoil_polars_metadata')
        .select('id')
        .eq('airfoil_name', selectedAirfoil)
        .eq('reynolds', selectedReynolds)
        .limit(1)
        .single();

      if (!metaData) return;

      const { data: dpData } = await supabase
        .from('airfoil_polar_data_points')
        .select('alpha, cl, cd')
        .eq('polar_metadata_id', (metaData as PolarMeta).id)
        .order('alpha', { ascending: true });

      if (!dpData) return;

      const interp = interpolateCl(dpData as DataPoint[], selectedAlpha);
      setLookupResult(interp);
      setResult(null); // Reset computed result when selection changes
    })();
  }, [selectedAlpha, selectedAirfoil, selectedReynolds]);

  // ─── Calculate Lift & Drag ─────────────────────────────────────────────────
  const handleCalculate = () => {
    if (!lookupResult) return;

    const v = parseFloat(airSpeed);
    const c = parseFloat(chordLength);
    const b = parseFloat(wingSpan);

    if (isNaN(v) || v <= 0) { setError('Please enter a valid positive air speed.'); return; }
    if (isNaN(c) || c <= 0) { setError('Please enter a valid positive chord length.'); return; }
    if (isNaN(b) || b <= 0) { setError('Please enter a valid positive wing span.'); return; }

    setError(null);
    setCalculating(true);

    setTimeout(() => {
      const wingArea = c * b; // m²
      const q = 0.5 * AIR_DENSITY_SEA_LEVEL * v * v; // dynamic pressure, Pa

      const lift = lookupResult.cl * q * wingArea;
      const drag = lookupResult.cd * q * wingArea;

      setResult({
        cl: lookupResult.cl,
        cd: lookupResult.cd,
        lift,
        drag,
      });
      setCalculating(false);
    }, 400); // slight delay for UX animation
  };

  const handleReset = () => {
    setSelectedReynolds(null);
    setSelectedAirfoil('');
    setAlphaOptions([]);
    setSelectedAlpha(null);
    setLookupResult(null);
    setAirSpeed('');
    setChordLength('10');
    setWingSpan('');
    setResult(null);
    setError(null);
  };

  const inputClass =
    'w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all dark:text-white font-mono placeholder:font-sans placeholder:text-slate-400';

  const sectionLabel = 'text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block mb-3';

  // ─── Render ────────────────────────────────────────────────────────────────

  const stepActive   = 'bg-blue-600 text-white shadow-lg shadow-blue-500/30';
  const stepInactive = 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500';

  const isStep2Active = selectedReynolds !== null;
  const isStep3Active = isStep2Active && !!selectedAirfoil;
  const isStep4Active = isStep3Active && selectedAlpha !== null;
  const canCalculate  = isStep4Active && !!lookupResult && airSpeed !== '' && wingSpan !== '';

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Page Header */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-8 shadow-sm">
        <div className="flex flex-col md:flex-row justify-between items-start gap-4 mb-2">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span className="px-2 py-0.5 bg-emerald-600 text-white rounded-[4px] text-[10px] font-black uppercase tracking-[0.2em]">
                Calculator
              </span>
              <span className="text-[10px] text-slate-400 font-bold tracking-widest uppercase">
                Wing Force Analysis
              </span>
            </div>
            <h2 className="text-4xl font-black tracking-tighter text-slate-900 dark:text-white">
              Lift &amp; Drag <span className="text-emerald-500">Calculator</span>
            </h2>
            <p className="text-slate-400 dark:text-slate-500 text-sm mt-2 font-medium max-w-xl">
              Select an airfoil polar from the database, input your flight parameters, and compute real aerodynamic forces using the standard lift &amp; drag equations.
            </p>
          </div>
          <div className="flex flex-col items-end">
            <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">
              Equations Used
            </p>
            <div className="mt-2 text-right space-y-1">
              <p className="font-mono text-xs text-emerald-500 font-bold">L = Cl · ½ρV² · S</p>
              <p className="font-mono text-xs text-rose-400 font-bold">D = Cd · ½ρV² · S</p>
            </div>
          </div>
        </div>
      </div>

      {/* Steps + Inputs */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">

        {/* Left Column: Steps 1–3 */}
        <div className="xl:col-span-5 space-y-6">

          {/* Step 1: Reynolds Number */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-6">
              <span className={`w-7 h-7 rounded-full text-xs font-black flex items-center justify-center ${stepActive}`}>1</span>
              <span className="text-sm font-black uppercase tracking-widest text-slate-700 dark:text-slate-300">
                Reynolds Number
              </span>
            </div>
            <label className={sectionLabel}>Select Reynolds (Re)</label>
            <div className="flex flex-wrap gap-2">
              {REYNOLDS_OPTIONS.map(re => (
                <button
                  key={re}
                  onClick={() => setSelectedReynolds(prev => prev === re ? null : re)}
                  className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all border ${
                    selectedReynolds === re
                      ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-500/30'
                      : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-blue-400 hover:text-blue-600'
                  }`}
                >
                  {formatReynolds(re)}
                </button>
              ))}
            </div>
          </div>

          {/* Step 2: Airfoil Name */}
          <div className={`bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm transition-opacity duration-300 ${!isStep2Active ? 'opacity-40 pointer-events-none' : ''}`}>
            <div className="flex items-center gap-3 mb-6">
              <span className={`w-7 h-7 rounded-full text-xs font-black flex items-center justify-center ${isStep2Active ? stepActive : stepInactive}`}>2</span>
              <span className="text-sm font-black uppercase tracking-widest text-slate-700 dark:text-slate-300">
                Airfoil Name
              </span>
              {loadingAirfoils && (
                <div className="w-4 h-4 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin ml-auto" />
              )}
            </div>
            <label className={sectionLabel}>
              Select Airfoil &mdash; {airfoilOptions.length} available
            </label>
            <select
              value={selectedAirfoil}
              onChange={e => setSelectedAirfoil(e.target.value)}
              disabled={!isStep2Active || loadingAirfoils}
              className={inputClass + ' cursor-pointer'}
            >
              <option value="">-- Choose an airfoil --</option>
              {airfoilOptions.map(name => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>

          {/* Step 3: Angle of Attack (Alpha) */}
          <div className={`bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm transition-opacity duration-300 ${!isStep3Active ? 'opacity-40 pointer-events-none' : ''}`}>
            <div className="flex items-center gap-3 mb-6">
              <span className={`w-7 h-7 rounded-full text-xs font-black flex items-center justify-center ${isStep3Active ? stepActive : stepInactive}`}>3</span>
              <span className="text-sm font-black uppercase tracking-widest text-slate-700 dark:text-slate-300">
                Angle of Attack (α)
              </span>
              {loadingAlphas && (
                <div className="w-4 h-4 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin ml-auto" />
              )}
            </div>
            <label className={sectionLabel}>
              Select Alpha — {alphaOptions.length} data points
            </label>
            <select
              value={selectedAlpha ?? ''}
              onChange={e => setSelectedAlpha(e.target.value === '' ? null : parseFloat(e.target.value))}
              disabled={!isStep3Active || loadingAlphas || alphaOptions.length === 0}
              className={inputClass + ' cursor-pointer'}
            >
              <option value="">-- Choose alpha (°) --</option>
              {alphaOptions.map(a => (
                <option key={a} value={a}>{a.toFixed(3)}°</option>
              ))}
            </select>
          </div>
        </div>

        {/* Right Column: Steps 4–5 + Results */}
        <div className="xl:col-span-7 space-y-6">

          {/* Cl / Cd from DB */}
          <div className={`bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm transition-opacity duration-300 ${!isStep4Active ? 'opacity-40' : ''}`}>
            <div className="flex items-center gap-3 mb-6">
              <span className={`w-7 h-7 rounded-full text-xs font-black flex items-center justify-center ${isStep4Active ? stepActive : stepInactive}`}>4</span>
              <span className="text-sm font-black uppercase tracking-widest text-slate-700 dark:text-slate-300">
                Aerodynamic Coefficients (from Database)
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="p-5 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800">
                <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest mb-1">Lift Coefficient</p>
                <p className="text-3xl font-black text-blue-600 dark:text-blue-400 mono">
                  {lookupResult ? lookupResult.cl.toFixed(4) : '—'}
                </p>
                <p className="text-[9px] font-black text-blue-400 uppercase mt-1 tracking-widest">Cl</p>
              </div>
              <div className="p-5 rounded-xl bg-rose-50 dark:bg-rose-900/20 border border-rose-100 dark:border-rose-800">
                <p className="text-[9px] font-black text-rose-400 uppercase tracking-widest mb-1">Drag Coefficient</p>
                <p className="text-3xl font-black text-rose-500 dark:text-rose-400 mono">
                  {lookupResult ? lookupResult.cd.toFixed(5) : '—'}
                </p>
                <p className="text-[9px] font-black text-rose-400 uppercase mt-1 tracking-widest">Cd</p>
              </div>
            </div>
          </div>

          {/* Step 5: Physical Inputs */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <span className={`w-7 h-7 rounded-full text-xs font-black flex items-center justify-center ${stepActive}`}>5</span>
                <span className="text-sm font-black uppercase tracking-widest text-slate-700 dark:text-slate-300">
                  Flight Parameters
                </span>
              </div>
              <button
                onClick={handleReset}
                className="text-[10px] font-black text-slate-400 hover:text-rose-500 uppercase tracking-widest transition-colors"
              >
                Reset All
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {/* Air Speed */}
              <div className="space-y-2">
                <label className={sectionLabel}>
                  Air Speed (V)
                  <span className="block text-[9px] font-normal normal-case tracking-normal text-slate-500 mt-0.5">meters / second</span>
                </label>
                <div className="relative">
                  <input
                    id="ld-airspeed"
                    type="number"
                    min="0"
                    step="0.1"
                    value={airSpeed}
                    onChange={e => setAirSpeed(e.target.value)}
                    placeholder="e.g., 60"
                    className={inputClass}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-400 uppercase">m/s</span>
                </div>
              </div>

              {/* Chord Length */}
              <div className="space-y-2">
                <label className={sectionLabel}>
                  Chord Length (c)
                  <span className="block text-[9px] font-normal normal-case tracking-normal text-slate-500 mt-0.5">default: 10 m</span>
                </label>
                <div className="relative">
                  <input
                    id="ld-chord"
                    type="number"
                    min="0.01"
                    step="0.1"
                    value={chordLength}
                    onChange={e => setChordLength(e.target.value)}
                    placeholder="10"
                    className={inputClass}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-400 uppercase">m</span>
                </div>
              </div>

              {/* Wing Span */}
              <div className="space-y-2">
                <label className={sectionLabel}>
                  Wing Span (b)
                  <span className="block text-[9px] font-normal normal-case tracking-normal text-slate-500 mt-0.5">meters</span>
                </label>
                <div className="relative">
                  <input
                    id="ld-wingspan"
                    type="number"
                    min="0.01"
                    step="0.1"
                    value={wingSpan}
                    onChange={e => setWingSpan(e.target.value)}
                    placeholder="e.g., 15"
                    className={inputClass}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-400 uppercase">m</span>
                </div>
              </div>
            </div>

            {/* Info bar */}
            <div className="mt-4 px-4 py-3 bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 rounded-lg flex flex-wrap gap-x-6 gap-y-1">
              <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">
                Air Density (ρ): <span className="text-blue-500">{AIR_DENSITY_SEA_LEVEL} kg/m³</span> (sea level ISA)
              </span>
              {airSpeed && chordLength && wingSpan && (
                <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">
                  Wing Area (S): <span className="text-emerald-500">
                    {(parseFloat(chordLength) * parseFloat(wingSpan)).toFixed(2)} m²
                  </span>
                </span>
              )}
              {airSpeed && (
                <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">
                  Dyn. Pressure (q): <span className="text-violet-500">
                    {(0.5 * AIR_DENSITY_SEA_LEVEL * Math.pow(parseFloat(airSpeed) || 0, 2)).toFixed(1)} Pa
                  </span>
                </span>
              )}
            </div>

            {/* Error */}
            {error && (
              <div className="mt-4 px-4 py-3 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-lg">
                <p className="text-xs text-rose-600 dark:text-rose-400 font-bold">{error}</p>
              </div>
            )}

            {/* Calculate button */}
            <div className="mt-6 flex justify-end">
              <button
                id="ld-calculate-btn"
                onClick={handleCalculate}
                disabled={!canCalculate || calculating}
                className={`flex items-center gap-3 px-10 py-3 rounded-xl font-black text-xs uppercase tracking-[0.2em] shadow-xl transition-all ${
                  canCalculate && !calculating
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white hover:scale-[1.02] active:scale-95 shadow-emerald-500/30'
                    : 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
                }`}
              >
                {calculating ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Computing…
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5"
                        d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 11h.01M12 11h.01M15 11h.01M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
                    </svg>
                    Calculate Forces
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Results Panel */}
          {result && (
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-emerald-200 dark:border-emerald-900 p-6 shadow-lg shadow-emerald-500/10 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.6)]" />
                  <span className="text-sm font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
                    Force Computation Complete
                  </span>
                </div>
                <span className="px-2 py-0.5 bg-emerald-600 text-white rounded-[4px] text-[10px] font-black uppercase tracking-[0.2em]">
                  Result
                </span>
              </div>

              {/* Summary line */}
              <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 rounded-lg mb-6 text-[10px] font-black uppercase tracking-widest text-slate-400 flex flex-wrap gap-x-6 gap-y-1">
                <span>
                  Airfoil: <span className="text-blue-500">{selectedAirfoil}</span>
                </span>
                <span>
                  Re: <span className="text-blue-500">{selectedReynolds ? formatReynolds(selectedReynolds) : '—'}</span>
                </span>
                <span>
                  α: <span className="text-blue-500">{selectedAlpha?.toFixed(3)}°</span>
                </span>
                <span>
                  V: <span className="text-blue-500">{airSpeed} m/s</span>
                </span>
                <span>
                  c: <span className="text-blue-500">{chordLength} m</span>
                </span>
                <span>
                  b: <span className="text-blue-500">{wingSpan} m</span>
                </span>
              </div>

              <div className="grid grid-cols-2 gap-5">
                {/* Lift */}
                <div className="p-6 rounded-xl bg-gradient-to-br from-blue-500/10 to-blue-600/5 border border-blue-200 dark:border-blue-800 relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent pointer-events-none" />
                  <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest mb-2">Total Lift Force</p>
                  <p className="text-4xl font-black text-blue-600 dark:text-blue-400 mono leading-none">
                    {result.lift >= 1000
                      ? `${(result.lift / 1000).toFixed(2)} kN`
                      : `${result.lift.toFixed(1)} N`
                    }
                  </p>
                  <p className="text-[9px] font-black text-blue-400 uppercase mt-2 tracking-widest">
                    L = Cl · q · S&nbsp;&nbsp;·&nbsp;&nbsp;Cl = {result.cl.toFixed(4)}
                  </p>
                  <div className="mt-4 flex items-center gap-1">
                    <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 10l7-7m0 0l7 7m-7-7v18" />
                    </svg>
                    <span className="text-xs text-blue-500 font-bold">Upward Force</span>
                  </div>
                </div>

                {/* Drag */}
                <div className="p-6 rounded-xl bg-gradient-to-br from-rose-500/10 to-rose-600/5 border border-rose-200 dark:border-rose-800 relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-br from-rose-500/5 to-transparent pointer-events-none" />
                  <p className="text-[9px] font-black text-rose-400 uppercase tracking-widest mb-2">Total Drag Force</p>
                  <p className="text-4xl font-black text-rose-500 dark:text-rose-400 mono leading-none">
                    {result.drag >= 1000
                      ? `${(result.drag / 1000).toFixed(2)} kN`
                      : `${result.drag.toFixed(1)} N`
                    }
                  </p>
                  <p className="text-[9px] font-black text-rose-400 uppercase mt-2 tracking-widest">
                    D = Cd · q · S&nbsp;&nbsp;·&nbsp;&nbsp;Cd = {result.cd.toFixed(5)}
                  </p>
                  <div className="mt-4 flex items-center gap-1">
                    <svg className="w-4 h-4 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                    </svg>
                    <span className="text-xs text-rose-500 font-bold">Rearward Force</span>
                  </div>
                </div>
              </div>

              {/* L/D Ratio + other derived stats */}
              <div className="mt-5 grid grid-cols-3 gap-4">
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 text-center">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">L/D Ratio</p>
                  <p className="text-2xl font-black text-emerald-500 mono">{(result.lift / result.drag).toFixed(2)}</p>
                  <p className="text-[8px] font-black text-slate-400 uppercase mt-1">Efficiency</p>
                </div>
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 text-center">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Wing Area</p>
                  <p className="text-2xl font-black text-violet-500 mono">
                    {(parseFloat(chordLength) * parseFloat(wingSpan)).toFixed(2)} m²
                  </p>
                  <p className="text-[8px] font-black text-slate-400 uppercase mt-1">c × b</p>
                </div>
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 text-center">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Dyn. Pressure</p>
                  <p className="text-2xl font-black text-amber-500 mono">
                    {(0.5 * AIR_DENSITY_SEA_LEVEL * Math.pow(parseFloat(airSpeed), 2)).toFixed(1)} Pa
                  </p>
                  <p className="text-[8px] font-black text-slate-400 uppercase mt-1">½ρV²</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default LiftDragCalculator;

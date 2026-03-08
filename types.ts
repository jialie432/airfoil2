
export interface PolarDataPoint {
  alpha: number;
  cl: number;
  cd: number;
  cdp: number;
  cm: number;
  topXtr: number;
  botXtr: number;
  clcd: number;
}

export interface AirfoilPolar {
  polarKey: string;
  airfoilName: string;
  reynolds: number;
  ncrit: number;
  mach: number;
  maxClCd: number;
  maxClCdAlpha: number;
  url: string;
  data: PolarDataPoint[];
}

export interface SearchFilters {
  reynolds: number | null;
  minCl: number | null; // Minimum Cl threshold - only return airfoils with max_cl > minCl
  minThickness: number | null; // Minimum max-thickness - only return airfoils with max_thickness >= minThickness (as % chord, e.g. 0.12 = 12%)
  sortBy: 'cl' | 'cd' | 'clcd' | null; // Sort by Cl, Cd, or L/D (Cl/Cd)
  sortOrder: 'asc' | 'desc'; // Ascending or Descending
}

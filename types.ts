
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
  alphaMin: number | null;
  alphaMax: number | null;
  clMin: number | null;
  clMax: number | null;
  cdMin: number | null;
  cdMax: number | null;
  clcdMin: number | null;
  clcdMax: number | null;
}

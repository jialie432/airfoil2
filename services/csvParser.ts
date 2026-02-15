
import { AirfoilPolar, PolarDataPoint } from '../types';

export function parseXfoilCSV(csv: string): AirfoilPolar {
  const lines = csv.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  
  const metadata: Partial<AirfoilPolar> = {};
  let dataStartIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('Polar key,')) metadata.polarKey = line.split(',')[1];
    if (line.startsWith('Airfoil,')) metadata.airfoilName = line.split(',')[1];
    if (line.startsWith('Reynolds number,')) metadata.reynolds = parseFloat(line.split(',')[1]);
    if (line.startsWith('Ncrit,')) metadata.ncrit = parseFloat(line.split(',')[1]);
    if (line.startsWith('Mach,')) metadata.mach = parseFloat(line.split(',')[1]);
    if (line.startsWith('Max Cl/Cd,')) metadata.maxClCd = parseFloat(line.split(',')[1]);
    if (line.startsWith('Max Cl/Cd alpha,')) metadata.maxClCdAlpha = parseFloat(line.split(',')[1]);
    if (line.startsWith('Url,')) metadata.url = line.split(',')[1];

    if (line.startsWith('Alpha,Cl,Cd,Cdp,Cm')) {
      dataStartIndex = i + 1;
      break;
    }
  }

  const data: PolarDataPoint[] = [];
  if (dataStartIndex !== -1) {
    for (let i = dataStartIndex; i < lines.length; i++) {
      const parts = lines[i].split(',').map(parseFloat);
      if (parts.length >= 3) {
        const cl = parts[1];
        const cd = parts[2];
        data.push({
          alpha: parts[0],
          cl: cl,
          cd: cd,
          cdp: parts[3],
          cm: parts[4],
          topXtr: parts[5],
          botXtr: parts[6],
          clcd: cd !== 0 ? cl / cd : 0
        });
      }
    }
  }

  return {
    polarKey: metadata.polarKey || '',
    airfoilName: metadata.airfoilName || '',
    reynolds: metadata.reynolds || 0,
    ncrit: metadata.ncrit || 0,
    mach: metadata.mach || 0,
    maxClCd: metadata.maxClCd || 0,
    maxClCdAlpha: metadata.maxClCdAlpha || 0,
    url: metadata.url || '',
    data
  };
}

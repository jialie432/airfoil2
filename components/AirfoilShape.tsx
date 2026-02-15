import React, { useEffect, useState } from 'react';
import { supabase } from '../services/supabaseClient';

interface Coordinate {
  x: number;
  y: number;
}

interface CoordinateMetadata {
  point_count: number;
  min_x: number;
  max_x: number;
  min_y: number;
  max_y: number;
  chord_length: number;
  max_thickness: number;
}

interface Props {
  airfoilName: string;
  isDark?: boolean;
  width?: number;
  height?: number;
}

const AirfoilShape: React.FC<Props> = ({
  airfoilName,
  isDark = false,
  width = 600,
  height = 300
}) => {
  const [coordinates, setCoordinates] = useState<Coordinate[]>([]);
  const [metadata, setMetadata] = useState<CoordinateMetadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchCoordinates = async () => {
      setLoading(true);
      setError(null);

      try {
        // Fetch metadata first
        const { data: metadataData, error: metadataError } = await supabase
          .from('airfoil_coordinates_metadata')
          .select('point_count, min_x, max_x, min_y, max_y, chord_length, max_thickness')
          .eq('airfoil_name', airfoilName)
          .single();

        if (metadataError) {
          console.error('Error fetching metadata:', metadataError);
          throw new Error('Airfoil metadata not found in database');
        }

        setMetadata(metadataData as CoordinateMetadata);

        // Fetch coordinates using the full airfoil name (not basename)
        const { data: coordinatesData, error: coordinatesError } = await supabase
          .from('airfoil_coordinates')
          .select('x, y, point_order')
          .eq('airfoil_name', airfoilName)
          .order('point_order', { ascending: true });

        if (coordinatesError) {
          console.error('Error fetching coordinates:', coordinatesError);
          throw new Error('Airfoil coordinates not found in database');
        }

        if (!coordinatesData || coordinatesData.length === 0) {
          throw new Error('No coordinate data available for this airfoil');
        }

        // Convert to Coordinate format
        const coords: Coordinate[] = coordinatesData.map((point: any) => ({
          x: parseFloat(point.x),
          y: parseFloat(point.y)
        }));

        setCoordinates(coords);
      } catch (err) {
        console.error('Error fetching airfoil coordinates:', err);
        setError(err instanceof Error ? err.message : 'Failed to load coordinates');
      } finally {
        setLoading(false);
      }
    };

    if (airfoilName) {
      fetchCoordinates();
    }
  }, [airfoilName]);

  // Calculate bounds and scale for SVG
  const calculateBounds = (coords: Coordinate[]) => {
    if (coords.length === 0) return { minX: 0, maxX: 1, minY: 0, maxY: 1 };

    const xs = coords.map(c => c.x);
    const ys = coords.map(c => c.y);

    return {
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minY: Math.min(...ys),
      maxY: Math.max(...ys)
    };
  };

  const bounds = calculateBounds(coordinates);
  const rangeX = bounds.maxX - bounds.minX || 1;
  const rangeY = bounds.maxY - bounds.minY || 1;

  // Add padding (10% of the larger dimension)
  const padding = Math.max(rangeX, rangeY) * 0.1;
  const viewBoxX = bounds.minX - padding;
  const viewBoxY = -(bounds.maxY + padding); // Flip Y axis (SVG has Y down, airfoil coords have Y up)
  const viewBoxWidth = rangeX + padding * 2;
  const viewBoxHeight = rangeY + padding * 2;

  // Convert coordinates to SVG path
  // Selig format: typically upper surface (TE->LE) then lower surface (LE->TE)
  const createPath = (coords: Coordinate[]) => {
    if (coords.length === 0) return '';

    // Find the leading edge (minimum x coordinate)
    const leadingEdgeIndex = coords.reduce((minIdx, coord, idx) =>
      coord.x < coords[minIdx].x ? idx : minIdx, 0
    );

    // Selig format: coordinates are usually ordered upper surface first, then lower
    // Upper surface: from trailing edge (x=1) to leading edge (x=0)
    // Lower surface: from leading edge (x=0) to trailing edge (x=1)

    // Check if coordinates are in Selig format (first point has x near 1, last point has x near 1)
    const firstX = coords[0].x;
    const lastX = coords[coords.length - 1].x;
    const isSeligFormat = (firstX > 0.9 && lastX > 0.9) || (firstX < 0.1 && lastX < 0.1);

    let pathParts: string[] = [];

    if (isSeligFormat && leadingEdgeIndex > 0 && leadingEdgeIndex < coords.length - 1) {
      // Standard Selig format: upper surface then lower surface
      // Upper: coords[0] to coords[leadingEdgeIndex] (TE->LE)
      // Lower: coords[leadingEdgeIndex] to coords[last] (LE->TE)

      const upperSurface = coords.slice(0, leadingEdgeIndex + 1);
      const lowerSurface = coords.slice(leadingEdgeIndex);

      // Start at trailing edge (upper surface)
      if (upperSurface.length > 0) {
        const first = upperSurface[0];
        pathParts.push(`M ${first.x} ${-first.y}`); // Flip Y for SVG coordinate system

        for (let i = 1; i < upperSurface.length; i++) {
          const point = upperSurface[i];
          pathParts.push(`L ${point.x} ${-point.y}`); // Flip Y for SVG coordinate system
        }
      }

      // Continue to lower surface
      if (lowerSurface.length > 1) {
        for (let i = 1; i < lowerSurface.length; i++) {
          const point = lowerSurface[i];
          pathParts.push(`L ${point.x} ${-point.y}`); // Flip Y for SVG coordinate system
        }
      }
    } else {
      // Fallback: just connect all points in order
      if (coords.length > 0) {
        pathParts.push(`M ${coords[0].x} ${-coords[0].y}`); // Flip Y for SVG coordinate system
        for (let i = 1; i < coords.length; i++) {
          pathParts.push(`L ${coords[i].x} ${-coords[i].y}`); // Flip Y for SVG coordinate system
        }
      }
    }

    // Close the path
    pathParts.push('Z');

    return pathParts.join(' ');
  };

  const pathData = createPath(coordinates);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[300px] bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-800">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-600/20 border-t-blue-600 rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Loading Profile</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full min-h-[300px] bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-800">
        <div className="text-center">
          <svg className="w-12 h-12 text-slate-400 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-xs font-bold text-slate-500 dark:text-slate-400">{error}</p>
          <p className="text-[10px] text-slate-400 mt-1">Coordinates not available</p>
        </div>
      </div>
    );
  }

  const strokeColor = isDark ? '#38bdf8' : '#2563eb';
  const fillColor = isDark ? 'rgba(56, 189, 248, 0.1)' : 'rgba(37, 99, 235, 0.1)';
  const gridColor = isDark ? '#1e293b' : '#e2e8f0';

  return (
    <div className="bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-800 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">
          Airfoil Profile Geometry
        </h3>
        <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded border border-slate-200 dark:border-slate-700">
          {coordinates.length} Points
        </div>
      </div>

      <div className="relative" style={{ width, height }}>
        <svg
          width={width}
          height={height}
          viewBox={`${viewBoxX} ${viewBoxY} ${viewBoxWidth} ${viewBoxHeight}`}
          preserveAspectRatio="xMidYMid meet"
          className="border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900"
        >
          {/* Grid lines */}
          <defs>
            <pattern id="grid" width="0.1" height="0.1" patternUnits="userSpaceOnUse">
              <path d="M 0.1 0 L 0 0 0 0.1" fill="none" stroke={gridColor} strokeWidth="0.01" opacity="0.3" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />

          {/* Center lines */}
          <line
            x1={bounds.minX - padding}
            y1={0}
            x2={bounds.maxX + padding}
            y2={0}
            stroke={gridColor}
            strokeWidth="0.005"
            strokeDasharray="0.02 0.02"
            opacity="0.5"
          />
          <line
            x1={0}
            y1={bounds.minY - padding}
            x2={0}
            y2={bounds.maxY + padding}
            stroke={gridColor}
            strokeWidth="0.005"
            strokeDasharray="0.02 0.02"
            opacity="0.5"
          />

          {/* Airfoil shape */}
          {pathData && (
            <path
              d={pathData}
              fill={fillColor}
              stroke={strokeColor}
              strokeWidth="0.01"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          )}

          {/* Leading edge marker */}
          {coordinates.length > 0 && (() => {
            const leIndex = coordinates.reduce((minIdx, coord, idx) =>
              coord.x < coordinates[minIdx].x ? idx : minIdx, 0
            );
            const le = coordinates[leIndex];
            return (
              <circle
                cx={le.x}
                cy={-le.y}
                r="0.01"
                fill={strokeColor}
                stroke="none"
              />
            );
          })()}

          {/* Trailing edge markers */}
          {coordinates.length > 0 && (
            <>
              <circle
                cx={coordinates[0].x}
                cy={-coordinates[0].y}
                r="0.008"
                fill={strokeColor}
                stroke="none"
              />
              <circle
                cx={coordinates[coordinates.length - 1].x}
                cy={-coordinates[coordinates.length - 1].y}
                r="0.008"
                fill={strokeColor}
                stroke="none"
              />
            </>
          )}
        </svg>
      </div>

      {/* Coordinate info */}
      <div className="mt-4 grid grid-cols-3 gap-2 text-[9px]">
        <div className="text-slate-500 dark:text-slate-400">
          <span className="font-black uppercase">Chord:</span> {metadata?.chord_length?.toFixed(4) ?? rangeX.toFixed(4)}
        </div>
        <div className="text-slate-500 dark:text-slate-400">
          <span className="font-black uppercase">Max Thickness:</span> {metadata?.max_thickness?.toFixed(4) ?? rangeY.toFixed(4)}
        </div>
        <div className="text-slate-500 dark:text-slate-400">
          <span className="font-black uppercase">Points:</span> {metadata?.point_count ?? coordinates.length}
        </div>
      </div>
    </div>
  );
};

export default AirfoilShape;

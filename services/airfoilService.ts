import { AirfoilPolar, SearchFilters, PolarDataPoint } from '../types';
import { supabase } from './supabaseClient';

interface DatabaseMetadata {
  id: number;
  polar_key: string;
  airfoil_name: string;
  reynolds: number;
  ncrit: number;
  mach: number;
  max_cl_cd: number | null;
  max_cl_cd_alpha: number | null;
  min_cl: number | null;
  max_cl: number | null;
  min_cd: number | null;
  max_cd: number | null;
  url: string | null;
  filename: string;
}

interface DatabaseDataPoint {
  alpha: number;
  cl: number;
  cd: number;
  cdp: number;
  cm: number;
  top_xtr: number;
  bot_xtr: number;
  clcd: number;
}

/**
 * Convert database metadata and data points to AirfoilPolar format
 */
function convertToAirfoilPolar(metadata: DatabaseMetadata, dataPoints: DatabaseDataPoint[]): AirfoilPolar {
  return {
    polarKey: metadata.polar_key,
    airfoilName: metadata.airfoil_name,
    reynolds: metadata.reynolds,
    ncrit: metadata.ncrit,
    mach: metadata.mach,
    maxClCd: metadata.max_cl_cd || 0,
    maxClCdAlpha: metadata.max_cl_cd_alpha || 0,
    url: metadata.url || '',
    data: dataPoints.map(dp => ({
      alpha: dp.alpha,
      cl: dp.cl,
      cd: dp.cd,
      cdp: dp.cdp,
      cm: dp.cm,
      topXtr: dp.top_xtr,
      botXtr: dp.bot_xtr,
      clcd: dp.clcd
    }))
  };
}

/**
 * Fetch data points for a polar from the database
 */
async function fetchDataPoints(polarMetadataId: number): Promise<DatabaseDataPoint[]> {
  const { data, error } = await supabase
    .from('airfoil_polar_data_points')
    .select('alpha, cl, cd, cdp, cm, top_xtr, bot_xtr, clcd')
    .eq('polar_metadata_id', polarMetadataId)
    .order('alpha', { ascending: true });

  if (error) {
    console.error('Error fetching data points:', error);
    return [];
  }

  return (data || []) as DatabaseDataPoint[];
}

/**
 * Fetch data points for multiple polars in batch
 */
async function fetchDataPointsBatch(polarMetadataIds: number[]): Promise<Map<number, DatabaseDataPoint[]>> {
  const resultMap = new Map<number, DatabaseDataPoint[]>();

  if (polarMetadataIds.length === 0) {
    return resultMap;
  }

  // Supabase has limits on .in() queries, so we need to batch them
  const batchSize = 10; // Conservative limit for Supabase
  const allData: (DatabaseDataPoint & { polar_metadata_id: number })[] = [];

  for (let i = 0; i < polarMetadataIds.length; i += batchSize) {
    const batch = polarMetadataIds.slice(i, i + batchSize);
    console.log("batch", batch);
    const { data, error } = await supabase
      .from('airfoil_polar_data_points')
      .select('polar_metadata_id, alpha, cl, cd, cdp, cm, top_xtr, bot_xtr, clcd')
      .in('polar_metadata_id', batch)
      .order('polar_metadata_id', { ascending: true })
      .order('alpha', { ascending: true });

    if (error) {
      console.error('Error fetching data points batch:', error);
      continue;
    }

    if (data) {
      allData.push(...(data as (DatabaseDataPoint & { polar_metadata_id: number })[]));
    }
  }

  // Group data points by polar_metadata_id
  for (const point of allData) {
    const polarId = point.polar_metadata_id;
    if (!resultMap.has(polarId)) {
      resultMap.set(polarId, []);
      console.log("add polarId to resultMap.keys", polarId);
    }
    const { polar_metadata_id, ...dataPoint } = point;
    resultMap.get(polarId)!.push(dataPoint);
  }
  console.log("resultMap.keys", resultMap.keys());
  return resultMap;
}

/**
 * Fetch all metadata with pagination support and filtering
 */
async function fetchAllMetadata(reynolds: number | null, minCl: number | null): Promise<DatabaseMetadata[]> {
  const allMetadata: DatabaseMetadata[] = [];
  const pageSize = 1000; // Supabase default/max limit per page
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    let query = supabase
      .from('airfoil_polars_metadata')
      .select('id, polar_key, airfoil_name, reynolds, ncrit, mach, max_cl_cd, max_cl_cd_alpha, min_cl, max_cl, min_cd, max_cd, url, filename')
      .order('id', { ascending: true }); // Order by id for consistent pagination

    // Apply Reynolds filter
    if (reynolds !== null) {
      query = query.eq('reynolds', reynolds);
    }

    // Apply minimum Cl filter: only return airfoils where max_cl > minCl
    if (minCl !== null) {
      query = query.gt('max_cl', minCl);
    }

    // Apply pagination
    query = query.range(offset, offset + pageSize - 1);

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching metadata:', error);
      break;
    }

    if (!data || data.length === 0) {
      hasMore = false;
      break;
    }
    console.log(data.length);
    allMetadata.push(...(data as DatabaseMetadata[]));

    // If we got fewer results than page size, we're done
    if (data.length < pageSize) {
      hasMore = false;
    } else {
      offset += pageSize;
    }
  }

  return allMetadata;
}

/**
 * Sort airfoil polars based on the selected criteria
 */
function sortAirfoils(polars: AirfoilPolar[], sortBy: 'cl' | 'cd' | 'clcd' | null, sortOrder: 'asc' | 'desc'): AirfoilPolar[] {
  if (!sortBy) {
    return polars; // No sorting applied
  }

  const sorted = [...polars].sort((a, b) => {
    let valueA: number;
    let valueB: number;

    switch (sortBy) {
      case 'cl':
        // Sort by maximum Cl
        valueA = Math.max(...a.data.map(d => d.cl));
        valueB = Math.max(...b.data.map(d => d.cl));
        break;
      case 'cd':
        // Sort by minimum Cd (lower is better)
        valueA = Math.min(...a.data.map(d => d.cd));
        valueB = Math.min(...b.data.map(d => d.cd));
        break;
      case 'clcd':
        // Sort by maximum L/D (Cl/Cd)
        valueA = Math.max(...a.data.map(d => d.clcd));
        valueB = Math.max(...b.data.map(d => d.clcd));
        break;
      default:
        return 0;
    }

    // Apply sort order
    if (sortOrder === 'asc') {
      return valueA - valueB;
    } else {
      return valueB - valueA;
    }
  });

  return sorted;
}

/**
 * Search for airfoil polars based on filters with ranking support
 */
export async function searchAirfoils(filters: SearchFilters): Promise<AirfoilPolar[]> {
  try {
    // Step 1: Fetch metadata with Reynolds and minimum Cl filters applied at database level
    const metadataArray = await fetchAllMetadata(filters.reynolds, filters.minCl);
    console.log(metadataArray.length);
    if (metadataArray.length === 0) {
      return [];
    }

    // Step 2: Fetch data points for all matching polars in batch
    const metadataIds = metadataArray.map(m => m.id);
    console.log("metadataIds.length", metadataIds.length);
    const dataPointsMap = await fetchDataPointsBatch(metadataIds);
    console.log(dataPointsMap.size);
    // Step 3: Convert to AirfoilPolar format
    const polars: AirfoilPolar[] = [];

    for (const metadata of metadataArray) {
      const dataPoints = dataPointsMap.get(metadata.id) || [];
      console.log(dataPoints.length);
      if (dataPoints.length > 0) {
        const polar = convertToAirfoilPolar(metadata, dataPoints);
        polars.push(polar);
      }
    }
    console.log(polars.length);
    // Step 4: Sort/rank the results based on user selection
    const sortedPolars = sortAirfoils(polars, filters.sortBy, filters.sortOrder);
    console.log(sortedPolars.length);
    return sortedPolars;
  } catch (error) {
    console.error('Search failed:', error);
    return [];
  }
}

/**
 * Get all airfoil polars from the database
 */
export async function getAllAirfoils(): Promise<AirfoilPolar[]> {
  try {
    // Fetch all metadata
    const { data: metadataList, error: metadataError } = await supabase
      .from('airfoil_polars_metadata')
      .select('id, polar_key, airfoil_name, reynolds, ncrit, mach, max_cl_cd, max_cl_cd_alpha, min_cl, max_cl, min_cd, max_cd, min_clcd, max_clcd, url, filename')
      .order('airfoil_name', { ascending: true })
      .limit(100); // Limit initial load for performance

    if (metadataError) {
      console.error('Error fetching metadata:', metadataError);
      return [];
    }

    if (!metadataList || metadataList.length === 0) {
      return [];
    }

    // Fetch data points in batch for all polars
    const metadataIds = (metadataList as DatabaseMetadata[]).map(m => m.id);
    const dataPointsMap = await fetchDataPointsBatch(metadataIds);

    // Convert to AirfoilPolar format
    const polars: AirfoilPolar[] = [];

    for (const metadata of metadataList as DatabaseMetadata[]) {
      const dataPoints = dataPointsMap.get(metadata.id) || [];
      if (dataPoints.length > 0) {
        const polar = convertToAirfoilPolar(metadata, dataPoints);
        polars.push(polar);
      }
    }

    return polars;
  } catch (error) {
    console.error('Error fetching all airfoils:', error);
    return [];
  }
}

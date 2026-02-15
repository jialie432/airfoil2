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
  min_clcd: number | null;
  max_clcd: number | null;
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
  const batchSize = 100; // Conservative limit for Supabase
  const allData: (DatabaseDataPoint & { polar_metadata_id: number })[] = [];

  for (let i = 0; i < polarMetadataIds.length; i += batchSize) {
    const batch = polarMetadataIds.slice(i, i + batchSize);

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
    }
    const { polar_metadata_id, ...dataPoint } = point;
    resultMap.get(polarId)!.push(dataPoint);
  }

  return resultMap;
}

/**
 * Fetch all metadata with pagination support
 */
async function fetchAllMetadata(reynolds: number | null, filters: SearchFilters): Promise<DatabaseMetadata[]> {
  const allMetadata: DatabaseMetadata[] = [];
  const pageSize = 1000; // Supabase default/max limit per page
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    let query = supabase
      .from('airfoil_polars_metadata')
      .select('id, polar_key, airfoil_name, reynolds, ncrit, mach, max_cl_cd, max_cl_cd_alpha, min_cl, max_cl, min_cd, max_cd, min_clcd, max_clcd, url, filename')
      .order('id', { ascending: true }); // Order by id for consistent pagination

    if (reynolds !== null) {
      query = query.eq('reynolds', reynolds);
    }

    // Apply metadata-level range filters
    // CL Limit: If input range fits within the airfoil's min_cl to max_cl range
    // This means: airfoil.min_cl <= input.clMin AND input.clMax <= airfoil.max_cl
    if (filters.clMin !== null) {
      query = query.lte('min_cl', filters.clMin); // airfoil's min_cl must be <= input min
    }
    if (filters.clMax !== null) {
      query = query.gte('max_cl', filters.clMax); // airfoil's max_cl must be >= input max
    }

    // CD Limit: If input range fits within the airfoil's min_cd to max_cd range
    // This means: airfoil.min_cd <= input.cdMin AND input.cdMax <= airfoil.max_cd
    if (filters.cdMin !== null) {
      query = query.lte('min_cd', filters.cdMin); // airfoil's min_cd must be <= input min
    }
    if (filters.cdMax !== null) {
      query = query.gte('max_cd', filters.cdMax); // airfoil's max_cd must be >= input max
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
 * Check if a polar has at least ONE data point that matches alpha and L/D filters
 * This uses a database query with limit 1 for efficiency
 * 
 * CRITICAL LOGIC: All filters are combined with AND logic on a SINGLE data point.
 * When alpha range is specified, we search for data points where:
 *   - alpha is within the specified range (alphaMin <= alpha <= alphaMax)
 *   - AND L/D efficiency (Cl/Cd) criteria are met
 *   - ALL conditions must be satisfied by the SAME data point
 * 
 * Note: CL and CD filters are now handled at the metadata level
 */
async function hasMatchingDataPoints(polarMetadataId: number, metadata: DatabaseMetadata, filters: SearchFilters): Promise<boolean> {
  try {
    let query = supabase
      .from('airfoil_polar_data_points')
      .select('id')
      .eq('polar_metadata_id', polarMetadataId)
      .limit(1); // Only need to check existence - stop at first match

    // Apply alpha range filter (if specified)
    // This MUST be satisfied: data point must be within alphaMin <= alpha <= alphaMax
    if (filters.alphaMin !== null) {
      query = query.gte('alpha', filters.alphaMin);
    }
    if (filters.alphaMax !== null) {
      query = query.lte('alpha', filters.alphaMax);
    }

    // L/D Efficiency filter: Check if input range fits within metadata range
    // This means: airfoil.min_clcd <= input.clcdMin AND input.clcdMax <= airfoil.max_clcd
    // Note: min_clcd and max_clcd need to be available in metadata
    if (filters.clcdMin !== null && metadata.min_clcd !== null) {
      if (metadata.min_clcd > filters.clcdMin) {
        return false; // airfoil's min L/D is higher than requested min - doesn't cover the range
      }
    }
    if (filters.clcdMax !== null && metadata.max_clcd !== null) {
      if (metadata.max_clcd < filters.clcdMax) {
        return false; // airfoil's max L/D is lower than requested max - doesn't cover the range
      }
    }

    const { data, error } = await query;

    if (error) {
      console.error(`Error checking data points for polar ${polarMetadataId}:`, error);
      return false;
    }

    return data !== null && data.length > 0;
  } catch (error) {
    console.error(`Error in hasMatchingDataPoints for polar ${polarMetadataId}:`, error);
    return false;
  }
}

/**
 * Check if filters require data point filtering (i.e., any non-reynolds, non-metadata filters)
 * Alpha and L/D efficiency require checking individual data points
 * CL and CD are now handled at metadata level
 */
function hasDataPointFilters(filters: SearchFilters): boolean {
  return filters.alphaMin !== null ||
    filters.alphaMax !== null ||
    filters.clcdMin !== null ||
    filters.clcdMax !== null;
}

/**
 * Search for airfoil polars based on filters - IMPROVED VERSION WITH ERROR HANDLING
 */
export async function searchAirfoils(filters: SearchFilters): Promise<AirfoilPolar[]> {
  try {
    // Step 1: Fetch metadata with Reynolds, CL, and CD filters applied at database level
    const metadataArray = await fetchAllMetadata(filters.reynolds, filters);

    if (metadataArray.length === 0) {
      return [];
    }

    // Step 2: If we have data point filters, check each polar for matching data points
    let matchingMetadataIds: number[] = [];

    if (hasDataPointFilters(filters)) {
      // Use Promise.allSettled to handle individual failures gracefully
      // Process in batches to avoid overwhelming Supabase
      const batchSize = 50; // Process 50 airfoils at a time
      const allResults: Array<{ id: number; hasMatch: boolean }> = [];

      for (let i = 0; i < metadataArray.length; i += batchSize) {
        const batch = metadataArray.slice(i, i + batchSize);

        const checkPromises = batch.map(metadata =>
          hasMatchingDataPoints(metadata.id, metadata, filters)
            .then(hasMatch => ({ id: metadata.id, hasMatch }))
            .catch(error => {
              // Log error but don't fail the entire search
              console.error(`Error checking polar ${metadata.id}:`, error);
              return { id: metadata.id, hasMatch: false };
            })
        );

        // Use allSettled to handle individual failures
        const batchResults = await Promise.allSettled(checkPromises);

        // Extract successful results
        for (const result of batchResults) {
          if (result.status === 'fulfilled') {
            allResults.push(result.value);
          } else {
            console.error('Promise rejected:', result.reason);
          }
        }

        // Small delay between batches to avoid rate limiting
        if (i + batchSize < metadataArray.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      matchingMetadataIds = allResults.filter(r => r.hasMatch).map(r => r.id);
    } else {
      // No data point filters, all metadata records match
      matchingMetadataIds = metadataArray.map(m => m.id);
    }

    if (matchingMetadataIds.length === 0) {
      return [];
    }

    // Step 3: Get metadata for matching polars only
    const matchingMetadata = metadataArray.filter(m => matchingMetadataIds.includes(m.id));

    // Step 4: Fetch data points for matching polars in batch
    const dataPointsMap = await fetchDataPointsBatch(matchingMetadataIds);

    // Step 5: Convert to AirfoilPolar format
    const matchingPolars: AirfoilPolar[] = [];

    for (const metadata of matchingMetadata) {
      const dataPoints = dataPointsMap.get(metadata.id) || [];
      if (dataPoints.length > 0) {
        const polar = convertToAirfoilPolar(metadata, dataPoints);
        matchingPolars.push(polar);
      }
    }

    return matchingPolars;
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

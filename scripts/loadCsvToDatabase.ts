import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { parseXfoilCSV } from '../services/csvParser';
import dotenv from 'dotenv';

// Get current directory for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env.local
dotenv.config({ path: path.join(__dirname, '../.env.local') });

// Initialize Supabase client
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: Supabase URL and Key must be set in environment variables');
  console.error('Required: VITE_SUPABASE_URL (or SUPABASE_URL) and VITE_SUPABASE_SERVICE_KEY (or VITE_SUPABASE_ANON_KEY)');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

interface PolarMetadata {
  polar_key: string;
  airfoil_name: string;
  reynolds: number;
  ncrit: number;
  mach: number;
  max_cl_cd: number | null;
  max_cl_cd_alpha: number | null;
  min_alpha: number | null;
  max_alpha: number | null;
  min_cl: number | null;
  max_cl: number | null;
  min_cd: number | null;
  max_cd: number | null;
  url: string | null;
  filename: string;
}

interface DataPoint {
  polar_metadata_id: number;
  alpha: number;
  cl: number;
  cd: number;
  cdp: number;
  cm: number;
  top_xtr: number;
  bot_xtr: number;
}

/**
 * Calculate min/max values from data points
 */
function calculateMinMaxValues(dataPoints: Array<{ alpha: number; cl: number; cd: number }>): {
  min_alpha: number | null;
  max_alpha: number | null;
  min_cl: number | null;
  max_cl: number | null;
  min_cd: number | null;
  max_cd: number | null;
} {
  if (dataPoints.length === 0) {
    return {
      min_alpha: null,
      max_alpha: null,
      min_cl: null,
      max_cl: null,
      min_cd: null,
      max_cd: null
    };
  }

  let minAlpha = dataPoints[0].alpha;
  let maxAlpha = dataPoints[0].alpha;
  let minCl = dataPoints[0].cl;
  let maxCl = dataPoints[0].cl;
  let minCd = dataPoints[0].cd;
  let maxCd = dataPoints[0].cd;

  for (const point of dataPoints) {
    if (point.alpha < minAlpha) minAlpha = point.alpha;
    if (point.alpha > maxAlpha) maxAlpha = point.alpha;
    if (point.cl < minCl) minCl = point.cl;
    if (point.cl > maxCl) maxCl = point.cl;
    if (point.cd < minCd) minCd = point.cd;
    if (point.cd > maxCd) maxCd = point.cd;
  }

  return {
    min_alpha: minAlpha,
    max_alpha: maxAlpha,
    min_cl: minCl,
    max_cl: maxCl,
    min_cd: minCd,
    max_cd: maxCd
  };
}

/**
 * Load a single CSV file into the database
 */
async function loadCsvFile(filePath: string, filename: string): Promise<void> {
  try {
    // Read and parse CSV file
    const csvContent = fs.readFileSync(filePath, 'utf-8');
    const polar = parseXfoilCSV(csvContent);

    // Calculate min/max values from data points
    const minMaxValues = calculateMinMaxValues(polar.data);

    // Prepare metadata
    const metadata: PolarMetadata = {
      polar_key: polar.polarKey,
      airfoil_name: polar.airfoilName,
      reynolds: polar.reynolds,
      ncrit: polar.ncrit,
      mach: polar.mach,
      max_cl_cd: polar.maxClCd || null,
      max_cl_cd_alpha: polar.maxClCdAlpha || null,
      min_alpha: minMaxValues.min_alpha,
      max_alpha: minMaxValues.max_alpha,
      min_cl: minMaxValues.min_cl,
      max_cl: minMaxValues.max_cl,
      min_cd: minMaxValues.min_cd,
      max_cd: minMaxValues.max_cd,
      url: polar.url || null,
      filename: filename
    };

    // Insert or update metadata (upsert based on polar_key)
    const { data: metadataResult, error: metadataError } = await supabase
      .from('airfoil_polars_metadata')
      .upsert(metadata, {
        onConflict: 'polar_key',
        ignoreDuplicates: false
      })
      .select()
      .single();

    if (metadataError) {
      throw new Error(`Failed to insert metadata for ${filename}: ${metadataError.message}`);
    }

    if (!metadataResult || !metadataResult.id) {
      throw new Error(`Failed to get metadata ID for ${filename}`);
    }

    const polarMetadataId = metadataResult.id;

    // Delete existing data points for this polar (in case we're updating)
    const { error: deleteError } = await supabase
      .from('airfoil_polar_data_points')
      .delete()
      .eq('polar_metadata_id', polarMetadataId);

    if (deleteError) {
      console.warn(`Warning: Failed to delete old data points for ${filename}: ${deleteError.message}`);
    }

    // Prepare data points in batches (Supabase has limits on batch size)
    const batchSize = 1000;
    const dataPoints: DataPoint[] = polar.data.map(pt => ({
      polar_metadata_id: polarMetadataId,
      alpha: pt.alpha,
      cl: pt.cl,
      cd: pt.cd,
      cdp: pt.cdp || 0,
      cm: pt.cm || 0,
      top_xtr: pt.topXtr || 0,
      bot_xtr: pt.botXtr || 0
    }));

    // Insert data points in batches
    for (let i = 0; i < dataPoints.length; i += batchSize) {
      const batch = dataPoints.slice(i, i + batchSize);

      const { error: dataError } = await supabase
        .from('airfoil_polar_data_points')
        .insert(batch);

      if (dataError) {
        throw new Error(`Failed to insert data points batch for ${filename} (batch ${Math.floor(i / batchSize) + 1}): ${dataError.message}`);
      }
    }

    console.log(`✓ Loaded ${filename} (${polar.data.length} data points, alpha: [${minMaxValues.min_alpha?.toFixed(2)}, ${minMaxValues.max_alpha?.toFixed(2)}], cl: [${minMaxValues.min_cl?.toFixed(3)}, ${minMaxValues.max_cl?.toFixed(3)}], cd: [${minMaxValues.min_cd?.toFixed(5)}, ${minMaxValues.max_cd?.toFixed(5)}])`);
  } catch (error) {
    console.error(`✗ Error loading ${filename}:`, error);
    throw error;
  }
}

/**
 * Load all CSV files from a directory into the database
 */
async function loadAllCsvFiles(directoryPath: string): Promise<void> {
  const files = fs.readdirSync(directoryPath);
  const csvFiles = files.filter(file => file.endsWith('.csv'));

  console.log(`Found ${csvFiles.length} CSV files to load...`);
  console.log('Starting load process...\n');

  let successCount = 0;
  let errorCount = 0;
  const errors: Array<{ file: string; error: string }> = [];

  // Process files with concurrency limit
  const concurrency = 5; // Adjust based on your needs
  for (let i = 0; i < csvFiles.length; i += concurrency) {
    const batch = csvFiles.slice(i, i + concurrency);

    await Promise.allSettled(
      batch.map(async (filename) => {
        try {
          const filePath = path.join(directoryPath, filename);
          await loadCsvFile(filePath, filename);
          successCount++;
        } catch (error) {
          errorCount++;
          errors.push({
            file: filename,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      })
    );

    // Progress update
    const processed = Math.min(i + concurrency, csvFiles.length);
    console.log(`Progress: ${processed}/${csvFiles.length} files processed...`);
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('Load Summary:');
  console.log(`✓ Successfully loaded: ${successCount} files`);
  console.log(`✗ Errors: ${errorCount} files`);

  if (errors.length > 0) {
    console.log('\nErrors:');
    errors.slice(0, 10).forEach(({ file, error }) => {
      console.log(`  - ${file}: ${error}`);
    });
    if (errors.length > 10) {
      console.log(`  ... and ${errors.length - 10} more errors`);
    }
  }
}

/**
 * Main execution
 */
async function main() {
  const args = process.argv.slice(2);
  const directoryPath = args[0] || path.join(__dirname, '../airfoil_polars');

  if (!fs.existsSync(directoryPath)) {
    console.error(`Error: Directory not found: ${directoryPath}`);
    process.exit(1);
  }

  console.log(`Loading CSV files from: ${directoryPath}`);
  console.log(`Supabase URL: ${supabaseUrl}\n`);

  try {
    await loadAllCsvFiles(directoryPath);
    console.log('\n✓ Load process completed!');
  } catch (error) {
    console.error('\n✗ Load process failed:', error);
    process.exit(1);
  }
}

// Run if executed directly
main().catch(console.error);

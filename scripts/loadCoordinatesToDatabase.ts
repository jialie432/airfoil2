import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// Get current directory for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Supabase client
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://hppgprzfcvqrvrwaimmm.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhwcGdwcnpmY3ZxcnZyd2FpbW1tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgxNTgzNDksImV4cCI6MjA4MzczNDM0OX0.-MHynVQrqyXCjIkZDviFHF9o_nm_8Kleo61z7xYD8Hw';

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: Supabase URL and Key must be set in environment variables');
  console.error('Required: VITE_SUPABASE_URL (or SUPABASE_URL) and VITE_SUPABASE_SERVICE_KEY (or SUPABASE_SERVICE_KEY)');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

interface Coordinate {
  x: number;
  y: number;
}

interface CoordinateMetadata {
  airfoil_name: string;
  point_count: number;
  min_x: number;
  max_x: number;
  min_y: number;
  max_y: number;
  chord_length: number;
  max_thickness: number;
  source_url: string | null;
  filename: string;
}

interface CoordinatePoint {
  airfoil_name: string;
  x: number;
  y: number;
  point_order: number;
  surface_type: string | null;
}

/**
 * Parse Selig format .dat file
 * Format: x y (one point per line, may have header)
 */
function parseSeligDatFile(fileContent: string): Coordinate[] {
  const lines = fileContent.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const coordinates: Coordinate[] = [];

  for (const line of lines) {
    // Skip header lines and comments
    if (
      line.startsWith('#') ||
      line.startsWith('Airfoil') ||
      (line.toLowerCase().includes('x') && line.toLowerCase().includes('y') && !line.match(/^\d/))
    ) {
      continue;
    }

    // Parse x y coordinates
    // Handle both space-separated and tab-separated
    const parts = line.split(/\s+/).filter(p => p.length > 0);
    if (parts.length >= 2) {
      const x = parseFloat(parts[0]);
      const y = parseFloat(parts[1]);

      if (!isNaN(x) && !isNaN(y)) {
        coordinates.push({ x, y });
      }
    }
  }

  return coordinates;
}

/**
 * Determine surface type (upper/lower) for each coordinate
 * Selig format: typically upper surface (TE->LE) then lower surface (LE->TE)
 */
function classifySurfaces(coordinates: Coordinate[]): Array<{ x: number; y: number; surface: string | null }> {
  if (coordinates.length === 0) return [];

  // Find leading edge (minimum x coordinate)
  const leadingEdgeIndex = coordinates.reduce((minIdx, coord, idx) =>
    coord.x < coordinates[minIdx].x ? idx : minIdx, 0
  );

  // Check if coordinates are in Selig format
  const firstX = coordinates[0].x;
  const lastX = coordinates[coordinates.length - 1].x;
  const isSeligFormat = (firstX > 0.9 && lastX > 0.9) || (firstX < 0.1 && lastX < 0.1);

  if (isSeligFormat && leadingEdgeIndex > 0 && leadingEdgeIndex < coordinates.length - 1) {
    // Standard Selig format: upper surface then lower surface
    return coordinates.map((coord, idx) => ({
      x: coord.x,
      y: coord.y,
      surface: idx <= leadingEdgeIndex ? 'upper' : 'lower'
    }));
  }

  // If we can't determine, return without surface classification
  return coordinates.map(coord => ({
    x: coord.x,
    y: coord.y,
    surface: null
  }));
}

/**
 * Calculate metadata from coordinates
 */
function calculateMetadata(
  coordinates: Coordinate[],
  airfoilName: string,
  filename: string,
  sourceUrl?: string
): CoordinateMetadata {
  if (coordinates.length === 0) {
    throw new Error('No coordinates to process');
  }

  const xs = coordinates.map(c => c.x);
  const ys = coordinates.map(c => c.y);

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  return {
    airfoil_name: airfoilName,
    point_count: coordinates.length,
    min_x: minX,
    max_x: maxX,
    min_y: minY,
    max_y: maxY,
    chord_length: maxX - minX,
    max_thickness: maxY - minY,
    source_url: sourceUrl || null,
    filename: filename
  };
}

/**
 * Extract airfoil name from filename
 * Example: "ag16-il.dat" -> "ag16-il"
 */
function extractAirfoilName(filename: string): string {
  // Remove .dat extension
  let name = filename.replace(/\.dat$/i, '');
  // Remove path if present
  name = path.basename(name);
  return name;
}

/**
 * Load a single coordinate file into the database
 */
async function loadCoordinateFile(filePath: string, filename: string): Promise<void> {
  try {
    // Read and parse .dat file
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const coordinates = parseSeligDatFile(fileContent);

    if (coordinates.length === 0) {
      throw new Error('No valid coordinates found in file');
    }

    // Extract airfoil name from filename
    const airfoilName = extractAirfoilName(filename);

    // Calculate metadata
    const metadata = calculateMetadata(coordinates, airfoilName, filename);

    // Classify surfaces
    const coordinatesWithSurfaces = classifySurfaces(coordinates);

    // Upsert metadata (insert or update if exists)
    const { data: metadataResult, error: metadataError } = await supabase
      .from('airfoil_coordinates_metadata')
      .upsert(metadata, {
        onConflict: 'airfoil_name',
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

    // Delete existing coordinates for this airfoil (in case we're updating)
    const { error: deleteError } = await supabase
      .from('airfoil_coordinates')
      .delete()
      .eq('airfoil_name', airfoilName);

    if (deleteError) {
      console.warn(`Warning: Failed to delete old coordinates for ${airfoilName}: ${deleteError.message}`);
    }

    // Prepare coordinate points for batch insert
    const coordinatePoints: CoordinatePoint[] = coordinatesWithSurfaces.map((coord, index) => ({
      airfoil_name: airfoilName,
      x: coord.x,
      y: coord.y,
      point_order: index,
      surface_type: coord.surface
    }));

    // Insert coordinates in batches (Supabase has limits on batch size)
    const batchSize = 1000;
    let insertedCount = 0;

    for (let i = 0; i < coordinatePoints.length; i += batchSize) {
      const batch = coordinatePoints.slice(i, i + batchSize);

      const { error: insertError } = await supabase
        .from('airfoil_coordinates')
        .insert(batch);

      if (insertError) {
        throw new Error(`Failed to insert coordinates batch for ${airfoilName}: ${insertError.message}`);
      }

      insertedCount += batch.length;
    }

    console.log(`✓ Loaded ${airfoilName}: ${insertedCount} coordinates`);
  } catch (error) {
    console.error(`✗ Error loading ${filename}:`, error);
    throw error;
  }
}

/**
 * Load all .dat files from a directory into the database
 */
async function loadAllCoordinateFiles(directoryPath: string): Promise<void> {
  const files = fs.readdirSync(directoryPath);
  const datFiles = files.filter(file => file.toLowerCase().endsWith('.dat'));

  console.log(`Found ${datFiles.length} coordinate files to load...`);
  console.log('Starting load process...\n');

  let successCount = 0;
  let errorCount = 0;
  const errors: Array<{ file: string; error: string }> = [];

  // Process files with concurrency limit
  const concurrency = 5; // Adjust based on your needs
  for (let i = 0; i < datFiles.length; i += concurrency) {
    const batch = datFiles.slice(i, i + concurrency);

    await Promise.allSettled(
      batch.map(async (filename) => {
        try {
          const filePath = path.join(directoryPath, filename);
          await loadCoordinateFile(filePath, filename);
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
    const processed = Math.min(i + concurrency, datFiles.length);
    console.log(`Progress: ${processed}/${datFiles.length} files processed...`);
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
  const directoryPath = args[0] || path.join(__dirname, '../airfoil_coordinates');

  if (!fs.existsSync(directoryPath)) {
    console.error(`Error: Directory not found: ${directoryPath}`);
    console.error('Usage: tsx scripts/loadCoordinatesToDatabase.ts [directory_path]');
    console.error('Default: ./airfoil_coordinates');
    process.exit(1);
  }

  console.log(`Loading coordinate files from: ${directoryPath}`);
  console.log(`Supabase URL: ${supabaseUrl}\n`);

  try {
    await loadAllCoordinateFiles(directoryPath);
    console.log('\n✓ Load process completed!');
  } catch (error) {
    console.error('\n✗ Load process failed:', error);
    process.exit(1);
  }
}

// Run if executed directly
main().catch(console.error);

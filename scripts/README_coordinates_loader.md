# Airfoil Coordinates Database Loader

TypeScript script to upload airfoil coordinate data (.dat files in Selig format) to the Supabase database.

## Prerequisites

1. **Database Migration**: Run the migration script first to create the coordinates tables:
   ```sql
   -- Run this in your Supabase SQL editor or via psql
   \i database/migration_add_coordinates_table.sql
   ```

2. **Environment Variables**: Set the following environment variables:
   - `VITE_SUPABASE_URL` or `SUPABASE_URL` - Your Supabase project URL
   - `VITE_SUPABASE_SERVICE_KEY` or `SUPABASE_SERVICE_KEY` - Your Supabase service role key

3. **Coordinate Files**: Download airfoil coordinate files using the Python script:
   ```bash
   python scripts/download_airfoil_coordinates.py --all --output ./airfoil_coordinates
   ```

## Usage

### Load all coordinate files from a directory

```bash
# Using default directory (./airfoil_coordinates)
npx tsx scripts/loadCoordinatesToDatabase.ts

# Specify custom directory
npx tsx scripts/loadCoordinatesToDatabase.ts /path/to/coordinate/files
```

### Load a single file (modify script as needed)

The script is designed to process entire directories. To load a single file, you can:
1. Create a temporary directory with just that file
2. Or modify the script to accept a single file path

## What It Does

1. **Parses .dat files**: Reads Selig format coordinate files (x y pairs)
2. **Classifies surfaces**: Identifies upper and lower surfaces based on coordinate order
3. **Calculates metadata**: Computes chord length, max thickness, bounds, etc.
4. **Uploads to database**: Stores coordinates and metadata in Supabase

## Database Schema

The script creates/uses two tables:

### `airfoil_coordinates_metadata`
- Stores metadata about each airfoil's coordinate set
- One row per airfoil
- Includes: point count, bounds, chord length, max thickness

### `airfoil_coordinates`
- Stores individual x, y coordinate points
- Multiple rows per airfoil (one per coordinate point)
- Includes: x, y, point_order, surface_type (upper/lower)

## Features

- ✅ Batch processing with concurrency control
- ✅ Automatic surface classification (upper/lower)
- ✅ Metadata calculation (chord, thickness, bounds)
- ✅ Upsert support (updates existing airfoils)
- ✅ Error handling and progress tracking
- ✅ Skips header lines and comments in .dat files

## Example Output

```
Loading coordinate files from: ./airfoil_coordinates
Supabase URL: https://your-project.supabase.co

Found 1638 coordinate files to load...
Starting load process...

✓ Loaded ag16-il: 129 coordinates
✓ Loaded e325-il: 97 coordinates
Progress: 5/1638 files processed...
...

============================================================
Load Summary:
✓ Successfully loaded: 1638 files
✗ Errors: 0 files
============================================================

✓ Load process completed!
```

## Notes

- The script processes files in batches of 5 concurrently
- Coordinates are inserted in batches of 1000 points
- Existing coordinates for an airfoil are deleted before inserting new ones (upsert behavior)
- Airfoil names are extracted from filenames (removes .dat extension)

## Troubleshooting

### "Table does not exist" error
- Make sure you've run the migration script first
- Check that the tables `airfoil_coordinates` and `airfoil_coordinates_metadata` exist

### "Permission denied" error
- Verify your Supabase service key has write permissions
- Check that RLS (Row Level Security) policies allow inserts

### "No valid coordinates found"
- Check that the .dat file is in Selig format (x y pairs, one per line)
- Verify the file isn't corrupted or empty

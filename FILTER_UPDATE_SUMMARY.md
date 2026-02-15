# Search Filter Updates - Implementation Summary

## Overview
Updated the search filter logic in `services/airfoilService.ts` to implement range-based filtering for CL Limit, CD Limit, and L/D Efficiency filters. The new logic checks if the user's input range **fits within** the airfoil's capability range from the metadata table.

## Changes Made

### 1. Updated Filter Logic

#### CL Limit Filter
- **Logic**: Returns the airfoil if the input CL range fits within the airfoil's min_cl to max_cl range
- **Implementation**: `airfoil.min_cl <= input.clMin AND input.clMax <= airfoil.max_cl`
- **Example**: If user searches for CL range [0.5, 1.0], only airfoils with min_cl <= 0.5 AND max_cl >= 1.0 are returned

#### CD Limit Filter  
- **Logic**: Returns the airfoil if the input CD range fits within the airfoil's min_cd to max_cd range
- **Implementation**: `airfoil.min_cd <= input.cdMin AND input.cdMax <= airfoil.max_cd`
- **Example**: If user searches for CD range [0.01, 0.02], only airfoils with min_cd <= 0.01 AND max_cd >= 0.02 are returned

#### L/D Efficiency Filter
- **Logic**: Returns the airfoil if the input L/D ratio range fits within the airfoil's min_clcd to max_clcd range
- **Implementation**: `airfoil.min_clcd <= input.clcdMin AND input.clcdMax <= airfoil.max_clcd`
- **Example**: If user searches for L/D range [50, 100], only airfoils with min_clcd <= 50 AND max_clcd >= 100 are returned

### 2. Updated `DatabaseMetadata` Interface
Added the following fields to track min/max values:
- `min_cl: number | null`
- `max_cl: number | null`
- `min_cd: number | null`
- `max_cd: number | null`
- `min_clcd: number | null`
- `max_clcd: number | null`

### 3. Modified Filtering Strategy
- **CL and CD filters** are now applied at the **metadata level** (database query) for better performance
- **Alpha and L/D efficiency filters** require checking individual data points
- Reduced the number of data point queries needed by filtering at metadata level first

### 4. Updated Database Queries
All queries now fetch the min/max columns:
- `fetchAllMetadata()` - includes CL/CD filtering at the database level
- `getAllAirfoils()` - fetches all min/max columns
- Queries now use `.lte()` and `.gte()` operators correctly to implement "fits within" logic

## Database Migration Required

### New Migration Script
Created: `database/migration_add_clcd_columns.sql`

This migration adds `min_clcd` and `max_clcd` columns to the `airfoil_polars_metadata` table.

### How to Apply the Migration

You need to run the migration script on your Supabase database:

1. **Via Supabase Dashboard**:
   - Go to your Supabase project dashboard
   - Navigate to the SQL Editor
   - Copy and paste the contents of `database/migration_add_clcd_columns.sql`
   - Execute the script

2. **Via command line** (if you have psql installed):
   ```bash
   psql -h <your-supabase-host> -U postgres -d postgres -f database/migration_add_clcd_columns.sql
   ```

3. **What the migration does**:
   - Adds `min_clcd` and `max_clcd` columns to `airfoil_polars_metadata` table
   - Populates these columns with calculated values from existing data points
   - Creates indexes on the new columns for query performance
   - Safely checks if columns already exist before adding them (idempotent)

## Testing the Changes

After applying the migration, test the filters:

1. **Test CL Limit Filter**:
   - Set CL range to a specific value range (e.g., 0.5 to 1.0)
   - Verify that returned airfoils have data points covering this entire range

2. **Test CD Limit Filter**:
   - Set CD range to a specific value range (e.g., 0.01 to 0.02)
   - Verify that returned airfoils have data points covering this entire range

3. **Test L/D Efficiency Filter**:
   - Set L/D ratio range (e.g., 50 to 100)
   - Verify that returned airfoils have L/D values covering this entire range

4. **Test Combined Filters**:
   - Use multiple filters together (e.g., CL + CD + L/D)
   - Verify that results satisfy all filter criteria

## Performance Improvements

The new implementation provides better performance:
- **Metadata-level filtering** reduces the number of data points queries
- **Early filtering** at database level eliminates non-matching airfoils before fetching data points
- **Indexed columns** ensure fast range queries on min/max values
- **Batch processing** remains for data point checks when needed

## Important Notes

1. **Migration is Required**: The code won't work correctly for L/D efficiency filter until the migration is applied
2. **Backward Compatible**: The migration script safely checks for existing columns
3. **Data Integrity**: The migration populates values from existing data points automatically
4. **Null Handling**: Code gracefully handles null values in min/max columns

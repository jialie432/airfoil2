-- Migration: Add min_clcd and max_clcd columns to airfoil_polars_metadata table
-- This script adds L/D ratio (Cl/Cd) min/max tracking to the metadata table

-- Add new columns if they don't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='airfoil_polars_metadata' AND column_name='min_clcd') THEN
        ALTER TABLE airfoil_polars_metadata ADD COLUMN min_clcd NUMERIC(10, 4);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='airfoil_polars_metadata' AND column_name='max_clcd') THEN
        ALTER TABLE airfoil_polars_metadata ADD COLUMN max_clcd NUMERIC(10, 4);
    END IF;
END $$;

-- Update existing rows with calculated min/max clcd values from data_points
UPDATE airfoil_polars_metadata m
SET 
    min_clcd = sub.min_clcd,
    max_clcd = sub.max_clcd,
    updated_at = NOW()
FROM (
    SELECT 
        polar_metadata_id,
        MIN(clcd) as min_clcd,
        MAX(clcd) as max_clcd
    FROM airfoil_polar_data_points
    GROUP BY polar_metadata_id
) sub
WHERE m.id = sub.polar_metadata_id;

-- Create indexes for the new columns to optimize filtering
CREATE INDEX IF NOT EXISTS idx_airfoil_polars_min_clcd ON airfoil_polars_metadata(min_clcd);
CREATE INDEX IF NOT EXISTS idx_airfoil_polars_max_clcd ON airfoil_polars_metadata(max_clcd);

-- Verification query to check the migration
-- Uncomment to run verification
/*
SELECT 
    m.airfoil_name,
    m.reynolds,
    m.min_clcd as stored_min_clcd,
    m.max_clcd as stored_max_clcd,
    MIN(d.clcd) as calculated_min_clcd,
    MAX(d.clcd) as calculated_max_clcd,
    CASE 
        WHEN m.min_clcd = MIN(d.clcd) AND m.max_clcd = MAX(d.clcd) THEN 'MATCH'
        ELSE 'MISMATCH'
    END as verification_status
FROM airfoil_polars_metadata m
LEFT JOIN airfoil_polar_data_points d ON m.id = d.polar_metadata_id
GROUP BY m.id, m.airfoil_name, m.reynolds, m.min_clcd, m.max_clcd
LIMIT 10;
*/

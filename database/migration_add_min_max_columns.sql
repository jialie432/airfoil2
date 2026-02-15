-- Migration: Add min/max columns to airfoil_polars_metadata table
-- This script can be run on existing databases to add the new columns

-- Add new columns if they don't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='airfoil_polars_metadata' AND column_name='min_alpha') THEN
        ALTER TABLE airfoil_polars_metadata ADD COLUMN min_alpha NUMERIC(10, 4);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='airfoil_polars_metadata' AND column_name='max_alpha') THEN
        ALTER TABLE airfoil_polars_metadata ADD COLUMN max_alpha NUMERIC(10, 4);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='airfoil_polars_metadata' AND column_name='min_cl') THEN
        ALTER TABLE airfoil_polars_metadata ADD COLUMN min_cl NUMERIC(10, 4);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='airfoil_polars_metadata' AND column_name='max_cl') THEN
        ALTER TABLE airfoil_polars_metadata ADD COLUMN max_cl NUMERIC(10, 4);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='airfoil_polars_metadata' AND column_name='min_cd') THEN
        ALTER TABLE airfoil_polars_metadata ADD COLUMN min_cd NUMERIC(10, 6);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='airfoil_polars_metadata' AND column_name='max_cd') THEN
        ALTER TABLE airfoil_polars_metadata ADD COLUMN max_cd NUMERIC(10, 6);
    END IF;
END $$;

-- Update existing rows with calculated min/max values from data_points
UPDATE airfoil_polars_metadata m
SET 
    min_alpha = sub.min_alpha,
    max_alpha = sub.max_alpha,
    min_cl = sub.min_cl,
    max_cl = sub.max_cl,
    min_cd = sub.min_cd,
    max_cd = sub.max_cd,
    updated_at = NOW()
FROM (
    SELECT 
        polar_metadata_id,
        MIN(alpha) as min_alpha,
        MAX(alpha) as max_alpha,
        MIN(cl) as min_cl,
        MAX(cl) as max_cl,
        MIN(cd) as min_cd,
        MAX(cd) as max_cd
    FROM airfoil_polar_data_points
    GROUP BY polar_metadata_id
) sub
WHERE m.id = sub.polar_metadata_id;

-- Update the view to include the new columns
CREATE OR REPLACE VIEW airfoil_polars_with_stats AS
SELECT 
    m.id,
    m.polar_key,
    m.airfoil_name,
    m.reynolds,
    m.ncrit,
    m.mach,
    m.max_cl_cd,
    m.max_cl_cd_alpha,
    m.min_alpha,
    m.max_alpha,
    m.min_cl,
    m.max_cl,
    m.min_cd,
    m.max_cd,
    m.url,
    m.filename,
    COUNT(d.id) as data_point_count,
    MIN(d.alpha) as calculated_min_alpha,
    MAX(d.alpha) as calculated_max_alpha,
    MIN(d.cl) as calculated_min_cl,
    MAX(d.cl) as calculated_max_cl,
    MIN(d.cd) as calculated_min_cd,
    MAX(d.cd) as calculated_max_cd,
    MIN(d.clcd) as min_clcd,
    MAX(d.clcd) as max_clcd,
    m.created_at,
    m.updated_at
FROM airfoil_polars_metadata m
LEFT JOIN airfoil_polar_data_points d ON m.id = d.polar_metadata_id
GROUP BY m.id, m.polar_key, m.airfoil_name, m.reynolds, m.ncrit, m.mach, 
         m.max_cl_cd, m.max_cl_cd_alpha, m.min_alpha, m.max_alpha, m.min_cl, m.max_cl, m.min_cd, m.max_cd,
         m.url, m.filename, m.created_at, m.updated_at;

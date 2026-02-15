-- Airfoil Polar Metadata Table
-- Stores the header information from each CSV file
CREATE TABLE IF NOT EXISTS airfoil_polars_metadata (
    id BIGSERIAL PRIMARY KEY,
    polar_key TEXT UNIQUE NOT NULL,
    airfoil_name TEXT NOT NULL,
    reynolds INTEGER NOT NULL,
    ncrit NUMERIC(10, 2) NOT NULL,
    mach NUMERIC(10, 4) NOT NULL,
    max_cl_cd NUMERIC(10, 4),
    max_cl_cd_alpha NUMERIC(10, 4),
    min_alpha NUMERIC(10, 4),
    max_alpha NUMERIC(10, 4),
    min_cl NUMERIC(10, 4),
    max_cl NUMERIC(10, 4),
    min_cd NUMERIC(10, 6),
    max_cd NUMERIC(10, 6),
    url TEXT,
    filename TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for common search queries
CREATE INDEX IF NOT EXISTS idx_airfoil_polars_reynolds ON airfoil_polars_metadata(reynolds);
CREATE INDEX IF NOT EXISTS idx_airfoil_polars_airfoil_name ON airfoil_polars_metadata(airfoil_name);
CREATE INDEX IF NOT EXISTS idx_airfoil_polars_polar_key ON airfoil_polars_metadata(polar_key);
CREATE INDEX IF NOT EXISTS idx_airfoil_polars_filename ON airfoil_polars_metadata(filename);

-- Add new columns if they don't exist (for existing databases)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='airfoil_polars_metadata' AND column_name='min_alpha') THEN
        ALTER TABLE airfoil_polars_metadata ADD COLUMN min_alpha NUMERIC(10, 4);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='airfoil_polars_metadata' AND column_name='max_alpha') THEN
        ALTER TABLE airfoil_polars_metadata ADD COLUMN max_alpha NUMERIC(10, 4);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='airfoil_polars_metadata' AND column_name='min_cl') THEN
        ALTER TABLE airfoil_polars_metadata ADD COLUMN min_cl NUMERIC(10, 4);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='airfoil_polars_metadata' AND column_name='max_cl') THEN
        ALTER TABLE airfoil_polars_metadata ADD COLUMN max_cl NUMERIC(10, 4);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='airfoil_polars_metadata' AND column_name='min_cd') THEN
        ALTER TABLE airfoil_polars_metadata ADD COLUMN min_cd NUMERIC(10, 6);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='airfoil_polars_metadata' AND column_name='max_cd') THEN
        ALTER TABLE airfoil_polars_metadata ADD COLUMN max_cd NUMERIC(10, 6);
    END IF;
END $$;

-- Airfoil Polar Data Points Table
-- Stores all the data points from each CSV file
CREATE TABLE IF NOT EXISTS airfoil_polar_data_points (
    id BIGSERIAL PRIMARY KEY,
    polar_metadata_id BIGINT NOT NULL REFERENCES airfoil_polars_metadata(id) ON DELETE CASCADE,
    alpha NUMERIC(10, 4) NOT NULL,
    cl NUMERIC(10, 4) NOT NULL,
    cd NUMERIC(10, 6) NOT NULL,
    cdp NUMERIC(10, 6),
    cm NUMERIC(10, 4),
    top_xtr NUMERIC(10, 4),
    bot_xtr NUMERIC(10, 4),
    clcd NUMERIC(10, 4) GENERATED ALWAYS AS (
        CASE WHEN cd != 0 THEN cl / cd ELSE 0 END
    ) STORED
);

-- Create indexes for range queries
CREATE INDEX IF NOT EXISTS idx_polar_data_points_polar_id ON airfoil_polar_data_points(polar_metadata_id);
CREATE INDEX IF NOT EXISTS idx_polar_data_points_alpha ON airfoil_polar_data_points(alpha);
CREATE INDEX IF NOT EXISTS idx_polar_data_points_cl ON airfoil_polar_data_points(cl);
CREATE INDEX IF NOT EXISTS idx_polar_data_points_cd ON airfoil_polar_data_points(cd);
CREATE INDEX IF NOT EXISTS idx_polar_data_points_clcd ON airfoil_polar_data_points(clcd);

-- Composite index for common filter combinations
CREATE INDEX IF NOT EXISTS idx_polar_data_points_filter ON airfoil_polar_data_points(polar_metadata_id, alpha, cl, cd, clcd);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
DROP TRIGGER IF EXISTS update_airfoil_polars_metadata_updated_at ON airfoil_polars_metadata;
CREATE TRIGGER update_airfoil_polars_metadata_updated_at
    BEFORE UPDATE ON airfoil_polars_metadata
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- View for easy querying with aggregated statistics
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

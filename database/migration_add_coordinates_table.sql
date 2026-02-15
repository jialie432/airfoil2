-- Migration: Add airfoil coordinates table
-- This table stores the geometric coordinates (x, y points) for airfoil shapes

-- Airfoil Coordinates Table
-- Stores the x, y coordinate points that define the airfoil shape
CREATE TABLE IF NOT EXISTS airfoil_coordinates (
    id BIGSERIAL PRIMARY KEY,
    airfoil_name TEXT NOT NULL,
    x NUMERIC(10, 6) NOT NULL,
    y NUMERIC(10, 6) NOT NULL,
    point_order INTEGER NOT NULL,
    surface_type TEXT, -- 'upper', 'lower', or NULL if unknown
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(airfoil_name, point_order)
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_airfoil_coordinates_name ON airfoil_coordinates(airfoil_name);
CREATE INDEX IF NOT EXISTS idx_airfoil_coordinates_order ON airfoil_coordinates(airfoil_name, point_order);
CREATE INDEX IF NOT EXISTS idx_airfoil_coordinates_surface ON airfoil_coordinates(airfoil_name, surface_type);

-- Airfoil Coordinates Metadata Table
-- Stores metadata about each airfoil's coordinate set
CREATE TABLE IF NOT EXISTS airfoil_coordinates_metadata (
    id BIGSERIAL PRIMARY KEY,
    airfoil_name TEXT UNIQUE NOT NULL,
    point_count INTEGER NOT NULL,
    min_x NUMERIC(10, 6),
    max_x NUMERIC(10, 6),
    min_y NUMERIC(10, 6),
    max_y NUMERIC(10, 6),
    chord_length NUMERIC(10, 6), -- max_x - min_x
    max_thickness NUMERIC(10, 6), -- max_y - min_y
    source_url TEXT,
    filename TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_airfoil_coords_metadata_name ON airfoil_coordinates_metadata(airfoil_name);

-- Trigger to automatically update updated_at
DROP TRIGGER IF EXISTS update_airfoil_coordinates_updated_at ON airfoil_coordinates;
CREATE TRIGGER update_airfoil_coordinates_updated_at
    BEFORE UPDATE ON airfoil_coordinates
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_airfoil_coords_metadata_updated_at ON airfoil_coordinates_metadata;
CREATE TRIGGER update_airfoil_coords_metadata_updated_at
    BEFORE UPDATE ON airfoil_coordinates_metadata
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- View for easy querying with coordinate statistics
CREATE OR REPLACE VIEW airfoil_coordinates_with_stats AS
SELECT 
    m.id,
    m.airfoil_name,
    m.point_count,
    m.min_x,
    m.max_x,
    m.min_y,
    m.max_y,
    m.chord_length,
    m.max_thickness,
    m.source_url,
    m.filename,
    COUNT(c.id) as actual_point_count,
    m.created_at,
    m.updated_at
FROM airfoil_coordinates_metadata m
LEFT JOIN airfoil_coordinates c ON m.airfoil_name = c.airfoil_name
GROUP BY m.id, m.airfoil_name, m.point_count, m.min_x, m.max_x, m.min_y, m.max_y,
         m.chord_length, m.max_thickness, m.source_url, m.filename, m.created_at, m.updated_at;

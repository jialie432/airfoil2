# AeroDynamics.AI — Codebase Deep Dive

## What Is This Project?

**AeroDynamics.AI** is a **web application for searching, visualizing, and comparing aerodynamic airfoil profiles**. An "airfoil" is the cross-sectional shape of a wing (like on a plane or drone). Engineers care deeply about:

- **Cl (Lift Coefficient)** — how much lift the wing generates
- **Cd (Drag Coefficient)** — how much drag (air resistance) it creates
- **L/D or Cl/Cd** — the efficiency ratio (higher = better glide)
- **Alpha (angle of attack)** — the angle of the wing relative to airflow
- **Reynolds number (Re)** — describes the airflow regime (slow/small craft = low Re, fast/large = high Re)

The app lets you **filter airfoils** by Re, minimum Cl, and minimum thickness, then **rank** them by lift, drag, or efficiency. You can see each airfoil's **graphical cross-section shape** and **polar performance charts**.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend framework | **React 19** with **TypeScript** |
| Build tool | **Vite 6** (fast dev server & bundler) |
| Styling | **TailwindCSS** (via class names in JSX) |
| Charts | **Recharts** (LineChart, ResponsiveContainer) |
| Backend / Database | **Supabase** (hosted PostgreSQL with auto-generated REST API) |
| Data loading scripts | **tsx** (run TypeScript scripts directly in Node.js) |
| Python scripts | **requests** library (for downloading airfoil data from web) |

---

## Project Directory Map

```
airfoil2/
├── App.tsx                  ← Main React app (layout, state, routing)
├── index.tsx                ← Entry point (renders <App />)
├── index.html               ← HTML shell
├── types.ts                 ← TypeScript type definitions
├── constants.tsx            ← Hardcoded sample CSV data (3 demo airfoils)
│
├── components/
│   ├── SearchFilters.tsx    ← Filter UI panel (Re, minCl, minThickness, sort)
│   ├── AirfoilChart.tsx     ← 3 performance charts (Cl, Cd, L/D vs Alpha)
│   └── AirfoilShape.tsx     ← SVG cross-section shape renderer
│
├── services/
│   ├── supabaseClient.ts    ← Supabase connection (reads env vars)
│   ├── airfoilService.ts    ← All DB queries and business logic ← YOU ARE HERE
│   └── csvParser.ts         ← Parses raw XFOIL CSV text into JS objects
│
├── database/
│   ├── schema.sql                        ← DB table definitions
│   ├── migration_add_clcd_columns.sql    ← Added Cl/Cd columns
│   ├── migration_add_coordinates_table.sql ← Added shape coords table
│   └── migration_add_min_max_columns.sql   ← Added min/max stat columns
│
├── scripts/
│   ├── loadCsvToDatabase.ts        ← Node script: bulk-load CSV → Supabase
│   ├── loadCoordinatesToDatabase.ts ← Node script: load shape coords → Supabase
│   ├── download_airfoil_coordinates.py ← Python: scrape airfoiltools.com
│   └── README_*.md                  ← How-to docs for the scripts
│
├── airfoil_polars/          ← ~8000+ XFOIL CSV files (one per airfoil/Re combo)
├── all_airfoils/            ← ~1000 airfoil coordinate `.dat` files
└── all_airfoils_list.txt    ← List of all airfoil names
```

---

## The Data Model

### Types ([types.ts](file:///Users/jialielu/highschoolproj/airfoil2/types.ts))

```typescript
// A single row in the polar data table — one angle-of-attack measurement
interface PolarDataPoint {
  alpha: number;  // Angle of attack (degrees)
  cl: number;     // Lift coefficient
  cd: number;     // Drag coefficient
  cdp: number;    // Pressure drag component
  cm: number;     // Pitching moment coefficient
  topXtr: number; // Transition point (upper surface)
  botXtr: number; // Transition point (lower surface)
  clcd: number;   // Computed: cl / cd (Lift-to-Drag ratio)
}

// One "polar" = one airfoil at one Reynolds number + Mach + Ncrit combo
interface AirfoilPolar {
  polarKey: string;      // Unique ID, e.g. "xf-naca2412-il-200000-n9"
  airfoilName: string;   // e.g. "naca2412"
  reynolds: number;      // e.g. 200000
  ncrit: number;         // Turbulence level (5=turbulent, 9=clean)
  mach: number;          // Mach number (usually 0 = incompressible)
  maxClCd: number;       // Pre-computed peak efficiency value
  maxClCdAlpha: number;  // Alpha at which peak efficiency occurs
  url: string;           // Source URL on airfoiltools.com
  data: PolarDataPoint[]; // All the measurement rows
}

// User-selected search parameters
interface SearchFilters {
  reynolds: number | null;       // Exact Re match (or null = all)
  minCl: number | null;          // Filter: only airfoils where max_cl > minCl
  minThickness: number | null;   // Filter: only airfoils where max_thickness >= this (e.g. 0.12 = 12% chord)
  sortBy: 'cl' | 'cd' | 'clcd' | null;  // What metric to rank by
  sortOrder: 'asc' | 'desc';    // Direction of ranking
}
```

### Database Schema ([database/schema.sql](file:///Users/jialielu/highschoolproj/airfoil2/database/schema.sql))

There are **3 main tables** in Supabase:

#### 1. `airfoil_polars_metadata`
Stores **one row per polar file** (summary/header data):
- `polar_key` — unique identifier
- `airfoil_name`, `reynolds`, `ncrit`, `mach`
- `max_cl_cd`, `max_cl_cd_alpha` — pre-computed peak L/D
- `min_cl`, `max_cl`, `min_cd`, `max_cd` — pre-computed stat ranges (used for fast filtering!)
- `url`, `filename`

#### 2. `airfoil_polar_data_points`
Stores **one row per data point** (alpha measurement):
- `polar_metadata_id` — foreign key → `airfoil_polars_metadata`
- `alpha`, `cl`, `cd`, `cdp`, `cm`, `top_xtr`, `bot_xtr`
- `clcd` — **generated column**: automatically computed as `cl / cd` by the DB itself

#### 3. `airfoil_coordinates_metadata` + `airfoil_coordinates`
Stores the **geometric shape** (x,y points) of each airfoil cross-section:
- `max_thickness`, `chord_length`, `point_count`
- Shape x/y coordinates ordered by `point_order`

> **Why two separate tables?** Performance. To find the top 20 airfoils matching your filter, you only need to query `airfoil_polars_metadata` (fast!). Then you fetch the full data points only for those 20 matches.

---

## Data Flow: How a Search Works

```
User sets filters → clicks "Commit Search"
        ↓
App.tsx: handleSearch() calls searchAirfoils(filters)
        ↓
airfoilService.ts: searchAirfoils()
  │
  ├── Step 1: fetchAllMetadata(reynolds, minCl, minThickness)
  │     ├── [If minThickness set] → fetchAirfoilsAboveThickness()
  │     │     └── Queries airfoil_coordinates_metadata WHERE max_thickness >= minThickness
  │     │         Returns a Set<string> of qualifying airfoil names
  │     │
  │     └── Paginated query on airfoil_polars_metadata:
  │           WHERE reynolds = X (if set)
  │           WHERE max_cl > minCl (if set)
  │           Pages of 1000 rows at a time
  │           → In-memory filter: only keep rows whose airfoil_name is in the thickness Set
  │
  ├── Step 2: fetchDataPointsBatch(metadataIds)
  │     → Fetches all data points for matched polars
  │     → Groups them into a Map<polarId, DataPoint[]>
  │     → Done in batches of 10 IDs (Supabase limit)
  │
  ├── Step 3: convertToAirfoilPolar()
  │     → Transforms DB row format into frontend AirfoilPolar objects
  │
  └── Step 4: sortAirfoils(polars, sortBy, sortOrder)
        → Sorts in memory:
          'cl'   → max Cl across all data points
          'cd'   → min Cd across all data points
          'clcd' → max Cl/Cd (L/D) across all data points
```

---

## File-by-File Breakdown

### [App.tsx](file:///Users/jialielu/highschoolproj/airfoil2/App.tsx) — The Master Controller

This is the **root component** and holds all the state.

**State:**
```typescript
isDark         // Light/dark theme toggle
filters        // Current SearchFilters object
results        // Array of AirfoilPolar[] from last search
loading        // Shows spinner overlay while searching
selectedAirfoil // Which airfoil the user clicked to view in detail
```

**On mount:** Auto-loads first 100 airfoils alphabetically via [getAllAirfoils()](file:///Users/jialielu/highschoolproj/airfoil2/services/airfoilService.ts#303-345).

**Layout (top-to-bottom):**
1. **Header** — Logo, dark mode toggle, live system clock
2. **SearchFilters** — Filter panel
3. **Sidebar** — Scrollable list of all result airfoils (click to select)
4. **Main panel** — When an airfoil is selected, shows:
   - HUD stat cards (Re, L/D, Alpha, Mach)
   - [AirfoilShape](file:///Users/jialielu/highschoolproj/airfoil2/components/AirfoilShape.tsx#26-328) — the cross-section shape SVG
   - [AirfoilChart](file:///Users/jialielu/highschoolproj/airfoil2/components/AirfoilChart.tsx#12-130) — the 3 performance charts
   - "Static Polar Log" — a table of all raw data points
5. **Footer** — Copyright, version info
6. **Loading overlay** — Full-screen spinner during searches

---

### [components/SearchFilters.tsx](file:///Users/jialielu/highschoolproj/airfoil2/components/SearchFilters.tsx) — Filter Panel

Renders the search parameter UI. Accepts `filters`, `setFilters`, and `onSearch` as props.

**Controls:**
- **Reynolds preset buttons** — 50k, 100k, 200k, 500k, 1M (toggle, single-select)
- **Min Cl input** — Number field (e.g. enter `1.5` to only show airfoils with max Cl > 1.5)
- **Min Thickness input** — Number field (e.g. `0.12` = 12% chord thickness minimum)
- **Sort By dropdown** — Max Cl / Min Cd / Max L/D
- **Sort Order dropdown** — Descending / Ascending
- **"Clear Deck" button** — Resets all filters to null
- **"Commit Search" button** — Calls `onSearch()` which runs the actual query

---

### [components/AirfoilChart.tsx](file:///Users/jialielu/highschoolproj/airfoil2/components/AirfoilChart.tsx) — Performance Charts

Renders **3 line charts** using the Recharts library:

1. **Cl vs Alpha** — How lift coefficient changes with angle of attack (main polar curve)
   - Has a `Brush` scrubber to zoom into a range
2. **Cd vs Alpha** — How drag changes with angle of attack
3. **L/D (Cl/Cd) vs Alpha** — The efficiency curve — you want to fly at the peak of this

Colors automatically switch between light/dark mode themes (aviation blue for lift, red for drag, green for efficiency).

---

### [components/AirfoilShape.tsx](file:///Users/jialielu/highschoolproj/airfoil2/components/AirfoilShape.tsx) — Wing Cross-Section Renderer

This is the most geometrically interesting component. It:

1. **Fetches coordinates** from Supabase (`airfoil_coordinates` table) for the given `airfoilName`
2. Also fetches **metadata** (chord, thickness, point count)
3. **Calculates a viewBox** — finds the bounding box of all x,y points, adds 10% padding
4. **Handles Y-axis flip** — SVG has Y=0 at top-left (Y increases downward), but aerodynamic coordinates have Y=0 at bottom (Y increases upward). So every y value is negated (`-y`) when drawing.
5. **Detects Selig format** — The standard airfoil coordinate format goes upper surface trailing-edge → leading-edge, then lower surface leading-edge → trailing-edge. The code detects this and traces the path correctly.
6. Draws an **SVG path** with a semitransparent fill
7. Marks the **leading edge** (leftmost point) and **trailing edge** (rightmost points) with dots
8. Shows **chord length, max thickness, and point count** below

---

### [services/airfoilService.ts](file:///Users/jialielu/highschoolproj/airfoil2/services/airfoilService.ts) — The Brain

All database access lives here. Key functions:

| Function | What it does |
|---|---|
| [searchAirfoils(filters)](file:///Users/jialielu/highschoolproj/airfoil2/services/airfoilService.ts#269-302) | Main search: 4-step pipeline (see flow above) |
| [getAllAirfoils()](file:///Users/jialielu/highschoolproj/airfoil2/services/airfoilService.ts#303-345) | Loads first 100 airfoils alphabetically (initial page load) |
| [fetchAllMetadata(re, minCl, minThickness)](file:///Users/jialielu/highschoolproj/airfoil2/services/airfoilService.ts#163-225) | Paginated metadata query with filters |
| [fetchAirfoilsAboveThickness(minThickness)](file:///Users/jialielu/highschoolproj/airfoil2/services/airfoilService.ts#122-162) | Pre-fetches airfoil names from coords table |
| [fetchDataPoints(polarMetadataId)](file:///Users/jialielu/highschoolproj/airfoil2/services/airfoilService.ts#58-75) | Fetches data points for a single polar |
| [fetchDataPointsBatch(ids[])](file:///Users/jialielu/highschoolproj/airfoil2/services/airfoilService.ts#76-121) | Fetches data points for many polars at once (batched in 10s) |
| [convertToAirfoilPolar(metadata, dataPoints)](file:///Users/jialielu/highschoolproj/airfoil2/services/airfoilService.ts#32-57) | Transforms DB format → app format |
| [sortAirfoils(polars, sortBy, sortOrder)](file:///Users/jialielu/highschoolproj/airfoil2/services/airfoilService.ts#226-268) | In-memory sort of results |

**Why pagination?** Supabase (and the underlying Postgres REST API) caps responses at 1000 rows per request. The [fetchAllMetadata](file:///Users/jialielu/highschoolproj/airfoil2/services/airfoilService.ts#163-225) function uses a `while (hasMore)` loop with `offset` to retrieve all matching rows across multiple pages.

**Why batch the data point queries?** Supabase's `.in()` operator has practical limits. The code processes 10 polar IDs at a time, fetching all their data points in each batch.

**Why is the thickness filter done in-memory?** Thickness lives in a *different* table (`airfoil_coordinates_metadata`) than the polar data (`airfoil_polars_metadata`). You can't directly `JOIN` them in a Supabase REST query. So the code:
1. Pre-fetches all qualifying airfoil names into a JavaScript `Set`
2. Then filters the metadata results in memory using `.filter()`

---

### [services/csvParser.ts](file:///Users/jialielu/highschoolproj/airfoil2/services/csvParser.ts) — CSV File Parser

Parses the raw XFOIL CSV format. Used both:
- By the **loading script** (to parse files off disk before DB upload)
- Historically in the app (now mostly replaced by DB reads)

The CSV format has a header block (key-value pairs) then a data block (comma-separated rows). The parser:
1. Scans line by line, extracting header values
2. Detects when it hits `Alpha,Cl,Cd,...` which marks the start of data rows
3. Parses each data row and computes `clcd = cl / cd`

---

### [services/supabaseClient.ts](file:///Users/jialielu/highschoolproj/airfoil2/services/supabaseClient.ts) — Database Connection

Just 12 lines. Reads `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from environment variables ([.env.local](file:///Users/jialielu/highschoolproj/airfoil2/.env.local) file), and creates/exports the Supabase client singleton.

> **Why `VITE_` prefix?** Vite only exposes env vars to the browser if they start with `VITE_`. This is a security feature — it prevents you from accidentally leaking server secrets.

---

### [scripts/loadCsvToDatabase.ts](file:///Users/jialielu/highschoolproj/airfoil2/scripts/loadCsvToDatabase.ts) — Bulk Data Loader

A **Node.js script** (not a React component) that:
1. Reads all `.csv` files from the `airfoil_polars/` directory
2. For each file:
   - Parses it with [parseXfoilCSV()](file:///Users/jialielu/highschoolproj/airfoil2/services/csvParser.ts#4-60)
   - Calculates min/max of alpha, cl, cd from data points
   - **Upserts** the metadata row (insert or update based on `polar_key`)
   - Deletes old data points for that polar (to handle re-runs)
   - Bulk-inserts new data points in batches of 1000
3. Processes 5 files concurrently using `Promise.allSettled()`
4. Prints a summary of successes and failures

Run it with: `npm run load:csv`

---

### [constants.tsx](file:///Users/jialielu/highschoolproj/airfoil2/constants.tsx) — Sample Data

Contains hardcoded raw CSV strings for 3 airfoils:
- `ag08-il` at Re=50,000
- `mh32` at Re=100,000
- `naca2412` at Re=200,000

These were used early in development before the database was connected, as demo/fallback data.

---

## The Aeronautical Concepts (Plain English)

| Term | Meaning |
|---|---|
| **Airfoil** | The cross-section shape of a wing |
| **Polar** | A graph/dataset showing aerodynamic coefficients across a range of angles |
| **Alpha (α)** | Angle of attack — how tilted the wing is relative to airflow |
| **Cl** | Lift coefficient — normalized lift force (higher = more lift) |
| **Cd** | Drag coefficient — normalized air resistance (lower = less drag) |
| **Cl/Cd (L/D)** | Lift-to-Drag ratio — the "efficiency" of the airfoil. A glider wants this high. |
| **Reynolds number** | Dimensionless number characterizing flow regime. Low Re (50k) = slow/small (drones, model planes). High Re (1M+) = fast/large (full-size aircraft). |
| **Mach number** | Speed as a fraction of the speed of sound. Most airfoils are tested at Mach 0 (incompressible flow). |
| **Ncrit** | Turbulence level of the test environment. Ncrit=9 is very clean (low turbulence), Ncrit=5 is more turbulent. |
| **XFOIL** | A computational tool (by MIT) that simulates airfoil aerodynamics and generates polar data |
| **Selig format** | The standard file format for airfoil coordinates, named after Professor Michael Selig |
| **Trailing edge / Leading edge** | Back and front tips of the airfoil respectively |

---

## How the Data Got Into the Database

1. **Downloaded** ~1000+ airfoil coordinate files from airfoiltools.com using [download_airfoil_coordinates.py](file:///Users/jialielu/highschoolproj/airfoil2/scripts/download_airfoil_coordinates.py)
2. **Downloaded** ~8000+ XFOIL polar CSV files from airfoiltools.com (same Python script)
3. **Ran** `npm run load:csv` → [loadCsvToDatabase.ts](file:///Users/jialielu/highschoolproj/airfoil2/scripts/loadCsvToDatabase.ts) → bulk-loaded all CSVs into Supabase
4. **Ran** [loadCoordinatesToDatabase.ts](file:///Users/jialielu/highschoolproj/airfoil2/scripts/loadCoordinatesToDatabase.ts) → loaded all coordinate files into Supabase

The `airfoil_polars/` directory still contains all ~8,232 CSV files locally.

---

## Key Design Decisions

1. **Supabase for backend** — No custom server needed. The Supabase REST API auto-generates from the schema. Perfect for a school project.
2. **Pre-computed min/max columns** — Rather than running `SELECT MAX(cl)` every search, the upload script pre-calculates `max_cl` and stores it in the metadata row. This makes filter queries instant.
3. **`clcd` as generated column** — The database computes `cl / cd` automatically on insert, so you never have to compute it in the app.
4. **Two-table design** — Separating metadata from data points means you can filter to 20 matching airfoils without pulling millions of data point rows.
5. **In-memory sorting** — After fetching results, sorting is done in JavaScript. This is fine because the number of returned results is bounded (search is already filtered).
6. **Thickness filter as a cross-table post-filter** — Since Supabase REST doesn't support arbitrary JOINs, the thickness filter is resolved client-side using a pre-fetched Set.

# Search Filter Overhaul - Summary

## Overview
The search filter system has been completely overhauled to simplify filtering and add powerful ranking capabilities.

## Changes Made

### 1. **Simplified Filter Criteria**
**Before:** Complex multi-parameter filtering including:
- Reynolds Number
- Alpha range (min/max)
- Cl range (min/max)
- Cd range (min/max)
- L/D Efficiency range (min/max)

**After:** Streamlined to essential filters only:
- **Reynolds Number** - Same as before (discrete selection from presets)
- **Minimum Cl Threshold** - Single value input that returns only airfoils where `max_cl > input value`

### 2. **New Ranking/Sorting Functionality**
Added powerful sorting capabilities to rank results by:
- **Max Cl** (Maximum Lift Coefficient)
- **Min Cd** (Minimum Drag Coefficient)  
- **Max L/D** (Maximum Lift-to-Drag Ratio / Cl/Cd)

Each can be sorted in:
- **Descending order** (Highest first) - Default
- **Ascending order** (Lowest first)

### 3. **Files Modified**

#### `types.ts`
- Simplified `SearchFilters` interface
- Removed: `alphaMin`, `alphaMax`, `clMin`, `clMax`, `cdMin`, `cdMax`, `clcdMin`, `clcdMax`
- Added: `minCl`, `sortBy`, `sortOrder`

```typescript
export interface SearchFilters {
  reynolds: number | null;
  minCl: number | null; // Minimum Cl threshold
  sortBy: 'cl' | 'cd' | 'clcd' | null; // Sort by Cl, Cd, or L/D
  sortOrder: 'asc' | 'desc'; // Ascending or Descending
}
```

#### `components/SearchFilters.tsx`
- Removed all filter inputs except Reynolds and Cl
- Added new "Ranking & Order" section with two dropdowns:
  - **Sort By** dropdown (Max Cl, Min Cd, Max L/D, or No Sorting)
  - **Order** dropdown (Descending or Ascending)
- Updated reset handler to clear all filters including sort options
- Cleaner, more focused UI that's easier to use

#### `services/airfoilService.ts`
- Simplified `fetchAllMetadata()` to only apply Reynolds and minimum Cl filters at database level
- Removed complex data point filtering logic (no longer needed)
- Added new `sortAirfoils()` function that:
  - Calculates max/min values from data points
  - Sorts results based on user selection
  - Handles all three sort criteria (Cl, Cd, L/D)
- Updated `searchAirfoils()` to call sorting function before returning results

#### `App.tsx`
- Updated initial filter state to match new interface
- Changed from 11 filter fields to 4 fields

## How It Works

### Filtering Logic
1. **Reynolds Filter**: Exact match on Reynolds number (if specified)
2. **Minimum Cl Filter**: Database query with `max_cl > minCl` (if specified)

### Sorting Logic
When a sort option is selected:
1. For each airfoil, the system calculates:
   - **Max Cl**: `Math.max(...data.map(d => d.cl))`
   - **Min Cd**: `Math.min(...data.map(d => d.cd))`
   - **Max L/D**: `Math.max(...data.map(d => d.clcd))`
2. Results are sorted based on the selected metric
3. Sort order (asc/desc) is applied

### Example Use Cases

**Find high-lift airfoils:**
- Set "Minimum Cl Threshold" to `1.5`
- Set "Sort By" to "Max Cl (Lift Coefficient)"
- Set "Order" to "Descending"
- Results show airfoils with max Cl > 1.5, ranked from highest to lowest Cl

**Find efficient airfoils:**
- Leave "Minimum Cl Threshold" empty
- Set "Sort By" to "Max L/D (Cl/Cd Ratio)"
- Set "Order" to "Descending"
- Results show all airfoils ranked by efficiency

**Find low-drag airfoils at specific Reynolds:**
- Select Reynolds preset (e.g., "100k")
- Set "Sort By" to "Min Cd (Drag Coefficient)"
- Set "Order" to "Ascending"
- Results show airfoils at Re=100k ranked from lowest to highest drag

## Benefits

1. **Simpler Interface**: Users focus on what matters most - Reynolds and minimum lift requirement
2. **More Flexible Ranking**: Can sort by any performance metric, not just filter by ranges
3. **Better Performance**: Fewer database queries, simpler logic
4. **Clearer Intent**: "Minimum Cl > X" is more intuitive than "Cl range contains X to Y"
5. **More Useful Results**: Ranking shows the best options first, rather than just yes/no filtering

## Database Query Optimization

The new approach is more efficient:
- **Before**: Multiple metadata filters + complex data point queries for each result
- **After**: Simple metadata filter + single batch data point fetch + client-side sorting

This reduces database load and improves search speed, especially for large result sets.

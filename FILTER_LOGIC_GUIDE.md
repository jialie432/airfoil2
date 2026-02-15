# Filter Logic Visualization

## Understanding "Fits Within" Logic

### Example Scenario

**Airfoil Capability:**
- CL range: [0.2, 1.5] (min_cl = 0.2, max_cl = 1.5)
- CD range: [0.005, 0.050] (min_cd = 0.005, max_cd = 0.050)
- L/D range: [20, 150] (min_clcd = 20, max_clcd = 150)

### Filter Test Cases

#### Test 1: Input Range Fits Within Airfoil Range ✅
**User Input:** CL [0.5, 1.0]
**Check:** 
- Is airfoil's min_cl (0.2) <= input min (0.5)? ✅ Yes
- Is airfoil's max_cl (1.5) >= input max (1.0)? ✅ Yes
**Result:** MATCH - Airfoil is returned

**Why?** The airfoil can provide CL values from 0.2 to 1.5, which completely covers the requested range of 0.5 to 1.0.

#### Test 2: Input Range Exceeds Airfoil Range ❌
**User Input:** CL [0.1, 1.8]
**Check:**
- Is airfoil's min_cl (0.2) <= input min (0.1)? ❌ No (0.2 > 0.1)
- Is airfoil's max_cl (1.5) >= input max (1.8)? ❌ No (1.5 < 1.8)
**Result:** NO MATCH - Airfoil is NOT returned

**Why?** The airfoil cannot provide CL values as low as 0.1 or as high as 1.8.

#### Test 3: Partial Overlap (Low End) ❌
**User Input:** CL [0.1, 0.8]
**Check:**
- Is airfoil's min_cl (0.2) <= input min (0.1)? ❌ No (0.2 > 0.1)
**Result:** NO MATCH - Airfoil is NOT returned

**Why?** Even though the airfoil can reach 0.8, it cannot go as low as 0.1.

#### Test 4: Partial Overlap (High End) ❌
**User Input:** CL [1.2, 2.0]
**Check:**
- Is airfoil's min_cl (0.2) <= input min (1.2)? ✅ Yes
- Is airfoil's max_cl (1.5) >= input max (2.0)? ❌ No (1.5 < 2.0)
**Result:** NO MATCH - Airfoil is NOT returned

**Why?** Even though the airfoil can reach 1.2, it cannot go as high as 2.0.

## SQL Query Translation

### CL Filter
```sql
-- User searches for CL range [0.5, 1.0]
WHERE min_cl <= 0.5    -- Airfoil can go at least as low as requested
  AND max_cl >= 1.0    -- Airfoil can go at least as high as requested
```

### CD Filter
```sql
-- User searches for CD range [0.01, 0.02]
WHERE min_cd <= 0.01   -- Airfoil can go at least as low as requested
  AND max_cd >= 0.02   -- Airfoil can go at least as high as requested
```

### L/D Efficiency Filter
```sql
-- User searches for L/D range [50, 100]
WHERE min_clcd <= 50   -- Airfoil can achieve at least as low as requested
  AND max_clcd >= 100  -- Airfoil can achieve at least as high as requested
```

## Code Implementation

### TypeScript/Supabase Query Builder
```typescript
// CL Filter
if (filters.clMin !== null) {
  query = query.lte('min_cl', filters.clMin); // min_cl <= clMin
}
if (filters.clMax !== null) {
  query = query.gte('max_cl', filters.clMax); // max_cl >= clMax
}

// CD Filter
if (filters.cdMin !== null) {
  query = query.lte('min_cd', filters.cdMin); // min_cd <= cdMin
}
if (filters.cdMax !== null) {
  query = query.gte('max_cd', filters.cdMax); // max_cd >= cdMax
}
```

### L/D Filter (Metadata Check)
```typescript
// Check at metadata level
if (filters.clcdMin !== null && metadata.min_clcd !== null) {
  if (metadata.min_clcd > filters.clcdMin) {
    return false; // Airfoil can't go as low as requested
  }
}
if (filters.clcdMax !== null && metadata.max_clcd !== null) {
  if (metadata.max_clcd < filters.clcdMax) {
    return false; // Airfoil can't go as high as requested
  }
}
```

## Visual Diagram

```
Airfoil Capability:    [===================]
                       0.2                 1.5

Test 1 (MATCH):              [=====]
                             0.5   1.0

Test 2 (NO MATCH):     [=====================]
                       0.1                 1.8

Test 3 (NO MATCH):     [=====]
                       0.1   0.8

Test 4 (NO MATCH):                    [=========]
                                      1.2     2.0
```

## Key Principle

**An airfoil matches the filter if and only if:**
> The airfoil's capability range **completely contains** the user's requested range.

This ensures that:
1. All requested values are achievable by the airfoil
2. The airfoil has data points covering the entire requested range
3. Users get airfoils that can definitely perform within their specified requirements

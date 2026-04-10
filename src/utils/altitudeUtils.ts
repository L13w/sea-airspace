// Convert altitude values (in feet) to meters
// Handles both numeric and string values (some FAA APIs return strings)
export function feetValueToMeters(value: number | string | null): number {
  if (value === null || value === undefined) return 0;
  const numValue = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(numValue)) return 0;
  // value is already in feet, convert to meters
  return numValue * 0.3048;
}

export function feetToMeters(feet: number): number {
  return feet * 0.3048;
}

export function metersToFeet(meters: number): number {
  return meters / 0.3048;
}

export function parseFloorAltitude(
  lowerVal: number | string | null,
  lowerCode: string
): number {
  // SFC = surface = 0
  if (lowerCode === 'SFC' || lowerVal === null) return 0;

  // Values are already in feet
  return feetValueToMeters(lowerVal);
}

// Maximum ceiling for visualization (18,000' MSL)
// Restricted areas can extend to FL600 (60,000') which creates visual outliers
// Cap the 3D extrusion while tooltip still shows actual values
const MAX_CEILING_FEET = 18000;

export function parseCeilingAltitude(
  upperVal: number | string | null,
  _upperCode: string
): number {
  if (upperVal === null) return feetValueToMeters(MAX_CEILING_FEET);
  const numValue = typeof upperVal === 'string' ? parseFloat(upperVal) : upperVal;
  if (isNaN(numValue)) return feetValueToMeters(MAX_CEILING_FEET);
  // Cap ceiling for consistent visualization scale
  const cappedValue = Math.min(numValue, MAX_CEILING_FEET);
  return feetValueToMeters(cappedValue);
}

// Format altitude for display
// The API returns values in feet directly (e.g., 5000 = 5,000 feet)
// Handles both numeric and string values (some FAA APIs return strings)
export function formatAltitude(value: number | string | null, code: string): string {
  if (code === 'SFC') return 'Surface';
  if (value === null) return 'Unknown';
  const numValue = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(numValue)) return 'Unknown';
  // Value is already in feet
  return `${numValue.toLocaleString()}'`;
}

// Format meters as feet for display
export function formatMetersAsFeet(meters: number): string {
  const feet = Math.round(metersToFeet(meters));
  return `${feet.toLocaleString()}'`;
}

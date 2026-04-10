export interface AirspaceProperties {
  OBJECTID: number;
  NAME: string;
  CLASS: 'B' | 'C' | 'D' | 'E' | 'P' | 'R' | string;
  TYPE_CODE?: string; // For SUA: 'P' (Prohibited), 'R' (Restricted), etc.
  LOCAL_TYPE: string;
  LOWER_VAL: number | string | null; // String in SUA/Prohibited APIs, number in Class Airspace
  LOWER_DESC: string;
  LOWER_UOM: string;
  LOWER_CODE: 'MSL' | 'AGL' | 'SFC' | string;
  UPPER_VAL: number | string | null; // String in SUA/Prohibited APIs, number in Class Airspace
  UPPER_DESC: string;
  UPPER_UOM: string;
  UPPER_CODE: 'MSL' | 'AGL' | string;
}

export interface AirspaceFeature {
  type: 'Feature';
  geometry: {
    type: 'Polygon' | 'MultiPolygon';
    coordinates: number[][][] | number[][][][];
  };
  properties: AirspaceProperties;
}

export interface AirspaceGeoJSON {
  type: 'FeatureCollection';
  features: AirspaceFeature[];
}

export interface ProcessedAirspace extends AirspaceFeature {
  floorMeters: number;
  ceilingMeters: number;
  extrusionHeight: number;
  color: [number, number, number, number];
}

export interface SeattleBounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

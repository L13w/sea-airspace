import { useState, useEffect } from 'react';
import type { AirspaceGeoJSON, ProcessedAirspace, SeattleBounds } from '../types/airspace';
import { processAirspaceFeatures } from '../utils/geometryUtils';

const API_URL = 'https://services6.arcgis.com/ssFJjBXIUyZDrSYZ/arcgis/rest/services/Class_Airspace/FeatureServer/0/query';

interface UseAirspaceDataReturn {
  data: ProcessedAirspace[] | null;
  loading: boolean;
  error: Error | null;
}

export function useAirspaceData(bounds: SeattleBounds): UseAirspaceDataReturn {
  const [data, setData] = useState<ProcessedAirspace[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams({
        outFields: '*',
        where: '1=1',
        f: 'geojson',
        geometry: `${bounds.minLng},${bounds.minLat},${bounds.maxLng},${bounds.maxLat}`,
        geometryType: 'esriGeometryEnvelope',
        inSR: '4326',
        spatialRel: 'esriSpatialRelIntersects',
      });

      try {
        const response = await fetch(`${API_URL}?${params}`);
        if (!response.ok) {
          throw new Error(`Failed to fetch airspace data: ${response.status}`);
        }

        const geojson: AirspaceGeoJSON = await response.json();

        // Filter to only include Class B, C, D, E airspace
        const filteredFeatures = geojson.features.filter(f =>
          ['B', 'C', 'D', 'E'].includes(f.properties.CLASS)
        );

        const processed = processAirspaceFeatures(filteredFeatures);
        setData(processed);
      } catch (err) {
        console.error('Error fetching airspace data:', err);
        setError(err as Error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [bounds.minLat, bounds.maxLat, bounds.minLng, bounds.maxLng]);

  return { data, loading, error };
}

// Seattle area bounds
export const SEATTLE_BOUNDS: SeattleBounds = {
  minLat: 47.0,
  maxLat: 48.2,
  minLng: -123.0,
  maxLng: -121.5,
};

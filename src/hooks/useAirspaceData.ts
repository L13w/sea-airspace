import { useState, useEffect } from 'react';
import type { AirspaceGeoJSON, ProcessedAirspace, AirspaceFeature } from '../types/airspace';
import { processAirspaceFeatures } from '../utils/geometryUtils';
import type { TerminalArea } from '../config/terminalAreas';

const CLASS_AIRSPACE_URL = 'https://services6.arcgis.com/ssFJjBXIUyZDrSYZ/arcgis/rest/services/Class_Airspace/FeatureServer/0/query';
const PROHIBITED_AREAS_URL = 'https://services6.arcgis.com/ssFJjBXIUyZDrSYZ/arcgis/rest/services/Prohibited_Areas/FeatureServer/0/query';
const SUA_URL = 'https://services6.arcgis.com/ssFJjBXIUyZDrSYZ/arcgis/rest/services/Special_Use_Airspace/FeatureServer/0/query';

interface UseAirspaceDataReturn {
  data: ProcessedAirspace[] | null;
  loading: boolean;
  error: Error | null;
}

export function useAirspaceData(terminalArea: TerminalArea): UseAirspaceDataReturn {
  const [data, setData] = useState<ProcessedAirspace[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);

      const { bounds } = terminalArea;
      const baseParams = {
        outFields: '*',
        where: '1=1',
        f: 'geojson',
        geometry: `${bounds.minLng},${bounds.minLat},${bounds.maxLng},${bounds.maxLat}`,
        geometryType: 'esriGeometryEnvelope',
        inSR: '4326',
        spatialRel: 'esriSpatialRelIntersects',
      };

      try {
        // Fetch Class B, C, D, E airspace
        const classParams = new URLSearchParams(baseParams);
        const classResponse = await fetch(`${CLASS_AIRSPACE_URL}?${classParams}`);
        if (!classResponse.ok) {
          throw new Error(`Failed to fetch class airspace data: ${classResponse.status}`);
        }
        const classGeojson: AirspaceGeoJSON = await classResponse.json();

        // Filter to only include Class B, C, D, E airspace
        const classFeatures = classGeojson.features.filter(f =>
          ['B', 'C', 'D', 'E'].includes(f.properties.CLASS)
        );

        // Fetch Prohibited Areas (P)
        const prohibitedParams = new URLSearchParams(baseParams);
        const prohibitedResponse = await fetch(`${PROHIBITED_AREAS_URL}?${prohibitedParams}`);
        let prohibitedFeatures: AirspaceFeature[] = [];
        if (prohibitedResponse.ok) {
          const prohibitedGeojson: AirspaceGeoJSON = await prohibitedResponse.json();
          // Map TYPE_CODE to CLASS for consistent handling
          prohibitedFeatures = prohibitedGeojson.features.map(f => ({
            ...f,
            properties: {
              ...f.properties,
              CLASS: f.properties.TYPE_CODE || 'P',
            }
          }));
        }

        // Fetch Restricted Areas (R) from Special Use Airspace
        // Only fetch R (Restricted) types, not all SUA
        const suaParams = new URLSearchParams({
          ...baseParams,
          where: "TYPE_CODE='R'",
        });
        const suaResponse = await fetch(`${SUA_URL}?${suaParams}`);
        let restrictedFeatures: AirspaceFeature[] = [];
        if (suaResponse.ok) {
          const suaGeojson: AirspaceGeoJSON = await suaResponse.json();
          // Map TYPE_CODE to CLASS for consistent handling
          restrictedFeatures = suaGeojson.features.map(f => ({
            ...f,
            properties: {
              ...f.properties,
              CLASS: f.properties.TYPE_CODE || 'R',
            }
          }));
        }

        // Combine all features
        const allFeatures = [...classFeatures, ...prohibitedFeatures, ...restrictedFeatures];

        const processed = processAirspaceFeatures(allFeatures);
        setData(processed);
      } catch (err) {
        console.error('Error fetching airspace data:', err);
        setError(err as Error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [terminalArea.id, terminalArea.bounds.minLat, terminalArea.bounds.maxLat, terminalArea.bounds.minLng, terminalArea.bounds.maxLng]);

  return { data, loading, error };
}

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

        // Fetch Prohibited Areas (P) — auxiliary; tolerate any failure without
        // aborting the whole load (Class airspace is the primary data).
        const prohibitedParams = new URLSearchParams(baseParams);
        let prohibitedFeatures: AirspaceFeature[] = [];
        try {
          const prohibitedResponse = await fetch(`${PROHIBITED_AREAS_URL}?${prohibitedParams}`);
          if (prohibitedResponse.ok) {
            const prohibitedGeojson = await prohibitedResponse.json();
            if (prohibitedGeojson && Array.isArray(prohibitedGeojson.features)) {
              prohibitedFeatures = prohibitedGeojson.features.map((f: AirspaceFeature) => ({
                ...f,
                properties: {
                  ...f.properties,
                  CLASS: f.properties.TYPE_CODE || 'P',
                }
              }));
            } else {
              console.warn('Prohibited endpoint returned 200 without features array:', prohibitedGeojson);
            }
          }
        } catch (e) {
          console.warn('Prohibited fetch failed (continuing without it):', e);
        }

        // Fetch Restricted Areas (R) from Special Use Airspace — same tolerance.
        const suaParams = new URLSearchParams({
          ...baseParams,
          where: "TYPE_CODE='R'",
        });
        let restrictedFeatures: AirspaceFeature[] = [];
        try {
          const suaResponse = await fetch(`${SUA_URL}?${suaParams}`);
          if (suaResponse.ok) {
            const suaGeojson = await suaResponse.json();
            if (suaGeojson && Array.isArray(suaGeojson.features)) {
              restrictedFeatures = suaGeojson.features.map((f: AirspaceFeature) => ({
                ...f,
                properties: {
                  ...f.properties,
                  CLASS: f.properties.TYPE_CODE || 'R',
                }
              }));
            } else {
              console.warn('SUA endpoint returned 200 without features array:', suaGeojson);
            }
          }
        } catch (e) {
          console.warn('SUA fetch failed (continuing without it):', e);
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

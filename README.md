# 3D Airspace Visualizer

An interactive web-based 3D visualization of FAA airspace boundaries, rendering controlled airspace as volumetric "wedding cake" structures. Explore Class B, C, D, and E airspace for 32 US terminal areas.

**Live Demo**: [airspace.llew.me](https://airspace.llew.me)

## Features

- **3D Volumetric Rendering**: Airspace displayed as extruded 3D volumes showing floor-to-ceiling altitude extent
- **32 Terminal Areas**: Seattle, Los Angeles, New York, Chicago, and more
- **Interactive Controls**: Pan, zoom, rotate, and tilt the view
- **Click to Select**: Tap any airspace volume to see detailed information
- **Altitude Profile**: Visual chart showing airspace stacking (desktop)
- **Mobile Optimized**: Simplified touch-friendly interface for phones and tablets
- **FAA Sectional Chart**: Real VFR sectional chart as the base map layer

## How It Was Created

This project was built entirely through AI-assisted development using **Claude Code** (Anthropic's CLI tool). The entire codebase—from initial scaffolding to production deployment—was generated through natural language conversation with Claude.

### The Process

1. **Initial Prompt**: Started with a detailed specification (see below) describing the desired visualization
2. **Iterative Development**: Features were added through conversation—describing what was needed, reviewing results, and refining
3. **Real-time Debugging**: Issues were identified and fixed through dialogue
4. **Mobile Optimization**: Added responsive design through continued conversation

### Technology Stack

- **React 18** + **TypeScript** - UI framework
- **deck.gl** - WebGL-powered 3D visualization
- **MapLibre GL JS** - Map rendering (with react-map-gl)
- **Vite** - Build tooling
- **Docker** - Containerized deployment

### Data Source

Airspace boundaries from the FAA Aeronautical Data Delivery Service:
- [Class Airspace GeoJSON](https://adds-faa.opendata.arcgis.com/datasets/c6a62360338e408cb1512366ad61559e_0)

Base map tiles from FAA VFR Sectional Charts via ArcGIS.

## Running Locally

### Prerequisites
- Node.js 20+
- Docker (optional, for containerized deployment)

### Development
```bash
npm install
npm run dev
```

### Production Build
```bash
npm run build
npm run preview
```

### Docker
```bash
docker build -t airspace-visualizer .
docker run -d --name airspace -p 8080:80 airspace-visualizer
```

Then visit http://localhost:8080

## Project Structure

```
/src
  /components
    Map3D.tsx           # Main 3D map with deck.gl layers
    AirspaceProfile.tsx # Altitude profile chart (desktop)
    AltitudeScale.tsx   # Vertical altitude ruler
    InfoPanel.tsx       # Selected airspace details
    Legend.tsx          # Airspace class color legend
    MobileMenu.tsx      # Hamburger menu for mobile
    TerminalAreaSelector.tsx  # Airport/region picker
  /hooks
    useAirspaceData.ts  # Data fetching and processing
    useIsMobile.ts      # Responsive detection
  /utils
    altitudeUtils.ts    # Altitude conversion (MSL/AGL)
    colorUtils.ts       # FAA chart color schemes
  /config
    terminalAreas.ts    # 32 terminal area definitions
  /data
    *.geojson           # Processed airspace data per region
```

## Initial Prompt

The project began with this specification:

---

### Project: 3D Airspace Visualizer for the Seattle Area

#### Overview
Build a web-based 3D visualization app that renders FAA airspace boundaries with their vertical (altitude) extent, creating a volumetric "wedding cake" visualization of controlled airspace. Focus initially on the Seattle Class B airspace and surrounding Class C, D, and E airspaces.

#### Data Sources
The FAA provides official airspace boundary data in GeoJSON/Shapefile format:

1. **Primary Data Source**: FAA ADDS (Aeronautical Data Delivery Service)
   - Class Airspace: https://adds-faa.opendata.arcgis.com/datasets/c6a62360338e408cb1512366ad61559e_0
   - Airspace Boundaries: https://adds-faa.opendata.arcgis.com/datasets/67885972e4e940b2aa6d74024901c561_0
   - Download as GeoJSON for easier web integration

2. **Supplementary Data**: FAA 28-Day NASR Subscription
   - https://www.faa.gov/air_traffic/flight_info/aeronav/Aero_Data/NASR_Subscription
   - Contains shapefiles with detailed airspace data

3. **For reference**: OpenAIP (https://www.openaip.net/) provides community-maintained airspace data as backup

#### Altitude Data Conventions (Critical)
The GeoJSON features should contain floor/ceiling altitude attributes. Key conventions:
- **Class B, C, D**: Altitudes are in MSL (Mean Sea Level) in hundreds of feet
- **Class E transition areas**: Floor may be in AGL (700' or 1200' AGL typical)
- **"SFC" means surface** (floor = 0 or terrain elevation)
- Look for attributes like: `LOWER_VAL`, `UPPER_VAL`, `FLOOR`, `CEILING`, `LOW_ALT`, `HIGH_ALT`
- Numbers like "100/30" on sectional mean ceiling 10,000 ft MSL / floor 3,000 ft MSL

#### Seattle-Specific Airspace Structure
- **SEA-TAC Class B**: Classic inverted wedding cake, surface to 10,000' MSL at center
- **Boeing Field (BFI) Class D**: ~25 (2,500' MSL ceiling)
- **Renton (RNT) Class D**: Surface to 2,500' MSL
- **Paine Field (PAE) Class D**: Near Everett, 3,000' MSL ceiling
- Several Class E transition areas around smaller fields

#### Technology Stack (Recommended)
Use one of these 3D visualization approaches:

**Option A: deck.gl + Mapbox (Recommended for web)**
```javascript
// Use SolidPolygonLayer with extrusion for 3D volumes
import {SolidPolygonLayer} from '@deck.gl/layers';
import {GeoJsonLayer} from '@deck.gl/layers';
```
- Excellent GeoJSON support
- Easy altitude extrusion via `getElevation` and `extruded: true`
- Good React integration
- Free tier available for Mapbox basemap

**Option B: CesiumJS**
- Better for true 3D globe visualization
- Native support for altitude-aware polygons
- Reference: "OneSky Using Cesium / 3D Tiles For Volumetric Airspace Visualization"
- Cesium Ion free tier available

**Option C: Three.js + Mapbox**
- More control but more work
- Good if custom visualization effects needed

#### Core Features (MVP)
1. **Data Loading**: Fetch and parse FAA GeoJSON airspace data
2. **3D Extrusion**: Render each airspace segment as a 3D volume
   - Floor altitude = bottom of extrusion
   - Ceiling altitude = top of extrusion
   - Color-code by airspace class (Blue=B, Magenta=C, etc.)
3. **Transparency**: Semi-transparent volumes so overlapping airspace is visible
4. **Camera Controls**: Orbit, pan, zoom around the Seattle area
5. **Tooltip/Click**: Show airspace details (class, floor, ceiling, name)
6. **Terrain Option**: Optionally include terrain elevation for AGL calculations

#### Data Processing Requirements
Create a data preprocessing step that:
1. Filters airspace to Seattle area (roughly lat 47.0-48.0, lon -123.0 to -121.5)
2. Converts altitude strings to numeric feet MSL
3. Handles "SFC" as 0 or terrain elevation
4. Groups multi-polygon features (same airspace, different altitude shelves)

#### Visual Design
- Use FAA sectional chart colors:
  - Class B: Blue (solid), semi-transparent fill
  - Class C: Magenta (solid)
  - Class D: Blue (dashed pattern or different shade)
  - Class E: Magenta (faded/lighter)
- Altitude scale: 1 foot = reasonable visual height (may need exaggeration for clarity)
- Include altitude labels at shelf boundaries
- Optional: Overlay a 2D sectional chart raster as ground texture

#### Sample Code Structure
```
/airspace-visualizer
  /src
    /components
      Map3D.jsx          # Main 3D map component
      AirspaceLayer.jsx  # Airspace volume rendering
      InfoPanel.jsx      # Click/hover info display
    /utils
      parseAirspace.js   # GeoJSON processing
      altitudeUtils.js   # Altitude conversion helpers
    /data
      seattle_airspace.geojson  # Downloaded/cached data
  /public
    index.html
  package.json
```

#### Stretch Goals
1. Toggle individual airspace classes on/off
2. Animate a flight path through the airspace
3. Show active TFRs (Temporary Flight Restrictions)
4. Real-time sectional chart overlay comparison
5. VR/AR viewing mode
6. Link to AirNav/SkyVector for airport details

#### Testing
Include sample coordinates to verify rendering:
- SEA-TAC: 47.4502° N, 122.3088° W
- Boeing Field: 47.5380° N, 122.3018° W
- Renton: 47.4931° N, 122.2157° W

#### Reference Materials
- FAA Aeronautical Chart Users' Guide: https://www.faa.gov/air_traffic/flight_info/aeronav/digital_products/aero_guide/
- Airspace types (US): https://en.wikipedia.org/wiki/Airspace_types_(United_States)

---

## License

MIT

## Author

Built with [Claude Code](https://claude.ai/claude-code)

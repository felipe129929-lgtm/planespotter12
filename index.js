import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fs from "fs"; // NEW: For reading the routes file
import path from "path"; // NEW: For file paths
import { fileURLToPath } from 'url'; // NEW: For ES Modules paths

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// NEW: Setup for loading local files in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 10000);
const PUBLIC_BASE_URL =
  (process.env.PUBLIC_BASE_URL || `http://localhost:${PORT}`).replace(/\/+$/, "");

// Serve local airline logo files from the "Logos" folder.
app.use("/logos", express.static("Logos"));

// --- NEW: ROUTE DATABASE LOADING ---
let ROUTES_DATABASE = {};
try {
  const routesPath = path.join(__dirname, "data", "routes.json");
  if (fs.existsSync(routesPath)) {
    const rawData = fs.readFileSync(routesPath, "utf8");
    ROUTES_DATABASE = JSON.parse(rawData);
    console.log("✅ Route database loaded");
  } else {
    console.log("⚠️ data/routes.json not found, routes will show as Unknown");
  }
} catch (err) {
  console.error("❌ Error loading routes.json:", err);
}
// ------------------------------------

function toRad(v) {
  return (v * Math.PI) / 180;
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function kmToNm(km) {
  return km * 0.539957;
}

function callsignPrefix(callsign = "") {
  const match = callsign.trim().toUpperCase().match(/^[A-Z]{2,3}/);
  return match ? match[0] : "";
}

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function isGenericAirlineName(name) {
  const genericValues = new Set(["", "Unknown", "Unknown Airline", "United States"]);
  return genericValues.has(cleanText(name));
}

function logoUrl(filename) {
  return `${PUBLIC_BASE_URL}/logos/${filename}`;
}

const AIRLINE_BRANDING_BY_PREFIX = {
  DAL: { name: "Delta Air Lines", logoUrl: logoUrl("delta.png") },
  AAL: { name: "American Airlines", logoUrl: logoUrl("american.png") },
  UAL: { name: "United Airlines", logoUrl: logoUrl("United.png") },
  ARG: { name: "Aerolineas Argentinas", logoUrl: logoUrl("aerolineasargentinas.png") },
  FBZ: { name: "Flybondi", logoUrl: logoUrl("Flybondi.png") },
  JAT: { name: "JetSmart", logoUrl: logoUrl("jetsmart.png") },
  JES: { name: "JetSmart Argentina", logoUrl: logoUrl("jetsmart.png") },
  JBU: { name: "JetBlue", logoUrl: "" },
  SWA: { name: "Southwest Airlines", logoUrl: "" },
  EDV: { name: "Endeavor Air", logoUrl: "" },
  RPA: { name: "Republic Airways", logoUrl: "" },
  FFT: { name: "Frontier Airlines", logoUrl: "" },
  ASA: { name: "Alaska Airlines", logoUrl: "" },
  NKS: { name: "Spirit Airlines", logoUrl: "" },
  JIA: { name: "PSA Airlines", logoUrl: "" },
  EJA: { name: "NetJets", logoUrl: "" },
  ABX: { name: "ABX Air", logoUrl: "" },
  GJS: { name: "GoJet Airlines", logoUrl: "" },
  CKS: { name: "Kalitta Air", logoUrl: "" },
  MXY: { name: "Breeze Airways", logoUrl: "" },
  THY: { name: "Turkish Airlines", logoUrl: "" },
  EIN: { name: "Aer Lingus", logoUrl: "" },
  ACA: { name: "Air Canada", logoUrl: "" },
  CES: { name: "China Eastern Airlines", logoUrl: "" },
  CAL: { name: "China Airlines", logoUrl: "" },
  MSR: { name: "EgyptAir", logoUrl: "" },
  VIR: { name: "Virgin Atlantic", logoUrl: "" },
  ANS: { name: "Andes Lineas Aereas", logoUrl: "" },
  AUT: { name: "Austral Lineas Aereas", logoUrl: "" }
};

const AIRCRAFT_TYPE_BY_ICAO = {
  A20N: "Airbus A320neo",
  A21N: "Airbus A321neo",
  A319: "Airbus A319",
  A320: "Airbus A320",
  A321: "Airbus A321",
  A332: "Airbus A330-200",
  A333: "Airbus A330-300",
  A359: "Airbus A350-900",
  A388: "Airbus A380",
  B38M: "Boeing 737 MAX 8",
  B39M: "Boeing 737 MAX 9",
  B737: "Boeing 737",
  B738: "Boeing 737-800",
  B739: "Boeing 737-900",
  B752: "Boeing 757-200",
  B763: "Boeing 767-300",
  B772: "Boeing 777-200",
  B77W: "Boeing 777-300ER",
  B788: "Boeing 787-8",
  B789: "Boeing 787-9",
  BCS1: "Airbus A220-100",
  BCS3: "Airbus A220-300",
  CRJ2: "Bombardier CRJ200",
  CRJ7: "Bombardier CRJ700",
  CRJ9: "Bombardier CRJ900",
  E170: "Embraer 170",
  E175: "Embraer 175",
  E190: "Embraer 190",
  E195: "Embraer 195"
};

function getAirlineBranding(callsign, fallback = "Unknown Airline") {
  const prefix = callsignPrefix(callsign);
  const mappedAirline = AIRLINE_BRANDING_BY_PREFIX[prefix];
  const safeFallback = cleanText(fallback) || "Unknown Airline";

  if (!mappedAirline) {
    return {
      name: isGenericAirlineName(safeFallback) ? "Unknown Airline" : safeFallback,
      logoUrl: ""
    };
  }

  return {
    name: isGenericAirlineName(safeFallback) ? mappedAirline.name : safeFallback,
    logoUrl: mappedAirline.logoUrl || ""
  };
}

function formatAircraftType(value) {
  const cleaned = cleanText(value)
    .replace(/\s+/g, " ")
    .replace(/\b([A-Z])-(\d{3})\b/g, "\\$1\\$2")
    .replace(/\bA-(\d{3})\b/g, "A\\$1");

  if (!cleaned) return "Unknown Type";

  if (/^[A-Z0-9]{3,5}$/.test(cleaned)) {
    return AIRCRAFT_TYPE_BY_ICAO[cleaned] || cleaned;
  }

  if (cleaned === cleaned.toUpperCase()) {
    return cleaned
      .toLowerCase()
      .replace(/\b\w/g, (char) => char.toUpperCase())
      .replace(/\bA(\d{3})\b/g, "A\\$1")
      .replace(/\bB(\d{3})\b/g, "B\\$1")
      .replace(/\bCrj\b/g, "CRJ")
      .replace(/\bErj\b/g, "ERJ");
  }

  return cleaned;
}

function selectAircraftType(ac) {
  const desc = cleanText(ac.desc);
  if (desc) return formatAircraftType(desc);

  const icaoType = cleanText(ac.t).toUpperCase();
  if (!icaoType) return "Unknown Type";

  return AIRCRAFT_TYPE_BY_ICAO[icaoType] || icaoType;
}

function extractPosition(ac) {
  if (Number.isFinite(ac.lat) && Number.isFinite(ac.lon)) {
    return { lat: ac.lat, lng: ac.lon };
  }

  if (
    ac.lastPosition &&
    Number.isFinite(ac.lastPosition.lat) &&
    Number.isFinite(ac.lastPosition.lon)
  ) {
    return {
      lat: ac.lastPosition.lat,
      lng: ac.lastPosition.lon
    };
  }

  return null;
}

function normalizeAircraft(ac, observerLat, observerLng, radiusKm) {
  const pos = extractPosition(ac);
  if (!pos) return null;

  const distanceKm = haversineKm(observerLat, observerLng, pos.lat, pos.lng);
  if (distanceKm > radiusKm) return null;

  const callsign = (ac.flight || ac.hex || "UNKNOWN").trim();
  const aircraftType = selectAircraftType(ac);
  const registration = ac.r || ac.hex || "Unknown";
  const airlineBranding = getAirlineBranding(callsign, "Unknown Airline");

  // --- NEW: ROUTE LOOKUP LOGIC ---
  const route = ROUTES_DATABASE[callsign] || { origin: "Unknown", destination: "Unknown" };
  // -------------------------------

  let lastSeenIso = new Date().toISOString();

  if (Number.isFinite(ac.seen)) {
    lastSeenIso = new Date(Date.now() - ac.seen * 1000).toISOString();
  } else if (ac.lastPosition && Number.isFinite(ac.lastPosition.seen_pos)) {
    lastSeenIso = new Date(Date.now() - ac.lastPosition.seen_pos * 1000).toISOString();
  }

  return {
    id: ac.hex || `${pos.lat},${pos.lng}`,
    callsign,
    aircraftType,
    registration,
    airlineName: airlineBranding.name,
    airlineLogoUrl: airlineBranding.logoUrl,
    origin: route.origin,           // CHANGED: Uses lookup
    destination: route.destination, // CHANGED: Uses lookup
    altitudeFt: Number.isFinite(ac.alt_baro) ? ac.alt_baro : null,
    speedKt: Number.isFinite(ac.gs) ? ac.gs : null,
    headingDeg: Number.isFinite(ac.track) ? ac.track : null,
    lat: pos.lat,
    lng: pos.lng,
    lastSeen: lastSeenIso,
    distanceKm,
    photoUrl: "",
    trail: [[pos.lat, pos.lng]]
  };
}

app.get("/", (_req, res) => {
  res.send("PlaneSpotter backend is running");
});

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "PlaneSpotter backend (Airplanes.live)",
    now: new Date().toISOString(),
    publicBaseUrl: PUBLIC_BASE_URL
  });
});

app.get("/api/aircraft/nearby", async (req, res) => {
  try {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    const radiusKm = Number(req.query.radiusKm || 100);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({
        error: "lat and lng query parameters are required numbers"
      });
    }

    if (!Number.isFinite(radiusKm) || radiusKm <= 0) {
      return res.status(400).json({
        error: "radiusKm must be a positive number"
      });
    }

    const radiusNm = Math.min(kmToNm(radiusKm), 250);

    const url = `https://api.airplanes.live/v2/point/${lat}/${lng}/${radiusNm.toFixed(1)}`;
    const apiRes = await fetch(url, {
      headers: {
        Accept: "application/json"
      }
    });

    if (!apiRes.ok) {
      const text = await apiRes.text();
      throw new Error(`Airplanes.live request failed: ${apiRes.status} ${text}`);
    }

    const data = await apiRes.json();
    const rawAircraft = Array.isArray(data.ac) ? data.ac : [];

    const aircraft = rawAircraft
      .map((ac) => normalizeAircraft(ac, lat, lng, radiusKm))
      .filter(Boolean)
      .sort((a, b) => a.distanceKm - b.distanceKm);

    res.json({ aircraft });
  } catch (error) {
    console.error("Failed to fetch nearby aircraft:", error);
    res.status(500).json({
      error: "Unable to fetch live aircraft"
    });
  }
});

app.listen(PORT, () => {
  console.log(`PlaneSpotter backend listening on port ${PORT}`);
  console.log(`Serving logos from: ${PUBLIC_BASE_URL}/logos/...`);
});

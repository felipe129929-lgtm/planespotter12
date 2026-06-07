import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = Number(process.env.PORT || 10000);

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
  const match = callsign.trim().match(/^[A-Z]{2,3}/);
  return match ? match[0] : "";
}

const airlineMap = {
  DAL: "Delta Air Lines",
  UAL: "United Airlines",
  AAL: "American Airlines",
  JBU: "JetBlue",
  SWA: "Southwest Airlines",
  EDV: "Endeavor Air",
  RPA: "Republic Airways",
  FFT: "Frontier Airlines",
  ASA: "Alaska Airlines",
  NKS: "Spirit Airlines",
  JIA: "PSA Airlines",
  EJA: "NetJets",
  ABX: "ABX Air",
  GJS: "GoJet Airlines",
  CKS: "Kalitta Air",
  MXY: "Breeze Airways",
  JST: "Jetstar",
  THY: "Turkish Airlines",
  EIN: "Aer Lingus",
  CES: "China Eastern Airlines",
  ACA: "Air Canada",
  CAL: "China Airlines",
  MSR: "EgyptAir",
  VIR: "Virgin Atlantic"
};

function deriveAirlineName(callsign, fallback = "Unknown Airline") {
  const prefix = callsignPrefix(callsign);
  return airlineMap[prefix] || fallback;
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
  const aircraftType = ac.desc || ac.t || "Unknown Type";
  const registration = ac.r || ac.hex || "Unknown";
  const airlineName = deriveAirlineName(callsign, "Unknown Airline");

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
    airlineName,
    origin: "Unknown",
    destination: "Unknown",
    altitudeFt: Number.isFinite(ac.alt_baro) ? ac.alt_baro : null,
    speedKt: Number.isFinite(ac.gs) ? ac.gs : null,
    headingDeg: Number.isFinite(ac.track) ? ac.track : 0,
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
    now: new Date().toISOString()
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
});
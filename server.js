const express = require("express");
const cors = require("cors");
const axios = require("axios");
const ical = require("node-ical");

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const NOOKAL_API_KEY = process.env.NOOKAL_API_KEY;

const NOOKAL_TOKEN_URL = "https://au-apiv3.nookal.com/oauth/token";
const NOOKAL_GRAPHQL_URL = "https://au-apiv3.nookal.com/graphql";

// ─── Instructor Configuration ────────────────────────────────────────────────
// HYBRID DATA SOURCES:
//   - ICS calendar URL: used for diary events (lessons, holds, holidays etc.)
//     ICS gives us clean titles/categories the API doesn't expose
//   - locationID + providerID: used for API client address lookups only
//     Gabriel + Christian share Driving Matters Pty Ltd (locationID 1)
const INSTRUCTORS = [
  {
    name: "Christian", base: "Montmorency", locationID: 1, providerID: 32,
    mods: ["LFA", "Spinner", "Electronic Spinner", "Hand Controls", "Satellite", "Extension Pedals", "Indicator Extension"],
    allAreas: true,
    maxTravelFromBase: 65,
    preferredZone: "All Melbourne areas by arrangement",
    icsUrl: "https://calsync.nookal.com/icsFile.php?HhXBkBCdHTLQaK4lrqfVa9ew%2FKnxwK8N60bfEsnM4Tix4fvM5lyQStblMTQiqaNaGeCeSgeSmXf%2F4kKI9OvU2fnXpnN%2FtMeidfD9E6WmLBWPsPF881mF4%2FDKjqX6mENEnlggTWF2jMn8Em8aKgSGXA%3D%3D"
  },
  {
    name: "Gabriel", base: "Croydon North", locationID: 1, providerID: 1,
    mods: ["LFA", "Spinner", "Electronic Spinner", "Hand Controls", "Satellite", "O-Ring", "Monarchs", "Indicator Extension"],
    earliestStart: "09:30",
    maxTravelFromBase: 55,
    zoneByArrangement: true,
    preferredZone: "East Melbourne — Croydon, Ringwood, Box Hill, Frankston corridor. Will go further by arrangement.",
    icsUrl: "https://calsync.nookal.com/icsFile.php?HhXBkBCdHTLQaK4lrqfVa9ew%2FKnxwK8N60bfEsnM4Tix4fvM5lyQStblMTQiqaNaGeCeSgeSmXf%2F4kKI9OvU2a52GEgwyPVJ%2B0I6mOab2rD4%2Bmqr7EYvQGR9ykfeKAj%2F"
  },
  {
    name: "Greg", base: "Kilsyth", locationID: 41, providerID: 77,
    mods: ["LFA", "Spinner", "Electronic Spinner", "Monarchs", "Indicator Extension"],
    maxTravelFromBase: 55,
    zoneByArrangement: true,
    preferredZone: "Extended East & South-East Melbourne — Kilsyth, Ringwood, Knox, Dandenong, Frankston, Bayside.",
    icsUrl: "https://calsync.nookal.com/icsFile.php?HhXBkBCdHTLQaK4lrqfVa9ew%2FKnxwK8N60bfEsnM4Tix4fvM5lyQStblMTQiqaNaGeCeSgeSmXf%2F4kKI9OvU2fgA7lzqZCrNH6P0mJPZWpJqu4G4d87qHmXHYUUq3ZhplneSIXp12lfHZzfvGyQdDw%3D%3D"
  },
  {
    name: "Jason", base: "Wandin North", locationID: 23, providerID: 59,
    mods: ["LFA", "Spinner"],
    maxTravelFromBase: 55,
    zoneByArrangement: true,
    preferredZone: "East Melbourne & Yarra Valley — Wandin, Lilydale, Mooroolbark, Ringwood, Knox, SE up to Bayside.",
    icsUrl: "https://calsync.nookal.com/icsFile.php?HhXBkBCdHTLQaK4lrqfVa9ew%2FKnxwK8N60bfEsnM4Tix4fvM5lyQStblMTQiqaNaGeCeSgeSmXf%2F4kKI9OvU2Sks8REnxfIzFLWWhJgXRykKsTkQKIlND6Q3P8UWc8WWFJCS5Y5gIU0xiqPfnSz%2FkQ%3D%3D"
  },
  {
    name: "Marc", base: "Werribee", locationID: 51, providerID: 90,
    mods: ["LFA", "Spinner", "Electronic Spinner", "Extension Pedals", "Indicator Extension"],
    maxTravelFromBase: 55,
    preferredZone: "West Melbourne — Werribee, Hoppers Crossing, Tarneit, Melton, Sunshine, Footscray, Altona, Laverton.",
    icsUrl: "https://calsync.nookal.com/icsFile.php?HhXBkBCdHTLQaK4lrqfVa9ew%2FKnxwK8N60bfEsnM4Tix4fvM5lyQStblMTQiqaNaGeCeSgeSmXf%2F4kKI9OvU2ecoRZN2xzdtmsUYY9vDrAuMuEJAzQSivaNXrwqSOqrMT982Jq4gficfE9XDNSVl0A%3D%3D"
  },
  {
    name: "Sherri", base: "Wandin North", locationID: 5, providerID: 38,
    mods: [],
    maxTravelFromBase: 50,
    zoneByArrangement: true,
    preferredZone: "Wandin to Ringwood radius. Will travel further if lessons are planned. Also covers Warragul area.",
    icsUrl: "https://calsync.nookal.com/icsFile.php?HhXBkBCdHTLQaK4lrqfVa9ew%2FKnxwK8N60bfEsnM4Tix4fvM5lyQStblMTQiqaNaGeCeSgeSmXf%2F4kKI9OvU2Qm9F8eQzb%2B6bu2IC%2FLaNBOOWmK9yskJZYl8guOGtP67bXXfuA0nBVLMaaPL2rsqew%3D%3D"
  },
  {
    name: "Yves", base: "Rye", locationID: 29, providerID: 62,
    mods: ["LFA", "Spinner", "Electronic Spinner", "Indicator Extension"],
    maxTravelFromBase: 35,
    hardZone: true,
    preferredZone: "Mornington Peninsula only — Rye, Rosebud, Mornington, Mt Eliza, Dromana, Safety Beach, Sorrento.",
    icsUrl: "https://calsync.nookal.com/icsFile.php?HhXBkBCdHTLQaK4lrqfVa9ew%2FKnxwK8N60bfEsnM4Tix4fvM5lyQStblMTQiqaNaGeCeSgeSmXf%2F4kKI9OvU2fgA7lzqZCrNH6P0mJPZWpJqu4G4d87qHmXHYUUq3ZhplneSIXp12lfHZzfvGyQdDw%3D%3D"
  }
];

// ─── In-memory caches (persist across requests while server runs) ────────────
const clientAddressCache = {};
let cachedToken = null;
let cachedTokenExpiry = 0;
const travelCache = {};
const icsCache = {}; // { icsUrl: { data, fetchedAt } } — ICS feeds cached 5 min
const ICS_CACHE_TTL_MS = 5 * 60 * 1000;

// ─── Date/Time Helpers ───────────────────────────────────────────────────────
function toMelbDateStr(date) {
  return new Date(date).toLocaleDateString("en-CA", { timeZone: "Australia/Melbourne" });
}

function timeToMins(t) {
  const parts = t.split(":").map(Number);
  return parts[0] * 60 + parts[1];
}

function minsToTime(m) {
  const h = Math.floor(m / 60);
  const mins = m % 60;
  return `${String(h).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

function snapTo15(timeMins) {
  return Math.ceil(timeMins / 15) * 15;
}

function getDayName(dateStr) {
  const d = new Date(dateStr + "T12:00:00+10:00");
  return d.toLocaleDateString("en-AU", { weekday: "short", timeZone: "Australia/Melbourne" });
}

function formatDate(dateStr) {
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

// ─── Nookal API Helpers ──────────────────────────────────────────────────────
async function getNookalToken() {
  if (cachedToken && Date.now() < cachedTokenExpiry - 60000) return cachedToken;

  const r = await axios.post(NOOKAL_TOKEN_URL, "grant_type=client_credentials", {
    headers: {
      "Authorization": `Bearer ${NOOKAL_API_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    timeout: 10000
  });
  cachedToken = r.data.accessToken;
  cachedTokenExpiry = new Date(r.data.accessTokenExpiresAt).getTime();
  return cachedToken;
}

async function nookalQuery(query) {
  const token = await getNookalToken();
  const r = await axios.post(NOOKAL_GRAPHQL_URL, { query }, {
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    timeout: 20000
  });
  if (r.data.errors) {
    throw new Error(`Nookal GraphQL error: ${JSON.stringify(r.data.errors)}`);
  }
  return r.data.data;
}

// ─── ICS Diary Fetching ──────────────────────────────────────────────────────
// Uses Nookal's ICS calendar export URLs. Returns clean event data with real
// titles (SUMMARY field) that the Nookal GraphQL API doesn't expose.
async function fetchICSForInstructor(inst) {
  const now = Date.now();
  const cached = icsCache[inst.icsUrl];
  if (cached && now - cached.fetchedAt < ICS_CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    const data = await ical.async.fromURL(inst.icsUrl);
    icsCache[inst.icsUrl] = { data, fetchedAt: now };
    return data;
  } catch (err) {
    throw new Error(`Failed to fetch ICS for ${inst.name}: ${err.message}`);
  }
}

// Convert ICS data to a unified appointment-like structure so the rest of the
// code works without changes. Returns entries for the date range specified.
async function getAppointmentsForInstructor(inst, dateFrom, dateTo) {
  const rawData = await fetchICSForInstructor(inst);
  const startBound = new Date(dateFrom + "T00:00:00+10:00");
  const endBound = new Date(dateTo + "T23:59:59+10:00");

  const appointments = [];
  for (const [uid, event] of Object.entries(rawData)) {
    if (event.type !== "VEVENT") continue;
    if (!event.start || !event.end) continue;

    const start = new Date(event.start);
    const end = new Date(event.end);
    if (end < startBound || start > endBound) continue;

    const summary = (event.summary || "").trim();
    const description = (event.description || "").trim();
    const categories = event.categories || [];

    // ICS events from Nookal have rich data in SUMMARY (title) and DESCRIPTION
    // We shape this to look like what the rest of our code expects, but also
    // add extra fields from ICS that the API didn't give us
    appointments.push({
      uid,
      appointmentDate: toMelbDateStr(start),
      startTime: toMelbTimeStrFull(start),
      endTime: toMelbTimeStrFull(end),
      rawStart: start,
      rawEnd: end,
      // ICS-specific fields — what the API was missing:
      summary,        // The event title — e.g. "Hold for Zain Karim", "School pick up"
      description,    // Notes/details — includes suburb and admin notes for lessons
      categories,     // Can contain ["Time Held"], ["Holidays"] etc.
      location: event.location || "",
      // Synthesized fields to match the shape we had from API (so existing logic still works)
      apptID: uid,
      status: null,    // will be set by classifyAppointment based on summary content
      clientID: null,  // ICS doesn't expose clientID directly
      clientName: null,
      notes: description,
      typeName: categories[0] || null
    });
  }
  return appointments;
}

// Format a Date as HH:MM:SS in Melbourne timezone
function toMelbTimeStrFull(date) {
  const t = new Date(date).toLocaleTimeString("en-AU", {
    timeZone: "Australia/Melbourne", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false
  });
  // en-AU returns "HH:MM:SS" but sometimes "24:00:00" — normalise
  return t.replace(/^24:/, "00:");
}

async function getClientAddress(clientID) {
  if (clientAddressCache[clientID] !== undefined) return clientAddressCache[clientID];

  const q = `
    query {
      client(clientID: ${clientID}) {
        clientID firstName lastName
        addresses {
          addr1 city state postcode isDefault
        }
      }
    }
  `;
  try {
    const d = await nookalQuery(q);
    const client = Array.isArray(d.client) ? d.client[0] : d.client;
    if (!client) {
      clientAddressCache[clientID] = null;
      return null;
    }

    const defaultAddr = (client.addresses || []).find(a => a.isDefault === 1 && a.city)
                     || (client.addresses || []).find(a => a.city);

    const result = defaultAddr ? {
      suburb: defaultAddr.city,
      state: defaultAddr.state,
      postcode: defaultAddr.postcode,
      addr1: defaultAddr.addr1,
      firstName: client.firstName,
      lastName: client.lastName
    } : null;

    clientAddressCache[clientID] = result;
    return result;
  } catch (err) {
    console.error(`Client lookup failed for ${clientID}:`, err.message);
    clientAddressCache[clientID] = null;
    return null;
  }
}

// ─── Appointment Classification ──────────────────────────────────────────────
// Returns: { kind, clientName, displayLabel }
//   kind: "lesson" | "hard-block" | "soft-block" | "skip"
//   Uses ICS summary text which has real titles from the diary.
function classifyAppointment(a) {
  const summary = (a.summary || "").trim();
  const summaryLower = summary.toLowerCase();
  const description = (a.description || "").trim();
  const categories = (a.categories || []).map(c => String(c).toLowerCase());

  // Skip cancelled events — ICS export usually excludes them but guard anyway
  if (summaryLower.includes("cancelled") || summaryLower.includes("cancellation")) {
    return { kind: "skip", reason: "cancelled" };
  }

  // Empty/blank entries — shouldn't happen but guard
  if (!summary && !description) {
    return { kind: "skip", reason: "empty" };
  }

  // ─── Hard blocks (never suggest during this time) ───
  const hardBlockSignals = [
    "day off", "dayoff", "no lessons", "no lesson",
    "private stuff", "private work", "non-sdt", "non sdt",
    "school pick up", "school pickup", "school run",
    "holiday", "holidays", "leave", "bali", "trip",
    "sick", "medical", "personal",
    "car service", "unavailable", "away", "off sick",
    "total ability van", "smartbox", "lagos holiday",
    "lunch break", "lunch"
  ];
  const hardBlockCategories = ["holidays", "non-sdt work", "medical", "prefer not to work", "van booking"];
  const isHardBySignal = hardBlockSignals.some(sig => summaryLower.includes(sig));
  const isHardByCategory = categories.some(cat => hardBlockCategories.includes(cat));
  if (isHardBySignal || isHardByCategory) {
    return { kind: "hard-block", reason: "unavailable time", label: summary };
  }

  // ─── Soft blocks (Time Held / holds — admin may override for specific clients) ───
  const softBlockSignals = [
    "hold for", "hold ", "time held",
    "community ot", "commot", "comm ot",
    "active one", "activeone",
    "hold ax", "holding spot", "holding time", "holding regular"
  ];
  const softBlockCategories = ["time held", "general", "hold time for test", "miscellaneous"];
  const isSoftBySignal = softBlockSignals.some(sig => summaryLower.includes(sig));
  const isSoftByCategory = categories.some(cat => softBlockCategories.includes(cat));
  if (isSoftBySignal || isSoftByCategory) {
    return { kind: "soft-block", reason: "reserved/hold", label: summary };
  }

  // ─── Anything prefixed with "Event - " is ALWAYS a diary event, never a lesson ───
  // This is Nookal's convention: client lessons use just the client name ("Aaron Cutajar"),
  // while all other diary items are prefixed with "Event - ". If we got here and the
  // summary starts with "Event -", it's a block we didn't match by keyword — default
  // to hard-block (safer than suggesting a booking over it).
  if (/^event\s*[-–]/i.test(summary)) {
    return { kind: "hard-block", reason: "diary event (unmatched keyword)", label: summary };
  }

  // ─── Real client lessons ───
  // In ICS, lessons appear as events named after the client (e.g. "Jeffrey Tran")
  // If we got here and the entry has substantial content, treat as a lesson
  return {
    kind: "lesson",
    clientName: summary,
    label: summary
  };
}

// ─── Location extraction from notes ──────────────────────────────────────────
// Returns a structured object describing what the notes say about location.
// Priority:
//   1. Pickup + Dropoff pattern ("from X to home in Y") → { pickup, dropoff }
//   2. Explicit street address in notes (e.g. "251 Mountain Hwy") → { address }
//   3. Named venue (school/clinic/hospital/centre) → { venue, venueSuburb }
//   4. Suburb name → { suburb }
//   5. Nothing useful → null
function extractNotesLocation(notes) {
  if (!notes || !notes.trim()) return null;

  // ─── Priority 1: Pickup + Dropoff pattern ───
  // "From School X to home in Y" or "from X to Y"
  const pickupDropoff = notes.match(/from\s+(?:school\s+)?([A-Za-z][A-Za-z\s&'.-]{3,60}?)\s+to\s+home\s+in\s+([A-Z][A-Z\s]{2,40}?)(?:\n|$|\.|,|;)/i);
  if (pickupDropoff) {
    const pickupRaw = pickupDropoff[1].trim();
    const dropoffRaw = cleanSuburb(pickupDropoff[2]);
    return {
      kind: "pickup-dropoff",
      pickup: { venue: pickupRaw, isSchool: /\b(school|college|grammar|academy|high|primary|secondary)\b/i.test(pickupRaw) },
      dropoff: { suburb: dropoffRaw }
    };
  }

  // ─── Priority 2: Explicit street address ───
  // Matches patterns like "251 Mountain Hwy", "5 Cashel Court - BERWICK", "12 Smith St"
  const streetAddressMatch = notes.match(/(\d{1,5}\s+[A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)*\s+(?:Street|St|Road|Rd|Avenue|Ave|Drive|Dr|Court|Ct|Crescent|Cres|Place|Pl|Parade|Pde|Way|Highway|Hwy|Boulevard|Blvd|Lane|Ln|Close|Cl|Terrace|Tce))\b[,\s-]*([A-Z][A-Z\s]{2,40}?)?(?:\n|$|\.|,|;|\)|\()/);
  if (streetAddressMatch) {
    const streetPart = streetAddressMatch[1].trim();
    const suburbPart = streetAddressMatch[2] ? cleanSuburb(streetAddressMatch[2]) : null;
    const fullAddress = suburbPart ? `${streetPart}, ${suburbPart}` : streetPart;
    return {
      kind: "address",
      address: fullAddress,
      suburb: suburbPart
    };
  }

  // Also try bracketed addresses: "(251 Mountain Hwy)"
  const bracketedAddr = notes.match(/\((\d{1,5}\s+[^)]+?)\)/);
  if (bracketedAddr) {
    return {
      kind: "address",
      address: bracketedAddr[1].trim()
    };
  }

  // ─── Priority 3: Named venue (schools, clinics, hospitals) ───
  // Look for keywords that indicate a specific venue, then extract the full venue name + suburb
  const venuePatterns = [
    // "Active One FRANKSTON", "ActiveOne clinic FRANKSTON"
    /\b(active\s*one|activeone)(?:\s+clinic)?\s+([A-Z][A-Z\s]{2,40}?)(?:\n|\s+(?:at|with|ax|lesson|for|prior|to)|$|\.|,)/i,
    // "CommOT BRUNSWICK", "Community OT BRUNSWICK EAST"
    /\b(comm\s*ot|community\s*ot)\s+([A-Z][A-Z\s]{2,40}?)(?:\n|\s+(?:at|with|ax|lesson|for|prior|to)|$|\.|,)/i,
    // "Epworth HAWTHORN"
    /\b(epworth)\s+([A-Z][A-Z\s]{2,40}?)(?:\n|\s+(?:at|with|ax|lesson|for|prior|to)|$|\.|,)/i,
    // "Eastern Health WANTIRNA"
    /\b(eastern\s+health|western\s+health|northern\s+health|southern\s+health)\s+([A-Z][A-Z\s]{2,40}?)(?:\n|\s+(?:at|with|ax|lesson|for|prior|to)|\(|$|\.|,)/i,
    // "X Hospital", "X Rehab"
    /\b([A-Z][a-zA-Z]+\s+(?:Hospital|Rehab|Rehabilitation|Medical\s+Centre|Health\s+Centre))\s+([A-Z][A-Z\s]{2,40}?)?(?:\n|\s|$|\.|,)/
  ];
  for (const pattern of venuePatterns) {
    const m = notes.match(pattern);
    if (m) {
      const venueName = cleanSuburb(m[1]);
      const venueSuburb = m[2] ? cleanSuburb(m[2]) : null;
      if (venueSuburb && isLikelySuburb(venueSuburb)) {
        return {
          kind: "venue",
          venue: `${venueName} ${venueSuburb}`,
          venueSuburb
        };
      }
    }
  }

  // ─── Priority 4: Street address followed by "- SUBURB" (no street type word) ───
  // e.g. "5 Cashel Court - BERWICK"
  const dashSuburbMatch = notes.match(/(\d+\s+[A-Z][A-Za-z\s]+?)\s*[-–]\s*([A-Z][A-Z\s]{2,40}?)(?:\s*$|\n|,)/);
  if (dashSuburbMatch) {
    const streetPart = dashSuburbMatch[1].trim();
    const suburbPart = cleanSuburb(dashSuburbMatch[2]);
    if (isLikelySuburb(suburbPart)) {
      return {
        kind: "address",
        address: `${streetPart}, ${suburbPart}`,
        suburb: suburbPart
      };
    }
  }

  // ─── Priority 5: First-line suburb ───
  const firstLine = notes.split(/\n|\r/)[0].trim();
  if (isLikelySuburb(firstLine)) {
    return { kind: "suburb", suburb: firstLine };
  }

  // ─── Fallback: any ALL CAPS phrase that looks like a suburb ───
  const capsMatches = notes.match(/\b[A-Z][A-Z\s]{2,30}\b/g) || [];
  for (const m of capsMatches) {
    const cleaned = cleanSuburb(m);
    if (isLikelySuburb(cleaned)) return { kind: "suburb", suburb: cleaned };
  }

  return null;
}

function cleanSuburb(s) {
  return (s || "").replace(/\s+/g, " ").trim();
}

function isLikelySuburb(s) {
  if (!s) return false;
  const cleaned = cleanSuburb(s).toUpperCase();
  if (cleaned.length < 3 || cleaned.length > 40) return false;
  const words = cleaned.split(/\s+/);
  if (words.length > 4) return false;
  if (!words.every(w => /^[A-Z]{2,}$/.test(w))) return false;

  const NOT_SUBURBS = new Set([
    "HOLD", "TEST", "LESSON", "NEW", "INITIAL", "PRE", "PLEASE", "COLLECT",
    "FROM", "HOME", "NDIS", "TAC", "SDT", "LFA", "AX", "NOT", "DO", "OFFER",
    "TOTAL", "ABILITY", "VAN", "SMARTBOX", "RETURN", "HOLIDAY", "HOLIDAYS",
    "CONFIRMED", "PRIVATE", "EASTER", "SERVICE", "AWAY", "WITH", "THE", "THIS",
    "WILL", "HAVE", "THAT", "DRIVING", "MATTERS", "PTY", "LTD", "SCHOOL",
    "PICKUP", "DROPOFF", "JASON", "GREG", "MARC", "CHRISTIAN", "GABRIEL",
    "SHERRI", "YVES", "COMMOT", "ACTIVEONE", "COMMUNITY", "OT", "CLINIC",
    "EASY", "DRIVE", "PREVIOUS", "NEXT", "EVENT", "DETAILS",
    "FASTING", "IMED", "ULTRASOUND", "BLOOD", "MEETING", "APPOINTMENT"
  ]);
  return !words.some(w => NOT_SUBURBS.has(w));
}

// Lookup client by name (since ICS doesn't give us clientID).
// Caches by name to avoid repeat lookups. Returns null if not found or ambiguous.
const clientByNameCache = {};
async function getClientByName(fullName) {
  if (!fullName || fullName.length < 3) return null;
  const key = fullName.toLowerCase().trim();
  if (clientByNameCache[key] !== undefined) return clientByNameCache[key];

  // Parse first + last name from "First Last" or "First Middle Last"
  const parts = fullName.trim().split(/\s+/);
  if (parts.length < 2) {
    clientByNameCache[key] = null;
    return null;
  }
  const firstName = parts[0];
  const lastName = parts[parts.length - 1];

  const q = `
    query {
      clients(firstName: "${firstName.replace(/"/g, '\\"')}", lastName: "${lastName.replace(/"/g, '\\"')}", pageLength: 5) {
        clientID
        firstName
        lastName
        addresses {
          addr1 city state postcode isDefault
        }
      }
    }
  `;
  try {
    const d = await nookalQuery(q);
    const matches = d.clients || [];
    // Prefer exact match
    const exact = matches.find(c =>
      c.firstName?.toLowerCase() === firstName.toLowerCase() &&
      c.lastName?.toLowerCase() === lastName.toLowerCase()
    );
    const best = exact || matches[0];
    if (!best) {
      clientByNameCache[key] = null;
      return null;
    }
    const defaultAddr = (best.addresses || []).find(a => a.isDefault === 1 && a.city)
                     || (best.addresses || []).find(a => a.city);
    const result = defaultAddr ? {
      clientID: best.clientID,
      suburb: defaultAddr.city,
      state: defaultAddr.state,
      postcode: defaultAddr.postcode,
      addr1: defaultAddr.addr1,
      firstName: best.firstName,
      lastName: best.lastName
    } : { clientID: best.clientID };
    clientByNameCache[key] = result;
    return result;
  } catch (err) {
    console.error(`Client name lookup failed for ${fullName}:`, err.message);
    clientByNameCache[key] = null;
    return null;
  }
}

// Helper: extract "Hold for CLIENT NAME" from a soft-block summary
function extractHoldClientName(summary) {
  if (!summary) return null;
  // Strip "Event - " prefix first
  const cleaned = summary.replace(/^event\s*[-–]\s*/i, "").trim();
  // Match "Hold for X", "HOLD for X", "Hold X", "HOLD FOR X"
  const m = cleaned.match(/^hold\s+(?:for\s+)?([A-Za-z][A-Za-z\s'-]+?)(?:\s*[-–,]|\s+\(|\s*$)/i);
  if (m) return m[1].trim();
  return null;
}

// ─── Smart location resolution ───────────────────────────────────────────────
// Returns { pickup, dropoff, clientHomeSuburb, clientName, noteText, source, unresolved }
// pickup/dropoff are full strings suitable for Google Maps geocoding
// source describes which data path was used (for debugging)
// unresolved=true means we couldn't determine location — caller should alert admin
async function resolveAppointmentLocation(appt) {
  // Try by clientID first if available, otherwise by clientName
  let clientAddr = null;
  if (appt.clientID) {
    clientAddr = await getClientAddress(appt.clientID);
  } else if (appt.clientName) {
    clientAddr = await getClientByName(appt.clientName);
  }
  const homeSuburb = clientAddr?.suburb || null;
  const homeFull = clientAddr?.addr1
    ? `${clientAddr.addr1}, ${clientAddr.suburb} ${clientAddr.state || "VIC"} ${clientAddr.postcode || ""}`.trim()
    : homeSuburb;

  const notesLoc = extractNotesLocation(appt.notes);

  const base = {
    clientHomeSuburb: homeSuburb,
    clientName: appt.clientName,
    noteText: appt.notes
  };

  // ─── Pickup + Dropoff pattern ───
  if (notesLoc?.kind === "pickup-dropoff") {
    // Pickup is usually a school/venue that needs geocoding by name
    // Dropoff suburb: if matches home, use full home address; otherwise use suburb string
    const pickupString = notesLoc.pickup.isSchool
      ? `${notesLoc.pickup.venue}, Victoria, Australia`  // let Google Maps geocode the school name
      : notesLoc.pickup.venue;
    const dropoffString = (homeSuburb && notesLoc.dropoff.suburb.toUpperCase() === homeSuburb.toUpperCase())
      ? homeFull
      : notesLoc.dropoff.suburb;
    return {
      ...base,
      pickup: pickupString,
      dropoff: dropoffString,
      source: "notes-pickup-dropoff"
    };
  }

  // ─── Explicit street address in notes ───
  if (notesLoc?.kind === "address") {
    // Use the exact address for both pickup and dropoff (assessments/clinic visits
    // start and finish at the same place unless pickup-dropoff pattern above)
    const addrStr = notesLoc.address.includes(",") || /VIC|\b3\d{3}\b/i.test(notesLoc.address)
      ? notesLoc.address
      : `${notesLoc.address}, Victoria, Australia`;
    return {
      ...base,
      pickup: addrStr,
      dropoff: addrStr,
      source: "notes-address"
    };
  }

  // ─── Named venue (school/clinic/hospital) ───
  if (notesLoc?.kind === "venue") {
    // Ask Google Maps to geocode the full venue name (e.g. "Active One FRANKSTON")
    const venueStr = `${notesLoc.venue}, Victoria, Australia`;
    return {
      ...base,
      pickup: venueStr,
      dropoff: venueStr,
      source: "notes-venue"
    };
  }

  // ─── Plain suburb in notes ───
  if (notesLoc?.kind === "suburb") {
    const notesSuburb = notesLoc.suburb;
    // If notes suburb matches home suburb → use full home address
    if (homeSuburb && notesSuburb.toUpperCase() === homeSuburb.toUpperCase()) {
      return {
        ...base,
        pickup: homeFull,
        dropoff: homeFull,
        source: "notes-suburb-matches-home"
      };
    }
    // Notes suburb differs from home — use the notes suburb (pickup point)
    return {
      ...base,
      pickup: notesSuburb,
      dropoff: notesSuburb,
      source: "notes-suburb-differs-from-home"
    };
  }

  // ─── No notes location, fall back to home ───
  if (homeFull) {
    return {
      ...base,
      pickup: homeFull,
      dropoff: homeFull,
      source: "home-fallback"
    };
  }

  // ─── Nothing resolved ───
  return {
    ...base,
    pickup: null,
    dropoff: null,
    source: "unresolved",
    unresolved: true
  };
}

// ─── Google Maps Travel Time ─────────────────────────────────────────────────
async function getTravelTime(origin, destination) {
  if (!origin || !destination) return 30;
  const key = `${origin.toUpperCase()}|${destination.toUpperCase()}`;
  if (travelCache[key] !== undefined) return travelCache[key];

  // If the origin/destination already contains ", VIC" or a postcode, don't append
  const needsContext = (s) => !/(,\s*VIC|\b3\d{3}\b|Australia)/i.test(s);
  const originStr = needsContext(origin) ? `${origin}, Victoria, Australia` : origin;
  const destStr = needsContext(destination) ? `${destination}, Victoria, Australia` : destination;

  try {
    const url = `https://maps.googleapis.com/maps/api/distancematrix/json`;
    const r = await axios.get(url, {
      params: {
        origins: originStr,
        destinations: destStr,
        mode: "driving",
        key: GOOGLE_MAPS_API_KEY
      },
      timeout: 8000
    });
    const row = r.data?.rows?.[0]?.elements?.[0];
    if (row?.status === "OK" && row.duration?.value) {
      const mins = Math.round(row.duration.value / 60);
      travelCache[key] = mins;
      return mins;
    }
  } catch (err) {
    console.error("Google Maps error:", err.message);
  }
  travelCache[key] = 30;
  return 30;
}

// ─── Availability Parsing ────────────────────────────────────────────────────
const TIME_BLOCKS = {
  "early-morning": [480, 600],
  "mid-morning": [600, 720],
  "afternoon": [720, 840],
  "late-afternoon": [840, 1050],
  "all-day": [480, 1050]
};

function parseAvailability(availString) {
  if (!availString || typeof availString !== "string") return {};
  const result = {};
  availString.split(",").forEach(part => {
    const [day, block] = part.trim().split(":");
    if (!day || !block) return;
    const dayKey = day.trim().slice(0, 3);
    const blockKey = block.trim().toLowerCase();
    if (!result[dayKey]) result[dayKey] = [];
    result[dayKey].push(blockKey);
  });
  return result;
}

// ─── Core matcher ────────────────────────────────────────────────────────────
async function findAvailableSlots(inst, clientSuburb, durationMins, availPref, weeksToScan = 17) {
  const slots = [];
  const now = new Date();
  const startDate = toMelbDateStr(now);
  const endDate = toMelbDateStr(new Date(now.getTime() + weeksToScan * 7 * 24 * 3600 * 1000));

  const baseTravel = await getTravelTime(inst.base, clientSuburb);
  if (inst.hardZone && baseTravel > inst.maxTravelFromBase) return [];

  let appointments;
  try {
    appointments = await getAppointmentsForInstructor(inst, startDate, endDate);
  } catch (err) {
    throw new Error(`Failed to fetch ${inst.name}'s diary: ${err.message}`);
  }

  // Group by date with resolved locations
  // Also collect admin alerts for unresolved soft-block client lookups
  const byDate = {};
  const adminAlerts = []; // [{date, time, issue, details}]

  for (const a of appointments) {
    const cls = classifyAppointment(a);
    if (cls.kind === "skip") continue;

    if (!byDate[a.appointmentDate]) byDate[a.appointmentDate] = [];

    const startM = timeToMins(a.startTime.slice(0, 5));
    const endM = timeToMins(a.endTime.slice(0, 5));

    let locStart = inst.base;
    let locEnd = inst.base;
    let prevClientName = null;
    let locationSource = "base";

    if (cls.kind === "lesson") {
      // Set the summary as clientName so resolveAppointmentLocation can try to
      // find this client in Nookal (by name) and pull their home address
      const apptForResolve = {
        ...a,
        clientName: cls.clientName || a.summary,
        notes: a.description || a.notes
      };
      const loc = await resolveAppointmentLocation(apptForResolve);
      if (loc && !loc.unresolved) {
        locStart = loc.pickup || inst.base;
        locEnd = loc.dropoff || loc.pickup || inst.base;
        prevClientName = cls.clientName;
        locationSource = loc.source;
      } else {
        prevClientName = cls.clientName;
        // Couldn't resolve lesson location — alert admin
        adminAlerts.push({
          date: a.appointmentDate,
          time: `${a.startTime.slice(0, 5)}-${a.endTime.slice(0, 5)}`,
          issue: "unresolved-lesson-location",
          details: `Could not determine where ${cls.clientName}'s lesson is — no address on file and notes are ambiguous.`
        });
      }
    } else if (cls.kind === "soft-block") {
      // Extract the client name from "Hold for X" and look them up for location
      const holdClient = extractHoldClientName(a.summary);
      if (holdClient) {
        const apptForResolve = {
          clientName: holdClient,
          notes: a.description || a.notes
        };
        const loc = await resolveAppointmentLocation(apptForResolve);
        if (loc && !loc.unresolved) {
          locStart = loc.pickup || inst.base;
          locEnd = loc.dropoff || loc.pickup || inst.base;
          locationSource = `soft-block: ${loc.source}`;
        } else {
          // Hold found but can't determine location — alert admin
          adminAlerts.push({
            date: a.appointmentDate,
            time: `${a.startTime.slice(0, 5)}-${a.endTime.slice(0, 5)}`,
            issue: "unresolved-hold-location",
            details: `Found a hold for "${holdClient}" but could not determine their location. Cannot verify travel feasibility for nearby slots on this day.`
          });
          locStart = null; locEnd = null; // explicitly null so later logic knows
        }
      } else {
        // Hold but no client name extractable (e.g. "Active One Frankston")
        // Try notes location directly
        const apptForResolve = { clientName: null, notes: a.description || a.notes };
        const loc = await resolveAppointmentLocation(apptForResolve);
        if (loc && !loc.unresolved) {
          locStart = loc.pickup || inst.base;
          locEnd = loc.dropoff || loc.pickup || inst.base;
          locationSource = `soft-block-venue: ${loc.source}`;
        }
      }
    }
    // hard-blocks keep locStart/locEnd as inst.base (instructor is effectively "off")

    byDate[a.appointmentDate].push({
      startMins: startM,
      endMins: endM,
      locationForStart: locStart,
      locationForEnd: locEnd,
      kind: cls.kind, // "lesson" | "hard-block" | "soft-block"
      label: cls.label || a.summary || "",
      note: a.description || "",
      clientName: prevClientName,
      startTime: a.startTime.slice(0, 5),
      endTime: a.endTime.slice(0, 5),
      locationSource
    });
  }

  const d = new Date(startDate + "T12:00:00+10:00");
  const endDateObj = new Date(endDate + "T12:00:00+10:00");

  while (d <= endDateObj) {
    const dateStr = toMelbDateStr(d);
    const dayName = getDayName(dateStr);

    if (dayName === "Sat" || dayName === "Sun") {
      d.setDate(d.getDate() + 1); continue;
    }

    const prefBlocks = availPref[dayName];
    if (!prefBlocks && Object.keys(availPref).length > 0) {
      d.setDate(d.getDate() + 1); continue;
    }

    const dayBlocks = byDate[dateStr] || [];
    const earliestStart = inst.earliestStart ? timeToMins(inst.earliestStart) : 480;

    // Both hard AND soft blocks prevent booking during their time
    // (soft blocks just add a flag for admin review)
    const sorted = [...dayBlocks].sort((a, b) => a.startMins - b.startMins);
    const gaps = [];

    if (sorted.length === 0) {
      gaps.push({
        earliestStart: earliestStart, latestEnd: 1050,
        prevLoc: inst.base, nextLoc: null,
        prevAppt: null, nextAppt: null
      });
    } else {
      if (sorted[0].startMins > earliestStart) {
        gaps.push({
          earliestStart: earliestStart,
          latestEnd: sorted[0].startMins,
          prevLoc: inst.base,
          nextLoc: sorted[0].locationForStart,
          prevAppt: null,
          nextAppt: sorted[0]
        });
      }
      for (let i = 0; i < sorted.length - 1; i++) {
        if (sorted[i + 1].startMins > sorted[i].endMins) {
          gaps.push({
            earliestStart: sorted[i].endMins,
            latestEnd: sorted[i + 1].startMins,
            prevLoc: sorted[i].locationForEnd,
            nextLoc: sorted[i + 1].locationForStart,
            prevAppt: sorted[i],
            nextAppt: sorted[i + 1]
          });
        }
      }
      const last = sorted[sorted.length - 1];
      if (last.endMins < 1050) {
        gaps.push({
          earliestStart: last.endMins,
          latestEnd: 1050,
          prevLoc: last.locationForEnd,
          nextLoc: null,
          prevAppt: last,
          nextAppt: null
        });
      }
    }

    // Detect soft blocks that happen on this day — for admin review notes
    const softBlocksOnDay = sorted.filter(s => s.kind === "soft-block").map(s => ({
      startTime: s.startTime,
      endTime: s.endTime,
      note: s.note.split("\n")[0].slice(0, 60),
      label: s.label.slice(0, 60)
    }));

    // Detect hard blocks that happen on this day — for context (e.g. late start after holidays)
    const hardBlocksOnDay = sorted.filter(s => s.kind === "hard-block").map(s => ({
      startTime: s.startTime,
      endTime: s.endTime,
      label: s.label.slice(0, 60)
    }));

    const BUFFER_MINS = 10; // Travel buffer for changeover, toilet, traffic

    for (const gap of gaps) {
      // If previous location couldn't be resolved (soft-block with unresolved client),
      // skip this gap — we can't safely calculate travel. Admin will see the alert.
      if (gap.prevLoc === null || gap.prevLoc === undefined) continue;

      const rawTravelIn = await getTravelTime(gap.prevLoc, clientSuburb);
      const rawTravelOut = gap.nextLoc ? await getTravelTime(clientSuburb, gap.nextLoc) : 0;

      // Buffer rule: 10-min buffer only applies when coming FROM a previous appointment
      // (lesson or soft-block). No buffer when starting fresh from base (instructor hasn't
      // just finished another lesson that needs changeover/toilet time).
      const comingFromAppointment = gap.prevAppt != null;
      const bufferInApplied = comingFromAppointment ? BUFFER_MINS : 0;
      const bufferOutApplied = gap.nextLoc ? BUFFER_MINS : 0;

      const travelInWithBuffer = rawTravelIn + bufferInApplied;
      const travelOutWithBuffer = rawTravelOut + bufferOutApplied;

      const minStart = snapTo15(gap.earliestStart + travelInWithBuffer);
      const maxEnd = gap.latestEnd - travelOutWithBuffer;
      const maxStart = maxEnd - durationMins;

      if (minStart > maxStart) continue;

      const blocksToCheck = prefBlocks && prefBlocks.length > 0 ? prefBlocks : ["all-day"];
      let matchedBlock = null;
      for (const blockName of blocksToCheck) {
        const [blockStart, blockEnd] = TIME_BLOCKS[blockName] || [480, 1050];
        const intersectStart = Math.max(minStart, blockStart);
        const intersectMaxStart = Math.min(maxStart, blockEnd - durationMins);
        if (intersectStart <= intersectMaxStart) {
          matchedBlock = { block: blockName, start: snapTo15(intersectStart) };
          break;
        }
      }
      if (!matchedBlock) continue;

      const maxT = inst.maxTravelFromBase || 60;
      const inNaturalZone = inst.allAreas || baseTravel <= maxT;
      const nearbyOnDay = rawTravelIn <= 20;

      let tier;
      if (inNaturalZone && nearbyOnDay) tier = 1;
      else if (inNaturalZone && !nearbyOnDay) tier = 2;
      else if (!inNaturalZone && nearbyOnDay) tier = 3;
      else tier = 4;

      // Peak traffic flag: AM peak 7:30-9:15, PM peak 15:00-18:00
      // Only flag if instructor is coming from a previous lesson (not base/home)
      const startMins = matchedBlock.start;
      const travellingFromLesson = gap.prevAppt && gap.prevAppt.kind === "lesson";
      const amPeak = startMins >= 450 && startMins <= 555 && travellingFromLesson;
      const pmPeak = startMins >= 900 && startMins <= 1080 && travellingFromLesson;
      const peakTrafficWarning = amPeak || pmPeak;

      // Check if this slot is first availability after a hard block that finished today
      // e.g. "LATE START AFTER HOLS" ending at 13:00, slot starts 13:45
      const priorHardBlock = hardBlocksOnDay.find(hb => {
        const hbEnd = timeToMins(hb.endTime);
        return hbEnd <= gap.earliestStart && (gap.earliestStart - hbEnd) <= 60;
      });

      slots.push({
        instructor: inst.name,
        base: inst.base,
        date: dateStr,
        dayName,
        suggestedStart: minsToTime(matchedBlock.start),
        period: matchedBlock.block,
        travelIn: rawTravelIn,
        travelOut: rawTravelOut,
        bufferMinsApplied: bufferInApplied, // actual buffer used (0 if from base)
        baseTravel,
        prevLocation: gap.prevLoc,
        nextLocation: gap.nextLoc,
        prevClientName: gap.prevAppt?.clientName || null,
        prevEndTime: gap.prevAppt?.endTime || null,
        prevAppointmentNote: gap.prevAppt?.note?.split("\n")[0]?.slice(0, 80) || null,
        prevAppointmentLabel: gap.prevAppt?.label?.slice(0, 80) || null,
        nextClientName: gap.nextAppt?.clientName || null,
        nextStartTime: gap.nextAppt?.startTime || null,
        nextAppointmentLabel: gap.nextAppt?.label?.slice(0, 80) || null,
        comingFromBase: !comingFromAppointment,
        priorHardBlock: priorHardBlock ? priorHardBlock.label : null,
        tier,
        totalApptsThatDay: sorted.filter(s => s.kind === "lesson").length,
        softBlocksOnDay,
        peakTrafficWarning,
        peakPeriod: amPeak ? "AM peak" : (pmPeak ? "PM peak" : null)
      });
    }

    d.setDate(d.getDate() + 1);
  }

  return { slots, adminAlerts };
}

// ─── Scoring ─────────────────────────────────────────────────────────────────
function scoreSlot(slot) {
  let score = 0;
  if (slot.tier === 1) score += 500;
  else if (slot.tier === 2) score += 300;
  else if (slot.tier === 3) score += 100;
  else score -= 100;

  score -= slot.travelIn * 5;
  if (slot.travelIn <= 5) score += 150;
  else if (slot.travelIn <= 10) score += 100;
  else if (slot.travelIn <= 20) score += 50;

  if (slot.baseTravel <= 15) score += 40;
  else if (slot.baseTravel <= 30) score += 20;
  else if (slot.baseTravel > 55) score -= 30;

  score -= (new Date(slot.date) - new Date()) / (1000 * 60 * 60 * 24) * 0.3;
  return score;
}

// ─── Analyse endpoint ────────────────────────────────────────────────────────
app.post("/analyse", async (req, res) => {
  const debugLog = [];
  try {
    const booking = req.body;
    const clientSuburb = booking.clientSuburb || booking.suburb;
    // Accept both array and comma-separated string for mods
    let requiredMods = booking.modifications || booking.requiredMods || [];
    if (typeof requiredMods === "string") {
      requiredMods = requiredMods.split(",").map(s => s.trim()).filter(Boolean);
    }
    if (!Array.isArray(requiredMods)) requiredMods = [];
    const durationMins = parseInt(booking.lessonDuration || booking.duration || 60);
    const availString = booking.availability || "";

    if (!clientSuburb) {
      return res.status(400).json({ error: "Client suburb is required", errorType: "validation" });
    }

    debugLog.push(`Analysing booking for ${booking.clientName || "(no name)"} in ${clientSuburb}`);
    debugLog.push(`Mods: ${requiredMods.join(", ") || "(none)"} | Duration: ${durationMins}min`);

    const MOD_MAP = {
      "left foot accelerator": "LFA",
      "lfa": "LFA",
      "electronic spinner": "Electronic Spinner",
      "spinner knob": "Spinner",
      "spinner": "Spinner",
      "hand controls": "Hand Controls",
      "hand control": "Hand Controls",
      "satellite": "Satellite",
      "o-ring": "O-Ring",
      "oval ring": "O-Ring",
      "o ring": "O-Ring",
      "monarchs": "Monarchs",
      "monarch": "Monarchs",
      "extension pedals": "Extension Pedals",
      "extension pedal": "Extension Pedals",
      "indicator extension": "Indicator Extension"
    };
    const normalisedMods = requiredMods.map(m => {
      const lower = m.toLowerCase().trim();
      for (const [kw, canonical] of Object.entries(MOD_MAP)) {
        if (lower === kw) return canonical;
        if (kw.includes(" ") && lower.includes(kw)) return canonical;
        if (!kw.includes(" ") && new RegExp(`\\b${kw}\\b`).test(lower)) return canonical;
      }
      return m;
    });

    const eligibleInstructors = INSTRUCTORS.filter(inst => {
      return normalisedMods.every(needed =>
        inst.mods.some(m => m.toLowerCase() === needed.toLowerCase())
      );
    });

    debugLog.push(`Eligible instructors: ${eligibleInstructors.map(i => i.name).join(", ") || "none"}`);

    if (eligibleInstructors.length === 0) {
      return res.json({
        content: [{ type: "text", text: `No instructors have all the required modifications: ${normalisedMods.join(", ")}.\n\nAdmin: review the client's requirements.` }],
        _debug: debugLog
      });
    }

    const availPref = parseAvailability(availString);
    debugLog.push(`Availability parsed: ${JSON.stringify(availPref)}`);

    const allSlots = [];
    const allAdminAlerts = [];
    const fetchErrors = [];
    for (const inst of eligibleInstructors) {
      try {
        const result = await findAvailableSlots(inst, clientSuburb, durationMins, availPref);
        allSlots.push(...result.slots);
        if (result.adminAlerts?.length) {
          // Tag each alert with the instructor so admin knows who it's about
          for (const alert of result.adminAlerts) {
            allAdminAlerts.push({ instructor: inst.name, ...alert });
          }
        }
        debugLog.push(`${inst.name}: ${result.slots.length} valid slots, ${result.adminAlerts?.length || 0} alerts`);
      } catch (err) {
        debugLog.push(`ERROR fetching ${inst.name}: ${err.message}`);
        fetchErrors.push({ instructor: inst.name, error: err.message });
      }
    }

    if (allSlots.length === 0) {
      const eligibleNames = eligibleInstructors.map(i => i.name).join(", ");
      const errorInfo = fetchErrors.length > 0
        ? `\n\n⚠️ Some instructor diaries could not be fetched: ${fetchErrors.map(e => `${e.instructor} (${e.error})`).join(", ")}`
        : "";
      return res.json({
        content: [{
          type: "text",
          text: `No available slots found for ${booking.clientName || "this client"} in ${clientSuburb}.

Eligible instructors (with required modifications): ${eligibleNames}

All eligible instructors are either fully booked during the client's preferred time windows or the client's suburb is outside their usual operating area.

Suggested actions for admin:
1. Ask the client about additional availability (different days or time blocks)
2. Check if the closest instructor has upcoming days near ${clientSuburb}
3. Contact an instructor directly about a special arrangement${errorInfo}`
        }],
        _debug: debugLog
      });
    }

    allSlots.sort((a, b) => scoreSlot(b) - scoreSlot(a));
    const selected = [];
    const usedInstructors = {};
    const usedDates = new Set();
    for (const s of allSlots) {
      if (selected.length >= 10) break;
      const instCount = usedInstructors[s.instructor] || 0;
      if (instCount >= 3) continue;
      if (usedDates.has(`${s.instructor}|${s.date}`)) continue;
      selected.push(s);
      usedInstructors[s.instructor] = instCount + 1;
      usedDates.add(`${s.instructor}|${s.date}`);
    }

    debugLog.push(`Selected top ${selected.length} slots for Claude`);

    const slotDescriptions = selected.map((s, i) => {
      const tierLabels = {
        1: "Tier 1 — Ideal (in zone, nearby on day)",
        2: "Tier 2 — Good (in natural zone)",
        3: "Tier 3 — Workable (outside zone but nearby on day)",
        4: "Tier 4 — Stretch (outside zone, no nearby lessons)"
      };
      const instData = INSTRUCTORS.find(x => x.name === s.instructor);

      // Build "coming from" description with context from appointment notes
      let comingFrom;
      if (s.prevClientName) {
        const contextNote = s.prevAppointmentNote && s.prevAppointmentNote !== s.prevClientName
          ? ` — ${s.prevAppointmentNote}`
          : "";
        comingFrom = `from lesson with ${s.prevClientName}${contextNote} (finishes ${s.prevEndTime})`;
      } else if (s.priorHardBlock) {
        comingFrom = `from base in ${s.base} (first availability after "${s.priorHardBlock}")`;
      } else {
        comingFrom = `from base in ${s.base}`;
      }

      // Build "next lesson" description
      let nextLesson;
      if (s.nextClientName) {
        nextLesson = `then lesson with ${s.nextClientName} at ${s.nextStartTime}`;
      } else if (s.nextLocation) {
        nextLesson = `then on to ${s.nextLocation} at ${s.nextStartTime}`;
      } else {
        nextLesson = "last lesson of the day";
      }

      const peakFlag = s.peakTrafficWarning ? `\n  ⚠️ ${s.peakPeriod} — travel may take longer than estimated` : "";

      const softBlockNote = s.softBlocksOnDay && s.softBlocksOnDay.length > 0
        ? `\n  Soft holds on this day: ${s.softBlocksOnDay.map(b => `${b.startTime}-${b.endTime} "${b.label || b.note}"`).join("; ")}`
        : "";

      const bufferNote = s.bufferMinsApplied > 0
        ? `${s.bufferMinsApplied} min buffer applied`
        : "no buffer (coming from base)";

      return `Slot ${i + 1}: ${s.instructor} — ${formatDate(s.date)} (${s.dayName}) at ${s.suggestedStart}
  ${tierLabels[s.tier]}
  Coming ${comingFrom}
  Travel in: ${s.travelIn} min (${bufferNote})
  After the lesson: ${nextLesson}
  Travel out: ${s.travelOut} min
  Base: ${s.base} → ${clientSuburb}: ${s.baseTravel} min
  Zone: ${instData?.preferredZone}
  Lessons booked that day: ${s.totalApptsThatDay}${peakFlag}${softBlockNote}`;
    }).join("\n\n");

    // Build admin alerts section if any
    const adminAlertsText = allAdminAlerts.length > 0
      ? `\n\nADMIN ALERTS (unresolved data — admin may need to verify):\n` +
        allAdminAlerts.map(a => `- ${a.instructor} ${formatDate(a.date)} ${a.time}: ${a.details}`).join("\n")
      : "";

    const systemPrompt = `You are the SDT Booking Assistant for Specialised Driver Training. You help office staff choose the best 3 slots from a list of pre-verified options.

Pick the 3 best slots from the provided list. Present each with:
- Option number, instructor name, date/time
- Tier label
- 2-3 sentences on: day/time fit, where instructor is coming from (use the "Coming from" line - mention the previous client's name AND any additional context from the appointment notes if present), what's happening after the lesson

Rules:
- Use ONLY the slots provided — do not invent any dates or times
- When describing travel, use the exact "Coming from" line provided. If it mentions additional context (e.g. "— Ax with OT Jo Coleman"), include that context in your written response
- If "first availability after X" is mentioned, include that context so admin knows instructor is returning from a break
- If the slot shows a ⚠️ peak traffic warning, include it in your response as a note under that option
- Tier 1 = ideal, Tier 2 = good, Tier 3 = workable (mention the instructor will already be in the area), Tier 4 = stretch (add a ⚠️ note)
- If all slots are from one instructor because they're the only eligible one, say so
- Keep language practical — this is for office staff making booking decisions
- No client-facing language (no "Hello [name]", no "would you like to book")

AT THE END OF YOUR RESPONSE, add an "Admin Review" section ONLY if any of the selected slots have "Soft holds on this day" listed. In that section:
- Mention each soft hold by date and what it says
- Say "Admin: verify these holds before booking — they may be for this client or related clients, or they may need to remain reserved"
- Do NOT add the Admin Review section for hard blocks — those slots will never be suggested anyway

IF the user message contains "ADMIN ALERTS" below the slots, add a separate "Unresolved Data Alerts" section at the very end listing each alert verbatim. These are cases where the system couldn't verify something (e.g. a hold's location). Do not filter these — list them all.

If no soft holds and no admin alerts exist, do not include any review sections at all.`;

    const userMessage = `CLIENT: ${booking.clientName || "(not specified)"}
SUBURB: ${clientSuburb}
MODS: ${normalisedMods.join(", ") || "none"}
AVAILABILITY: ${availString || "not specified"}

VERIFIED SLOTS:
${slotDescriptions}${adminAlertsText}`;

    const aiRes = await axios.post("https://api.anthropic.com/v1/messages", {
      model: "claude-sonnet-4-20250514",
      max_tokens: 1500,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }]
    }, {
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
      },
      timeout: 60000
    });

    debugLog.push("Claude analysis complete");
    res.json({ ...aiRes.data, _debug: debugLog });

  } catch (err) {
    console.error("ANALYSE ERROR:", err);
    let userMessage = err.message;
    let errorType = "general";

    if (err.response?.status === 401) {
      userMessage = "Authentication error — API credentials may be invalid or expired. Check Railway environment variables.";
      errorType = "auth";
    } else if (err.response?.status === 429) {
      userMessage = "Rate limit reached — please wait a moment and try again.";
      errorType = "rate_limit";
    } else if (err.response?.data?.error?.type === "invalid_request_error" && (err.response?.data?.error?.message || "").toLowerCase().includes("credit")) {
      userMessage = "Anthropic API credits exhausted — please top up at console.anthropic.com to continue.";
      errorType = "credits";
    } else if (err.message?.includes("Nookal")) {
      userMessage = `Nookal API error: ${err.message}`;
      errorType = "nookal";
    } else if (err.message?.toLowerCase().includes("timeout")) {
      userMessage = "Request timed out — the Nookal API may be slow right now. Please try again.";
      errorType = "timeout";
    } else if (err.message?.includes("ECONNREFUSED") || err.message?.includes("ENOTFOUND")) {
      userMessage = "Could not reach an external service (Nookal, Google Maps, or Anthropic). Please try again in a moment.";
      errorType = "network";
    }

    res.status(500).json({
      error: userMessage,
      errorType,
      debugLog,
      rawError: err.message
    });
  }
});

// ─── Health check ────────────────────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    version: "v2-nookal-api",
    cacheSize: {
      clientAddresses: Object.keys(clientAddressCache).length,
      travelRoutes: Object.keys(travelCache).length
    },
    tokenValid: cachedToken && Date.now() < cachedTokenExpiry
  });
});

// ─── Cache clear (for when a client moves or we need fresh data) ─────────────
app.post("/clear-cache", (req, res) => {
  const before = {
    clients: Object.keys(clientAddressCache).length,
    travel: Object.keys(travelCache).length
  };
  for (const k of Object.keys(clientAddressCache)) delete clientAddressCache[k];
  for (const k of Object.keys(travelCache)) delete travelCache[k];
  cachedToken = null;
  cachedTokenExpiry = 0;
  res.json({ cleared: before });
});


// ─── Debug: show classification for one instructor/day ──────────────────────
// Usage: /debug-day?instructor=Gabriel&date=2026-04-28
app.get("/debug-day", async (req, res) => {
  try {
    const instructorName = req.query.instructor;
    const date = req.query.date;
    if (!instructorName || !date) {
      return res.json({ error: "Usage: /debug-day?instructor=Gabriel&date=2026-04-28" });
    }
    const inst = INSTRUCTORS.find(i => i.name.toLowerCase() === instructorName.toLowerCase());
    if (!inst) return res.json({ error: `Instructor '${instructorName}' not found` });

    // Fetch ICS for the day + next day to ensure proper range response
    const dateObj = new Date(date + "T12:00:00+10:00");
    const nextDay = new Date(dateObj.getTime() + 24 * 3600 * 1000);
    const dateTo = toMelbDateStr(nextDay);
    const appts = await getAppointmentsForInstructor(inst, date, dateTo);
    const forThisDay = appts.filter(a => a.appointmentDate === date);

    // Classify each AND resolve location (so we see what the booking engine actually uses)
    const classified = [];
    for (const a of forThisDay) {
      const cls = classifyAppointment(a);
      const startM = timeToMins(a.startTime.slice(0, 5));
      const endM = timeToMins(a.endTime.slice(0, 5));
      const entry = {
        time: `${a.startTime.slice(0,5)}-${a.endTime.slice(0,5)}`,
        durationMins: endM - startM,
        summary: a.summary,
        description: a.description?.slice(0, 120),
        categories: a.categories,
        classification: cls.kind,
        label: cls.label,
        reason: cls.reason,
        blocksTime: cls.kind === "lesson" || cls.kind === "hard-block" || cls.kind === "soft-block"
      };

      // For lessons and soft-block holds, also show the resolved location
      if (cls.kind === "lesson") {
        const loc = await resolveAppointmentLocation({
          clientName: cls.clientName || a.summary,
          notes: a.description || a.notes
        });
        entry.resolvedLocation = loc ? {
          pickup: loc.pickup,
          dropoff: loc.dropoff,
          source: loc.source,
          clientHomeSuburb: loc.clientHomeSuburb,
          unresolved: loc.unresolved || false
        } : null;
      } else if (cls.kind === "soft-block") {
        const holdClient = extractHoldClientName(a.summary);
        if (holdClient) {
          const loc = await resolveAppointmentLocation({
            clientName: holdClient,
            notes: a.description || a.notes
          });
          entry.holdClient = holdClient;
          entry.resolvedLocation = loc ? {
            pickup: loc.pickup,
            dropoff: loc.dropoff,
            source: loc.source,
            clientHomeSuburb: loc.clientHomeSuburb,
            unresolved: loc.unresolved || false
          } : { unresolved: true };
        }
      }

      classified.push(entry);
    }
    classified.sort((x, y) => timeToMins(x.time.slice(0, 5)) - timeToMins(y.time.slice(0, 5)));

    // Compute gaps
    const blocks = classified.filter(c => c.blocksTime);
    const gaps = [];
    const earliestStart = inst.earliestStart ? timeToMins(inst.earliestStart) : 480;
    const latestEnd = 1050;
    const sorted = [...blocks].sort((a, b) => timeToMins(a.time.slice(0, 5)) - timeToMins(b.time.slice(0, 5)));
    let cursor = earliestStart;
    for (const b of sorted) {
      const bStart = timeToMins(b.time.slice(0, 5));
      const bEnd = timeToMins(b.time.slice(6, 11));
      if (bStart > cursor) gaps.push({ from: minsToTime(cursor), to: minsToTime(bStart), lengthMins: bStart - cursor });
      cursor = Math.max(cursor, bEnd);
    }
    if (cursor < latestEnd) gaps.push({ from: minsToTime(cursor), to: minsToTime(latestEnd), lengthMins: latestEnd - cursor });

    res.json({
      instructor: inst.name,
      date,
      source: "ICS diary feed",
      totalEntries: forThisDay.length,
      classified,
      summary: {
        lessons: classified.filter(c => c.classification === "lesson").length,
        hardBlocks: classified.filter(c => c.classification === "hard-block").length,
        softBlocks: classified.filter(c => c.classification === "soft-block").length,
        skipped: classified.filter(c => c.classification === "skip").length
      },
      availableGaps: gaps
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Test Nookal API health ─────────────────────────────────────────────────
app.get("/test-nookal", async (req, res) => {
  try {
    await getNookalToken();
    const locations = await nookalQuery(`query { locations { locationID name suburb } }`);
    res.json({
      apiTokenWorks: true,
      locations: locations.locations,
      cacheStats: {
        clientAddresses: Object.keys(clientAddressCache).length,
        clientNames: Object.keys(clientByNameCache).length,
        travelRoutes: Object.keys(travelCache).length,
        icsFeeds: Object.keys(icsCache).length
      },
      note: "Main diary data now comes from ICS feeds, not API. API is used only for client address lookups."
    });
  } catch (err) {
    res.status(500).json({ error: err.message, detail: err.response?.data });
  }
});

// ─── Test ICS feed fetch ────────────────────────────────────────────────────
app.get("/test-ics", async (req, res) => {
  try {
    const instructorName = req.query.instructor || "Christian";
    const inst = INSTRUCTORS.find(i => i.name.toLowerCase() === instructorName.toLowerCase());
    if (!inst) return res.json({ error: `Instructor not found` });

    const today = toMelbDateStr(new Date());
    const tomorrow = toMelbDateStr(new Date(Date.now() + 24 * 3600 * 1000));
    const appts = await getAppointmentsForInstructor(inst, today, tomorrow);
    const forThisDay = appts.filter(a => a.appointmentDate === today || a.appointmentDate === tomorrow);

    res.json({
      instructor: inst.name,
      dateRange: `${today} - ${tomorrow}`,
      entries: forThisDay.map(a => ({
        date: a.appointmentDate,
        time: `${a.startTime.slice(0,5)}-${a.endTime.slice(0,5)}`,
        summary: a.summary,
        description: a.description?.slice(0, 100),
        categories: a.categories,
        classification: classifyAppointment(a)
      }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => console.log(`SDT Booking Assistant v2 running on ${PORT}`));

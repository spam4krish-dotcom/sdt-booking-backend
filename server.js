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

// Known Nookal consultation types — any event with a description starting
// with one of these is DEFINITELY a real lesson, regardless of summary content.
// This is an authoritative whitelist (user-provided).
const KNOWN_CONSULTATION_TYPES = [
  "Driving Assesst- Privately Paying - NEW",
  "Driver Training- Privately Paying - NEW",
  "Driving Ax-Initial NDIS, OT or Pvte - NEW",
  "Driving Ax - Follow-up NDIS, OT or Pvte - NEW",
  "Driver Training for NDIS Participant- CURRENT",
  "Ax/ReAx post NDIS lessons from existing funds",
  "Driver Training for NDIS Self-Payer - Legacy",
  "Driving Ax-Initial NDIS, OT or Pvte - 2023/24",
  "Driving Ax - Follow-up NDIS, OT or Pvte-23/24",
  "Driver Assessment for TAC claimant - 2025/26",
  "Driver Training for TAC claimant - 2025/26",
  "Travel to/from for TAC claimant - 2025/26",
  "Driving Assessment for WCover client - 25/26",
  "Driver Training for WCover client -2025/26",
  "Travel time for WCover client - 2025/26",
  "Van Driver Training for NDIS Participant-curr",
  "METEC Hiring Fee",
  "Learner Permit Training - Current",
  "Driving Ax - Pvte Client (by arrangement",
  "Driver Training - Pvte Client (by arrangement",
  "Driver Training for NDIS Self-Payer ($200)",
  "D/Training for NDIS Participant (full hr)",
  "Driving Assessment for DVA client (regional)",
  "Driver Training for DVA client",
  "Driver Training for DVA client (regional)",
  "Specialist van usage - Assessment",
  "Specialist van usage - Training",
  "Pvte lesson",
  "Free lesson",
  "D/Training for NDIS Participant (by arrangeme",
  "Travel Time Fee",
  "Driver Training- Private Paying Client-23/24",
  "Driving Assesst- Private Paying Client-23/24",
  "Travel for NDIS Participant-current"
];

// Check if description starts with any known consultation type
function hasKnownConsultationType(description) {
  if (!description) return false;
  const descLower = description.toLowerCase();
  return KNOWN_CONSULTATION_TYPES.some(ct => descLower.startsWith(ct.toLowerCase()));
}

// ─── Appointment Classification ──────────────────────────────────────────────
// Returns: { kind, clientName, label, clinic? }
//   kind: "lesson" | "hard-block" | "clinic-hold" | "private-hold" | "skip"
//     - lesson: real client appointment (Blue Category)
//     - hard-block: instructor unavailable (holidays/day off/sick/non-sdt/etc.)
//     - clinic-hold: held for Active One or Community OT (eligible for admin alert)
//     - private-hold: held for a private client (Sherri's style, no alert)
//     - skip: empty/cancelled/note-reminder/irrelevant
//
// Colour signals in ICS (observed consistently across all instructors):
//   Blue Category   → lesson
//   Purple Category → Event (hold/block of various kinds)
//   Orange Category → Note (admin reminder — SKIP, doesn't block time)
function classifyAppointment(a) {
  const summary = (a.summary || "").trim();
  const summaryLower = summary.toLowerCase();
  const description = (a.description || "").trim();
  const categories = (a.categories || []).map(c => String(c).toLowerCase());

  // Skip cancelled events
  if (summaryLower.includes("cancelled") || summaryLower.includes("cancellation")) {
    return { kind: "skip", reason: "cancelled" };
  }

  // Empty/blank entries
  if (!summary && !description) {
    return { kind: "skip", reason: "empty" };
  }

  // ─── Orange Category = Note (admin reminder, not a real block) ───
  // Nookal "Note" entries are admin reminders like "No Addie today" or
  // "SMARTBOX RETURN" — they don't block time, the instructor can still book
  // around them. They appear in the diary (usually orange/yellow tint) but
  // are informational only. Detectable by Orange Category + summary === "Note"
  // AND/OR description starting with "Note details:".
  const isOrangeCategory = categories.includes("orange category");
  const descriptionStartsWithNote = /^note\s+details\s*:/i.test(description);
  if (isOrangeCategory || summary.toLowerCase() === "note" || descriptionStartsWithNote) {
    return { kind: "skip", reason: "note (admin reminder, not a block)" };
  }

  // ─── PRIMARY SIGNAL: ICS colour category ───
  // Blue Category = real lesson; Purple Category = Event (block/hold)
  // Nookal assigns these reliably per entry type, giving us a clean binary.
  const isBlueCategory = categories.includes("blue category");
  const isPurpleCategory = categories.includes("purple category");

  // ─── Blue Category = lesson ───
  // Cross-check: description must start with a known consultation type
  if (isBlueCategory) {
    if (hasKnownConsultationType(description)) {
      return { kind: "lesson", clientName: summary, label: summary };
    }
    // Blue but no known consultation type — still treat as lesson (safer default)
    return { kind: "lesson", clientName: summary, label: summary };
  }

  // ─── Purple Category = Event; sub-classify by summary ───
  if (isPurpleCategory || /^event\s*[-–]/i.test(summary)) {
    // Hard block keywords (with word-boundary matching to avoid substring traps)
    const hardBlockSignals = [
      "day off", "dayoff", "no lessons", "no lesson",
      "private stuff", "private work", "non-sdt", "non sdt",
      "school pick up", "school pickup", "school run",
      "holiday", "holidays", "leave on", "sick",
      "medical appointment", "medical",
      "car service", "unavailable",
      "total ability van", "smartbox", "lagos holiday",
      "lunch break",
      "job interview", "doctor", "dentist", "ultrasound", "blood test",
      "vic roads", "vicroads", "meet vic",
      "personal", "myotherapist",
      "soccer training", "sports training"
    ];
    const hardBlockRegex = new RegExp(
      "\\b(" + hardBlockSignals.map(s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+")).join("|") + ")\\b",
      "i"
    );
    if (hardBlockRegex.test(summary)) {
      return { kind: "hard-block", reason: "unavailable", label: summary };
    }

    // Clinic-partnership holds (worth admin alert when nearby)
    const clinic = matchClinicPartner(summary);
    if (clinic) {
      return { kind: "clinic-hold", label: summary, clinic };
    }

    // Any other Purple event = private hold (blocks time, no admin alert)
    return { kind: "private-hold", label: summary };
  }

  // ─── Fallback: no category, try heuristics ───
  // If description starts with known consultation type → lesson
  if (hasKnownConsultationType(description)) {
    return { kind: "lesson", clientName: summary, label: summary };
  }

  // "Event - X" prefix without a match → default to private-hold (safer than suggesting)
  if (/^event\s*[-–]/i.test(summary)) {
    return { kind: "private-hold", label: summary };
  }

  // Last resort: treat as lesson (client name in summary)
  return { kind: "lesson", clientName: summary, label: summary };
}

// Strip the ICS-generated prefix from a description to isolate the real
// appointment notes. ICS descriptions have two common forms:
//   Lessons: "Driver Training for NDIS Participant- CURRENT at 01:45 pm, 12/05/26 with Lucas Tripicchio at Marc Seow.MELTON"
//            (separator is ".Marc Seow." or ".Driving Matters Pty Ltd.")
//   Events:  "Event details: Location: Marc Seow"
//            (everything useful is in Summary; description has the free-form admin notes at the top)
function stripIcsDescriptionPrefix(description) {
  if (!description) return "";

  // Pattern 1: "Event details: X[newline]Location: Y" → extract X (the actual notes)
  const eventDetailsMatch = description.match(/^event\s+details\s*:\s*(.*)$/is);
  if (eventDetailsMatch) {
    const rest = eventDetailsMatch[1];
    // Strip trailing "Location: ..."
    const locationStripped = rest.replace(/\s*Location\s*:\s*[^\n]*$/i, "").trim();
    return locationStripped;
  }

  // Pattern 2a: Strip everything up to the LAST occurrence of the instructor location separator.
  // The Nookal ICS template appends ".<LocationName>." before the real appointment notes.
  // Known location-field values seen in ICS: "Driving Matters Pty Ltd", "Marc Seow",
  // "Greg Ekkel", "Sherri Simmonds", "Jason Simmonds", "Yves Salzmann".
  const instructorLocations = [
    "Driving Matters Pty Ltd",
    "Marc Seow", "Greg Ekkel", "Sherri Simmonds", "Jason Simmonds",
    "Yves Salzmann", "Christian Lagos", "Gabriel Lagos"
  ];
  for (const loc of instructorLocations) {
    // Match ".Loc." or "Loc." or "›Loc." with optional trailing content
    const escaped = loc.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`[›·]?${escaped}\\.?\\s*(.+)$`, "is");
    const m = description.match(re);
    if (m && m[1].trim()) {
      return m[1].trim();
    }
  }

  // Pattern 2b: Generic "Pty Ltd." ending
  const ptyMatch = description.match(/(?:Pty\s*Ltd|Clinic|Office|Practice)\.?\s*(.+)$/is);
  if (ptyMatch && ptyMatch[1].trim()) {
    return ptyMatch[1].trim();
  }

  // Pattern 3: "with <ClientName> at <LocationName>." — take what's after
  const withAtMatch = description.match(/\s+with\s+[^,]+?\s+at\s+[^.]+\.(.+)$/is);
  if (withAtMatch && withAtMatch[1].trim()) {
    return withAtMatch[1].trim();
  }

  // Fallback: return the whole thing
  return description;
}

// ─── Location extraction from notes ──────────────────────────────────────────
// Returns a structured object describing what the notes say about location.
// Priority:
//   1. Pickup + Dropoff pattern ("from X to home in Y") → { pickup, dropoff }
//   2. Explicit street address in notes (e.g. "251 Mountain Hwy") → { address }
//   3. Named venue (school/clinic/hospital/centre) → { venue, venueSuburb }
//   4. Suburb name → { suburb }
//   5. Nothing useful → null
function extractNotesLocation(rawNotes) {
  if (!rawNotes || !rawNotes.trim()) return null;

  // Strip the ICS template prefix so we only search the real appointment notes
  const notes = stripIcsDescriptionPrefix(rawNotes);
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
  const streetAddressMatch = notes.match(/(\d{1,5}\s+[A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)*\s+(?:Street|St|Road|Rd|Avenue|Ave|Drive|Dr|Court|Ct|Crescent|Cres|Place|Pl|Parade|Pde|Way|Highway|Hwy|Boulevard|Blvd|Lane|Ln|Close|Cl|Terrace|Tce))\b/i);
  if (streetAddressMatch) {
    const streetPart = streetAddressMatch[1].trim();
    // Try to find a suburb near this address (within 50 chars)
    const startIdx = streetAddressMatch.index;
    const endIdx = startIdx + streetAddressMatch[0].length;
    const nearbyContext = notes.slice(Math.max(0, startIdx - 50), Math.min(notes.length, endIdx + 80));
    const nearbyCaps = nearbyContext.match(/\b([A-Z]{3,}(?:\s+[A-Z]{2,})*)\b/g) || [];
    let suburbPart = null;
    for (const caps of nearbyCaps) {
      if (isLikelySuburb(caps)) { suburbPart = cleanSuburb(caps); break; }
    }
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
  const venuePatterns = [
    /\b(active\s*one|activeone)(?:\s+clinic)?\s+([A-Z][A-Z\s]{2,40}?)(?:\n|\s+(?:at|with|ax|lesson|for|prior|to)|$|\.|,)/i,
    /\b(comm\s*ot|community\s*ot)\s+([A-Z][A-Z\s]{2,40}?)(?:\n|\s+(?:at|with|ax|lesson|for|prior|to)|$|\.|,)/i,
    /\b(epworth)\s+([A-Z][A-Z\s]{2,40}?)(?:\n|\s+(?:at|with|ax|lesson|for|prior|to)|$|\.|,)/i,
    /\b(eastern\s+health|western\s+health|northern\s+health|southern\s+health)\s+([A-Z][A-Z\s]{2,40}?)(?:\n|\s+(?:at|with|ax|lesson|for|prior|to)|\(|$|\.|,)/i,
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

  // Expanded blocklist — includes Nookal consultation type fragments
  const NOT_SUBURBS = new Set([
    // Admin/workflow
    "HOLD", "TEST", "LESSON", "LESSONS", "NEW", "INITIAL", "PRE", "PLEASE", "COLLECT",
    "FROM", "HOME", "NOT", "DO", "OFFER", "OFFERED", "REBOOK",
    "CONFIRMED", "CONFIRMING", "PENDING", "WL", "APPROVAL", "APPROVED",
    // Consultation type fragments
    "CURRENT", "CURR", "LEGACY", "PARTICIPANT", "PARTICIPANTS",
    "TRAINING", "FOLLOW", "FOLLOWUP", "ASSESSMENT", "ASSESSMENTS", "ASSESS",
    "PAYING", "SELF", "PAYER", "MANAGED", "CLAIMANT", "CLAIMANTS",
    "PRIVATE", "PRIVATELY", "PVTE", "PVT", "REAX",
    // Funding
    "NDIS", "TAC", "WCOVER", "WORKCOVER", "DVA", "SDT", "LFA", "AX",
    // Known blocks
    "TOTAL", "ABILITY", "VAN", "SMARTBOX", "RETURN", "HOLIDAY", "HOLIDAYS",
    "EASTER", "SERVICE", "AWAY", "SICK", "MEDICAL", "APPOINTMENT",
    "METEC", "HIRING", "LEARNER", "PERMIT",
    // Generic
    "WITH", "THE", "THIS", "THAT", "WILL", "HAVE", "HAS", "THEIR",
    // Company
    "DRIVING", "MATTERS", "PTY", "LTD", "DETAILS", "LOCATION",
    // Schools/venue stopwords
    "SCHOOL", "COLLEGE", "GRAMMAR", "ACADEMY", "HIGH",
    "PICKUP", "DROPOFF",
    // Instructor names
    "JASON", "GREG", "MARC", "CHRISTIAN", "GABRIEL", "SHERRI", "YVES",
    "LAGOS", "SIMMONDS", "EKKEL", "SEOW", "SALZMANN",
    // Clinic types
    "COMMOT", "ACTIVEONE", "COMMUNITY", "OT", "CLINIC",
    "EASY", "DRIVE", "PREVIOUS", "NEXT",
    // Event
    "EVENT", "EVENTS",
    // Random note words
    "FASTING", "IMED", "ULTRASOUND", "BLOOD", "MEETING",
    "SATELLITE", "SPINNER", "KNOB", "ELECTRONIC",
    "HANDCONTROLS", "LOLLIPOP", "MONARCHS", "RADIAL", "EURO", "GRIP",
    "ACCELERATOR", "ACC", "RB", "LH", "RH", "LHS", "RHS",
    "ONGOING", "SERIES", "FUNDING", "FUNDED",
    "INVOICE", "PAYMENT",
    "VICROADS"
  ]);
  return !words.some(w => NOT_SUBURBS.has(w));
}

// Lookup client by name (since ICS doesn't give us clientID).
// Caches by name. Handles name variants like "Christine (prefers Chris) Dean"
// or "Kade Syphers-Smith" by trying multiple parsing strategies.
const clientByNameCache = {};
async function getClientByName(fullName) {
  if (!fullName || fullName.length < 3) return null;
  const key = fullName.toLowerCase().trim();
  if (clientByNameCache[key] !== undefined) return clientByNameCache[key];

  // Strip parenthetical aliases — e.g. "Christine (prefers Chris) Dean" → "Christine Dean"
  // Also strip trailing alias notes like "Chris Wayman (Dad's home)"
  const cleanedName = fullName
    .replace(/\([^)]*\)/g, " ")  // remove everything in parens
    .replace(/\s+/g, " ")
    .trim();

  const parts = cleanedName.split(/\s+/);
  if (parts.length < 2) {
    clientByNameCache[key] = null;
    return null;
  }

  // Try two strategies: (a) first word + last word, (b) first word + preferred name from parens
  const tryPairs = [];
  // Strategy a: standard first + last
  tryPairs.push({ firstName: parts[0], lastName: parts[parts.length - 1] });

  // Strategy b: if original had parens with a single word, try that as firstName
  const parenMatch = fullName.match(/\(([^)]+)\)/);
  if (parenMatch) {
    const parenContent = parenMatch[1].trim();
    // Parse "prefers Chris" or just "Chris"
    const parenName = parenContent.replace(/^prefers\s+/i, "").trim();
    if (parenName && !parenName.includes(" ")) {
      tryPairs.push({ firstName: parenName, lastName: parts[parts.length - 1] });
    }
  }

  for (const { firstName, lastName } of tryPairs) {
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
      const exact = matches.find(c =>
        c.firstName?.toLowerCase() === firstName.toLowerCase() &&
        c.lastName?.toLowerCase() === lastName.toLowerCase()
      );
      const best = exact || matches[0];
      if (best) {
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
      }
    } catch (err) {
      console.error(`Client name lookup failed for ${firstName} ${lastName}:`, err.message);
    }
  }

  // All strategies failed
  clientByNameCache[key] = null;
  return null;
}

// Helper: extract "Hold for CLIENT NAME" from a hold summary.
// Returns { kind, name } where kind is "client" | "venue" | null
//   client: a real person name we should look up in Nookal
//   venue: a clinic/location name (e.g. "Community BRUNSWICK", "Active One Frankston")
//          — don't look up as a client, resolve via notes location instead
//   null: couldn't extract anything useful
function extractHoldClientName(summary) {
  if (!summary) return { kind: null };
  // Strip "Event - " prefix first
  const cleaned = summary.replace(/^event\s*[-–]\s*/i, "").trim();

  // Match "Hold for X", "HOLD for X", "Hold X", "HOLD FOR X"
  const m = cleaned.match(/^hold\s+(?:for\s+)?([A-Za-z][A-Za-z\s'&-]+?)(?:\s*[-–,]|\s+\(|\s+regular|\s+ax|\s+spot|\s*$)/i);
  if (!m) return { kind: null };

  const extracted = m[1].trim();

  // Check if this is a venue name rather than a client name
  // Venue indicators:
  //   - Contains "Community", "Active One", "ActiveOne", "CommOT", "Epworth", "Eastern Health", etc.
  //   - Has any ALL-CAPS word (client names are Proper Case, suburbs are ALL CAPS)
  //   - Is a known clinic type
  const venueKeywords = /\b(community|active\s*one|activeone|comm\s*ot|commot|epworth|eastern\s+health|western\s+health|hospital|rehab|clinic|centre|center|office|health)\b/i;
  if (venueKeywords.test(extracted)) {
    return { kind: "venue", name: extracted };
  }

  // If any word is ALL CAPS (3+ letters), it's a suburb/venue not a person
  const words = extracted.split(/\s+/);
  const hasAllCapsWord = words.some(w => /^[A-Z]{3,}$/.test(w));
  if (hasAllCapsWord) {
    return { kind: "venue", name: extracted };
  }

  // Require at least 2 words for a client name (First + Last)
  if (words.length < 2) {
    return { kind: null };
  }

  return { kind: "client", name: extracted };
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
// Returns duration in minutes (for travel calcs).
// Also caches the distance in metres so we can check radii without re-querying.
const distanceCache = {}; // { "origin|destination": metres }

async function getTravelTime(origin, destination) {
  if (!origin || !destination) return 30;
  const key = `${origin.toUpperCase()}|${destination.toUpperCase()}`;
  if (travelCache[key] !== undefined) return travelCache[key];

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
    if (row?.status === "OK") {
      if (row.duration?.value) {
        const mins = Math.round(row.duration.value / 60);
        travelCache[key] = mins;
        if (row.distance?.value) distanceCache[key] = row.distance.value;
        return mins;
      }
    }
  } catch (err) {
    console.error("Google Maps error:", err.message);
  }
  travelCache[key] = 30;
  return 30;
}

// Get distance in km between two locations (uses cache if populated by getTravelTime)
async function getDistanceKm(origin, destination) {
  if (!origin || !destination) return null;
  const key = `${origin.toUpperCase()}|${destination.toUpperCase()}`;
  if (distanceCache[key] !== undefined) return distanceCache[key] / 1000;

  // Trigger a query to populate the cache
  await getTravelTime(origin, destination);
  if (distanceCache[key] !== undefined) return distanceCache[key] / 1000;
  return null;
}

// ─── Clinic partnership configuration ────────────────────────────────────────
// When a clinic-partner hold exists on a day and the client's location is
// within the specified radius of the clinic, the system raises an admin alert
// suggesting they check if the hold is still needed.
const CLINIC_PARTNERS = [
  {
    name: "Active One Frankston",
    address: "25 Yuille Street, Frankston, Victoria, Australia",
    radiusKm: 15,
    matchPatterns: [
      /active\s*one\s+frankston/i,
      /activeone\s+frankston/i
    ]
  },
  {
    name: "Community OT Brunswick East",
    address: "310 Lygon Street, Brunswick East, Victoria, Australia",
    radiusKm: 10,
    matchPatterns: [
      /community\s+ot/i,
      /comm\s*ot/i,
      /commot/i
    ]
  }
];

// Check if a summary matches any known clinic partner
function matchClinicPartner(summary) {
  if (!summary) return null;
  for (const clinic of CLINIC_PARTNERS) {
    for (const pattern of clinic.matchPatterns) {
      if (pattern.test(summary)) return clinic;
    }
  }
  return null;
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
  // Also collect admin alerts for unresolved client lookups
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
        // Couldn't resolve location — fall back to base so adjacent slots can
        // still be computed conservatively. Track a candidate admin alert that
        // we'll only surface if this date appears in the top-3 recommendations.
        prevClientName = cls.clientName;
        locStart = inst.base;
        locEnd = inst.base;
        locationSource = "lesson-unresolved-fallback-base";
        adminAlerts.push({
          date: a.appointmentDate,
          time: `${a.startTime.slice(0, 5)}-${a.endTime.slice(0, 5)}`,
          issue: "unresolved-lesson-location",
          details: `Could not determine where ${cls.clientName}'s lesson is — no address on file and notes are ambiguous. Travel estimates near this lesson may be inaccurate.`
        });
      }
    } else if (cls.kind === "clinic-hold") {
      // Clinic partnership hold (Active One Frankston / Community OT).
      // These don't need a location lookup — we know the clinic address.
      // For travel calcs, the instructor is AT the clinic during the hold.
      locStart = cls.clinic.address;
      locEnd = cls.clinic.address;
      locationSource = `clinic-hold: ${cls.clinic.name}`;
    } else if (cls.kind === "private-hold") {
      // Private client hold (e.g. "Hold for Jessica Mills", "Event - Luca Silvan").
      // Instructor has this time reserved; we don't know exactly where they'll be.
      // Fall back to base as a neutral assumption — it'll make adjacent slots
      // look conservative (slightly more travel time required), which is safe.
      locStart = inst.base;
      locEnd = inst.base;
      locationSource = "private-hold (base assumed)";
    }
    // hard-blocks keep locStart/locEnd as inst.base (instructor is effectively "off")

    byDate[a.appointmentDate].push({
      startMins: startM,
      endMins: endM,
      locationForStart: locStart,
      locationForEnd: locEnd,
      kind: cls.kind, // "lesson" | "hard-block" | "clinic-hold" | "private-hold"
      label: cls.label || a.summary || "",
      note: a.description || "",
      clientName: prevClientName,
      clinic: cls.clinic || null,  // populated for clinic-hold entries
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

    // Clinic partnership holds on this day — eligible for admin alerts if slot is nearby
    const clinicHoldsOnDay = sorted.filter(s => s.kind === "clinic-hold").map(s => ({
      startTime: s.startTime,
      endTime: s.endTime,
      label: s.label.slice(0, 60),
      clinic: s.clinic
    }));

    // Private client holds on this day — block time, no alert
    const privateHoldsOnDay = sorted.filter(s => s.kind === "private-hold").map(s => ({
      startTime: s.startTime,
      endTime: s.endTime,
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
      // If previous location couldn't be resolved, skip this gap
      if (gap.prevLoc === null || gap.prevLoc === undefined) continue;

      const rawTravelIn = await getTravelTime(gap.prevLoc, clientSuburb);
      const rawTravelOut = gap.nextLoc ? await getTravelTime(clientSuburb, gap.nextLoc) : 0;

      // Buffer rule: 10-min buffer only applies when coming FROM a previous appointment
      // (lesson or hold). No buffer when starting fresh from base (instructor hasn't
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
        bufferMinsApplied: bufferInApplied,
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
        clinicHoldsOnDay,       // for admin alerts (Active One / Community OT)
        privateHoldsOnDay,      // shown in admin review for context
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

    // ─── Check clinic-partnership holds for admin alerts ───
    // For each selected slot, see if there's a clinic hold on the same day that
    // might free up, AND the client is within the clinic's radius.
    // We collect these into a separate alerts list that Claude will include.
    const clinicHoldAlerts = [];
    for (const s of selected) {
      if (!s.clinicHoldsOnDay || s.clinicHoldsOnDay.length === 0) continue;
      for (const hold of s.clinicHoldsOnDay) {
        if (!hold.clinic) continue;
        // Check if client is within clinic's radius
        const distanceKm = await getDistanceKm(hold.clinic.address, clientSuburb);
        if (distanceKm !== null && distanceKm <= hold.clinic.radiusKm) {
          clinicHoldAlerts.push({
            instructor: s.instructor,
            date: s.date,
            slotTime: s.suggestedStart,
            holdStart: hold.startTime,
            holdEnd: hold.endTime,
            clinicName: hold.clinic.name,
            distanceKm: Math.round(distanceKm * 10) / 10
          });
        }
      }
    }

    const slotDescriptions = selected.map((s, i) => {
      const tierLabels = {
        1: "Tier 1 — Ideal (in zone, nearby on day)",
        2: "Tier 2 — Good (in natural zone)",
        3: "Tier 3 — Workable (outside zone but nearby on day)",
        4: "Tier 4 — Stretch (outside zone, no nearby lessons)"
      };
      const instData = INSTRUCTORS.find(x => x.name === s.instructor);

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

      let nextLesson;
      if (s.nextClientName) {
        nextLesson = `then lesson with ${s.nextClientName} at ${s.nextStartTime}`;
      } else if (s.nextLocation) {
        nextLesson = `then on to ${s.nextLocation} at ${s.nextStartTime}`;
      } else {
        nextLesson = "last lesson of the day";
      }

      const peakFlag = s.peakTrafficWarning ? `\n  ⚠️ ${s.peakPeriod} — travel may take longer than estimated` : "";

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
  Lessons booked that day: ${s.totalApptsThatDay}${peakFlag}`;
    }).join("\n\n");

    // Build admin alerts section (unresolved data + clinic partnership alerts)
    let adminAlertsText = "";
    if (clinicHoldAlerts.length > 0) {
      adminAlertsText += `\n\nCLINIC PARTNERSHIP ALERTS (worth checking with clinic — slot may free up):\n`;
      adminAlertsText += clinicHoldAlerts.map(a =>
        `- ${a.instructor} has a potential slot on ${formatDate(a.date)} at ${a.slotTime} near ${clientSuburb}. ${a.clinicName} has a hold at ${a.holdStart}-${a.holdEnd} (${a.distanceKm}km away). Check with ${a.clinicName} if that hold is still needed.`
      ).join("\n");
    }

    // Filter data alerts: only show alerts that affect the dates of our top-3
    // recommended slots. An unresolved lesson on an unrelated date doesn't need
    // admin attention — it doesn't affect this booking.
    const selectedInstructorDates = new Set(
      selected.map(s => `${s.instructor}|${s.date}`)
    );
    const relevantDataAlerts = allAdminAlerts.filter(a =>
      selectedInstructorDates.has(`${a.instructor}|${a.date}`)
    );

    if (relevantDataAlerts.length > 0) {
      adminAlertsText += `\n\nDATA ALERTS (unresolved lookup issues affecting recommended slots):\n` +
        relevantDataAlerts.map(a => `- ${a.instructor} ${formatDate(a.date)} ${a.time}: ${a.details}`).join("\n");
    }
    debugLog.push(`Data alerts: ${allAdminAlerts.length} total, ${relevantDataAlerts.length} relevant to selected slots`);

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

AT THE END OF YOUR RESPONSE, check the user message for these sections and add them to your response if present (copy them verbatim, don't summarize):

1. If the user message contains "CLINIC PARTNERSHIP ALERTS", add a section titled "Clinic Partnership Check" listing each alert. Precede it with: "These clinics regularly reserve and usually fill their hold slots, but occasionally one frees up. Worth a quick call before confirming:"

2. If the user message contains "DATA ALERTS", add a section titled "Data Alerts" listing each verbatim. Precede it with: "The system couldn't verify some information — admin should confirm these before booking:"

If neither section exists in the user message, do NOT add any alert sections at all.`;

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


// ─── Raw ICS dump: show every field the ICS feed exposes for one day ──────
// Usage: /debug-raw-ics?instructor=Greg&date=2026-05-08
// Returns the raw node-ical VEVENT objects so we can see exactly what's available
app.get("/debug-raw-ics", async (req, res) => {
  try {
    const instructorName = req.query.instructor;
    const date = req.query.date;
    if (!instructorName || !date) {
      return res.json({ error: "Usage: /debug-raw-ics?instructor=Greg&date=2026-05-08" });
    }
    const inst = INSTRUCTORS.find(i => i.name.toLowerCase() === instructorName.toLowerCase());
    if (!inst) return res.json({ error: `Instructor '${instructorName}' not found` });

    // Fetch raw ICS data
    const rawData = await fetchICSForInstructor(inst);
    const targetDate = new Date(date + "T00:00:00+10:00");
    const targetDateEnd = new Date(date + "T23:59:59+10:00");

    const eventsOnDay = [];
    for (const [uid, event] of Object.entries(rawData)) {
      if (event.type !== "VEVENT") continue;
      if (!event.start || !event.end) continue;
      const eventStart = new Date(event.start);
      if (eventStart < targetDate || eventStart > targetDateEnd) continue;

      // Dump EVERY property on this VEVENT object
      const allFields = {};
      for (const key of Object.keys(event)) {
        const val = event[key];
        // Stringify dates, keep primitives as-is, ignore functions
        if (val instanceof Date) {
          allFields[key] = val.toISOString();
        } else if (typeof val === "function") {
          continue;
        } else if (typeof val === "object" && val !== null) {
          try { allFields[key] = JSON.parse(JSON.stringify(val)); }
          catch { allFields[key] = String(val); }
        } else {
          allFields[key] = val;
        }
      }
      eventsOnDay.push({
        time: `${new Date(event.start).toLocaleTimeString("en-AU", { timeZone: "Australia/Melbourne", hour: "2-digit", minute: "2-digit", hour12: false })}-${new Date(event.end).toLocaleTimeString("en-AU", { timeZone: "Australia/Melbourne", hour: "2-digit", minute: "2-digit", hour12: false })}`,
        summary: event.summary,
        allRawFields: allFields
      });
    }

    res.json({
      instructor: inst.name,
      date,
      eventCount: eventsOnDay.length,
      events: eventsOnDay
    });
  } catch (err) {
    res.status(500).json({ error: err.message, stack: err.stack });
  }
});

// ─── Deep diagnostic: full trace of slot calculation for one day ───────────
// Usage: /debug-slot?instructor=Gabriel&date=2026-06-01&clientSuburb=Dandenong
// Returns complete trace: appointments, gaps, travel calcs, buffer, snap, final times
app.get("/debug-slot", async (req, res) => {
  try {
    const instructorName = req.query.instructor;
    const date = req.query.date;
    const clientSuburb = req.query.clientSuburb || req.query.suburb || "Melbourne";
    const durationMins = parseInt(req.query.duration || "60");

    if (!instructorName || !date) {
      return res.json({
        error: "Usage: /debug-slot?instructor=Gabriel&date=2026-06-01&clientSuburb=Dandenong&duration=60"
      });
    }
    const inst = INSTRUCTORS.find(i => i.name.toLowerCase() === instructorName.toLowerCase());
    if (!inst) return res.json({ error: `Instructor '${instructorName}' not found` });

    const dateObj = new Date(date + "T12:00:00+10:00");
    const nextDay = new Date(dateObj.getTime() + 24 * 3600 * 1000);
    const dateTo = toMelbDateStr(nextDay);
    const appts = await getAppointmentsForInstructor(inst, date, dateTo);
    const forThisDay = appts.filter(a => a.appointmentDate === date);

    const baseTravel = await getTravelTime(inst.base, clientSuburb);

    // Classify + resolve each appointment
    const resolved = [];
    for (const a of forThisDay) {
      const cls = classifyAppointment(a);
      if (cls.kind === "skip") continue;

      const startM = timeToMins(a.startTime.slice(0, 5));
      const endM = timeToMins(a.endTime.slice(0, 5));
      const entry = {
        apptID: a.apptID,
        time: `${a.startTime.slice(0,5)}-${a.endTime.slice(0,5)}`,
        startMins: startM,
        endMins: endM,
        summary: a.summary,
        description: (a.description || "").slice(0, 200),
        kind: cls.kind,
        label: cls.label,
        clientName: cls.clientName || null,
        locationForStart: inst.base,
        locationForEnd: inst.base,
        locationSource: "base-fallback",
        extractedHoldClient: null
      };

      if (cls.kind === "lesson") {
        const loc = await resolveAppointmentLocation({
          clientName: cls.clientName || a.summary,
          notes: a.description || a.notes
        });
        if (loc && !loc.unresolved) {
          entry.locationForStart = loc.pickup || inst.base;
          entry.locationForEnd = loc.dropoff || loc.pickup || inst.base;
          entry.locationSource = loc.source;
          entry.clientHomeSuburb = loc.clientHomeSuburb;
        } else {
          entry.locationSource = "lesson-unresolved";
          entry.clientHomeSuburb = loc?.clientHomeSuburb || null;
        }
      } else if (cls.kind === "clinic-hold") {
        entry.locationForStart = cls.clinic.address;
        entry.locationForEnd = cls.clinic.address;
        entry.locationSource = `clinic-hold: ${cls.clinic.name}`;
        entry.clinic = cls.clinic;
      } else if (cls.kind === "private-hold") {
        entry.locationForStart = inst.base;
        entry.locationForEnd = inst.base;
        entry.locationSource = "private-hold (base assumed)";
      }

      const notesLocPreview = extractNotesLocation(a.description || a.notes);
      entry.notesLocationParsed = notesLocPreview;

      resolved.push(entry);
    }

    resolved.sort((a, b) => a.startMins - b.startMins);

    const earliestStart = inst.earliestStart ? timeToMins(inst.earliestStart) : 480;
    const latestEnd = 1050;
    const BUFFER_MINS = 10;

    const gaps = [];
    if (resolved.length === 0) {
      gaps.push({
        earliestStart, latestEnd,
        prevLoc: inst.base, nextLoc: null,
        prevAppt: null, nextAppt: null,
        prevAppointmentLabel: "(empty day — from base)"
      });
    } else {
      if (resolved[0].startMins > earliestStart) {
        gaps.push({
          earliestStart, latestEnd: resolved[0].startMins,
          prevLoc: inst.base, nextLoc: resolved[0].locationForStart,
          prevAppt: null, nextAppt: resolved[0],
          prevAppointmentLabel: "(first slot — from base)"
        });
      }
      for (let i = 0; i < resolved.length - 1; i++) {
        if (resolved[i + 1].startMins > resolved[i].endMins) {
          gaps.push({
            earliestStart: resolved[i].endMins,
            latestEnd: resolved[i + 1].startMins,
            prevLoc: resolved[i].locationForEnd,
            nextLoc: resolved[i + 1].locationForStart,
            prevAppt: resolved[i],
            nextAppt: resolved[i + 1],
            prevAppointmentLabel: `${resolved[i].label} (${resolved[i].kind})`
          });
        }
      }
      const last = resolved[resolved.length - 1];
      if (last.endMins < latestEnd) {
        gaps.push({
          earliestStart: last.endMins, latestEnd,
          prevLoc: last.locationForEnd, nextLoc: null,
          prevAppt: last, nextAppt: null,
          prevAppointmentLabel: `${last.label} (${last.kind}) — last of day`
        });
      }
    }

    const gapAnalysis = [];
    for (const gap of gaps) {
      const g = {
        window: `${minsToTime(gap.earliestStart)}-${minsToTime(gap.latestEnd)}`,
        windowLengthMins: gap.latestEnd - gap.earliestStart,
        prevAppointment: gap.prevAppointmentLabel,
        prevLocation: gap.prevLoc,
        nextLocation: gap.nextLoc,
        skipped: false,
        skipReason: null
      };

      if (gap.prevLoc === null || gap.prevLoc === undefined) {
        g.skipped = true;
        g.skipReason = "prev location unresolved";
        gapAnalysis.push(g);
        continue;
      }

      const rawTravelIn = await getTravelTime(gap.prevLoc, clientSuburb);
      const rawTravelOut = gap.nextLoc ? await getTravelTime(clientSuburb, gap.nextLoc) : 0;

      const comingFromAppointment = gap.prevAppt != null;
      const bufferInApplied = comingFromAppointment ? BUFFER_MINS : 0;
      const bufferOutApplied = gap.nextLoc ? BUFFER_MINS : 0;

      const travelInWithBuffer = rawTravelIn + bufferInApplied;
      const travelOutWithBuffer = rawTravelOut + bufferOutApplied;

      const rawMinStart = gap.earliestStart + travelInWithBuffer;
      const snappedMinStart = snapTo15(rawMinStart);
      const maxEnd = gap.latestEnd - travelOutWithBuffer;
      const maxStart = maxEnd - durationMins;

      g.calculation = {
        prevLoc_to_clientSuburb: `${gap.prevLoc} → ${clientSuburb} = ${rawTravelIn} min (Google Maps)`,
        clientSuburb_to_nextLoc: gap.nextLoc ? `${clientSuburb} → ${gap.nextLoc} = ${rawTravelOut} min (Google Maps)` : "(no next appt)",
        comingFromAppointment,
        bufferInApplied: `${bufferInApplied} min (${comingFromAppointment ? "has prev appt" : "from base, no buffer"})`,
        bufferOutApplied: `${bufferOutApplied} min`,
        gapEarliestStart: `${minsToTime(gap.earliestStart)} (${gap.earliestStart} min)`,
        travelInWithBuffer: `${travelInWithBuffer} min (${rawTravelIn} travel + ${bufferInApplied} buffer)`,
        rawMinStart: `${minsToTime(rawMinStart)} (${rawMinStart} min)`,
        snappedMinStart: `${minsToTime(snappedMinStart)} (${snappedMinStart} min)`,
        maxEnd: `${minsToTime(maxEnd)} (${maxEnd} min)`,
        maxStart: `${minsToTime(maxStart)} (${maxStart} min)`,
        slotFits: snappedMinStart <= maxStart,
        slotFitsExplanation: snappedMinStart <= maxStart
          ? `✅ slot fits — earliest start ${minsToTime(snappedMinStart)}, max start ${minsToTime(maxStart)}`
          : `❌ slot too tight — earliest start ${minsToTime(snappedMinStart)} > max start ${minsToTime(maxStart)}`
      };

      gapAnalysis.push(g);
    }

    res.json({
      instructor: inst.name,
      instructorBase: inst.base,
      date,
      clientSuburb,
      durationMins,
      baseTravel_minutes: baseTravel,
      earliestStart: minsToTime(earliestStart),
      latestEnd: minsToTime(latestEnd),
      bufferRule: "10 min buffer applied only when coming from a previous appointment (not from base)",
      resolvedAppointments: resolved,
      gapAnalysis
    });
  } catch (err) {
    res.status(500).json({ error: err.message, stack: err.stack });
  }
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
        blocksTime: cls.kind === "lesson" || cls.kind === "hard-block" || cls.kind === "clinic-hold" || cls.kind === "private-hold"
      };

      // For lessons, resolve the real location
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
      } else if (cls.kind === "clinic-hold") {
        entry.clinic = cls.clinic;
        entry.resolvedLocation = {
          pickup: cls.clinic.address,
          dropoff: cls.clinic.address,
          source: `clinic-hold: ${cls.clinic.name}`,
          unresolved: false
        };
      } else if (cls.kind === "private-hold") {
        entry.resolvedLocation = {
          pickup: inst.base,
          dropoff: inst.base,
          source: "private-hold (base assumed)",
          unresolved: false
        };
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
        clinicHolds: classified.filter(c => c.classification === "clinic-hold").length,
        privateHolds: classified.filter(c => c.classification === "private-hold").length,
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

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
// Zone lists derived from 2 years of real diary data (23/4/24 — 23/4/26).
// coreZone = suburbs regularly served (2+ visits/year, or typical pattern area)
// stretchZone = suburbs served occasionally but legitimately (1-2 visits/year)
// Anything outside both requires "nearby lesson that day" to be suggested.
const INSTRUCTORS = [
  {
    name: "Christian", base: "Montmorency", locationID: 1, providerID: 32,
    mods: ["LFA", "Spinner", "Electronic Spinner", "Hand Controls", "Satellite", "Extension Pedals", "Indicator Extension"],
    allAreas: true,
    maxTravelFromBase: 65,
    maxRadiusKm: 60, // Christian has been everywhere; use generous fallback
    coreZone: [
      "Montmorency", "Thomastown", "Greensborough", "Heidelberg Heights", "Heidelberg",
      "Yallambie", "Preston", "Lalor", "Kew", "Brunswick", "Brunswick East",
      "Clifton Hill", "Fitzroy", "Rowville", "Essendon", "Highett", "Hampton",
      "Chadstone", "Boronia", "Mill Park", "Wollert", "Mount Waverley",
      "Hawthorn", "Brighton", "Beaumaris", "Greenvale", "Wheelers Hill"
    ],
    stretchZone: [
      "Frankston", "Narre Warren South", "Narre Warren", "Berwick", "Pakenham",
      "Mount Evelyn", "Wyndham Vale", "Noble Park", "Warragul", "Tarneit",
      "Lyndhurst", "Altona Meadows", "Aspendale Gardens", "Bundoora"
    ],
    preferredZone: "All Melbourne areas by arrangement (historically served everywhere east, north, SE)",
    icsUrl: "https://calsync.nookal.com/icsFile.php?HhXBkBCdHTLQaK4lrqfVa9ew%2FKnxwK8N60bfEsnM4Tix4fvM5lyQStblMTQiqaNaGeCeSgeSmXf%2F4kKI9OvU2fnXpnN%2FtMeidfD9E6WmLBWPsPF881mF4%2FDKjqX6mENEnlggTWF2jMn8Em8aKgSGXA%3D%3D"
  },
  {
    name: "Gabriel", base: "Croydon North", locationID: 1, providerID: 1,
    mods: ["LFA", "Spinner", "Electronic Spinner", "Hand Controls", "Satellite", "O-Ring", "Monarchs", "Indicator Extension"],
    earliestStart: "09:30",
    maxTravelFromBase: 55,
    maxRadiusKm: 35,
    coreZone: [
      "Croydon North", "Croydon", "Croydon South", "Croydon Hills", "Ringwood",
      "Ringwood North", "Ringwood East", "Bayswater North", "Bayswater",
      "Warrandyte", "Donvale", "Kilsyth", "Glen Waverley", "Kew", "Camberwell",
      "Wheelers Hill", "Mont Albert North", "Mont Albert", "Balwyn", "Box Hill",
      "Templestowe", "Eltham", "Surrey Hills", "Mitcham", "Vermont"
    ],
    stretchZone: [
      "Narre Warren", "Frankston", "Chelsea Heights", "Chelsea", "Bonbeach",
      "Lalor", "Heidelberg West", "Keysborough", "Ashwood", "Hawthorn",
      "Mount Waverley", "Glen Waverley", "Williamstown", "Dandenong North",
      "Brighton", "Lynbrook", "Black Rock"
    ],
    preferredZone: "East Melbourne — Croydon, Ringwood, Box Hill, Templestowe corridor. Occasionally SE to Frankston.",
    icsUrl: "https://calsync.nookal.com/icsFile.php?HhXBkBCdHTLQaK4lrqfVa9ew%2FKnxwK8N60bfEsnM4Tix4fvM5lyQStblMTQiqaNaGeCeSgeSmXf%2F4kKI9OvU2a52GEgwyPVJ%2B0I6mOab2rD4%2Bmqr7EYvQGR9ykfeKAj%2F"
  },
  {
    name: "Greg", base: "Kilsyth", locationID: 41, providerID: 77,
    mods: ["LFA", "Spinner", "Electronic Spinner", "Monarchs", "Indicator Extension"],
    maxTravelFromBase: 55,
    maxRadiusKm: 45,
    coreZone: [
      "Kilsyth", "Mooroolbark", "Croydon", "Croydon North", "Croydon South",
      "Ringwood", "Ringwood North", "Blackburn", "Blackburn South",
      "Box Hill North", "Warrandyte North", "Mill Park", "Reservoir",
      "Frankston", "Carrum Downs", "Mentone", "Brighton", "Caulfield South",
      "Malvern East", "Wheelers Hill", "Hawthorn", "Ferntree Gully", "Boronia",
      "Pascoe Vale", "Preston", "Heidelberg Heights", "Cranbourne", "Caulfield North"
    ],
    stretchZone: [
      "Brighton", "Coburg", "Coburg North", "Caroline Springs", "Belgrave Heights",
      "Cranbourne East", "Patterson Lakes", "Footscray", "Braybrook", "Elwood",
      "Ormond", "Bentleigh East", "Hughesdale", "Epping", "Mickleham", "Albanvale"
    ],
    preferredZone: "Extended East & SE — Kilsyth, Ringwood, Blackburn, Frankston corridor, Bayside (Brighton, Caulfield), inner north (Preston, Coburg).",
    icsUrl: "https://calsync.nookal.com/icsFile.php?HhXBkBCdHTLQaK4lrqfVa9ew%2FKnxwK8N60bfEsnM4Tix4fvM5lyQStblMTQiqaNaGeCeSgeSmXf%2F4kKI9OvU2fgA7lzqZCrNH6P0mJPZWpJqu4G4d87qHmXHYUUq3ZhplneSIXp12lfHZzfvGyQdDw%3D%3D"
  },
  {
    name: "Jason", base: "Wandin North", locationID: 23, providerID: 59,
    mods: ["LFA", "Spinner"],
    maxTravelFromBase: 55,
    maxRadiusKm: 35,
    coreZone: [
      "Wandin North", "Wandin", "Mooroolbark", "Lilydale", "Kilsyth",
      "Croydon", "Croydon Hills", "Warrandyte", "Ringwood", "Ringwood East",
      "Cockatoo", "Healesville", "Research", "Tecoma", "Monbulk"
    ],
    stretchZone: [
      "Canterbury", "Hawthorn", "Hawthorn East", "Camberwell", "Glen Iris",
      "Glen Waverley", "Ferntree Gully", "Donvale", "Knoxfield", "Rowville",
      "Lynbrook", "Pakenham", "Scoresby"
    ],
    preferredZone: "East Melbourne & Yarra Valley — Wandin, Lilydale, Mooroolbark, Ringwood, Knox. Occasional Camberwell/Hawthorn.",
    icsUrl: "https://calsync.nookal.com/icsFile.php?HhXBkBCdHTLQaK4lrqfVa9ew%2FKnxwK8N60bfEsnM4Tix4fvM5lyQStblMTQiqaNaGeCeSgeSmXf%2F4kKI9OvU2Sks8REnxfIzFLWWhJgXRykKsTkQKIlND6Q3P8UWc8WWFJCS5Y5gIU0xiqPfnSz%2FkQ%3D%3D"
  },
  {
    name: "Marc", base: "Werribee", locationID: 51, providerID: 90,
    mods: ["LFA", "Spinner", "Electronic Spinner", "Extension Pedals", "Indicator Extension"],
    maxTravelFromBase: 55,
    maxRadiusKm: 45,
    coreZone: [
      "Werribee", "Hoppers Crossing", "Tarneit", "Wyndham Vale", "Melton",
      "Melton West", "Melton South", "Cairnlea", "Hillside", "Sunbury",
      "Tullamarine", "Seabrook", "Laverton North", "Laverton", "Truganina",
      "Point Cook", "Delahay", "Caroline Springs", "Doreen", "Northcote",
      "Gowanbrae", "Pascoe Vale", "Broadmeadows", "Brunswick", "Brunswick West",
      "Parkville", "Avondale Heights", "Bundoora", "Kensington"
    ],
    stretchZone: [
      "Roxburgh Park", "Collingwood", "Middle Park", "Preston", "Essendon",
      "Ivanhoe", "Altona", "Sth Morang", "Lalor"
    ],
    preferredZone: "West Melbourne + inner north. Werribee/Hoppers/Tarneit/Melton core, also Sunbury, Brunswick, Parkville, Northcote, Broadmeadows corridor.",
    icsUrl: "https://calsync.nookal.com/icsFile.php?HhXBkBCdHTLQaK4lrqfVa9ew%2FKnxwK8N60bfEsnM4Tix4fvM5lyQStblMTQiqaNaGeCeSgeSmXf%2F4kKI9OvU2ecoRZN2xzdtmsUYY9vDrAuMuEJAzQSivaNXrwqSOqrMT982Jq4gficfE9XDNSVl0A%3D%3D"
  },
  {
    name: "Sherri", base: "Wandin North", locationID: 5, providerID: 38,
    mods: [],
    maxTravelFromBase: 50,
    maxRadiusKm: 35,
    coreZone: [
      "Wandin North", "Wandin", "Lilydale", "Chirnside Park", "Park Orchards",
      "Montrose", "Kilsyth", "Mooroolbark", "Croydon", "Rowville",
      "Upper Ferntree Gully", "Wantirna South", "Hurstbridge"
    ],
    stretchZone: [
      "Frankston South", "Frankston North", "Keysborough", "Prahran",
      "Clyde North", "Cranbourne West", "Narre Warren", "Narre Warren North",
      "Narre Warren South", "Berwick", "Lyndhurst"
    ],
    preferredZone: "East to Ringwood corridor (Lilydale, Chirnside Park, Montrose). Private clients occasionally Frankston South, Keysborough, Prahran, SE suburbs.",
    icsUrl: "https://calsync.nookal.com/icsFile.php?HhXBkBCdHTLQaK4lrqfVa9ew%2FKnxwK8N60bfEsnM4Tix4fvM5lyQStblMTQiqaNaGeCeSgeSmXf%2F4kKI9OvU2Qm9F8eQzb%2B6bu2IC%2FLaNBOOWmK9yskJZYl8guOGtP67bXXfuA0nBVLMaaPL2rsqew%3D%3D"
  },
  {
    name: "Yves", base: "Rye", locationID: 29, providerID: 62,
    mods: ["LFA", "Spinner", "Electronic Spinner", "Indicator Extension"],
    maxTravelFromBase: 35,
    maxRadiusKm: 35,
    hardZone: true,
    coreZone: [
      "Rye", "Rosebud", "Tootgarook", "Capel Sound", "Dromana",
      "Mornington", "Mount Eliza", "Safety Beach", "Sorrento",
      "Hastings", "Somerville", "Tyabb", "Crib Point", "Cape Schanck"
    ],
    stretchZone: [
      "Frankston"  // edge of Peninsula only
    ],
    preferredZone: "Mornington Peninsula only (hard zone). Rye, Rosebud, Mornington, Mt Eliza, Dromana, Safety Beach, Sorrento, Hastings, Somerville, Tyabb.",
    icsUrl: "https://calsync.nookal.com/icsFile.php?HhXBkBCdHTLQaK4lrqfVa9ew%2FKnxwK8N60bfEsnM4Tix4fvM5lyQStblMTQiqaNaJ6xepUO6AS0mQIBuSqW%2BOWjh2dEdLM2ryJYQBbgLemmcR6jFHgrJeGdQCO3yfSW7dInaTI63gFq7aNCi2ArGCg%3D%3D"
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

function dayCount(n) {
  if (n === 1) return "1 time";
  return `${n} times`;
}

function fullDayName(shortName) {
  const map = { Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday", Sat: "Saturday", Sun: "Sunday" };
  return map[shortName] || shortName;
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
  // Short Notes are admin reminders like "No Addie today" — they don't block time.
  // Long Notes (>= 4 hours) are effectively day-off markers (e.g. a 13-hour
  // "SMARTBOX RETURN" Note) and should hard-block the time to prevent slot
  // suggestions in those windows.
  const isOrangeCategory = categories.includes("orange category");
  const descriptionStartsWithNote = /^note\s+details\s*:/i.test(description);
  if (isOrangeCategory || summary.toLowerCase() === "note" || descriptionStartsWithNote) {
    // Compute duration — if the Note spans 4+ hours, treat as hard-block
    if (a.startTime && a.endTime) {
      const startM = timeToMins(a.startTime.slice(0, 5));
      const endM = timeToMins(a.endTime.slice(0, 5));
      const durationMins = endM - startM;
      if (durationMins >= 240) {
        // Long Note = effectively a day-off block
        // Extract the real note content from description for label
        const noteContent = description.replace(/^note\s+details\s*:\s*/i, "")
                                       .replace(/location\s*:[^\n]*$/i, "")
                                       .trim()
                                       .slice(0, 60);
        return {
          kind: "hard-block",
          reason: "long note (effectively day-off)",
          label: noteContent ? `Note: ${noteContent}` : "Long-duration admin note"
        };
      }
    }
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
      // Jason's recurring daily cutoff: "No more SDT bookings after 2:30pm" / "No more SDT clients after 2:30pm"
      // (46 recurring entries in diary; Event Category = Holidays in Nookal but keywords weren't in the regex)
      "no more sdt", "no more bookings", "no more clients",
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
      "soccer training", "sports training",
      // Non-SDT private work patterns (instructors doing test-prep for outside clients)
      "pre test lesson", "initial lesson test",
      // Late-start / back-from-holidays markers. These are Gabriel's (and others')
      // way of marking "can't start until later" when returning from leave, e.g.
      // "LATE START AFTER HOLS" or "back from hols". Without these the entry falls
      // through to private-hold and gets rendered as "location unknown" in admin
      // output, when actually the instructor is just starting their day late.
      "late start", "hols", "back from hols",
      // "X to Y" test-route pattern (e.g. "LILYDALE to HEALESVILLE")
      // harder to match via simple keywords — caught by pickup-dropoff detection below
    ];
    const hardBlockRegex = new RegExp(
      "\\b(" + hardBlockSignals.map(s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+")).join("|") + ")\\b",
      "i"
    );
    if (hardBlockRegex.test(summary)) {
      return { kind: "hard-block", reason: "unavailable", label: summary };
    }

    // Non-SDT private instructor work: Purple Event with " TEST" or "TEST" preceded by a name.
    // Patterns: "Event - Dash Clark TEST", "Event - Savannah Kipping INITIAL LESSON TEST",
    // "Event - Jane Smith PRE TEST LESSON". Since we're inside the Purple Event branch,
    // a summary ending in TEST or containing " TEST " is Non-SDT instructor work.
    if (/\btest\b/i.test(summary)) {
      return { kind: "hard-block", reason: "non-sdt work (instructor private test-prep)", label: summary };
    }

    // Also detect "X to Y" test routes (Jason's pattern like "LILYDALE to HEALESVILLE")
    if (/^event\s*[-–]\s*[A-Z][A-Z\s]+\s+to\s+[A-Z][A-Z\s]+$/i.test(summary.trim())) {
      return { kind: "hard-block", reason: "test route (non-sdt)", label: summary };
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
    let suburbPart = null;

    // Step 1: Check the text IMMEDIATELY AFTER the street-address match.
    // Lesson notes commonly read "2 Ranch Court Narre Warren" — suburb right after.
    // Without this step, a title-case suburb like "Narre Warren" was invisible to
    // the old all-caps-only fallback, leaving the address to be geocoded with
    // no suburb context (Google then picked the wrong geographic match).
    //
    // Match 1-4 TitleCase words OR an ALLCAPS suburb, explicitly refusing to
    // swallow "VIC" or a 4-digit postcode into the suburb. Also stops at line
    // ends, punctuation, or opening parens.
    const afterMatch = notes.slice(streetAddressMatch.index + streetAddressMatch[0].length);
    // Title-case attempt: word is TitleCase but not "VIC" — 1 to 4 words long.
    // Reject the capture if it ends at or includes VIC/postcode.
    const titleCaseSuburb = afterMatch.match(/^[\s,\-–]*((?:(?!VIC\b)[A-Z][A-Za-z]+)(?:\s+(?!VIC\b)[A-Z][A-Za-z]+){0,3})(?=[\s,.|\n\r;(]|$)/);
    // All-caps attempt as backup (e.g. "BERWICK")
    const allCapsSuburb = !titleCaseSuburb
      ? afterMatch.match(/^[\s,\-–]*([A-Z]{3,}(?:\s+[A-Z]{2,})*)(?=[\s,.|\n\r;(]|$)/)
      : null;
    const matchedSuburb = titleCaseSuburb || allCapsSuburb;
    if (matchedSuburb) {
      const candidate = cleanSuburb(matchedSuburb[1]);
      if (isLikelySuburb(candidate)) suburbPart = candidate;
    }

    // Step 2 (fallback): Search the WHOLE notes string for an all-caps suburb
    // elsewhere. This catches the old pattern like "WANTIRNA Ax with OT ... 251
    // Mountain Hwy" where the suburb leads the notes rather than follows the address.
    if (!suburbPart) {
      const allCaps = notes.match(/\b([A-Z]{3,}(?:\s+[A-Z]{2,})*)\b/g) || [];
      for (const caps of allCaps) {
        if (isLikelySuburb(caps)) { suburbPart = cleanSuburb(caps); break; }
      }
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

// Stricter location extractor used ONLY for private-hold notes. Designed to
// avoid the false-positive case where a person's name like "Daniel Dodig" or
// "Jaxon Harris" looks like an all-caps suburb after .toUpperCase() and gets
// fuzzy-matched by Google to a random Victorian location.
//
// Accepts only:
//   1. A full street address (number + street + recognised street type).
//   2. A suburb candidate that is ALL CAPS in the ORIGINAL text (not just
//      after upper-casing). Real Nookal admin entries use "MENTONE" or
//      "WANTIRNA" as deliberate caps-locked location markers; person names
//      are written in title case ("Jack Richardson") and won't match.
function extractPrivateHoldLocation(rawNotes) {
  if (!rawNotes) return null;
  const notes = stripIcsDescriptionPrefix(rawNotes).trim();
  if (!notes) return null;

  // Priority 1: street address with full type (no change from
  // extractNotesLocation — these are unambiguous and safe).
  const streetAddressMatch = notes.match(/(\d{1,5}\s+[A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)*\s+(?:Street|St|Road|Rd|Avenue|Ave|Drive|Dr|Court|Ct|Crescent|Cres|Place|Pl|Parade|Pde|Way|Highway|Hwy|Boulevard|Blvd|Lane|Ln|Close|Cl|Terrace|Tce))\b/i);
  if (streetAddressMatch) {
    const streetPart = streetAddressMatch[1].trim();
    // Try to grab a TitleCase or ALLCAPS suburb after the address (same as
    // the main extractor)
    const afterMatch = notes.slice(streetAddressMatch.index + streetAddressMatch[0].length);
    const titleCaseSuburb = afterMatch.match(/^[\s,\-–]*((?:(?!VIC\b)[A-Z][A-Za-z]+)(?:\s+(?!VIC\b)[A-Z][A-Za-z]+){0,3})(?=[\s,.|\n\r;(]|$)/);
    const allCapsSuburb = !titleCaseSuburb
      ? afterMatch.match(/^[\s,\-–]*([A-Z]{3,}(?:\s+[A-Z]{2,})*)(?=[\s,.|\n\r;(]|$)/)
      : null;
    const matchedSuburb = titleCaseSuburb || allCapsSuburb;
    let suburbPart = null;
    if (matchedSuburb) {
      const candidate = cleanSuburb(matchedSuburb[1]);
      if (isLikelySuburb(candidate)) suburbPart = candidate;
    }
    return {
      kind: "address",
      address: suburbPart ? `${streetPart}, ${suburbPart}` : streetPart
    };
  }

  // Priority 2: ALL-CAPS suburb in the original text. This is the key
  // distinction from the generic extractor — we require the candidate to
  // be all caps in the SOURCE, not just after .toUpperCase. So "Daniel
  // Dodig" won't match (mixed case) but "MENTONE" will.
  // Note: use [ \t]+ (not \s+) for the inter-word separator so that newlines
  // act as token boundaries — otherwise "HOLD JACK RICHARDSON\nMENTONE" gets
  // tokenised as one giant string and we miss MENTONE on its own line.
  const allCapsTokens = notes.match(/\b[A-Z]{3,}(?:[ \t]+[A-Z]{2,})*\b/g) || [];
  for (const token of allCapsTokens) {
    if (isLikelySuburb(token)) return { kind: "suburb", suburb: cleanSuburb(token) };
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

// ─── Admin audit log ─────────────────────────────────────────────────────────
// In-memory ring buffer of the last N analyses, so admin can look back at
// recent bookings during the shadow-testing phase without having to dig
// through Railway logs. Resets when the server restarts — this is intended
// as a lightweight audit view, not persistent storage.
const ADMIN_LOG_MAX_ENTRIES = 100;
const adminAuditLog = [];
function appendAuditLog(entry) {
  adminAuditLog.push(entry);
  if (adminAuditLog.length > ADMIN_LOG_MAX_ENTRIES) {
    adminAuditLog.shift();
  }
}

// Expand common street-type abbreviations so Google Maps geocoding is unambiguous.
// Examples: "251 Mountain Hwy" → "251 Mountain Highway"
// This matters because Google can fuzzy-match common abbreviations to the wrong street.
function expandStreetAbbreviations(addr) {
  if (!addr) return addr;
  const replacements = [
    [/\bHwy\b\.?/gi, "Highway"],
    [/\bSt\b\.?(?!\s+\w+\s+\b(?:North|South|East|West)\b)/gi, "Street"],  // "St" → "Street", but not "St Kilda"
    [/\bRd\b\.?/gi, "Road"],
    [/\bAve\b\.?/gi, "Avenue"],
    [/\bDr\b\.?/gi, "Drive"],
    [/\bCt\b\.?/gi, "Court"],
    [/\bCres\b\.?/gi, "Crescent"],
    [/\bPl\b\.?/gi, "Place"],
    [/\bPde\b\.?/gi, "Parade"],
    [/\bBlvd\b\.?/gi, "Boulevard"],
    [/\bLn\b\.?/gi, "Lane"],
    [/\bCl\b\.?/gi, "Close"],
    [/\bTce\b\.?/gi, "Terrace"]
  ];
  let result = addr;
  for (const [pattern, replacement] of replacements) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

async function getTravelTime(origin, destination) {
  if (!origin || !destination) return 30;
  // Normalise abbreviations BEFORE caching so we don't have duplicate cache keys
  const originClean = expandStreetAbbreviations(origin);
  const destClean = expandStreetAbbreviations(destination);
  const key = `${originClean.toUpperCase()}|${destClean.toUpperCase()}`;
  if (travelCache[key] !== undefined) return travelCache[key];

  const needsContext = (s) => !/(,\s*VIC|\b3\d{3}\b|Australia)/i.test(s);
  const originStr = needsContext(originClean) ? `${originClean}, Victoria, Australia` : originClean;
  const destStr = needsContext(destClean) ? `${destClean}, Victoria, Australia` : destClean;

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

// Get distance in km between two locations (uses cache if populated by getTravelTime).
// CRITICAL: must use the same cache key shape as getTravelTime, which applies
// expandStreetAbbreviations to both inputs before keying. Previously this function
// used the raw inputs, so origins containing "Hwy", "St", "Rd" etc. always missed
// the cache → returned null → hasNearbyAppointmentSameDay silently treated every
// such lesson as "not nearby" → tier calc went wrong for Wantirna/Highett-type notes.
async function getDistanceKm(origin, destination) {
  if (!origin || !destination) return null;
  const originClean = expandStreetAbbreviations(origin);
  const destClean = expandStreetAbbreviations(destination);
  const key = `${originClean.toUpperCase()}|${destClean.toUpperCase()}`;
  if (distanceCache[key] !== undefined) return distanceCache[key] / 1000;

  // Trigger a query to populate the cache (getTravelTime uses the same key shape)
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
    // Real diary writes this multiple ways:
    //   "Hold for Active One Frankston"              — 52 entries (original regex)
    //   "HOLD FOR 3 Ax's WITH ACTIVE ONE (FRANKSTON)" — 24 entries (Greg's pattern, parens)
    //   "ActiveOne clinic Frankston Marion McNeil"   — 4 entries (compound with "clinic")
    // Before this fix, the 28 non-matching variants fell through to private-hold,
    // so travel calcs used the instructor's BASE as the origin instead of the
    // clinic, producing wildly wrong "coming from" numbers for adjacent slots
    // (e.g. Greg "at Kilsyth" when really at Frankston — a 50-min difference).
    matchPatterns: [
      // Parenthesised Frankston — handled first to avoid greedy matches
      /active\s*one\s*\(\s*frankston\s*\)/i,
      // "ActiveOne clinic Frankston" or "Active One clinic Frankston"
      /active\s*one\s*clinic\s+frankston/i,
      // Plain patterns (still needed for the majority)
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

// ─── Zone helpers ────────────────────────────────────────────────────────────
// Extract a suburb name from a location string. Handles "14 Davey Street, Frankston VIC 3199",
// "88 Reynolds Road, Doncaster East VIC 3109", etc. Falls back to the string itself if it's
// already just a suburb.
function extractSuburbFromLocation(loc) {
  if (!loc) return null;
  const s = String(loc).trim();

  // Pattern 1: address with suburb before VIC/postcode, e.g. "14 Davey Street, Frankston VIC 3199"
  // Capture the phrase right before VIC or 4-digit postcode
  const beforeVic = s.match(/,\s*([A-Za-z][A-Za-z\s]{2,40}?)\s+(?:VIC|Victoria|,|\b3\d{3}\b)/i);
  if (beforeVic) {
    return beforeVic[1].trim().replace(/\s+/g, " ");
  }

  // Pattern 2: "SUBURB NAME, VIC 3XXX" no leading comma
  const withPostcode = s.match(/([A-Za-z][A-Za-z\s]{2,40}?)\s+(?:VIC|Victoria)\s+3\d{3}/i);
  if (withPostcode) {
    return withPostcode[1].trim().replace(/\s+/g, " ");
  }

  // Pattern 3: all caps with no context, e.g. "WANTIRNA" or "FRANKSTON Civic Centre"
  // Take the first capitalized 3+ char word if it looks like a suburb
  const firstCaps = s.match(/^([A-Z][A-Za-z\s-]+?)(?:,|\s+VIC|\s+Vic|\s+3\d{3}|$)/);
  if (firstCaps) {
    // Try to trim trailing junk like "Civic Centre"
    const candidate = firstCaps[1].trim().replace(/\s+(Civic|Centre|Station|Clinic|Hospital|College|Grammar|Street|Road|Avenue|Drive|Court)\b.*$/i, "");
    if (candidate.length >= 3) return candidate.replace(/\s+/g, " ");
  }

  // Last resort: first line
  const firstLine = s.split(/\n|\r/)[0].trim();
  if (firstLine.length <= 40) return firstLine.replace(/\s+/g, " ");
  return null;
}

// Normalise a suburb name for comparison (lower-case, trim, remove punctuation)
function normSuburb(s) {
  if (!s) return "";
  return String(s).toLowerCase().trim().replace(/[.,]/g, "").replace(/\s+/g, " ");
}

// Check if a client suburb is in an instructor's core zone, stretch zone, or neither.
// Returns: "core" | "stretch" | "outside"
function getZoneFit(instructor, clientSuburb) {
  const cs = normSuburb(clientSuburb);
  if (!cs) return "outside";

  // Try exact suburb match first
  const coreMatch = (instructor.coreZone || []).some(z => normSuburb(z) === cs);
  if (coreMatch) return "core";

  const stretchMatch = (instructor.stretchZone || []).some(z => normSuburb(z) === cs);
  if (stretchMatch) return "stretch";

  // Check if client suburb contains or is contained by a zone entry
  // (handles "Frankston South" partial-matching to "Frankston" in Yves stretch list)
  const csWords = cs.split(" ");
  const coreLoose = (instructor.coreZone || []).some(z => {
    const zn = normSuburb(z);
    return cs.includes(zn) || zn.includes(cs);
  });
  if (coreLoose) return "core";

  const stretchLoose = (instructor.stretchZone || []).some(z => {
    const zn = normSuburb(z);
    return cs.includes(zn) || zn.includes(cs);
  });
  if (stretchLoose) return "stretch";

  return "outside";
}

// Check if any of the instructor's REAL appointments that day are within 15km
// of the client's location. Used to detect "already in the area" scenarios.
// Only counts lesson (Blue Category client appointments) and clinic-holds —
// private-holds have unreliable locations so we don't use them for this check.
async function hasNearbyAppointmentSameDay(appointmentsForDay, clientAddress) {
  const NEARBY_THRESHOLD_KM = 15;
  for (const a of appointmentsForDay) {
    if (a.kind !== "lesson" && a.kind !== "clinic-hold") continue;
    if (!a.locationForStart) continue;
    const dist = await getDistanceKm(a.locationForStart, clientAddress);
    if (dist !== null && dist <= NEARBY_THRESHOLD_KM) {
      return {
        found: true,
        distanceKm: Math.round(dist * 10) / 10,
        nearbyClient: a.clientName || a.label,
        nearbyKind: a.kind, // "lesson" or "clinic-hold" — used to pick correct wording downstream
        nearbyLocation: a.locationForStart,
        nearbyTime: a.startTime
      };
    }
  }
  return { found: false };
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

// Does a time range [startTime, endTime] (HH:MM strings) overlap any of the
// given block names (e.g. ["mid-morning", "late-afternoon"])? Used to filter
// clinic-hold alerts so we only surface holds that actually conflict with the
// client's requested time windows — not noon holds when the client asked for
// late afternoon only.
function timeRangeOverlapsBlocks(startTime, endTime, blockNames) {
  if (!blockNames || blockNames.length === 0) return true; // no preference = any time ok
  const startM = timeToMins(startTime.slice(0, 5));
  const endM = timeToMins(endTime.slice(0, 5));
  for (const blockName of blockNames) {
    const range = TIME_BLOCKS[blockName];
    if (!range) continue;
    const [bStart, bEnd] = range;
    // overlap test: ranges [a,b] and [c,d] overlap iff a < d AND c < b
    if (startM < bEnd && bStart < endM) return true;
  }
  return false;
}

// Strip the noisy "Event - " prefix that Nookal prepends to every non-lesson
// calendar entry ("Event - HOLD for Kaine McNeil" → "HOLD for Kaine McNeil").
// Also tidy leading/trailing whitespace.
function stripEventPrefix(label) {
  if (!label) return label;
  return label.replace(/^\s*Event\s*[-–]\s*/i, "").trim();
}

// Truncate a string on a word boundary, avoiding mid-word cutoffs like
// "Eastern Health Wantirna 25" (which should be "Eastern Health Wantirna...").
// If the cut point falls inside a word, back up to the last space; if the
// resulting string is <80% of the limit (we'd lose too much), cut at the
// original limit instead. Adds ellipsis only when truncation actually happened.
function smartTruncate(str, limit) {
  if (!str || str.length <= limit) return str;
  const slice = str.slice(0, limit);
  const lastSpace = slice.lastIndexOf(" ");
  const cutPoint = lastSpace > limit * 0.8 ? lastSpace : limit;
  return str.slice(0, cutPoint).replace(/[,\s]+$/, "") + "…";
}

// ─── Core matcher ────────────────────────────────────────────────────────────
async function findAvailableSlots(inst, clientSuburb, durationMins, availPref, weeksToScan = 17) {
  const slots = [];
  const allClinicHolds = []; // [{date, dayName, startTime, endTime, label, clinic}]
  const now = new Date();
  const startDate = toMelbDateStr(now);
  const endDate = toMelbDateStr(new Date(now.getTime() + weeksToScan * 7 * 24 * 3600 * 1000));

  // Extract client's suburb from the address for zone checks
  const clientSuburbName = extractSuburbFromLocation(clientSuburb) || clientSuburb;
  const zoneFit = getZoneFit(inst, clientSuburbName);

  // Yves: hard zone — if client is outside Peninsula, skip entirely
  if (inst.hardZone && zoneFit === "outside") {
    return { slots: [], adminAlerts: [], allClinicHolds: [], dropReason: `${clientSuburbName} is outside ${inst.name}'s hard zone (${inst.base} only)` };
  }

  const baseTravel = await getTravelTime(inst.base, clientSuburb);
  // Also check distance from base for non-zone-list matches
  const baseDistanceKm = await getDistanceKm(inst.base, clientSuburb);

  // Hard-zone fallback via distance if zone list doesn't have the suburb
  if (inst.hardZone && baseDistanceKm !== null && baseDistanceKm > inst.maxRadiusKm) {
    return { slots: [], adminAlerts: [], allClinicHolds: [], dropReason: `client ${Math.round(baseDistanceKm)}km from ${inst.name}'s base — outside ${inst.maxRadiusKm}km hard zone` };
  }

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
      // Try to extract a location from the hold's notes. We need to be CAREFUL
      // here: the hold's summary often contains a person's name like "Jaxon Harris"
      // or "Daniel Dodig" which would falsely pass a generic suburb check
      // (toUpperCase makes them look like all-caps suburbs). Google then fuzzy-
      // matches the person name to some random Victorian street, producing
      // wildly inaccurate travel times (36 km when actual is 5).
      //
      // To avoid that, only accept location candidates that are:
      //   (a) a full street address with a recognised street type, OR
      //   (b) explicitly written in ALL CAPS in the original text (a pattern
      //       admin commonly uses to signal locations: "MENTONE", "WANTIRNA"),
      //       AND not in a blocklist of common name-shaped false positives.
      //
      // If neither passes, fall back to instructor's base. The old behaviour was
      // ALWAYS to fall back to base — slightly less accurate for genuine
      // location-tagged holds (like Greg's MENTONE one) but never wildly wrong.
      const holdLoc = extractPrivateHoldLocation(a.description || a.notes || "");
      if (holdLoc && holdLoc.kind === "address") {
        locStart = holdLoc.address;
        locEnd = holdLoc.address;
        locationSource = `private-hold (address from notes)`;
      } else if (holdLoc && holdLoc.kind === "suburb") {
        locStart = holdLoc.suburb;
        locEnd = holdLoc.suburb;
        locationSource = `private-hold (suburb '${holdLoc.suburb}' from notes)`;
      } else {
        // No parseable location — safe fallback is to assume the instructor is
        // at base. Conservative (slightly inflated travel) but never wrong.
        locStart = inst.base;
        locEnd = inst.base;
        locationSource = "private-hold (base assumed, no location in notes)";
      }
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

    // Gap calculation: walk through sorted blocks with a cursor that tracks the
    // farthest point any block ends. This correctly handles OVERLAPPING blocks —
    // e.g. a full-day Van Day hard-block from 08:30-18:00 with a smaller private
    // hold at 09:00-10:00 nested inside it. The earlier pairwise logic saw the
    // private hold ending at 10:00 and opened a false gap 10:00-18:00 because
    // it didn't know Van Day was still going.
    const sortedForGaps = sorted;

    // Walk the sorted list, tracking cursor = max end time seen so far.
    const gaps = [];
    let cursor = earliestStart;
    let lastBlockBeforeCursor = null; // the entry whose endMins pushed cursor here

    // Gap before the first block
    if (sortedForGaps.length === 0) {
      gaps.push({
        earliestStart, latestEnd: 1050,
        prevLoc: inst.base, nextLoc: null,
        prevAppt: null, nextAppt: null
      });
    } else {
      const first = sortedForGaps[0];
      if (first.startMins > earliestStart) {
        gaps.push({
          earliestStart,
          latestEnd: first.startMins,
          prevLoc: inst.base,
          nextLoc: first.locationForStart,
          prevAppt: null,
          nextAppt: first
        });
      }
      cursor = Math.max(earliestStart, first.endMins);
      lastBlockBeforeCursor = first;

      // Walk the rest, merging overlaps and opening gaps where they exist
      for (let i = 1; i < sortedForGaps.length; i++) {
        const entry = sortedForGaps[i];
        if (entry.startMins > cursor) {
          // Found a gap: from cursor → entry.startMins
          gaps.push({
            earliestStart: cursor,
            latestEnd: entry.startMins,
            prevLoc: lastBlockBeforeCursor.locationForEnd,
            nextLoc: entry.locationForStart,
            prevAppt: lastBlockBeforeCursor,
            nextAppt: entry
          });
        }
        // Advance the cursor to the furthest end so far; track which block holds it
        if (entry.endMins > cursor) {
          cursor = entry.endMins;
          lastBlockBeforeCursor = entry;
        }
      }

      // Gap after the last block
      if (cursor < 1050) {
        gaps.push({
          earliestStart: cursor,
          latestEnd: 1050,
          prevLoc: lastBlockBeforeCursor.locationForEnd,
          nextLoc: null,
          prevAppt: lastBlockBeforeCursor,
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

    // Also collect into the day-independent list so we can alert even when
    // this instructor doesn't make the top 3 (the holds themselves might be
    // what's blocking them from being a good match).
    for (const ch of clinicHoldsOnDay) {
      // Only include if the day matches the client's availability preference
      // (no point alerting about a Friday hold when client only asks Wednesdays)
      const prefForThisDay = availPref[dayName];
      const clientInterestedInThisDay = !prefForThisDay && Object.keys(availPref).length === 0
        ? true
        : !!prefForThisDay;
      if (!clientInterestedInThisDay) continue;

      // AND the hold's time window must actually overlap the client's requested
      // time blocks. Otherwise the alert is misleading — e.g. client asks Monday
      // Late Afternoon, clinic hold is at noon → even if the hold frees up, it
      // still wouldn't fit the client's window, so admin shouldn't be prompted
      // to call the clinic about it.
      const timeFits = timeRangeOverlapsBlocks(ch.startTime, ch.endTime, prefForThisDay);
      if (!timeFits) continue;

      allClinicHolds.push({
        date: dateStr,
        dayName,
        startTime: ch.startTime,
        endTime: ch.endTime,
        label: ch.label,
        clinic: ch.clinic
      });
    }

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
      // Companion distance lookups — already cached from the travel-time calls
      // above via getDistanceKm (which pulls from distanceCache). Admin gets
      // "38 min / 42 km" format so they can smell-check the Google Maps call.
      const rawDistanceInKm = await getDistanceKm(gap.prevLoc, clientSuburb);
      const rawDistanceOutKm = gap.nextLoc ? await getDistanceKm(clientSuburb, gap.nextLoc) : null;

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

      // ─── Smart zone-aware tier calculation ───
      // Check if instructor is already "in the area" via any real lesson/clinic-hold within 15km
      const nearbyInfo = await hasNearbyAppointmentSameDay(sorted, clientSuburb);

      // Tier logic:
      //   Client in CORE zone + travelIn ≤ 25 min → Tier 1 (ideal)
      //   Client in CORE zone + travelIn > 25 min → Tier 2 (good but longer travel)
      //   Client in STRETCH zone + has nearby lesson same day → Tier 2 (already in area)
      //   Client in STRETCH zone + no nearby → Tier 3 (occasional reach)
      //   Client OUTSIDE zones + has nearby lesson → Tier 3 (area visit)
      //   Client OUTSIDE zones + no nearby lesson → Tier 4 ⚠️ stretch (heavily de-ranked)
      let tier;
      let tierReason = "";
      if (zoneFit === "core") {
        if (rawTravelIn <= 25) { tier = 1; tierReason = "in core zone, short travel"; }
        else { tier = 2; tierReason = "in core zone, longer travel"; }
      } else if (zoneFit === "stretch") {
        if (nearbyInfo.found) { tier = 2; tierReason = `in stretch zone, nearby lesson same day (${nearbyInfo.nearbyClient} ${nearbyInfo.nearbyTime})`; }
        else { tier = 3; tierReason = "in stretch zone, no nearby lessons"; }
      } else {
        // outside all zones
        if (nearbyInfo.found) { tier = 3; tierReason = `already in area (${nearbyInfo.nearbyClient} ${nearbyInfo.nearbyTime}, ${nearbyInfo.distanceKm}km away)`; }
        else { tier = 4; tierReason = "outside usual zones, empty day — stretch"; }
      }

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
        travelInKm: rawDistanceInKm !== null ? Math.round(rawDistanceInKm * 10) / 10 : null,
        travelOutKm: rawDistanceOutKm !== null ? Math.round(rawDistanceOutKm * 10) / 10 : null,
        bufferMinsApplied: bufferInApplied,
        baseTravel,
        baseDistanceKm,
        zoneFit,
        tierReason,
        nearbyOnDay: nearbyInfo.found,
        nearbyClient: nearbyInfo.nearbyClient || null,
        nearbyKind: nearbyInfo.nearbyKind || null,
        nearbyTime: nearbyInfo.nearbyTime || null,
        prevLocation: gap.prevLoc,
        nextLocation: gap.nextLoc,
        prevClientName: gap.prevAppt?.clientName || null,
        prevEndTime: gap.prevAppt?.endTime || null,
        prevAppointmentKind: gap.prevAppt?.kind || null,
        prevAppointmentNote: gap.prevAppt?.note
          ? smartTruncate(stripIcsDescriptionPrefix(gap.prevAppt.note).split("\n")[0], 60) || null
          : null,
        prevAppointmentLabel: gap.prevAppt?.label ? smartTruncate(gap.prevAppt.label, 80) : null,
        prevLocationSource: gap.prevAppt?.locationSource || null,
        nextClientName: gap.nextAppt?.clientName || null,
        nextStartTime: gap.nextAppt?.startTime || null,
        nextAppointmentLabel: gap.nextAppt?.label ? smartTruncate(gap.nextAppt.label, 80) : null,
        nextAppointmentKind: gap.nextAppt?.kind || null,
        nextLocationSource: gap.nextAppt?.locationSource || null,
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

  return { slots, adminAlerts, allClinicHolds };
}

// ─── Scoring ─────────────────────────────────────────────────────────────────
// Philosophy: "smart like a senior admin" — the earliest SENSIBLE slot wins.
// Not a points-optimised ranking that picks cross-town Tier 2 slots over nearby
// Tier 1 slots a month out. Scoring logic:
//   1. Tier 1/2/3 go into the main list. Tier 4 goes into a separate "Also
//      worth considering" section at the very end, shown only if there aren't
//      enough Tier 1-3 slots. (This split happens in the slot-selection loop,
//      not here — this function still returns a score, but the main vs fallback
//      split dominates the ordering.)
//   2. Within the main list, sort primarily by DATE — earliest wins.
//   3. Within the same date, earliest TIME of day wins.
//   4. Travel time and tier are tiebreakers only when dates and times are close.
// This matches what admin actually wants: "when's the earliest time this
// client can get in with someone who can genuinely do the lesson?"
function scoreSlot(slot) {
  let score = 0;

  // Date is the dominant factor. 10 points per day later. A 2-week-later slot
  // is -140, enough to beat almost any quality difference within the main-list
  // tiers. Tier 4 is handled by the bucket separation, not by the score.
  const daysOut = (new Date(slot.date) - new Date()) / (1000 * 60 * 60 * 24);
  score -= daysOut * 10;

  // Time of day is secondary. Earlier in the day wins within the same date.
  // 08:00 → 480 min, 17:00 → 1020 min. 0.3 per min keeps this subtle (max ~160
  // point spread across a full day) so it only moves things when the primary
  // date signal is tied.
  const startMins = timeToMins(slot.suggestedStart);
  score -= startMins * 0.3;

  // Tier still matters, but only as a tiebreaker within the same-date bucket.
  // These values are small enough that they can't flip a 3-day-earlier Tier 3
  // over a later Tier 1, but they can reorder slots booked on the same day.
  if (slot.tier === 1) score += 30;
  else if (slot.tier === 2) score += 20;
  else if (slot.tier === 3) score += 10;
  // Tier 4 gets 0 here — it's already excluded from the main list by bucketing.

  // Light travel penalty as final tiebreaker. 0.5 per min — a 20-min travel
  // difference is only 10 points, so it won't overturn date or time ordering.
  score -= slot.travelIn * 0.5;

  // Very mild bonus for "instructor already in area" on outside-zone clients.
  // Still useful as a tiebreaker but can't tip the list further out.
  if (slot.nearbyOnDay && slot.zoneFit !== "core") score += 5;

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

    // Track reasons instructors are dropped so admin can see "Not offered" explanation.
    // excludedInstructors collects { name, reason } for display at bottom of output.
    const excludedInstructors = [];

    const eligibleInstructors = INSTRUCTORS.filter(inst => {
      const missingMods = normalisedMods.filter(needed =>
        !inst.mods.some(m => m.toLowerCase() === needed.toLowerCase())
      );
      if (missingMods.length > 0) {
        excludedInstructors.push({
          name: inst.name,
          reason: `missing mod${missingMods.length > 1 ? "s" : ""}: ${missingMods.join(", ")}`
        });
        return false;
      }
      return true;
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
    const allInstructorClinicHolds = []; // [{instructor, date, dayName, startTime, endTime, label, clinic}]
    const fetchErrors = [];
    for (const inst of eligibleInstructors) {
      try {
        const result = await findAvailableSlots(inst, clientSuburb, durationMins, availPref);
        allSlots.push(...result.slots);
        if (result.adminAlerts?.length) {
          for (const alert of result.adminAlerts) {
            allAdminAlerts.push({ instructor: inst.name, ...alert });
          }
        }
        if (result.allClinicHolds?.length) {
          for (const ch of result.allClinicHolds) {
            allInstructorClinicHolds.push({ instructor: inst.name, ...ch });
          }
        }
        // Track why an eligible instructor didn't contribute any slots, so the
        // "Not offered" footer can explain it to admin.
        if (result.slots.length === 0) {
          if (result.dropReason) {
            excludedInstructors.push({ name: inst.name, reason: result.dropReason });
          } else {
            excludedInstructors.push({ name: inst.name, reason: "no gaps fit client's availability + duration" });
          }
        }
        debugLog.push(`${inst.name}: ${result.slots.length} valid slots, ${result.adminAlerts?.length || 0} alerts, ${result.allClinicHolds?.length || 0} clinic holds in avail window`);
      } catch (err) {
        debugLog.push(`ERROR fetching ${inst.name}: ${err.message}`);
        fetchErrors.push({ instructor: inst.name, error: err.message });
        excludedInstructors.push({ name: inst.name, reason: `diary fetch error (retry later)` });
      }
    }

    if (allSlots.length === 0) {
      const eligibleNames = eligibleInstructors.map(i => i.name).join(", ");
      const errorInfo = fetchErrors.length > 0
        ? `\n\n⚠️ Some instructor diaries could not be fetched: ${fetchErrors.map(e => `${e.instructor} (${e.error})`).join(", ")}`
        : "";

      // Detect whether the client address itself is the problem. If Google
      // Maps can't geocode it, every travel lookup falls back to a 30-min
      // stub with no distance cached. But Google also sometimes "helpfully"
      // fuzzy-matches a garbage address to some distant Victorian location
      // (e.g. "Nonexistent Street, Whatever VIC 9999" might match to somewhere
      // 400 km away). Flag BOTH cases: null distance (clean failure) OR
      // implausibly large distance (>150 km from Christian's base is far
      // further than any real Melbourne suburb — Rye is ~90 km, Melton is ~40).
      let addressLikelyInvalid = false;
      try {
        const probeBase = INSTRUCTORS.find(i => i.name === "Christian")?.base || "Melbourne";
        const probeDistance = await getDistanceKm(probeBase, clientSuburb);
        if (probeDistance === null || probeDistance > 150) {
          addressLikelyInvalid = true;
        }
      } catch (e) {
        addressLikelyInvalid = true;
      }

      const addressWarningText = addressLikelyInvalid
        ? `\n\n⚠️ Could not find "${clientSuburb}" on the map. Please double-check the address — the suburb or street name may be misspelled, or the postcode may be wrong. No further instructor lookup is possible until the address is corrected.`
        : "";

      return res.json({
        content: [{
          type: "text",
          text: `No available slots found for ${booking.clientName || "this client"} in ${clientSuburb}.${addressWarningText}

Eligible instructors (with required modifications): ${eligibleNames}

All eligible instructors are either fully booked during the client's preferred time windows or the client's suburb is outside their usual operating area.

Suggested actions for admin:
1. ${addressLikelyInvalid ? "Fix the address spelling / postcode and retry" : "Ask the client about additional availability (different days or time blocks)"}
2. Check if the closest instructor has upcoming days near ${clientSuburb}
3. Contact an instructor directly about a special arrangement${errorInfo}`
        }],
        _debug: debugLog
      });
    }

    // Split slots into two buckets before scoring/selection:
    //   Main: Tier 1, 2, 3 — these are the proper recommendations.
    //   Fallback: Tier 4 — long drives / stretch — shown only in a separate
    //             "Also worth considering" section and only when the main list
    //             is thin.
    // Admin expects Tier 4 to never jump ahead of a Tier 3, no matter how much
    // earlier the date or how clever the travel math. This bucket separation
    // guarantees that — neither the scorer nor the diversity penalty can mix
    // them.
    const mainSlots = allSlots.filter(s => s.tier <= 3);
    const fallbackSlots = allSlots.filter(s => s.tier === 4);

    mainSlots.sort((a, b) => scoreSlot(b) - scoreSlot(a));
    fallbackSlots.sort((a, b) => scoreSlot(b) - scoreSlot(a));

    const selected = [];          // main Tier 1-3 picks shown to admin
    const fallbackSelected = [];  // Tier 4 picks shown as "also worth considering"
    const usedInstructors = {};
    const usedInstructorDates = new Set();
    const TARGET_SLOTS = 5;         // aim for 5 main-list slots
    const MAX_FALLBACK = 3;         // up to 3 Tier 4 fallbacks when main list thin

    // Fill main list with Tier 1-3 slots. Diversity penalty is now mild (-10 for
    // same instructor, -5 for same day-of-week) — with date-first scoring it's
    // mainly for tiebreaks, not a primary driver. Too much diversity pressure
    // otherwise pushes later-but-different slots over genuinely-earliest ones.
    while (selected.length < TARGET_SLOTS && mainSlots.length > 0) {
      let bestIdx = -1;
      let bestAdjustedScore = -Infinity;
      for (let i = 0; i < mainSlots.length; i++) {
        const s = mainSlots[i];
        const instCount = usedInstructors[s.instructor] || 0;
        if (instCount >= 3) continue;
        if (usedInstructorDates.has(`${s.instructor}|${s.date}`)) continue;
        let adjusted = scoreSlot(s);
        for (const alreadyPicked of selected) {
          if (alreadyPicked.instructor === s.instructor) adjusted -= 10;
          if (alreadyPicked.dayName === s.dayName) adjusted -= 5;
        }
        if (adjusted > bestAdjustedScore) {
          bestAdjustedScore = adjusted;
          bestIdx = i;
        }
      }
      if (bestIdx === -1) break;
      const picked = mainSlots.splice(bestIdx, 1)[0];
      selected.push(picked);
      usedInstructors[picked.instructor] = (usedInstructors[picked.instructor] || 0) + 1;
      usedInstructorDates.add(`${picked.instructor}|${picked.date}`);
    }

    // Only dip into Tier 4 fallbacks if the main list is short. If we already
    // have 5 decent Tier 1-3 options, admin doesn't need to see Tier 4 — that
    // would just muddy the picture.
    const mainListIsShort = selected.length < TARGET_SLOTS;
    if (mainListIsShort && fallbackSlots.length > 0) {
      const fallbackUsedInstructors = {};
      const fallbackUsedInstructorDates = new Set();
      while (fallbackSelected.length < MAX_FALLBACK && fallbackSlots.length > 0) {
        let bestIdx = -1;
        let bestAdjustedScore = -Infinity;
        for (let i = 0; i < fallbackSlots.length; i++) {
          const s = fallbackSlots[i];
          const instCount = fallbackUsedInstructors[s.instructor] || 0;
          if (instCount >= 2) continue;
          if (fallbackUsedInstructorDates.has(`${s.instructor}|${s.date}`)) continue;
          let adjusted = scoreSlot(s);
          for (const alreadyPicked of fallbackSelected) {
            if (alreadyPicked.instructor === s.instructor) adjusted -= 10;
            if (alreadyPicked.dayName === s.dayName) adjusted -= 5;
          }
          if (adjusted > bestAdjustedScore) {
            bestAdjustedScore = adjusted;
            bestIdx = i;
          }
        }
        if (bestIdx === -1) break;
        const picked = fallbackSlots.splice(bestIdx, 1)[0];
        fallbackSelected.push(picked);
        fallbackUsedInstructors[picked.instructor] = (fallbackUsedInstructors[picked.instructor] || 0) + 1;
        fallbackUsedInstructorDates.add(`${picked.instructor}|${picked.date}`);
      }
    }

    // Log the final ordering so we can check pick quality from Railway logs later.
    const mainOrder = selected.map(s => `${s.instructor} ${s.date} ${s.suggestedStart} T${s.tier}`);
    const fbOrder = fallbackSelected.map(s => `${s.instructor} ${s.date} ${s.suggestedStart} T4`);
    console.log(`[pickOrder] ${booking.clientName || '(no name)'} in ${clientSuburb}: main=[${mainOrder.join(' | ')}]${fbOrder.length ? ` fallback=[${fbOrder.join(' | ')}]` : ''}`);

    debugLog.push(`Selected top ${selected.length} slots for Claude (presenting first ${Math.min(TARGET_SLOTS, selected.length)})`);

    // ─── Check clinic-partnership holds for admin alerts ───
    // Two cases:
    //   1. A recommended slot is near a clinic hold (the slot still went through,
    //      but admin might consider swapping to the hold time if the clinic doesn't need it)
    //   2. An eligible instructor had clinic holds that blocked them from being
    //      recommended AT ALL — admin should know the booking could work great
    //      for this client if the clinic releases its hold.
    const clinicHoldAlerts = [];
    const seenAlertKeys = new Set();

    // Case 1: selected slot has clinic holds on same day (within radius)
    for (const s of selected) {
      if (!s.clinicHoldsOnDay || s.clinicHoldsOnDay.length === 0) continue;
      for (const hold of s.clinicHoldsOnDay) {
        if (!hold.clinic) continue;
        const distanceKm = await getDistanceKm(hold.clinic.address, clientSuburb);
        if (distanceKm !== null && distanceKm <= hold.clinic.radiusKm) {
          const key = `${s.instructor}|${s.date}|${hold.startTime}`;
          if (seenAlertKeys.has(key)) continue;
          seenAlertKeys.add(key);
          clinicHoldAlerts.push({
            type: "adjacent-to-selected",
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

    // Case 2: instructors with clinic holds in client-availability windows who
    // weren't selected. If the client is within the clinic's radius, this is
    // exactly the kind of scenario admin wants to know about — the clinic hold
    // is blocking what could be a great match.
    const selectedInstructorNames = new Set(selected.map(s => s.instructor));
    for (const ch of allInstructorClinicHolds) {
      // Skip if this instructor already contributed selected slots AND was already alerted
      // (we've already handled their adjacent-to-selected case above)
      const distanceKm = await getDistanceKm(ch.clinic.address, clientSuburb);
      if (distanceKm === null || distanceKm > ch.clinic.radiusKm) continue;

      const key = `${ch.instructor}|${ch.date}|${ch.startTime}`;
      if (seenAlertKeys.has(key)) continue;
      seenAlertKeys.add(key);

      // Only flag as "blocked" if this instructor has no selected slot on that date
      const hasSelectedSlotThisDate = selected.some(s =>
        s.instructor === ch.instructor && s.date === ch.date
      );

      clinicHoldAlerts.push({
        type: hasSelectedSlotThisDate ? "adjacent-to-selected" : "blocking-unselected",
        instructor: ch.instructor,
        date: ch.date,
        dayName: ch.dayName,
        slotTime: null,
        holdStart: ch.startTime,
        holdEnd: ch.endTime,
        clinicName: ch.clinic.name,
        distanceKm: Math.round(distanceKm * 10) / 10
      });
    }

    // ─── Slot descriptions (compact, labeled format for admin) ───
    // Each slot is 5-6 short lines: ID header, From, After, any Note lines.
    // Shown to Claude as-is; Claude's job is to RENDER the 5, not rewrite them.
    // Only the top TARGET_SLOTS (5) are rendered to admin; the remaining pool
    // contributes to clinic/data alerts but isn't presented.
    const PRESENT_COUNT = 5;
    const toPresent = selected.slice(0, PRESENT_COUNT);

    // Gather which private-hold references will appear in the rendered slots —
    // so we can add a single footer line about unknown hold locations instead
    // of repeating "exact location not confirmed" per slot.
    let hasAnyPrivateHoldMention = false;

    // Track which boilerplate notes have already been shown, so we don't repeat
    // "Instructor covers this area occasionally — dedicated trip" on every
    // Tier 3 Stretch slot. Admin reads it once and internalises it. The
    // tier tag in the slot header already conveys the category; the Note text
    // is the explanation, and the explanation only needs stating once.
    const shownTier3Stretch = { shown: false };
    const shownTier4Stretch = { shown: false };

    // Helper: render a single slot into the compact labeled format.
    // Reused for both the main list (Tier 1-3) and the "also worth considering"
    // fallback list (Tier 4). The `slotNumber` is a 1-based display index —
    // main list numbers its own slots 1..N; fallback starts its own numbering.
    const renderSlot = (s, slotNumber) => {
      let tierTag;
      if (s.tier === 1) tierTag = "Tier 1 — Ideal";
      else if (s.tier === 2) tierTag = "Tier 2 — Good";
      else if (s.tier === 3 && s.nearbyOnDay) tierTag = "Tier 3 — Area visit";
      else if (s.tier === 3) tierTag = "Tier 3 — Stretch ⚠️";
      else tierTag = "Tier 4 — Stretch ⚠️";

      // "From:" line describes where the instructor is just before this slot.
      const inKm = s.travelInKm !== null ? ` / ${s.travelInKm} km` : "";
      let fromLine;
      if (s.prevAppointmentKind === "lesson" && s.prevClientName) {
        const ctx = s.prevAppointmentNote && s.prevAppointmentNote !== s.prevClientName
          ? ` (${s.prevAppointmentNote})` : "";
        fromLine = `From: ${s.prevClientName} lesson${ctx} finishes ${s.prevEndTime} → client (${s.travelIn} min${inKm})`;
      } else if (s.prevAppointmentKind === "clinic-hold") {
        fromLine = `From: ${stripEventPrefix(s.prevAppointmentLabel)} ends ${s.prevEndTime} → client (${s.travelIn} min${inKm})`;
      } else if (s.prevAppointmentKind === "private-hold") {
        hasAnyPrivateHoldMention = true;
        // If the server extracted a suburb from the hold's notes, travel is a real
        // calculation (not a base fallback). Otherwise it's truly unknown.
        const hasResolvedLoc = s.prevLocationSource && s.prevLocationSource.startsWith("private-hold (suburb") || (s.prevLocationSource && s.prevLocationSource.startsWith("private-hold (address"));
        if (hasResolvedLoc) {
          fromLine = `From: ${stripEventPrefix(s.prevAppointmentLabel)} ends ${s.prevEndTime} → client (${s.travelIn} min${inKm})`;
        } else {
          fromLine = `From: ${stripEventPrefix(s.prevAppointmentLabel)} ends ${s.prevEndTime} (location unknown) → client (${s.travelIn} min${inKm} est. from base)`;
        }
      } else if (s.priorHardBlock) {
        fromLine = `From: ${s.base} base (first slot after "${stripEventPrefix(s.priorHardBlock)}") → client (${s.travelIn} min${inKm})`;
      } else {
        fromLine = `From: ${s.base} base → client (${s.travelIn} min${inKm})`;
      }

      // "After:" line — what the instructor does next.
      const outKm = s.travelOutKm !== null ? ` / ${s.travelOutKm} km` : "";
      let afterLine;
      if (s.nextAppointmentKind === "lesson" && s.nextClientName) {
        afterLine = `After: client → ${s.nextClientName} lesson at ${s.nextStartTime} (${s.travelOut} min${outKm})`;
      } else if (s.nextAppointmentKind === "clinic-hold") {
        // Only mention the travel burden if the clinic is non-trivially far from
        // the client. Keeps short hops like Frankston→Frankston clean, but flags
        // cross-town jumps like Carnegie→Frankston (55 min) so admin knows the
        // instructor has a real drive after this lesson.
        const travelBurden = s.travelOut >= 15
          ? ` (~${s.travelOut} min${outKm} to get there)`
          : "";
        afterLine = `After: ${stripEventPrefix(s.nextAppointmentLabel)} at ${s.nextStartTime} — at the clinic${travelBurden}`;
      } else if (s.nextAppointmentKind === "private-hold") {
        hasAnyPrivateHoldMention = true;
        const hasResolvedLoc = s.nextLocationSource && (s.nextLocationSource.startsWith("private-hold (suburb") || s.nextLocationSource.startsWith("private-hold (address"));
        if (hasResolvedLoc) {
          const travelBurden = s.travelOut >= 15
            ? ` (~${s.travelOut} min${outKm} to get there)`
            : "";
          afterLine = `After: ${stripEventPrefix(s.nextAppointmentLabel)} at ${s.nextStartTime}${travelBurden}`;
        } else {
          afterLine = `After: ${stripEventPrefix(s.nextAppointmentLabel)} at ${s.nextStartTime} (location unknown)`;
        }
      } else if (s.nextAppointmentKind === "hard-block") {
        afterLine = `After: ${stripEventPrefix(s.nextAppointmentLabel)} at ${s.nextStartTime} — instructor off-duty (personal commitment)`;
      } else {
        afterLine = `After: Free rest of day`;
      }

      // Optional "Note:" line — only when there's something admin genuinely
      // benefits from seeing. Don't include boilerplate like "Tier 1 core zone"
      // — that's already implicit in the tag. Also suppress repeated tier-stretch
      // explanations after the first appearance (admin reads once, not 5×).
      const notes = [];
      if (s.tier === 3 && s.nearbyOnDay && s.nearbyClient) {
        // "Already in area" is slot-specific (different nearbyClient each time)
        // so we show it every time, not deduped. Word the note differently for
        // a nearby lesson vs a nearby clinic hold, and strip the "Event - " prefix
        // when the nearby entry is a clinic hold (labels otherwise render like
        // "Event - Hold for Active One Frankston lesson" which is both noisy and
        // technically wrong — a clinic hold isn't a "lesson").
        if (s.nearbyKind === "clinic-hold") {
          notes.push(`Already in area — ${stripEventPrefix(s.nearbyClient)} clinic hold ${s.nearbyTime} nearby`);
        } else {
          notes.push(`Already in area — ${s.nearbyClient} lesson ${s.nearbyTime} nearby`);
        }
      } else if (s.tier === 3 && !s.nearbyOnDay) {
        if (!shownTier3Stretch.shown) {
          notes.push(`Instructor covers this area occasionally — dedicated trip`);
          shownTier3Stretch.shown = true;
        }
      } else if (s.tier === 4) {
        if (!shownTier4Stretch.shown) {
          notes.push(`Outside ${s.instructor}'s usual area AND not nearby today — use only if no better option`);
          shownTier4Stretch.shown = true;
        }
      }
      if (s.peakTrafficWarning) {
        notes.push(`⚠️ ${s.peakPeriod} — travel may take longer than estimated`);
      }

      // Squeeze detection — warn admin when this slot has tight margins on either
      // side. Instructor has <= 10 min buffer before lesson starts OR <= 10 min
      // between lesson end and next commitment. Low buffer = high risk of running
      // late. The gap-fit math already guarantees the slot is mathematically
      // possible, but mathematically-possible and comfortable are different.
      const bufferIn = timeToMins(s.suggestedStart) - (
        s.prevAppointmentKind && s.prevEndTime
          ? timeToMins(s.prevEndTime)
          : 0
      );
      // Only meaningful when coming FROM a previous appointment
      if (s.prevAppointmentKind && bufferIn > 0 && bufferIn - s.travelIn < 10) {
        notes.push(`⚠️ Tight schedule — only ${Math.max(0, bufferIn - s.travelIn)} min spare after travel from previous appt`);
      }
      if (s.nextAppointmentKind && s.nextStartTime) {
        // Lesson end = suggestedStart + durationMins. Then travel to next appt.
        const lessonEnd = timeToMins(s.suggestedStart) + durationMins;
        const nextStart = timeToMins(s.nextStartTime);
        const afterBuffer = nextStart - lessonEnd - s.travelOut;
        if (afterBuffer < 10) {
          notes.push(`⚠️ Tight schedule — only ${Math.max(0, afterBuffer)} min spare before next appt`);
        }
      }
      const notesLinesBlock = notes.map(n => `Note: ${n}`).join("\n  ");

      // Slot header. List is ordered best-to-worst — no need for a "top pick"
      // tag; Slot 1 is always the best pick. Tier tag already communicates quality.
      return `Slot ${slotNumber}: ${s.instructor} — ${formatDate(s.date)} (${s.dayName}) at ${s.suggestedStart}   [${tierTag}]
  ${fromLine}
  ${afterLine}${notesLinesBlock ? "\n  " + notesLinesBlock : ""}`;
    };

    // Main list: Tier 1-3 slots, rendered in score order.
    const mainRendered = toPresent.map((s, i) => renderSlot(s, i + 1)).join("\n\n");

    // Fallback list: Tier 4 slots, shown under a separate heading only when
    // the main list had fewer than 5 slots (we need filler) AND we have Tier 4
    // candidates. Numbered continuing from where the main list left off so
    // admin sees a coherent index.
    let fallbackRendered = "";
    if (fallbackSelected.length > 0) {
      const startNum = toPresent.length + 1;
      const fallbackSlotTexts = fallbackSelected.map((s, i) => renderSlot(s, startNum + i));
      fallbackRendered = `\n\nAlso worth considering (longer drives / outside usual areas — use only if nothing above works for the client):\n\n${fallbackSlotTexts.join("\n\n")}`;
    }

    const slotDescriptions = mainRendered + fallbackRendered;

    // Footer note — one mention of the private-hold caveat, not per-slot.
    const privateHoldFooter = hasAnyPrivateHoldMention
      ? "\n\nNote: Private-hold entries above (e.g. Sherri's and Jason's private clients) have unknown locations — instructor has the time reserved but the destination isn't in Nookal. Confirm with the instructor if timing is tight."
      : "";

    // Build admin alerts section (unresolved data + clinic partnership alerts)
    let adminAlertsText = "";

    if (clinicHoldAlerts.length > 0) {
      // Group alerts by instructor + clinic + type to avoid dumping every
      // individual Wednesday. "Christian has Active One holds on 18 Wednesdays"
      // is more useful than 18 separate lines.
      const groups = {};
      for (const a of clinicHoldAlerts) {
        const key = `${a.instructor}|${a.clinicName}|${a.type}`;
        if (!groups[key]) {
          groups[key] = {
            instructor: a.instructor,
            clinicName: a.clinicName,
            type: a.type,
            distanceKm: a.distanceKm,
            dates: new Set(),
            dayNames: new Set(),
            holdTimes: new Set()
          };
        }
        groups[key].dates.add(a.date);
        if (a.dayName) groups[key].dayNames.add(a.dayName);
        groups[key].holdTimes.add(`${a.holdStart}-${a.holdEnd}`);
      }

      const alertLines = [];
      for (const g of Object.values(groups)) {
        const dateCount = g.dates.size;
        const dayList = [...g.dayNames];
        const timeList = [...g.holdTimes].sort();

        let dayPhrase;
        if (dayList.length === 1 && dateCount > 1) {
          dayPhrase = `${dayCount(dateCount)} on ${fullDayName(dayList[0])}s`;
        } else if (dateCount === 1) {
          dayPhrase = `on ${formatDate([...g.dates][0])}`;
        } else {
          dayPhrase = `on ${dateCount} dates`;
        }

        const timePhrase = timeList.length === 1
          ? `at ${timeList[0]}`
          : `in slots ${timeList.slice(0, 3).join(", ")}${timeList.length > 3 ? " and others" : ""}`;

        if (g.type === "blocking-unselected") {
          alertLines.push(
            `- ${g.instructor} could be a great match for this client ${dayPhrase}, but ${g.clinicName} has holds ${timePhrase} (${g.distanceKm}km from client). Check with ${g.clinicName} — if any of those holds are free, ${g.instructor} could take this client.`
          );
        } else {
          alertLines.push(
            `- ${g.instructor} has recommended slot(s) near ${g.clinicName}'s holds ${dayPhrase} ${timePhrase} (${g.distanceKm}km from client). Worth asking ${g.clinicName} if any are free — might be better fits.`
          );
        }
      }

      adminAlertsText += `\n\nCLINIC PARTNERSHIP ALERTS (worth checking with clinic — slot may free up):\n`;
      adminAlertsText += alertLines.join("\n");
    }

    // Filter data alerts: only show alerts relevant to the slots we're actually
    // presenting (the ones Claude will render). Previously we scoped to top-3
    // and the full selected-10 pool leaked alerts from unpresented slots.
    const presentedInstructorDates = new Set(
      toPresent.map(s => `${s.instructor}|${s.date}`)
    );
    const relevantDataAlerts = allAdminAlerts.filter(a =>
      presentedInstructorDates.has(`${a.instructor}|${a.date}`)
    );

    if (relevantDataAlerts.length > 0) {
      adminAlertsText += `\n\nDATA ALERTS (unresolved lookup issues affecting recommended slots):\n` +
        relevantDataAlerts.map(a => `- ${a.instructor} ${formatDate(a.date)} ${a.time}: ${a.details}`).join("\n");
    }
    debugLog.push(`Data alerts: ${allAdminAlerts.length} total, ${relevantDataAlerts.length} relevant to selected slots`);

    // "Not offered" footer — list eligible-but-filtered instructors with why.
    // De-dupe by name in case an instructor was added for multiple reasons.
    const seenExcluded = new Set();
    const dedupedExcluded = [];
    for (const ex of excludedInstructors) {
      if (!seenExcluded.has(ex.name)) {
        seenExcluded.add(ex.name);
        dedupedExcluded.push(ex);
      }
    }
    // Only include instructors NOT already in the selected list (an instructor
    // with one good slot and 12 filtered gaps shouldn't appear as "not offered")
    const selectedNames = new Set(toPresent.map(s => s.instructor));
    const notOfferedList = dedupedExcluded.filter(ex => !selectedNames.has(ex.name));

    // Collapse the common "missing mod: X" case into one line per mod, since
    // the same mod often excludes 4-5 instructors and listing them each on
    // their own line is needless repetition.
    //   Before: - Greg: missing mod: Satellite
    //           - Jason: missing mod: Satellite
    //           - Marc: missing mod: Satellite
    //           ...
    //   After:  - Missing Satellite mod: Greg, Jason, Marc, Sherri, Yves
    const modBuckets = {}; // mod name -> [instructor names]
    const otherReasons = []; // [{name, reason}] for non-mod reasons
    for (const ex of notOfferedList) {
      const modMatch = ex.reason.match(/^missing mods?:\s*(.+)$/i);
      if (modMatch) {
        // Single mod OR comma-separated list ("LFA, Electronic Spinner")
        const mods = modMatch[1].split(",").map(m => m.trim()).filter(Boolean);
        for (const m of mods) {
          if (!modBuckets[m]) modBuckets[m] = [];
          modBuckets[m].push(ex.name);
        }
      } else {
        otherReasons.push(ex);
      }
    }

    let notOfferedText = "";
    if (notOfferedList.length > 0) {
      const lines = [];
      // Mod-mismatch collapsed lines first
      for (const [mod, names] of Object.entries(modBuckets)) {
        lines.push(`- Missing ${mod} mod: ${names.join(", ")}`);
      }
      // Then per-instructor non-mod reasons
      for (const ex of otherReasons) {
        lines.push(`- ${ex.name}: ${ex.reason}`);
      }
      notOfferedText = "\n\nNOT OFFERED (eligible instructors who didn't make the list):\n" + lines.join("\n");
    }

    // Address-not-found detection: if NO slot in the selected list has a resolved
    // distance from base, Google probably couldn't geocode the client address.
    // Travel times will still be returned (30-min fallback) but admin should
    // know before they trust the numbers. Also flag when all base distances
    // come back implausibly large (>150 km) — Google fuzzy-matched the address
    // to somewhere obviously wrong rather than returning null.
    const anyBaseDistanceReasonable = toPresent.some(s =>
      s.baseDistanceKm !== null &&
      s.baseDistanceKm !== undefined &&
      s.baseDistanceKm <= 150
    );
    const addressWarning = (toPresent.length > 0 && !anyBaseDistanceReasonable)
      ? "⚠️ Client address couldn't be found reliably on the map — travel times below may be inaccurate. Please double-check the address before booking.\n\n"
      : "";

    // Compose top-of-output client summary — sits above options so admin confirms
    // no data entry mix-up before copying anything into Nookal.
    const clientName = booking.clientName || "(not specified)";
    const sessionType = booking.sessionType || booking.serviceType || "";
    const modsText = normalisedMods.length > 0 ? normalisedMods.join(", ") : "no mods required";
    const clientSummary =
      `CLIENT: ${clientName} • ${clientSuburb} • ${durationMins}min • ${modsText}\n` +
      (sessionType ? `Session type: ${sessionType}\n` : "");

    const systemPrompt = `You are the SDT Booking Assistant for Specialised Driver Training. You prepare a compact scannable summary for office staff to act on — NOT a narrative.

═══ CRITICAL ANTI-FABRICATION RULES ═══

The list of VERIFIED SLOTS below is the ONLY source of truth. Every slot you present MUST exist verbatim in that list.

DO NOT:
- Invent a new date, time, or slot
- Round, adjust, or alter any time shown
- Invent previous/next appointment client names or locations
- Rewrite From: or After: lines — copy them as-is (you may shorten slightly but preserve all facts)
- Add a tier number or change a tier number
- Claim "already in area" unless the slot explicitly says so in its Note
- Invent distances (km) or travel times — only use the numbers in the From/After lines
- Never write "heading back to base", "returns to [base city]", or similar for After: lines that show a hard-block (personal commitment) or private-hold (location unknown) — those phrasings are always wrong for those kinds of next appointment. Copy the After: line as-is.

═══ OUTPUT FORMAT — FOLLOW EXACTLY ═══

Start with the CLIENT line copied verbatim from the user message.

If there is an "⚠️ Client address couldn't be found on the map..." warning, include it immediately after.

Then list each slot EXACTLY as shown in VERIFIED SLOTS — keep the "Slot N: ..." header with the tier tag in brackets, keep the From: and After: lines verbatim (including all commas, parentheses, ellipses and punctuation), keep any Note: lines.

If there is an "Also worth considering" section in the VERIFIED SLOTS text, copy it verbatim AFTER the main slots — keep its heading line intact. Those are longer-drive fallback options; admin should see them but they're clearly secondary.

Do NOT add narrative sentences around the slots. No "Perfect timing", no "Another excellent option", no introductions like "Here are the best slots". The slots speak for themselves.

If the main list has fewer than 5 slots, show only what exists. Say in ONE short line: "Only N slot(s) available in usual zones." If there's also an "Also worth considering" section below, that one still appears as normal — admin might prefer a longer-drive option over waiting.

═══ BELOW THE SLOTS ═══

Headings should be plain text — NOT markdown bold (no **) and NOT all-caps. Write them exactly like this:
  Not offered
  Clinic check
  Data alerts

If the user message has a "NOT OFFERED" section, copy it verbatim under the heading "Not offered".

If the user message has a "CLINIC PARTNERSHIP ALERTS" section, render under the heading "Clinic check" with a one-line intro: "These clinics regularly reserve and usually fill their hold slots, but occasionally one frees up — worth a call before confirming:"

If the user message has a "DATA ALERTS" section, render under the heading "Data alerts" with intro: "Admin should confirm these before booking:"

If the user message has a "Note: Private-hold entries above..." footer, copy it verbatim at the very bottom.

═══ TONE ═══

Admin-facing. Fast to scan. No filler. No client-facing language. No markdown formatting anywhere — no **bold**, no _italics_, no # headings. Use plain text with the exact line format from VERIFIED SLOTS. Your goal is to RENDER, not to WRITE.`;

    const userMessage = `${clientSummary}
AVAILABILITY: ${availString || "not specified"}

${addressWarning}VERIFIED SLOTS:
${slotDescriptions}${privateHoldFooter}${notOfferedText}${adminAlertsText}`;

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

    // Append to admin audit log (ring buffer of last 100 bookings).
    // Captures enough detail that admin can later review what was suggested
    // for a given client without needing the full Railway log stream.
    appendAuditLog({
      timestamp: new Date().toISOString(),
      clientName: booking.clientName || "(not specified)",
      suburb: clientSuburb,
      mods: normalisedMods,
      duration: durationMins,
      availability: availString || "(none specified)",
      presentedSlots: toPresent.map(s => ({
        instructor: s.instructor,
        date: s.date,
        dayName: s.dayName,
        start: s.suggestedStart,
        tier: s.tier,
        nearbyOnDay: s.nearbyOnDay || false,
        travelInMin: s.travelIn,
        travelInKm: s.travelInKm
      })),
      fallbackSlots: fallbackSelected.map(s => ({
        instructor: s.instructor,
        date: s.date,
        dayName: s.dayName,
        start: s.suggestedStart,
        tier: s.tier,
        travelInMin: s.travelIn,
        travelInKm: s.travelInKm
      })),
      notOfferedCount: notOfferedList.length,
      clinicAlertCount: clinicHoldAlerts.length,
      warnings: {
        addressLikelyInvalid: addressWarning !== "",
        hasPrivateHolds: hasAnyPrivateHoldMention
      }
    });

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

// ─── Debug: run the booking pipeline without Claude, return raw slot data ───
// Usage: POST /debug-selected with the same body as /analyse
// Returns: the exact list of verified slots the system would give to Claude,
// plus any clinic alerts and data alerts. Use this to confirm whether a slot
// Claude suggested was actually approved by the system (or fabricated by Claude).
app.post("/debug-selected", async (req, res) => {
  try {
    const booking = req.body;
    const clientSuburb = booking.clientSuburb || booking.suburb;
    let requiredMods = booking.modifications || booking.requiredMods || [];
    if (typeof requiredMods === "string") {
      requiredMods = requiredMods.split(",").map(s => s.trim()).filter(Boolean);
    }
    if (!Array.isArray(requiredMods)) requiredMods = [];
    const durationMins = parseInt(booking.lessonDuration || booking.duration || 60);
    const availString = booking.availability || "";

    if (!clientSuburb) return res.status(400).json({ error: "Client suburb required" });

    // Use the same mod normalisation as /analyse
    const MOD_MAP = {
      "left foot accelerator": "LFA", "lfa": "LFA",
      "electronic spinner": "Electronic Spinner",
      "spinner knob": "Spinner", "spinner": "Spinner",
      "hand controls": "Hand Controls", "hand control": "Hand Controls",
      "satellite": "Satellite",
      "o-ring": "O-Ring", "oval ring": "O-Ring", "o ring": "O-Ring",
      "monarchs": "Monarchs", "monarch": "Monarchs",
      "extension pedals": "Extension Pedals", "extension pedal": "Extension Pedals",
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

    const eligibleInstructors = INSTRUCTORS.filter(inst =>
      normalisedMods.every(needed =>
        inst.mods.some(m => m.toLowerCase() === needed.toLowerCase())
      )
    );

    const availPref = parseAvailability(availString);

    const allSlots = [];
    const allAdminAlerts = [];
    const allInstructorClinicHolds = [];
    for (const inst of eligibleInstructors) {
      try {
        const result = await findAvailableSlots(inst, clientSuburb, durationMins, availPref);
        allSlots.push(...result.slots);
        if (result.adminAlerts?.length) {
          for (const alert of result.adminAlerts) allAdminAlerts.push({ instructor: inst.name, ...alert });
        }
        if (result.allClinicHolds?.length) {
          for (const ch of result.allClinicHolds) allInstructorClinicHolds.push({ instructor: inst.name, ...ch });
        }
      } catch (err) {
        // ignore per-instructor errors for diagnostic purposes
      }
    }

    allSlots.sort((a, b) => scoreSlot(b) - scoreSlot(a));

    // Apply the same selection logic as /analyse: top 10, max 3 per instructor, unique instructor+date
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

    // Return a compact view of what Claude would see
    res.json({
      clientSuburb,
      durationMins,
      requiredMods: normalisedMods,
      eligibleInstructors: eligibleInstructors.map(i => i.name),
      totalRawSlots: allSlots.length,
      selectedCount: selected.length,
      selectedSlots: selected.map(s => ({
        instructor: s.instructor,
        date: s.date,
        dayName: s.dayName,
        suggestedStart: s.suggestedStart,
        tier: s.tier,
        travelIn: s.travelIn,
        baseTravel: s.baseTravel,
        bufferApplied: s.bufferMinsApplied,
        prevLocation: s.prevLocation,
        nextLocation: s.nextLocation,
        prevClientName: s.prevClientName,
        prevEndTime: s.prevEndTime,
        comingFromBase: s.comingFromBase,
        priorHardBlock: s.priorHardBlock,
        peakTrafficWarning: s.peakTrafficWarning,
        clinicHoldsThisDay: s.clinicHoldsOnDay?.length || 0,
        privateHoldsThisDay: s.privateHoldsOnDay?.length || 0
      })),
      clinicHoldsInAvailWindow: allInstructorClinicHolds.map(c => ({
        instructor: c.instructor,
        date: c.date,
        dayName: c.dayName,
        holdTime: `${c.startTime}-${c.endTime}`,
        clinic: c.clinic.name
      })),
      dataAlerts: allAdminAlerts.slice(0, 50)
    });
  } catch (err) {
    res.status(500).json({ error: err.message, stack: err.stack });
  }
});

// ─── Health check ────────────────────────────────────────────────────────────
// BUILD_ID changes whenever significant updates ship so we can verify deploys
const BUILD_ID = "2026-04-25-stricter-private-hold-extraction-v5.6";
const BUILD_STARTED = new Date().toISOString();

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    version: "v2-nookal-api",
    buildId: BUILD_ID,
    serverStarted: BUILD_STARTED,
    features: [
      "street-abbreviation-expansion",
      "next-lesson-prompt-hardening",
      "data-alerts-scoped-to-selected-dates",
      "clinic-alerts-for-blocked-instructors",
      "private-hold-classification",
      "yves-ics-url-fixed",
      "tier-3-label-split-area-vs-stretch",
      "next-appointment-kind-aware-phrasing",
      "clinic-alert-time-block-overlap-filter",
      "jason-daily-cutoff-hard-block",
      "getDistanceKm-cache-key-fix",
      "compact-labeled-slot-output",
      "bidirectional-travel-min-and-km",
      "diversity-penalty-in-slot-selection",
      "present-up-to-5-slots",
      "not-offered-explanation",
      "strip-event-prefix",
      "address-not-found-warning",
      "client-summary-at-top",
      "claude-pick-order-logging",
      "late-start-hols-as-hard-block",
      "smart-truncate-word-boundary",
      "clinic-hold-travel-burden-surfaced",
      "tier-note-deduplication",
      "not-offered-collapsed-mod-lines",
      "top-pick-tag-on-slot-1",
      "browser-friendly-test-endpoint",
      "plain-text-section-headings",
      "title-case-suburb-extraction-after-street",
      "top-pick-restricted-to-tier-1-and-2",
      "nearby-appointment-kind-aware-wording",
      "geocode-failure-detection",
      "clinic-regex-handles-parens-and-clinic-word",
      "geocode-fuzzy-match-detection-150km-threshold",
      "admin-audit-log-ring-buffer",
      "private-hold-location-from-notes",
      "stronger-date-penalty-and-core-zone-nearby-ignored",
      "date-first-scoring-smart-ranking",
      "tier-4-bucketed-to-also-worth-considering",
      "top-pick-tag-removed",
      "squeeze-detection-for-tight-schedules",
      "stricter-private-hold-location-no-name-fuzzy-match"
    ],
    cacheSize: {
      clientAddresses: Object.keys(clientAddressCache).length,
      clientNames: Object.keys(clientByNameCache).length,
      travelRoutes: Object.keys(travelCache).length,
      icsFeeds: Object.keys(icsCache).length
    },
    tokenValid: cachedToken && Date.now() < cachedTokenExpiry
  });
});

// ─── Cache clear (for when a client moves or we need fresh data) ─────────────
// Accepts both GET and POST so admin can hit it from a browser URL bar.
function handleClearCache(req, res) {
  const before = {
    clients: Object.keys(clientAddressCache).length,
    travel: Object.keys(travelCache).length,
    ics: Object.keys(icsCache).length
  };
  for (const k of Object.keys(clientAddressCache)) delete clientAddressCache[k];
  for (const k of Object.keys(clientByNameCache)) delete clientByNameCache[k];
  for (const k of Object.keys(travelCache)) delete travelCache[k];
  for (const k of Object.keys(icsCache)) delete icsCache[k];
  cachedToken = null;
  cachedTokenExpiry = 0;
  res.json({ cleared: before, message: "All caches cleared. Next request will be slower (cold start)." });
}
app.get("/clear-cache", handleClearCache);
app.post("/clear-cache", handleClearCache);


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

    // Gap calc with cursor-based walk to handle overlapping blocks properly
    const gaps = [];
    if (resolved.length === 0) {
      gaps.push({
        earliestStart, latestEnd,
        prevLoc: inst.base, nextLoc: null,
        prevAppt: null, nextAppt: null,
        prevAppointmentLabel: "(empty day — from base)"
      });
    } else {
      let cursor = earliestStart;
      let lastBefore = null;

      if (resolved[0].startMins > earliestStart) {
        gaps.push({
          earliestStart, latestEnd: resolved[0].startMins,
          prevLoc: inst.base, nextLoc: resolved[0].locationForStart,
          prevAppt: null, nextAppt: resolved[0],
          prevAppointmentLabel: "(first slot — from base)"
        });
      }
      cursor = Math.max(earliestStart, resolved[0].endMins);
      lastBefore = resolved[0];

      for (let i = 1; i < resolved.length; i++) {
        const entry = resolved[i];
        if (entry.startMins > cursor) {
          gaps.push({
            earliestStart: cursor,
            latestEnd: entry.startMins,
            prevLoc: lastBefore.locationForEnd,
            nextLoc: entry.locationForStart,
            prevAppt: lastBefore,
            nextAppt: entry,
            prevAppointmentLabel: `${lastBefore.label} (${lastBefore.kind})`
          });
        }
        if (entry.endMins > cursor) {
          cursor = entry.endMins;
          lastBefore = entry;
        }
      }

      if (cursor < latestEnd) {
        gaps.push({
          earliestStart: cursor, latestEnd,
          prevLoc: lastBefore.locationForEnd, nextLoc: null,
          prevAppt: lastBefore, nextAppt: null,
          prevAppointmentLabel: `${lastBefore.label} (${lastBefore.kind}) — last of day`
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

// ─── Browser-friendly test endpoint ─────────────────────────────────────────
// Lets you test a booking from a URL bar (no form, no curl needed).
// Takes query-string parameters and internally runs the same pipeline as /analyse,
// then returns Claude's rendered output as plain text so it's readable in any browser.
//
// Example:
//   /test?name=Jenna+Frost&suburb=14+Davey+Street,+Frankston+VIC+3199
//        &mods=LFA&duration=60&availability=Wed:mid-morning
//
// Multiple availability windows: comma-separated
//   availability=Mon:mid-morning,Wed:afternoon
// Multiple mods: comma-separated
//   mods=LFA,Electronic+Spinner
app.get("/test", async (req, res) => {
  try {
    const { name, suburb, mods, duration, availability } = req.query;

    if (!suburb) {
      res.type("text/plain").send(
        "Usage: /test?name=<client>&suburb=<address>&mods=<mod1,mod2>&duration=<60|90>&availability=<Day:block,Day:block>\n\n" +
        "Example: /test?name=Jenna+Frost&suburb=14+Davey+Street,+Frankston+VIC+3199&mods=LFA&duration=60&availability=Wed:mid-morning\n\n" +
        "Day codes: Mon Tue Wed Thu Fri\n" +
        "Block codes: early-morning mid-morning afternoon late-afternoon all-day"
      );
      return;
    }

    // Build the same body shape the form sends to /analyse, then forward.
    const body = {
      clientName: name || "(test client)",
      suburb: suburb,
      modifications: mods || "",
      duration: duration || "60",
      availability: availability || ""
    };

    // Self-call /analyse via HTTP so we reuse its exact pipeline (no duplication).
    // We go localhost because we're on the same Railway instance.
    const port = PORT || 3000;
    const analyseRes = await axios.post(`http://localhost:${port}/analyse`, body, {
      headers: { "Content-Type": "application/json" },
      timeout: 90000
    });

    // /analyse returns a Claude-API-shaped response. Pull out the text.
    const data = analyseRes.data;
    let rendered = "";
    if (data?.content?.length) {
      rendered = data.content
        .filter(c => c.type === "text")
        .map(c => c.text)
        .join("\n\n");
    } else if (data?.error) {
      rendered = `Error: ${data.error}`;
    } else {
      rendered = "(No content returned)";
    }

    res.type("text/plain").send(rendered);
  } catch (err) {
    const detail = err.response?.data?.error || err.message;
    res.status(500).type("text/plain").send(`Test endpoint error:\n${detail}`);
  }
});

// ─── Admin audit log endpoint ──────────────────────────────────────────────
// Browser-friendly view of the last N analyses. Designed to be read on a phone
// during the shadow-testing phase so admin can review what the tool suggested
// for recent bookings without needing Railway access.
//
// Default: plain-text formatted. Add ?format=json for raw JSON.
// Add ?n=<count> to limit to the most recent N (default 20, max 100).
// Add ?client=<substring> to filter by client name.
app.get("/admin-log", (req, res) => {
  const format = req.query.format || "text";
  const requestedN = parseInt(req.query.n) || 20;
  const n = Math.max(1, Math.min(requestedN, ADMIN_LOG_MAX_ENTRIES));
  const clientFilter = (req.query.client || "").toLowerCase();

  // Newest first
  let entries = [...adminAuditLog].reverse();
  if (clientFilter) {
    entries = entries.filter(e => e.clientName.toLowerCase().includes(clientFilter));
  }
  entries = entries.slice(0, n);

  if (format === "json") {
    return res.json({
      total: adminAuditLog.length,
      shown: entries.length,
      entries
    });
  }

  // Plain-text format — easy to read on a phone
  if (entries.length === 0) {
    const hint = clientFilter
      ? `No bookings match "${clientFilter}".`
      : "No bookings analysed yet since last server restart.";
    return res.type("text/plain").send(hint);
  }

  const lines = [];
  lines.push(`Admin audit log — ${adminAuditLog.length} total in memory, showing ${entries.length} most recent${clientFilter ? ` matching "${clientFilter}"` : ""}`);
  lines.push("(ring buffer of last 100, resets on server restart)");
  lines.push("");

  // Melbourne-local time formatter
  const toMelbTime = (iso) => {
    try {
      const d = new Date(iso);
      const formatter = new Intl.DateTimeFormat("en-AU", {
        timeZone: "Australia/Melbourne",
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", hour12: false
      });
      return formatter.format(d);
    } catch { return iso; }
  };

  for (const e of entries) {
    lines.push("─".repeat(60));
    lines.push(`${toMelbTime(e.timestamp)} — ${e.clientName}`);
    lines.push(`  ${e.suburb}  •  ${e.duration}min  •  ${e.mods.length ? e.mods.join(", ") : "no mods"}`);
    lines.push(`  Availability: ${e.availability}`);

    if (e.warnings && e.warnings.addressLikelyInvalid) {
      lines.push(`  ⚠️ Address could not be found on the map`);
    }

    if (e.presentedSlots.length === 0) {
      lines.push("  → No slots offered");
    } else {
      lines.push(`  → ${e.presentedSlots.length} slot(s) offered:`);
      for (let i = 0; i < e.presentedSlots.length; i++) {
        const s = e.presentedSlots[i];
        const tierTag = s.tier === 1 ? "T1"
          : s.tier === 2 ? "T2"
          : s.tier === 3 ? (s.nearbyOnDay ? "T3 area" : "T3 stretch")
          : "T4 ⚠️";
        const km = s.travelInKm !== null && s.travelInKm !== undefined ? `${s.travelInKm}km` : "?km";
        lines.push(`     ${i + 1}. ${s.instructor} ${s.date} (${s.dayName}) ${s.start}  [${tierTag}]  (${s.travelInMin}min / ${km})`);
      }
    }
    // Also show Tier 4 fallback slots if any were presented as "Also worth considering"
    if (e.fallbackSlots && e.fallbackSlots.length > 0) {
      lines.push(`  + ${e.fallbackSlots.length} fallback slot(s) (longer drives):`);
      for (let i = 0; i < e.fallbackSlots.length; i++) {
        const s = e.fallbackSlots[i];
        const km = s.travelInKm !== null && s.travelInKm !== undefined ? `${s.travelInKm}km` : "?km";
        lines.push(`     F${i + 1}. ${s.instructor} ${s.date} (${s.dayName}) ${s.start}  [T4 ⚠️]  (${s.travelInMin}min / ${km})`);
      }
    }
    if (e.notOfferedCount > 0) {
      lines.push(`  ${e.notOfferedCount} instructor(s) not offered`);
    }
    if (e.clinicAlertCount > 0) {
      lines.push(`  ${e.clinicAlertCount} clinic alert(s) fired`);
    }
    lines.push("");
  }

  lines.push("");
  lines.push("Query options:");
  lines.push("  ?n=50               — show more entries");
  lines.push("  ?client=smith       — filter by client name");
  lines.push("  ?format=json        — raw JSON output");

  res.type("text/plain").send(lines.join("\n"));
});

app.listen(PORT, () => console.log(`SDT Booking Assistant v2 running on ${PORT}`));

const express = require("express");
const cors = require("cors");
const axios = require("axios");

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
// locationID + providerID from Nookal
// Gabriel + Christian share Driving Matters Pty Ltd (locationID 1), filter by providerID
const INSTRUCTORS = [
  {
    name: "Christian", base: "Montmorency", locationID: 1, providerID: 32,
    mods: ["LFA", "Spinner", "Electronic Spinner", "Hand Controls", "Satellite", "Extension Pedals", "Indicator Extension"],
    allAreas: true,
    maxTravelFromBase: 65,
    preferredZone: "All Melbourne areas by arrangement"
  },
  {
    name: "Gabriel", base: "Croydon North", locationID: 1, providerID: 1,
    mods: ["LFA", "Spinner", "Electronic Spinner", "Hand Controls", "Satellite", "O-Ring", "Monarchs", "Indicator Extension"],
    earliestStart: "09:30",
    maxTravelFromBase: 55,
    zoneByArrangement: true,
    preferredZone: "East Melbourne — Croydon, Ringwood, Box Hill, Frankston corridor. Will go further by arrangement."
  },
  {
    name: "Greg", base: "Kilsyth", locationID: 41, providerID: 77,
    mods: ["LFA", "Spinner", "Electronic Spinner", "Monarchs", "Indicator Extension"],
    maxTravelFromBase: 55,
    zoneByArrangement: true,
    preferredZone: "Extended East & South-East Melbourne — Kilsyth, Ringwood, Knox, Dandenong, Frankston, Bayside."
  },
  {
    name: "Jason", base: "Wandin North", locationID: 23, providerID: 59,
    mods: ["LFA", "Spinner"],
    maxTravelFromBase: 55,
    zoneByArrangement: true,
    preferredZone: "East Melbourne & Yarra Valley — Wandin, Lilydale, Mooroolbark, Ringwood, Knox, SE up to Bayside."
  },
  {
    name: "Marc", base: "Werribee", locationID: 51, providerID: 90,
    mods: ["LFA", "Spinner", "Electronic Spinner", "Extension Pedals", "Indicator Extension"],
    maxTravelFromBase: 55,
    preferredZone: "West Melbourne — Werribee, Hoppers Crossing, Tarneit, Melton, Sunshine, Footscray, Altona, Laverton."
  },
  {
    name: "Sherri", base: "Wandin North", locationID: 5, providerID: 38,
    mods: [],
    maxTravelFromBase: 50,
    zoneByArrangement: true,
    preferredZone: "Wandin to Ringwood radius. Will travel further if lessons are planned. Also covers Warragul area."
  },
  {
    name: "Yves", base: "Rye", locationID: 29, providerID: 62,
    mods: ["LFA", "Spinner", "Electronic Spinner", "Indicator Extension"],
    maxTravelFromBase: 35,
    hardZone: true,
    preferredZone: "Mornington Peninsula only — Rye, Rosebud, Mornington, Mt Eliza, Dromana, Safety Beach, Sorrento."
  }
];

// ─── In-memory caches (persist across requests while server runs) ────────────
const clientAddressCache = {};
let cachedToken = null;
let cachedTokenExpiry = 0;
const travelCache = {};

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

async function getAppointmentsForInstructor(inst, dateFrom, dateTo) {
  const q = `
    query {
      appointments(
        locationIDs: [${inst.locationID}]
        providerIDs: [${inst.providerID}]
        dateFrom: "${dateFrom}"
        dateTo: "${dateTo}"
        pageLength: 500
      ) {
        apptID
        appointmentDate
        startTime
        endTime
        status
        clientID
        clientName
        notes
        typeName
      }
    }
  `;
  const d = await nookalQuery(q);
  return d.appointments || [];
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
function classifyAppointment(a) {
  if (a.status === "StdAppt") return "lesson";
  if (a.status === "Cancelled") return "skip";
  if (a.status === "Note") return "skip";

  if (a.status === "Event") {
    const hasContent = (a.notes && a.notes.trim()) || (a.typeName && a.typeName.trim());
    const blockCategories = ["time held", "holidays", "non-sdt work", "medical", "general"];
    const isBlock = blockCategories.some(cat => (a.typeName || "").toLowerCase().includes(cat));
    if (hasContent || isBlock) return "block";
    return "skip";
  }

  return "skip";
}

// ─── Location extraction from notes ──────────────────────────────────────────
function extractNotesLocation(notes) {
  if (!notes || !notes.trim()) return null;

  // Pattern: "to home in SUBURB" — dropoff
  const dropoffMatch = notes.match(/\bto\s+home\s+in\s+([A-Z][A-Z\s]{2,40}?)(?:\n|$|\.|,)/i);
  if (dropoffMatch) {
    return {
      pickup: extractPickupFromSchoolPattern(notes),
      dropoff: cleanSuburb(dropoffMatch[1])
    };
  }

  // Pattern: "from [ClinicName] SUBURB" — pickup from clinic
  const clinicMatch = notes.match(/from\s+[A-Za-z][A-Za-z\s]*?(?:clinic|CommOT|ActiveOne|Community\s+OT)\s+([A-Z][A-Z\s]{2,40}?)(?:\s|$|\.|,|\n|prior)/i);
  if (clinicMatch) {
    return { single: cleanSuburb(clinicMatch[1]) };
  }

  // Pattern: "street address - SUBURB"
  const dashSuburbMatch = notes.match(/-\s*([A-Z][A-Z\s]{2,40}?)(?:\s*$|\n|,)/);
  if (dashSuburbMatch) {
    const candidate = cleanSuburb(dashSuburbMatch[1]);
    if (isLikelySuburb(candidate)) return { single: candidate };
  }

  // Pattern: first line is all caps
  const firstLine = notes.split(/\n|\r/)[0].trim();
  if (isLikelySuburb(firstLine)) return { single: firstLine };

  // Fallback: find ALL CAPS phrase
  const capsMatches = notes.match(/\b[A-Z][A-Z\s]{2,30}\b/g) || [];
  for (const m of capsMatches) {
    const cleaned = cleanSuburb(m);
    if (isLikelySuburb(cleaned)) return { single: cleaned };
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
    "EASY", "DRIVE", "PREVIOUS", "NEXT"
  ]);
  return !words.some(w => NOT_SUBURBS.has(w));
}

function extractPickupFromSchoolPattern(notes) {
  const m = notes.match(/from\s+(?:school\s+)?([A-Z][A-Z\s]{2,40}?)\s+to/i);
  if (m) return cleanSuburb(m[1]);
  return null;
}

// ─── Smart location resolution ───────────────────────────────────────────────
async function resolveAppointmentLocation(appt) {
  const clientAddr = appt.clientID ? await getClientAddress(appt.clientID) : null;
  const homeSuburb = clientAddr?.suburb || null;
  const notesLoc = extractNotesLocation(appt.notes);

  if (notesLoc?.dropoff) {
    return {
      pickup: notesLoc.pickup || homeSuburb,
      dropoff: notesLoc.dropoff,
      clientHomeSuburb: homeSuburb,
      clientName: appt.clientName,
      noteText: appt.notes
    };
  }

  if (notesLoc?.single) {
    const notesSuburb = notesLoc.single;
    if (homeSuburb && notesSuburb.toUpperCase() === homeSuburb.toUpperCase()) {
      return {
        pickup: homeSuburb, dropoff: homeSuburb,
        clientHomeSuburb: homeSuburb, clientName: appt.clientName,
        noteText: appt.notes
      };
    }
    return {
      pickup: notesSuburb, dropoff: notesSuburb,
      clientHomeSuburb: homeSuburb, clientName: appt.clientName,
      noteText: appt.notes
    };
  }

  if (homeSuburb) {
    return {
      pickup: homeSuburb, dropoff: homeSuburb,
      clientHomeSuburb: homeSuburb, clientName: appt.clientName,
      noteText: appt.notes
    };
  }

  return null;
}

// ─── Google Maps Travel Time ─────────────────────────────────────────────────
async function getTravelTime(origin, destination) {
  if (!origin || !destination) return 30;
  const key = `${origin.toUpperCase()}|${destination.toUpperCase()}`;
  if (travelCache[key] !== undefined) return travelCache[key];

  try {
    const url = `https://maps.googleapis.com/maps/api/distancematrix/json`;
    const r = await axios.get(url, {
      params: {
        origins: `${origin}, Victoria, Australia`,
        destinations: `${destination}, Victoria, Australia`,
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
async function findAvailableSlots(inst, clientSuburb, durationMins, availPref, weeksToScan = 6) {
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
  const byDate = {};
  for (const a of appointments) {
    const cls = classifyAppointment(a);
    if (cls === "skip") continue;

    if (!byDate[a.appointmentDate]) byDate[a.appointmentDate] = [];

    const startM = timeToMins(a.startTime.slice(0, 5));
    const endM = timeToMins(a.endTime.slice(0, 5));

    let locStart = inst.base;
    let locEnd = inst.base;

    if (cls === "lesson") {
      const loc = await resolveAppointmentLocation(a);
      if (loc) {
        locStart = loc.pickup || inst.base;
        locEnd = loc.dropoff || loc.pickup || inst.base;
      }
    }

    byDate[a.appointmentDate].push({
      startMins: startM,
      endMins: endM,
      locationForStart: locStart,
      locationForEnd: locEnd,
      kind: cls,
      note: a.notes || a.typeName || ""
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

    const sorted = [...dayBlocks].sort((a, b) => a.startMins - b.startMins);
    const gaps = [];

    if (sorted.length === 0) {
      gaps.push({ earliestStart: earliestStart, latestEnd: 1050, prevLoc: inst.base, nextLoc: null });
    } else {
      if (sorted[0].startMins > earliestStart) {
        gaps.push({
          earliestStart: earliestStart,
          latestEnd: sorted[0].startMins,
          prevLoc: inst.base,
          nextLoc: sorted[0].locationForStart
        });
      }
      for (let i = 0; i < sorted.length - 1; i++) {
        if (sorted[i + 1].startMins > sorted[i].endMins) {
          gaps.push({
            earliestStart: sorted[i].endMins,
            latestEnd: sorted[i + 1].startMins,
            prevLoc: sorted[i].locationForEnd,
            nextLoc: sorted[i + 1].locationForStart
          });
        }
      }
      const last = sorted[sorted.length - 1];
      if (last.endMins < 1050) {
        gaps.push({
          earliestStart: last.endMins,
          latestEnd: 1050,
          prevLoc: last.locationForEnd,
          nextLoc: null
        });
      }
    }

    for (const gap of gaps) {
      const travelIn = await getTravelTime(gap.prevLoc, clientSuburb);
      const travelOut = gap.nextLoc ? await getTravelTime(clientSuburb, gap.nextLoc) : 0;

      const minStart = snapTo15(gap.earliestStart + travelIn);
      const maxEnd = gap.latestEnd - travelOut;
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
      const nearbyOnDay = travelIn <= 20;

      let tier;
      if (inNaturalZone && nearbyOnDay) tier = 1;
      else if (inNaturalZone && !nearbyOnDay) tier = 2;
      else if (!inNaturalZone && nearbyOnDay) tier = 3;
      else tier = 4;

      slots.push({
        instructor: inst.name,
        base: inst.base,
        date: dateStr,
        dayName,
        suggestedStart: minsToTime(matchedBlock.start),
        period: matchedBlock.block,
        travelIn,
        travelOut,
        baseTravel,
        prevLocation: gap.prevLoc,
        nextLocation: gap.nextLoc,
        tier,
        totalApptsThatDay: sorted.filter(s => s.kind === "lesson").length,
        blocksOnDay: sorted.filter(s => s.kind === "block").map(s => s.note.slice(0, 40))
      });
    }

    d.setDate(d.getDate() + 1);
  }

  return slots;
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
    const fetchErrors = [];
    for (const inst of eligibleInstructors) {
      try {
        const slots = await findAvailableSlots(inst, clientSuburb, durationMins, availPref);
        allSlots.push(...slots);
        debugLog.push(`${inst.name}: ${slots.length} valid slots`);
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
      return `Slot ${i + 1}: ${s.instructor} — ${formatDate(s.date)} (${s.dayName}) at ${s.suggestedStart}
  ${tierLabels[s.tier]}
  Travel in: ${s.travelIn} min from ${s.prevLocation || s.base}
  Travel out: ${s.travelOut} min to ${s.nextLocation || "no next lesson"}
  Base: ${s.base} → ${clientSuburb}: ${s.baseTravel} min
  Zone: ${instData?.preferredZone}
  Other lessons on day: ${s.totalApptsThatDay}`;
    }).join("\n\n");

    const systemPrompt = `You are the SDT Booking Assistant for Specialised Driver Training. You help office staff choose the best 3 slots from a list of pre-verified options.

Pick the 3 best slots from the provided list. Present each with:
- Option number, instructor name, date/time
- Tier label (from the slot data)
- 2-3 sentences on why: day/time fit, where instructor is coming from that day, what's before/after

Rules:
- Use ONLY the slots provided — do not invent any dates or times
- Always describe where the instructor is coming from that day (use the Travel in field), never default to "from base" if there's a real prev location
- Tier 1 = ideal, Tier 2 = good, Tier 3 = workable (mention the instructor will already be in the area), Tier 4 = stretch (always add a ⚠️ note)
- If all slots are from one instructor because they're the only eligible one, say so
- Keep language practical — this is for office staff making booking decisions
- No client-facing language (no "Hello [name]", no "would you like to book")`;

    const userMessage = `CLIENT: ${booking.clientName || "(not specified)"}
SUBURB: ${clientSuburb}
MODS: ${normalisedMods.join(", ") || "none"}
AVAILABILITY: ${availString || "not specified"}

VERIFIED SLOTS:
${slotDescriptions}`;

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

// ─── Nookal API test endpoint ────────────────────────────────────────────────
app.get("/test-nookal", async (req, res) => {
  try {
    await getNookalToken();
    const locations = await nookalQuery(`query { locations { locationID name suburb } }`);

    const today = toMelbDateStr(new Date());
    const tomorrow = toMelbDateStr(new Date(Date.now() + 24 * 3600 * 1000));
    const christian = INSTRUCTORS.find(i => i.name === "Christian");
    const christianAppts = await getAppointmentsForInstructor(christian, today, tomorrow);

    res.json({
      tokenObtained: true,
      locations: locations.locations,
      christianRealEntries: christianAppts.filter(a => classifyAppointment(a) !== "skip"),
      cacheStats: {
        clientAddresses: Object.keys(clientAddressCache).length,
        travelRoutes: Object.keys(travelCache).length
      }
    });
  } catch (err) {
    res.status(500).json({
      error: err.message,
      detail: err.response?.data
    });
  }
});

app.listen(PORT, () => console.log(`SDT Booking Assistant v2 running on ${PORT}`));

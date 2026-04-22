const express = require("express");
const cors = require("cors");
const ical = require("node-ical");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

// ─── Instructor Definitions ─────────────────────────────────────────────────
// zone: instructor's natural operating area (Melbourne suburbs they regularly cover)
// zoneByArrangement: true = will go outside zone if other lessons planned nearby that day
// hardZone: true = never suggest outside zone regardless (Yves/Peninsula only)
// maxTravelFromBase: soft cap — slots beyond this only appear as Tier 3/4
const INSTRUCTORS = [
  {
    name: "Christian",
    base: "Montmorency",
    mods: ["LFA", "Spinner", "Electronic Spinner", "Hand Controls", "Satellite", "Extension Pedals", "Indicator Extension"],
    // Christian covers ALL areas by arrangement - no zone restriction
    allAreas: true,
    maxTravelFromBase: 65,
    preferredZone: "All Melbourne areas by arrangement",
    zoneSuburbs: [], // empty = no restriction
    icsUrl: "https://calsync.nookal.com/icsFile.php?HhXBkBCdHTLQaK4lrqfVa9ew%2FKnxwK8N60bfEsnM4Tix4fvM5lyQStblMTQiqaNaGeCeSgeSmXf%2F4kKI9OvU2fnXpnN%2FtMeidfD9E6WmLBWPsPF881mF4%2FDKjqX6mENEnlggTWF2jMn8Em8aKgSGXA%3D%3D"
  },
  {
    name: "Gabriel",
    base: "Croydon North",
    mods: ["LFA", "Spinner", "Electronic Spinner", "Hand Controls", "Satellite", "O-Ring", "Monarchs", "Indicator Extension"],
    earliestStart: "09:30", // semi-retired, never books before 9:30
    maxTravelFromBase: 55,
    zoneByArrangement: true, // prefers east, will go elsewhere if arranged
    preferredZone: "East Melbourne — Croydon, Ringwood, Box Hill, Frankston corridor. Will go further by arrangement.",
    icsUrl: "https://calsync.nookal.com/icsFile.php?HhXBkBCdHTLQaK4lrqfVa9ew%2FKnxwK8N60bfEsnM4Tix4fvM5lyQStblMTQiqaNaGeCeSgeSmXf%2F4kKI9OvU2a52GEgwyPVJ%2B0I6mOab2rD4%2Bmqr7EYvQGR9ykfeKAj%2F"
  },
  {
    name: "Greg",
    base: "Kilsyth",
    mods: ["LFA", "Spinner", "Electronic Spinner", "Monarchs", "Indicator Extension"],
    maxTravelFromBase: 55,
    zoneByArrangement: true, // extended east/SE, further by arrangement
    preferredZone: "Extended East & South-East Melbourne — Kilsyth, Ringwood, Knox, Dandenong, Frankston, Bayside. Further by arrangement.",
    icsUrl: "https://calsync.nookal.com/icsFile.php?HhXBkBCdHTLQaK4lrqfVa9ew%2FKnxwK8N60bfEsnM4Tix4fvM5lyQStblMTQiqaNaGeCeSgeSmXf%2F4kKI9OvU2fgA7lzqZCrNH6P0mJPZWpJqu4G4d87qHmXHYUUq3ZhplneSIXp12lfHZzfvGyQdDw%3D%3D"
  },
  {
    name: "Jason",
    base: "Wandin North",
    mods: ["LFA", "Spinner"],
    maxTravelFromBase: 55,
    zoneByArrangement: true, // east/SE up to Bayside wedge, further by arrangement (speak to admin)
    preferredZone: "East Melbourne & Yarra Valley — Wandin, Lilydale, Mooroolbark, Ringwood, Knox, SE up to Bayside. Speak to admin for further.",
    icsUrl: "https://calsync.nookal.com/icsFile.php?HhXBkBCdHTLQaK4lrqfVa9ew%2FKnxwK8N60bfEsnM4Tix4fvM5lyQStblMTQiqaNaGeCeSgeSmXf%2F4kKI9OvU2Sks8REnxfIzFLWWhJgXRykKsTkQKIlND6Q3P8UWc8WWFJCS5Y5gIU0xiqPfnSz%2FkQ%3D%3D"
  },
  {
    name: "Marc",
    base: "Werribee",
    mods: ["LFA", "Spinner", "Electronic Spinner", "Extension Pedals", "Indicator Extension"],
    maxTravelFromBase: 55,
    preferredZone: "West Melbourne — Werribee, Hoppers Crossing, Tarneit, Melton, Sunshine, Footscray, Altona, Laverton, Keilor, Caroline Springs.",
    icsUrl: "https://calsync.nookal.com/icsFile.php?HhXBkBCdHTLQaK4lrqfVa9ew%2FKnxwK8N60bfEsnM4Tix4fvM5lyQStblMTQiqaNaGeCeSgeSmXf%2F4kKI9OvU2ecoRZN2xzdtmsUYY9vDrAuMuEJAzQSivaNXrwqSOqrMT982Jq4gficfE9XDNSVl0A%3D%3D"
  },
  {
    name: "Sherri",
    base: "Wandin North",
    mods: [],
    maxTravelFromBase: 50,
    zoneByArrangement: true, // Wandin-Ringwood radius, further if lessons planned, also Warragul
    preferredZone: "Wandin to Ringwood radius. Will travel further if lessons are planned. Also covers Warragul area.",
    icsUrl: "https://calsync.nookal.com/icsFile.php?HhXBkBCdHTLQaK4lrqfVa9ew%2FKnxwK8N60bfEsnM4Tix4fvM5lyQStblMTQiqaNaGeCeSgeSmXf%2F4kKI9OvU2Qm9F8eQzb%2B6bu2IC%2FLaNBOOWmK9yskJZYl8guOGtP67bXXfuA0nBVLMaaPL2rsqew%3D%3D"
  },
  {
    name: "Yves",
    base: "Rye",
    mods: ["LFA", "Spinner", "Electronic Spinner", "Indicator Extension"],
    maxTravelFromBase: 35,
    hardZone: true, // Mornington Peninsula ONLY — never suggest outside this
    preferredZone: "Mornington Peninsula only — Rye, Rosebud, Mornington, Mt Eliza, Dromana, Safety Beach, Sorrento.",
    icsUrl: "https://calsync.nookal.com/icsFile.php?HhXBkBCdHTLQaK4lrqfVa9ew%2FKnxwK8N60bfEsnM4Tix4fvM5lyQStblMTQiqaNaGeCeSgeSmXf%2F4kKI9OvU2fgA7lzqZCrNH6P0mJPZWpJqu4G4d87qHmXHYUUq3ZhplneSIXp12lfHZzfvGyQdDw%3D%3D"
  }
];

// ─── Date/Time Helpers ───────────────────────────────────────────────────────

function toMelbDateStr(date) {
  return new Date(date).toLocaleDateString("en-CA", { timeZone: "Australia/Melbourne" });
}

function toMelbTimeStr(date) {
  return new Date(date).toLocaleTimeString("en-AU", {
    timeZone: "Australia/Melbourne", hour: "2-digit", minute: "2-digit", hour12: false
  });
}

// Convert "HH:MM" string to minutes since midnight
function timeToMins(t) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

// Convert minutes since midnight to "HH:MM"
function minsToTime(m) {
  const h = Math.floor(m / 60);
  const mins = m % 60;
  return `${String(h).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

// Round UP to next 15-minute increment
function snapTo15(timeMins) {
  return Math.ceil(timeMins / 15) * 15;
}

// Get day-of-week name from date string YYYY-MM-DD
function getDayName(dateStr) {
  const d = new Date(dateStr + "T12:00:00+10:00");
  return d.toLocaleDateString("en-AU", { weekday: "short", timeZone: "Australia/Melbourne" });
}

// Format YYYY-MM-DD to DD/MM/YYYY
function formatDate(dateStr) {
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

// ─── Block Detection ─────────────────────────────────────────────────────────

function isBlockOutEvent(e) {
  const summary = (e.summary || "").toLowerCase();
  const blockWords = [
    "holiday", "day off", "no lesson", "leave", "bali", "travel",
    "unavailable", "time held", "private stuff", "car service",
    "non-sdt", "late start after hols", "early finish",
    "no sdt", "not working", "away", "sick", "personal",
    "school pickup", "school run", "pick up",
    "dentist", "doctor", "medical",
    "not available", "do not book", "dnb", "mowing man",
    "fasting", "blood test", "ultrasound"
  ];
  if (blockWords.some(w => summary.includes(w))) return true;

  // All-day event type (date-only, no time component)
  if (e.datetype === "date") return true;

  const start = new Date(e.start);
  const end = new Date(e.end);

  // Catch midnight-to-midnight all-day events (some ICS feeds encode all-day this way)
  const melbTZ = { timeZone: "Australia/Melbourne", hour: "2-digit", minute: "2-digit", hour12: false };
  const startHHMM = start.toLocaleTimeString("en-AU", melbTZ);
  const endHHMM = end.toLocaleTimeString("en-AU", melbTZ);
  if (startHHMM === "00:00" && endHHMM === "00:00") return true;

  // Only block on duration if genuinely all-day (8+ hours)
  const durationHours = (end - start) / (1000 * 60 * 60);
  if (durationHours >= 8) return true;

  return false;
}

// ─── Travel Times ─────────────────────────────────────────────────────────────

const travelCache = {};

async function getTravelTime(origin, destination) {
  if (!origin || !destination || origin === "Unknown") return 45;
  const normO = origin.trim().toLowerCase();
  const normD = destination.trim().toLowerCase();
  if (normO === normD) return 5;
  const cacheKey = `${normO}|${normD}`;
  if (travelCache[cacheKey] !== undefined) return travelCache[cacheKey];
  try {
    const url = `https://maps.googleapis.com/maps/api/distancematrix/json` +
      `?origins=${encodeURIComponent(origin + ", VIC, Australia")}` +
      `&destinations=${encodeURIComponent(destination + ", VIC, Australia")}` +
      `&mode=driving&key=${GOOGLE_MAPS_API_KEY}`;
    const res = await axios.get(url);
    const el = res.data.rows[0].elements[0];
    const mins = el.status === "OK" ? Math.ceil(el.duration.value / 60) : 45;
    travelCache[cacheKey] = mins;
    return mins;
  } catch {
    return 45;
  }
}

// ─── Core Slot Finder ────────────────────────────────────────────────────────

/**
 * For a given instructor diary day, compute all valid start windows at clientSuburb.
 * Returns array of { earliestStart, latestStart } in "HH:MM" format.
 *
 * Logic:
 * - Working window: 08:00 – 17:30 (lesson must finish by 18:00 but we cap start at 17:30-duration)
 * - For each gap between appointments (or start-of-day / end-of-day):
 *     earliestStart = max(workdayStart, prevApptEnd + travelFromPrevLocation + 5min buffer)
 *     latestStart   = min(workdayEnd - duration, nextApptStart - travelToNextLocation - 5min buffer - duration)
 *   If earliestStart + duration <= latestStart + duration, gap is usable.
 */
async function computeDayWindows(dayAppts, clientSuburb, durationMins, instructorBase, instructorEarliestStart) {
  const WORKDAY_START = timeToMins(instructorEarliestStart || "08:00");
  const WORKDAY_END = timeToMins("17:30"); // latest a lesson can START (ends by 18:30 at latest — adjust if needed)
  const LESSON_END_CAP = timeToMins("18:00");
  const BUFFER = 5;

  // Filter out any midnight-to-midnight events that slipped through block detection
  // and sort by start time
  const sorted = [...dayAppts]
    .filter(a => !(a.startTime === "00:00" && a.endTime === "00:00"))
    .filter(a => timeToMins(a.endTime) > timeToMins(a.startTime)) // skip zero-duration events
    .sort((a, b) => timeToMins(a.startTime) - timeToMins(b.startTime));

  // Build list of "fence posts": { time (end of prev / start of day), location }
  // We check gaps: [fencePost[i].time, sorted[i].startTime]

  const windows = [];

  // Helper: check a gap
  async function checkGap(gapStartMins, gapStartLocation, gapEndMins, gapEndLocation) {
    // Travel TO client from previous location
    const travelIn = await getTravelTime(gapStartLocation, clientSuburb);
    // Travel FROM client to next location
    const travelOut = gapEndLocation ? await getTravelTime(clientSuburb, gapEndLocation) : 0;

    const earliestStart = gapStartMins + travelIn + BUFFER;
    // Latest we can start so that: startTime + duration + travelOut + buffer <= gapEndMins
    const latestStart = gapEndMins - durationMins - travelOut - BUFFER;

    const clampedEarliest = Math.max(earliestStart, WORKDAY_START);
    const clampedLatest = Math.min(latestStart, WORKDAY_END);

    // Must also finish by LESSON_END_CAP
    const capLatest = Math.min(clampedLatest, LESSON_END_CAP - durationMins);

    if (clampedEarliest <= capLatest) {
      windows.push({
        earliestStart: minsToTime(clampedEarliest),
        latestStart: minsToTime(capLatest),
        travelIn,
        travelOut,
        prevLocation: gapStartLocation,
        nextLocation: gapEndLocation
      });
    }
  }

  if (sorted.length === 0) {
    // Entire day free — travel from base
    await checkGap(WORKDAY_START, instructorBase, LESSON_END_CAP, null);
  } else {
    // Gap before first appointment
    const first = sorted[0];
    await checkGap(WORKDAY_START, instructorBase, timeToMins(first.startTime), first.location);

    // Gaps between appointments
    for (let i = 0; i < sorted.length - 1; i++) {
      const prev = sorted[i];
      const next = sorted[i + 1];
      await checkGap(timeToMins(prev.endTime), prev.location, timeToMins(next.startTime), next.location);
    }

    // Gap after last appointment
    const last = sorted[sorted.length - 1];
    await checkGap(timeToMins(last.endTime), last.location, LESSON_END_CAP, null);
  }

  return windows;
}

// ─── Availability Parser ──────────────────────────────────────────────────────

// Time block definitions — maps label to [startMins, endMins]
const TIME_BLOCKS = {
  "early-morning": [timeToMins("08:00"), timeToMins("10:00")],
  "mid-morning":   [timeToMins("10:00"), timeToMins("12:00")],
  "afternoon":     [timeToMins("12:00"), timeToMins("14:00")],
  "late-afternoon":[timeToMins("14:00"), timeToMins("17:30")],
  "all-day":       [timeToMins("08:00"), timeToMins("17:30")],
  // Legacy AM/PM support
  "AM":            [timeToMins("08:00"), timeToMins("12:00")],
  "PM":            [timeToMins("12:00"), timeToMins("17:30")],
};

function parseAvailability(availStr) {
  // New format: "Tue:mid-morning, Thu:late-afternoon, Thu:all-day"
  // Legacy format: "Mon AM, Tue PM"
  // Returns: { Tue: ["mid-morning"], Thu: ["late-afternoon", "all-day"] }
  const result = {};
  if (!availStr || availStr === "No specific availability selected") return result;
  const parts = availStr.split(",").map(s => s.trim());
  parts.forEach(p => {
    // New format with colon
    if (p.includes(":")) {
      const [day, block] = p.split(":").map(s => s.trim());
      if (!result[day]) result[day] = [];
      if (block) result[day].push(block);
    } else {
      // Legacy space-separated
      const [day, period] = p.split(" ");
      if (!result[day]) result[day] = [];
      if (period) result[day].push(period);
    }
  });
  return result;
}

function windowMatchesAvailability(window, block) {
  if (!block) return true;
  const blockRange = TIME_BLOCKS[block];
  if (!blockRange) return true;
  const [blockStart, blockEnd] = blockRange;
  const winEarliest = timeToMins(window.earliestStart);
  const winLatest = timeToMins(window.latestStart);
  // Window overlaps with block range
  return winEarliest < blockEnd && winLatest >= blockStart;
}

// Given a window and a time block, find the best suggested start within that block
function bestStartInBlock(window, block, durationMins) {
  const winEarliest = timeToMins(window.earliestStart);
  const winLatest = timeToMins(window.latestStart);
  const blockRange = TIME_BLOCKS[block] || [winEarliest, winLatest];
  const [blockStart, blockEnd] = blockRange;

  // Clamp to both window and block
  const clampedEarliest = Math.max(winEarliest, blockStart);
  const clampedLatest = Math.min(winLatest, blockEnd - durationMins);

  if (clampedEarliest > clampedLatest) return null;

  // Snap up to nearest 15 mins
  const snapped = snapTo15(clampedEarliest);
  if (snapped > clampedLatest) return null;
  return minsToTime(snapped);
}

// ─── Routes ──────────────────────────────────────────────────────────────────

app.get("/", (req, res) => res.json({ status: "ok", message: "SDT Smart Backend is Live" }));
app.get("/health", (req, res) => res.json({ status: "ok", message: "SDT Smart Backend is Live and Running!" }));


app.get("/debug-diary", async (req, res) => {
  const now = new Date();
  const endDate = new Date(now.getTime() + 42 * 24 * 60 * 60 * 1000);
  const results = {};

  await Promise.all(INSTRUCTORS.map(async inst => {
    try {
      const rawData = await ical.async.fromURL(inst.icsUrl);
      const blockedDates = new Set();
      const appointments = {};
      const rawEvents = [];

      Object.values(rawData).forEach(e => {
        if (e.type !== "VEVENT") return;
        const start = new Date(e.start);
        const end = new Date(e.end);
        if (end < now || start > endDate) return;
        const dateStr = toMelbDateStr(start);
        const startTime = toMelbTimeStr(start);
        const endTime = toMelbTimeStr(end);
        const dur = (end - start) / (1000 * 60 * 60);
        const blocked = isBlockOutEvent(e);
        rawEvents.push({ dateStr, startTime, endTime, dur: dur.toFixed(1), summary: e.summary, datetype: e.datetype, blocked });
        if (blocked) {
          const d = new Date(start);
          while (toMelbDateStr(d) <= toMelbDateStr(end)) { blockedDates.add(toMelbDateStr(d)); d.setDate(d.getDate()+1); }
        } else {
          if (!(startTime === "00:00" && endTime === "00:00")) {
            if (!appointments[dateStr]) appointments[dateStr] = [];
            let dRaw = (e.location||"").replace(/^[^a-zA-Z0-9]+/,"").split(",")[0].trim();
            const dGarbled = !dRaw||dRaw.toLowerCase().includes("driving matters")||dRaw.toLowerCase()===inst.name.toLowerCase()||dRaw.split(" ").every(w=>/^[A-Z][a-z]+$/.test(w)&&w.length>2);
            appointments[dateStr].push({ startTime, endTime, location: dGarbled ? inst.base : dRaw });
          }
        }
      });

      results[inst.name] = {
        base: inst.base,
        mods: inst.mods,
        blockedDates: [...blockedDates].sort(),
        appointmentDays: Object.fromEntries(Object.entries(appointments).sort()),
        rawEventCount: rawEvents.length,
        rawEvents: rawEvents.sort((a,b) => a.dateStr.localeCompare(b.dateStr))
      };
    } catch(e) {
      results[inst.name] = { error: e.message };
    }
  }));

  res.json(results);
});

app.post("/analyse", async (req, res) => {
  const debugLog = [];
  try {
    const booking = req.body;
    const clientSuburb = booking.suburb;
    const durationMins = parseInt(booking.duration) || 60;

    if (!clientSuburb) return res.status(400).json({ error: "Missing suburb" });
    if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: "Missing ANTHROPIC_API_KEY" });
    if (!GOOGLE_MAPS_API_KEY) return res.status(500).json({ error: "Missing GOOGLE_MAPS_API_KEY" });

    const requiredMods = (booking.modifications || "").split(",").map(s => s.trim()).filter(Boolean);

    // ── 1. Filter instructors by mods ──
    // Fuzzy mod matching — "Standard Spinner", "spinner knob", "RHS spinner" all match "Spinner"
    // IMPORTANT: More specific keywords must come BEFORE general ones
    // e.g. "electronic spinner" before "spinner" to prevent wrong matching
    const MOD_KEYWORDS = {
      "left foot accelerator": "LFA",
      "left foot": "LFA",
      "lfa": "LFA",
      "electronic spinner": "Electronic Spinner",
      "e-spinner": "Electronic Spinner",
      "spinner knob": "Spinner",
      "standard spinner": "Spinner",
      "rhs spinner": "Spinner",
      "lhs spinner": "Spinner",
      "spinner": "Spinner",
      "hand controls": "Hand Controls",
      "hand control": "Hand Controls",
      "satellite accelerator": "Satellite",
      "satellite": "Satellite",
      "o-ring": "O-Ring",
      "oval ring": "O-Ring",
      "o ring": "O-Ring",
      "monarchs": "Monarchs",
      "monarch": "Monarchs",
      "extension pedals": "Extension Pedals",
      "extension pedal": "Extension Pedals",
    };

    // Normalise required mods to canonical names
    // Uses ordered MOD_KEYWORDS - more specific entries first to avoid wrong matches
    const normalisedMods = requiredMods.map(mod => {
      const lower = mod.toLowerCase().trim();
      for (const [kw, canonical] of Object.entries(MOD_KEYWORDS)) {
        // Use exact match OR whole-word boundary match
        if (lower === kw || lower === kw.toLowerCase()) return canonical;
        // For multi-word keywords, check if the full phrase is present
        if (kw.includes(" ") && lower.includes(kw)) return canonical;
        // For single-word keywords, match whole word only (not substring)
        if (!kw.includes(" ") && new RegExp(`\\b${kw}\\b`).test(lower)) return canonical;
      }
      return mod;
    });

    debugLog.push(`Normalised mods: ${normalisedMods.join(", ")}`);

    let eligibleInstructors = INSTRUCTORS.filter(inst => {
      if (normalisedMods.length === 0) return true;
      return normalisedMods.every(mod =>
        inst.mods.some(m => m.toLowerCase() === mod.toLowerCase())
      );
    });
    debugLog.push(`Eligible instructors: ${eligibleInstructors.map(i => i.name).join(", ")}`);

    // ── 2. Parse availability preference ──
    const availPref = parseAvailability(booking.availability);
    const prefDays = Object.keys(availPref); // e.g. ["Tue", "Thu"]

    // ── 3. Define date range ──
    const now = new Date();
    // Start from tomorrow
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() + 1);
    const endDate = new Date(now.getTime() + 42 * 24 * 60 * 60 * 1000);

    // Gabriel additional holiday block
    const gabrielHolidayStart = new Date("2026-04-25");
    const gabrielHolidayEnd = new Date("2026-04-30");

    // ── 4. Fetch all diaries ──
    debugLog.push("Fetching diaries...");
    const diaries = await Promise.all(eligibleInstructors.map(async inst => {
      try {
        const rawData = await ical.async.fromURL(inst.icsUrl);
        const blockedDates = new Set();
        const appointments = {};

        Object.values(rawData).forEach(e => {
          if (e.type !== "VEVENT") return;
          const start = new Date(e.start);
          const end = new Date(e.end);
          if (end < now || start > endDate) return;

          const dateStr = toMelbDateStr(start);

          if (isBlockOutEvent(e)) {
            const d = new Date(start);
            while (toMelbDateStr(d) <= toMelbDateStr(end)) {
              blockedDates.add(toMelbDateStr(d));
              d.setDate(d.getDate() + 1);
            }
            return;
          }

          const startTime = toMelbTimeStr(start);
          const endTime = toMelbTimeStr(end);

          if (startTime === "00:00" && endTime === "00:00") {
            blockedDates.add(dateStr);
            return;
          }

          if (!appointments[dateStr]) appointments[dateStr] = [];
          // Clean location: strip BOM/non-ASCII prefix chars, fall back to base if garbled or person-name
          let rawLoc = (e.location || "").replace(/^[^a-zA-Z0-9]+/, "").split(",")[0].trim();
          const isGarbledLocation = !rawLoc || 
            rawLoc.toLowerCase().includes("driving matters") ||
            rawLoc.toLowerCase() === inst.name.toLowerCase() ||
            rawLoc.split(" ").every(w => /^[A-Z][a-z]+$/.test(w) && w.length > 2);
          
          let cleanLoc = inst.base; // default fallback
          if (!isGarbledLocation) {
            cleanLoc = rawLoc;
          } else {
            // Location field is garbled (instructor's own name or company name)
            // Strategy: use the FIRST LINE of the appointment notes only
            // In Nookal, staff write the suburb on the first line under the client name
            // e.g. "GREENSBOROUGH\nLesson prior to local Ax..." → take "GREENSBOROUGH"
            // This avoids false matches like "BRUNSWICK EAST" from OT office references
            
            const notesText = (e.description || e.notes || e.summary || "");
            const firstLine = notesText.split(/\n|\r/)[0].trim();
            
            // Words that are definitely not suburbs (even if ALL CAPS on first line)
            const NOT_SUBURB = new Set([
              "HOLD","TEST","LESSON","NEW","INITIAL","PRE","PLEASE","COLLECT","NOTE",
              "NDIS","OT","TAC","SDT","LFA","AX","FROM","HOME","LOCAL","WITH","FOR",
              "TOTAL","ABILITY","VAN","MELBOURNE","SMARTBOX","RETURN","JAMIESON",
              "HOLIDAY","HOLIDAYS","CONFIRMED","PERSONAL","PRIVATE","EASTER","CAR",
              "SERVICE","AWAY","AND","THE","THIS","WILL","HAVE","THAT",
              "DRIVING","MATTERS","PTY","LTD",
              // Instructor names
              "JASON","GREG","MARC","CHRISTIAN","GABRIEL","SHERRI","YVES",
              "SIMMONDS","EKKEL","SEOW","SALZMANN","LAGOS"
            ]);
            
            // Check if first line looks like a suburb (ALL CAPS, 1-3 words, no punctuation)
            // e.g. "GREENSBOROUGH", "BOX HILL NORTH", "CAULFIELD SOUTH"
            const firstLineWords = firstLine.split(/\s+/).filter(w => w.length > 0);
            const isSuburbLine = firstLineWords.length >= 1 && 
              firstLineWords.length <= 4 &&
              firstLineWords.every(w => /^[A-Z][A-Z0-9]*$/.test(w)) &&
              !firstLineWords.some(w => NOT_SUBURB.has(w)) &&
              firstLine.length >= 3;
            
            if (isSuburbLine) {
              cleanLoc = firstLine;
            } else {
              // Fall back to scanning all lines for a suburb-like ALL CAPS line
              const allLines = notesText.split(/\n|\r/).map(l => l.trim()).filter(Boolean);
              for (const line of allLines.slice(0, 3)) { // only check first 3 lines
                const lineWords = line.split(/\s+/).filter(w => w.length > 0);
                if (lineWords.length >= 1 && lineWords.length <= 4 &&
                    lineWords.every(w => /^[A-Z][A-Z0-9]*$/.test(w)) &&
                    !lineWords.some(w => NOT_SUBURB.has(w)) &&
                    line.length >= 3) {
                  cleanLoc = line;
                  break;
                }
              }
            }
          }
          appointments[dateStr].push({
            startTime,
            endTime,
            location: cleanLoc,
            summary: e.summary || "",
            isHold: (e.summary || "").toUpperCase().includes("HOLD")
          });
        });

        // Gabriel extra holiday
        if (inst.name === "Gabriel") {
          const d = new Date(gabrielHolidayStart);
          while (d <= gabrielHolidayEnd) {
            blockedDates.add(toMelbDateStr(d));
            d.setDate(d.getDate() + 1);
          }
        }

        const apptDates = Object.keys(appointments).sort();
        debugLog.push(`${inst.name}: ${apptDates.length} days with appts (${apptDates.slice(0,8).join(', ')}${apptDates.length > 8 ? '...' : ''}), ${blockedDates.size} blocked (${[...blockedDates].sort().slice(0,5).join(', ')})`);
        return { inst, blockedDates, appointments };
      } catch (e) {
        debugLog.push(`${inst.name}: FAILED - ${e.message}`);
        return { inst, blockedDates: new Set(), appointments: {}, error: e.message };
      }
    }));

    // ── 4b. Pre-check base travel time for each instructor ──
    debugLog.push("Checking base travel times...");
    const baseTravelTimes = {};
    for (const diary of diaries) {
      const travelFromBase = await getTravelTime(diary.inst.base, clientSuburb);
      baseTravelTimes[diary.inst.name] = travelFromBase;
      debugLog.push(`${diary.inst.name} base→${clientSuburb}: ${travelFromBase} min (max: ${diary.inst.maxTravelMins || 60})`);
    }

    // ── 5. For each eligible instructor, find valid slots ──
    debugLog.push("Computing valid slots...");
    const validSlots = [];

    for (const diary of diaries) {
      const { inst, blockedDates, appointments } = diary;

      // Iterate every day in the 6-week window
      const d = new Date(startDate);
      while (d <= endDate) {
        const dateStr = toMelbDateStr(d);
        const dayName = getDayName(dateStr); // "Mon", "Tue", etc.

        // Skip weekends
        if (dayName === "Sat" || dayName === "Sun") {
          d.setDate(d.getDate() + 1);
          continue;
        }

        // Skip blocked dates
        if (blockedDates.has(dateStr)) {
          d.setDate(d.getDate() + 1);
          continue;
        }

        // Check if this day matches client preference
        const preferredPeriods = availPref[dayName];
        const dayIsPreferred = prefDays.length === 0 || preferredPeriods !== undefined;

        // HARD SKIP non-preferred days — only suggest them if zero preferred slots exist across 6 weeks
        if (!dayIsPreferred) {
          d.setDate(d.getDate() + 1);
          continue;
        }

        const baseTravel = baseTravelTimes[inst.name] || 0;
        const maxTravel = inst.maxTravelFromBase || inst.maxTravelMins || 60;

        // Hard zone instructors (e.g. Yves/Peninsula) — never suggest outside their zone
        if (inst.hardZone && baseTravel > maxTravel) {
          d.setDate(d.getDate() + 1);
          continue;
        }

        // For other instructors: if base travel exceeds max, only allow if working nearby
        // (this produces Tier 3 slots — still shown, but flagged)
        const dayAppts = appointments[dateStr] || [];
        if (!inst.allAreas && baseTravel > maxTravel * 1.4) {
          // Way too far even with nearby appointments — skip
          d.setDate(d.getDate() + 1);
          continue;
        }

        // Compute valid windows for this day
        const windows = await computeDayWindows(
          dayAppts,
          clientSuburb,
          durationMins,
          inst.base,
          inst.earliestStart
        );

        for (const window of windows) {
          const periods = preferredPeriods || [null];
          for (const period of periods) {
            if (windowMatchesAvailability(window, period)) {
              const suggestedStart = bestStartInBlock(window, period, durationMins);
              if (!suggestedStart) continue;

              // Filter: if actual travel-in exceeds instructor's max AND base is also far,
              // this slot is genuinely not feasible
              const instMaxTravel = inst.maxTravelMins || 60;
              const actualTravel = window.travelIn;
              if (actualTravel > instMaxTravel && baseTravel > instMaxTravel) {
                continue; // Both base and current location are too far
              }

              // Calculate recommendation tier
              const bTravel = baseTravelTimes[inst.name] || 999;
              const aTravel = window.travelIn;
              const maxT = inst.maxTravelFromBase || inst.maxTravelMins || 60;
              const inNaturalZone = inst.allAreas || bTravel <= maxT;
              const nearbyOnDay = aTravel <= 20;
              
              let tier;
              if (inNaturalZone && nearbyOnDay) tier = 1;        // ideal: in zone + nearby
              else if (inNaturalZone && !nearbyOnDay) tier = 2;  // good: in zone from base
              else if (!inNaturalZone && nearbyOnDay) tier = 3;  // ok: out of zone but nearby
              else tier = 4;                                       // stretch: out of zone, not nearby

              validSlots.push({
                instructor: inst.name,
                base: inst.base,
                mods: inst.mods,
                date: dateStr,
                dayName,
                suggestedStart,
                windowEarliest: window.earliestStart,
                windowLatest: window.latestStart,
                travelIn: window.travelIn,
                travelOut: window.travelOut,
                prevLocation: window.prevLocation,
                nextLocation: window.nextLocation,
                isPreferred: dayIsPreferred,
                period: period || "ANY",
                tier,
                slotNotes: booking.availabilityNotes?.[`${dayName}:${period}`] || "",
                appointmentsBefore: dayAppts.filter(a => timeToMins(a.endTime) <= timeToMins(suggestedStart)).length,
                appointmentsAfter: dayAppts.filter(a => timeToMins(a.startTime) >= timeToMins(suggestedStart) + durationMins).length,
                totalApptsThatDay: dayAppts.length
              });
              break;
            }
          }
        }

        d.setDate(d.getDate() + 1);
      }
    }

    debugLog.push(`Total valid slots found: ${validSlots.length}`);

    if (validSlots.length === 0) {
      // Build specific, actionable no-slots message
      const closestInst = eligibleInstructors
        .map(i => ({ name: i.name, travel: baseTravelTimes[i.name] || 999, zone: i.preferredZone }))
        .sort((a, b) => a.travel - b.travel)[0];

      const instLines = eligibleInstructors.map(i => {
        const t = baseTravelTimes[i.name] || "?";
        const inst = INSTRUCTORS.find(x => x.name === i.name);
        return `• ${i.name} (base: ${i.base}, ${t} min from ${clientSuburb}) — ${inst.preferredZone}`;
      }).join("\n");

      const availDesc = booking.availability || "not specified";

      const noSlotMsg = `No available slots found for ${booking.clientName} in ${clientSuburb} during their preferred availability (${availDesc}).

Eligible instructors with required modifications:
${instLines}

Why no slots were found:
All eligible instructors are either fully booked during the client's preferred time windows, or the client's suburb is outside their normal operating area without other nearby lessons planned on those days.

Suggested actions for admin:
1. Ask the client if they have any additional availability (different days or time blocks)
2. Check if ${closestInst ? closestInst.name : "the closest instructor"} has any upcoming days when they'll already be working near ${clientSuburb}
3. If urgent, speak directly with an instructor about a special arrangement`;

      return res.json({
        content: [{ type: "text", text: noSlotMsg }],
        _debug: debugLog
      });
    }

    // ── 6. Score and rank slots ──
    function scoreSlot(slot) {
      let score = 0;
      const baseTravel = baseTravelTimes[slot.instructor] || slot.travelIn;

      // TIER is the primary sorting signal
      // Tier 1 (in zone + nearby) always beats Tier 2, which beats Tier 3, which beats Tier 4
      if (slot.tier === 1) score += 500;
      else if (slot.tier === 2) score += 300;
      else if (slot.tier === 3) score += 100;
      else score -= 100; // Tier 4: stretch, show last
      
      // Within same tier: lower travel on the day = better
      score -= slot.travelIn * 5;
      
      // Bonus for being very close on the day
      if (slot.travelIn <= 5)  score += 150;
      else if (slot.travelIn <= 10) score += 100;
      else if (slot.travelIn <= 20) score += 50;

      // Within same tier: closer base = slightly better
      if (baseTravel <= 15) score += 40;
      else if (baseTravel <= 30) score += 20;
      else if (baseTravel > 55) score -= 30;

      // Earlier date = slightly better
      score -= (new Date(slot.date) - new Date()) / (1000 * 60 * 60 * 24) * 0.3;
      
      return score;
    }

    validSlots.sort((a, b) => scoreSlot(b) - scoreSlot(a));

    // Pick top 10 diverse slots: spread across instructors AND weeks where possible
    const selectedSlots = [];
    const usedDates = new Set();
    const usedInstructorWeeks = new Set();
    const instructorCounts = {};

    // First pass: prefer diversity — different instructors, different weeks
    for (const slot of validSlots) {
      if (selectedSlots.length >= 10) break;
      if (usedDates.has(slot.date)) continue; // no two slots on same date
      const weekKey = slot.date.substring(0, 8);
      const instWeekKey = slot.instructor + "|" + weekKey;
      // Allow max 2 slots per instructor total across all weeks in the selection
      const instCount = instructorCounts[slot.instructor] || 0;
      if (instCount >= 2) continue;
      if (usedInstructorWeeks.has(instWeekKey)) continue;
      selectedSlots.push(slot);
      usedDates.add(slot.date);
      usedInstructorWeeks.add(instWeekKey);
      instructorCounts[slot.instructor] = instCount + 1;
    }

    // Second pass: if < 3 slots, relax instructor limit but keep date uniqueness
    if (selectedSlots.length < 3) {
      for (const slot of validSlots) {
        if (selectedSlots.length >= 6) break;
        if (usedDates.has(slot.date)) continue;
        if (!selectedSlots.includes(slot)) {
          selectedSlots.push(slot);
          usedDates.add(slot.date);
        }
      }
    }

    // Final fallback: no constraints at all
    if (selectedSlots.length < 3) {
      for (const slot of validSlots) {
        if (selectedSlots.length >= 6) break;
        if (!selectedSlots.includes(slot)) selectedSlots.push(slot);
      }
    }

    debugLog.push(`Sending ${selectedSlots.length} slots to Claude for ranking`);

    // ── 7. Format slots for Claude ──
    const slotDescriptions = selectedSlots.map((s, i) => {
      const prevDesc = s.prevLocation === s.base
        ? `travelling from base (${s.base}, ${s.travelIn} min drive)`
        : `after lesson ending ${s.windowEarliest.replace(/^(\d+):(\d+)$/, (_, h, m) => {
            // work back to find the end time of the previous appt
            return s.windowEarliest;
          })} at ${s.prevLocation} (${s.travelIn} min drive to client)`;
      const nextDesc = s.nextLocation
        ? `next lesson at ${s.nextLocation} (${s.travelOut} min drive from client)`
        : "last lesson of day — no time pressure";
      const notesLine = s.slotNotes ? `\n  Client note: "${s.slotNotes}"` : "";
      const instData = INSTRUCTORS.find(i => i.name === s.instructor);
      const baseKm = baseTravelTimes[s.instructor] || "?";
      const tierLabels = {1: "Tier 1 — Ideal (in area, nearby on day)", 2: "Tier 2 — Good (in natural zone)", 3: "Tier 3 — Workable (outside zone but nearby on day)", 4: "Tier 4 — Stretch (outside zone, no nearby lessons)"};
      const tierLabel = tierLabels[s.tier] || "Unknown tier";
      const baseNote = `  Base: ${instData ? instData.base : "unknown"} → ${clientSuburb}: ${baseKm} min | Zone: ${instData ? instData.preferredZone : "unknown"}`;
      return `Slot ${i + 1}: ${s.instructor} — ${formatDate(s.date)} (${s.dayName}) at ${s.suggestedStart}
  ${tierLabel}
  Valid window: ${s.windowEarliest}–${s.windowLatest}
  Before: ${prevDesc}
  After: ${nextDesc}
  Day total: ${s.totalApptsThatDay} booking(s) that day
  Availability preference: ${s.period}
${baseNote}${notesLine}`;
    }).join("\n\n");

    const systemPrompt = `You are the SDT Booking Assistant for Specialised Driver Training in Melbourne.
Today is ${toMelbDateStr(now)}.

The backend has already computed valid, mathematically correct time slots with geographic tiers.

Your job:
1. Present the best 3 slots clearly
2. For each slot, explain: the day/time match, where the instructor is coming from, what's before and after
3. Apply the tier labels appropriately

TIER SYSTEM — always communicate tier clearly in your response:
• Tier 1 = Ideal: instructor is in their natural area AND already working nearby that day
• Tier 2 = Good: instructor is in their natural area (coming from base or nearby)  
• Tier 3 = Workable: instructor is outside usual area but already has lessons nearby that day — mention this explicitly: "Worth considering — [instructor] will already be in the area on [date]"
• Tier 4 = Stretch: instructor is outside usual area with no nearby lessons — always flag: "⚠️ Admin review needed — [instructor] would be travelling from [location] with no other lessons nearby. Only book after confirming with [instructor] that this works."

RULES:
- DO NOT invent dates or times — only use the pre-verified slots provided
- If all slots are same instructor because they're the only eligible one, say so clearly
- If a closer instructor had no gaps, mention: "[Name] is the more natural fit for [suburb] but had no available gaps during the client's preferred times"
- Always mention before/after appointments so admin can judge the day's logistics
- Keep language plain and practical — this is for office staff making booking decisions

Format each option as:
Option [N]: [Instructor]
Date: [DD/MM/YYYY — Day]
Time: [HH:MM]
Travel: [X min from [previous location or base]]
Why: [2-3 sentences: day/time match, where coming from, what's before and after on the day]
⚠️ Flag: [ONLY include if base travel >45 min AND a closer instructor exists with the same mods. Use: "Needs admin review — [instructor] base is [X] min from [suburb]. [Closer instructor] is the more natural fit but had no available gaps." Omit entirely if instructor is the closest/only option, or if they're already working nearby that day (travelIn <=20 min).]`;

    // Find geographically ideal instructor(s) for context
    const eligibleWithTravel = diaries.map(d => ({
      name: d.inst.name,
      base: d.inst.base,
      baseTravel: baseTravelTimes[d.inst.name] || 999
    })).sort((a, b) => a.baseTravel - b.baseTravel);
    
    const geoContext = eligibleWithTravel.map(i => 
      `${i.name} (base: ${i.base}, ${i.baseTravel} min from ${clientSuburb})`
    ).join(", ");

    // Instructors who have the mods but did NOT appear in slots (fully booked / no gaps)
    const instructorsInSlots = new Set(selectedSlots.map(s => s.instructor));
    const eligibleNotInSlots = eligibleWithTravel.filter(i => !instructorsInSlots.has(i.name));
    const missedContext = eligibleNotInSlots.length > 0
      ? `\nINSTRUCTORS WITH REQUIRED MODS BUT NO AVAILABLE GAPS: ${eligibleNotInSlots.map(i => `${i.name} (${i.baseTravel} min from ${clientSuburb} — fully booked during client's preferred times)`).join(", ")}`
      : "";

    const userMessage = `CLIENT: ${booking.clientName}
SUBURB: ${clientSuburb}
REQUIRED MODS: ${normalisedMods.join(", ") || "None"}
PREFERRED AVAILABILITY: ${booking.availability}
DURATION: ${durationMins} mins
FUNDING: ${booking.funding || "Not specified"}
INSTRUCTOR PREFERENCE: ${booking.instructorPreference || "None"}
GENDER PREFERENCE: ${booking.genderPreference || "No Preference"}
NOTES: ${booking.schedulingNotes || ""} ${booking.otherNotes || ""}

ELIGIBLE INSTRUCTORS BY DISTANCE FROM CLIENT (closest first):
${geoContext}${missedContext}

PRE-VERIFIED AVAILABLE SLOTS:
${slotDescriptions}

Please pick the best 3 options and explain each clearly. If the closest instructor(s) don't appear in the slots above, mention that they had no available gaps matching the client's preferences.`;

    debugLog.push("Calling Claude...");
    const aiRes = await axios.post("https://api.anthropic.com/v1/messages", {
      model: "claude-sonnet-4-20250514",
      max_tokens: 1500,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }]
    }, {
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
      }
    });

    debugLog.push("Success");
    res.json({ ...aiRes.data, _debug: debugLog });

  } catch (err) {
    console.error("ERROR:", err.message);
    let detail = err.message;
    if (err.response) detail = `HTTP ${err.response.status}: ${JSON.stringify(err.response.data).substring(0, 300)}`;
    res.status(500).json({ error: err.message, detail, debugLog });
  }
});

// ─── Nookal API Test Endpoint ────────────────────────────────────────────────
app.get("/test-nookal", async (req, res) => {
  const apiKey = process.env.NOOKAL_API_KEY;
  const clientId = process.env.NOOKAL_CLIENT_ID;

  if (!apiKey) {
    return res.json({ error: "Missing NOOKAL_API_KEY environment variable" });
  }

  const TOKEN_ENDPOINT = "https://au-apiv3.nookal.com/oauth/token";
  const GRAPHQL_ENDPOINT = "https://au-apiv3.nookal.com/graphql";
  const results = {};

  // STEP 1: Get OAuth access token
  let accessToken = null;
  try {
    const tokenResponse = await axios.post(
      TOKEN_ENDPOINT,
      "grant_type=client_credentials",
      {
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/x-www-form-urlencoded"
        },
        timeout: 10000
      }
    );
    accessToken = tokenResponse.data.accessToken || tokenResponse.data.access_token;
    results.token_obtained = !!accessToken;
  } catch (err) {
    results.token_request_error = {
      status: err.response?.status,
      detail: err.response?.data || err.message
    };
    return res.json(results);
  }

  const gqlHeaders = {
    "Authorization": `Bearer ${accessToken}`,
    "Content-Type": "application/json"
  };

  // STEP 2: Introspect schema — what fields does 'location' type have?
  try {
    const introspectQuery = `
      query {
        __type(name: "location") {
          name
          fields {
            name
            type { name kind }
          }
        }
      }
    `;
    const r = await axios.post(GRAPHQL_ENDPOINT, { query: introspectQuery }, { headers: gqlHeaders, timeout: 10000 });
    results.location_schema = r.data;
  } catch (err) {
    results.location_schema = { error: err.response?.data || err.message };
  }

  // STEP 3: Introspect top-level query fields — what queries are available?
  try {
    const queryListQuery = `
      query {
        __schema {
          queryType {
            fields {
              name
              args { name type { name kind } }
            }
          }
        }
      }
    `;
    const r = await axios.post(GRAPHQL_ENDPOINT, { query: queryListQuery }, { headers: gqlHeaders, timeout: 10000 });
    results.available_queries = r.data;
  } catch (err) {
    results.available_queries = { error: err.response?.data || err.message };
  }

  // STEP 4: Try a simple locations query with just 'name'
  try {
    const r = await axios.post(GRAPHQL_ENDPOINT, {
      query: `query { locations { name } }`
    }, { headers: gqlHeaders, timeout: 10000 });
    results.locations_simple = r.data;
  } catch (err) {
    results.locations_simple = { error: err.response?.data || err.message };
  }

  res.json({
    endpoints: { token: TOKEN_ENDPOINT, graphql: GRAPHQL_ENDPOINT },
    client_id: clientId,
    results
  });
});

app.listen(PORT, () => console.log(`SDT Smart Backend active on ${PORT}`));

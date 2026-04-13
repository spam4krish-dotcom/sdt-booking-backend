const express = require("express");
const cors = require("cors");
const ical = require("node-ical");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

// maxTravelMins: hard cap — instructor won't be suggested if base-to-client travel exceeds this
// preferredZone: description passed to Claude for context
const INSTRUCTORS = [
  {
    name: "Christian", base: "Montmorency",
    mods: ["LFA", "Spinner", "Electronic Spinner", "Hand Controls", "Satellite", "Extension Pedals"],
    maxTravelMins: 60,
    preferredZone: "North/Northeast Melbourne, inner eastern suburbs",
    icsUrl: "https://calsync.nookal.com/icsFile.php?HhXBkBCdHTLQaK4lrqfVa9ew%2FKnxwK8N60bfEsnM4Tix4fvM5lyQStblMTQiqaNaGeCeSgeSmXf%2F4kKI9OvU2fnXpnN%2FtMeidfD9E6WmLBWPsPF881mF4%2FDKjqX6mENEnlggTWF2jMn8Em8aKgSGXA%3D%3D"
  },
  {
    name: "Gabriel", base: "Croydon North",
    mods: ["LFA", "Spinner", "Electronic Spinner", "Hand Controls", "Satellite", "O-Ring", "Monarchs"],
    earliestStart: "09:30",
    maxTravelMins: 50,
    preferredZone: "Eastern suburbs, inner city, southeastern suburbs up to Frankston",
    icsUrl: "https://calsync.nookal.com/icsFile.php?HhXBkBCdHTLQaK4lrqfVa9ew%2FKnxwK8N60bfEsnM4Tix4fvM5lyQStblMTQiqaNaGeCeSgeSmXf%2F4kKI9OvU2a52GEgwyPVJ%2B0I6mOab2rD4%2Bmqr7EYvQGR9ykfeKAj%2F"
  },
  {
    name: "Greg", base: "Kilsyth",
    mods: ["LFA", "Spinner", "Electronic Spinner", "Monarchs"],
    maxTravelMins: 50,
    preferredZone: "Eastern and outer eastern suburbs",
    icsUrl: "https://calsync.nookal.com/icsFile.php?HhXBkBCdHTLQaK4lrqfVa9ew%2FKnxwK8N60bfEsnM4Tix4fvM5lyQStblMTQiqaNaGeCeSgeSmXf%2F4kKI9OvU2fgA7lzqZCrNH6P0mJPZWpJqu4G4d87qHmXHYUUq3ZhplneSIXp12lfHZzfvGyQdDw%3D%3D"
  },
  {
    name: "Jason", base: "Wandin North",
    mods: ["LFA", "Spinner"],
    maxTravelMins: 55,
    preferredZone: "Eastern and outer eastern suburbs, Yarra Valley",
    icsUrl: "https://calsync.nookal.com/icsFile.php?HhXBkBCdHTLQaK4lrqfVa9ew%2FKnxwK8N60bfEsnM4Tix4fvM5lyQStblMTQiqaNaGeCeSgeSmXf%2F4kKI9OvU2Sks8REnxfIzFLWWhJgXRykKsTkQKIlND6Q3P8UWc8WWFJCS5Y5gIU0xiqPfnSz%2FkQ%3D%3D"
  },
  {
    name: "Marc", base: "Werribee",
    mods: ["LFA", "Spinner", "Electronic Spinner", "Extension Pedals"],
    maxTravelMins: 55,
    preferredZone: "Western suburbs, southwestern suburbs",
    icsUrl: "https://calsync.nookal.com/icsFile.php?HhXBkBCdHTLQaK4lrqfVa9ew%2FKnxwK8N60bfEsnM4Tix4fvM5lyQStblMTQiqaNaGeCeSgeSmXf%2F4kKI9OvU2ecoRZN2xzdtmsUYY9vDrAuMuEJAzQSivaNXrwqSOqrMT982Jq4gficfE9XDNSVl0A%3D%3D"
  },
  {
    name: "Sherri", base: "Wandin North",
    mods: [],
    maxTravelMins: 45,
    preferredZone: "Eastern suburbs",
    icsUrl: "https://calsync.nookal.com/icsFile.php?HhXBkBCdHTLQaK4lrqfVa9ew%2FKnxwK8N60bfEsnM4Tix4fvM5lyQStblMTQiqaNaGeCeSgeSmXf%2F4kKI9OvU2Qm9F8eQzb%2B6bu2IC%2FLaNBOOWmK9yskJZYl8guOGtP67bXXfuA0nBVLMaaPL2rsqew%3D%3D"
  },
  {
    name: "Yves", base: "Rye",
    mods: ["LFA", "Spinner"],
    maxTravelMins: 30,
    preferredZone: "Mornington Peninsula only",
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
    const MOD_KEYWORDS = {
      "lfa": "LFA",
      "left foot": "LFA",
      "left foot accelerator": "LFA",
      "spinner": "Spinner",
      "spinner knob": "Spinner",
      "standard spinner": "Spinner",
      "rhs spinner": "Spinner",
      "lhs spinner": "Spinner",
      "electronic spinner": "Electronic Spinner",
      "e-spinner": "Electronic Spinner",
      "hand control": "Hand Controls",
      "hand controls": "Hand Controls",
      "satellite": "Satellite",
      "satellite accelerator": "Satellite",
      "o-ring": "O-Ring",
      "oval ring": "O-Ring",
      "o ring": "O-Ring",
      "monarchs": "Monarchs",
      "monarch": "Monarchs",
      "extension pedal": "Extension Pedals",
      "extension pedals": "Extension Pedals",
    };

    // Normalise required mods to canonical names
    const normalisedMods = requiredMods.map(mod => {
      const lower = mod.toLowerCase().trim();
      // Direct keyword lookup
      for (const [kw, canonical] of Object.entries(MOD_KEYWORDS)) {
        if (lower.includes(kw)) return canonical;
      }
      return mod; // keep original if no match
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
            // Try to extract suburb from the summary field
            // Summaries often contain suburb in ALL CAPS or after a dash
            // e.g. "Gabriel Keymer - LILYDALE to HEALESVILLE" or "Jesse Gattenhof MOOROOLBARK"
            const summary = e.summary || "";
            const suburbMatch = summary.match(/[-–]\s*([A-Z][A-Z\s]{2,}?)(?:\s+to\s+|\s*$)/);
            const capsMatch = summary.match(/([A-Z][A-Z]{3,}(?:\s+[A-Z]{2,})?)/);
            if (suburbMatch) {
              cleanLoc = suburbMatch[1].trim().replace(/\s+/g, " ");
            } else if (capsMatch && !["HOLD", "TEST", "LESSON", "NEW", "INITIAL", "PRE"].includes(capsMatch[1])) {
              cleanLoc = capsMatch[1].trim();
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

        // Note base travel for scoring - no hard cap, but used in scoring and flagging
        const baseTravel = baseTravelTimes[inst.name] || 0;

        const dayAppts = appointments[dateStr] || [];

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
      return res.json({
        content: [{ type: "text", text: "No available slots found for this client in the next 6 weeks matching their requirements and availability." }],
        _debug: debugLog
      });
    }

    // ── 6. Score and rank slots ──
    function scoreSlot(slot) {
      let score = 0;
      const baseTravel = baseTravelTimes[slot.instructor] || slot.travelIn;
      
      // Primary: travel from previous location (actual travel on the day)
      score -= slot.travelIn * 4;
      
      // Secondary: base travel as a geographic suitability signal
      // Heavily penalise if base is far away (instructor is geographically wrong for this client)
      if (baseTravel > 60) score -= 200;
      else if (baseTravel > 45) score -= 100;
      else if (baseTravel > 30) score -= 40;
      else if (baseTravel <= 15) score += 60; // bonus for nearby base
      
      // Earlier in the 6-week window = slightly better
      score -= (new Date(slot.date) - new Date()) / (1000 * 60 * 60 * 24);
      
      // Bonus if already working near client that day
      if (slot.travelIn <= 15) score += 80;
      
      return score;
    }

    validSlots.sort((a, b) => scoreSlot(b) - scoreSlot(a));

    // Pick top 10 diverse slots: enforce different instructors and spread across weeks
    // All slots here are already preferred-day only (non-preferred were hard-skipped above)
    const selectedSlots = [];
    const usedInstructorWeeks = new Set(); // key: instructor+week — max 1 slot per instructor per week

    for (const slot of validSlots) {
      if (selectedSlots.length >= 10) break;
      const weekKey = slot.instructor + "|" + slot.date.substring(0, 8); // YYYY-MM-D (Mon of week approx)
      // Allow same instructor in different weeks, but not same instructor same week
      if (usedInstructorWeeks.has(weekKey)) continue;
      selectedSlots.push(slot);
      usedInstructorWeeks.add(weekKey);
    }

    // Fallback: if we somehow have fewer than 3, relax the instructor-week constraint
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
      const baseNote = `  Base: ${instData ? instData.base : "unknown"} → ${clientSuburb}: ${baseKm} min drive`;
      return `Slot ${i + 1}: ${s.instructor} — ${formatDate(s.date)} (${s.dayName}) at ${s.suggestedStart}
  Valid window: ${s.windowEarliest}–${s.windowLatest}
  Before: ${prevDesc}
  After: ${nextDesc}
  Day total: ${s.totalApptsThatDay} booking(s) that day
  Preferred: YES (${s.period})
${baseNote}${notesLine}`;
    }).join("\n\n");

    const systemPrompt = `You are the SDT Booking Assistant for Specialised Driver Training in Melbourne.
Today is ${toMelbDateStr(now)}.

The backend has already computed valid, mathematically correct time slots — your job is ONLY to:
1. Pick the 3 best slots from the list provided
2. Explain WHY each is a good fit using plain language
3. Format them clearly

DO NOT invent new dates or times. DO NOT question the validity of the slots — they have been pre-verified.
DO NOT mention slots that aren't in the list.

Format each option as:
Option [N]: [Instructor]
Date: [DD/MM/YYYY — Day]
Time: [HH:MM]
Travel: [X min from previous location / base]
Why: [2-3 sentences covering: day/time match, where instructor is coming from, what's before and after]
⚠️ Flag: [ONLY include this line if base travel exceeds 45 min — write "Needs admin review — [instructor] is based in [base] which is [X] min from [suburb]. Confirm this works before booking.". Omit this line entirely if travel is reasonable.]`;

    const userMessage = `CLIENT: ${booking.clientName}
SUBURB: ${clientSuburb}
REQUIRED MODS: ${requiredMods.join(", ") || "None"}
PREFERRED AVAILABILITY: ${booking.availability}
DURATION: ${durationMins} mins
FUNDING: ${booking.funding || "Not specified"}
INSTRUCTOR PREFERENCE: ${booking.instructorPreference || "None"}
GENDER PREFERENCE: ${booking.genderPreference || "No Preference"}
NOTES: ${booking.schedulingNotes || ""} ${booking.otherNotes || ""}

PRE-VERIFIED AVAILABLE SLOTS:
${slotDescriptions}

Please pick the best 3 options and explain each clearly.`;

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

app.listen(PORT, () => console.log(`SDT Smart Backend active on ${PORT}`));

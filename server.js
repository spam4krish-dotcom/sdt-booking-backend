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
const INSTRUCTORS = [
  {
    name: "Christian",
    base: "Montmorency",
    mods: ["LFA", "Spinner", "Electronic Spinner", "Hand Controls", "Satellite", "Extension Pedals", "Indicator Extension"],
    allAreas: true,
    maxTravelFromBase: 65,
    preferredZone: "All Melbourne areas by arrangement",
    zoneSuburbs: [],
    icsUrl: "https://calsync.nookal.com/icsFile.php?HhXBkBCdHTLQaK4lrqfVa9ew%2FKnxwK8N60bfEsnM4Tix4fvM5lyQStblMTQiqaNaGeCeSgeSmXf%2F4kKI9OvU2fnXpnN%2FtMeidfD9E6WmLBWPsPF881mF4%2FDKjqX6mENEnlggTWF2jMn8Em8aKgSGXA%3D%3D"
  },
  {
    name: "Gabriel",
    base: "Croydon North",
    mods: ["LFA", "Spinner", "Electronic Spinner", "Hand Controls", "Satellite", "O-Ring", "Monarchs", "Indicator Extension"],
    earliestStart: "09:30",
    maxTravelFromBase: 55,
    zoneByArrangement: true,
    preferredZone: "East Melbourne — Croydon, Ringwood, Box Hill, Frankston corridor. Will go further by arrangement.",
    icsUrl: "https://calsync.nookal.com/icsFile.php?HhXBkBCdHTLQaK4lrqfVa9ew%2FKnxwK8N60bfEsnM4Tix4fvM5lyQStblMTQiqaNaGeCeSgeSmXf%2F4kKI9OvU2a52GEgwyPVJ%2B0I6mOab2rD4%2Bmqr7EYvQGR9ykfeKAj%2F"
  },
  {
    name: "Greg",
    base: "Kilsyth",
    mods: ["LFA", "Spinner", "Electronic Spinner", "Monarchs", "Indicator Extension"],
    maxTravelFromBase: 55,
    zoneByArrangement: true,
    preferredZone: "Extended East & South-East Melbourne — Kilsyth, Ringwood, Knox, Dandenong, Frankston, Bayside. Further by arrangement.",
    icsUrl: "https://calsync.nookal.com/icsFile.php?HhXBkBCdHTLQaK4lrqfVa9ew%2FKnxwK8N60bfEsnM4Tix4fvM5lyQStblMTQiqaNaGeCeSgeSmXf%2F4kKI9OvU2fgA7lzqZCrNH6P0mJPZWpJqu4G4d87qHmXHYUUq3ZhplneSIXp12lfHZzfvGyQdDw%3D%3D"
  },
  {
    name: "Jason",
    base: "Wandin North",
    mods: ["LFA", "Spinner"],
    maxTravelFromBase: 55,
    zoneByArrangement: true,
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
    zoneByArrangement: true,
    preferredZone: "Wandin to Ringwood radius. Will travel further if lessons are planned. Also covers Warragul area.",
    icsUrl: "https://calsync.nookal.com/icsFile.php?HhXBkBCdHTLQaK4lrqfVa9ew%2FKnxwK8N60bfEsnM4Tix4fvM5lyQStblMTQiqaNaGeCeSgeSmXf%2F4kKI9OvU2Qm9F8eQzb%2B6bu2IC%2FLaNBOOWmK9yskJZYl8guOGtP67bXXfuA0nBVLMaaPL2rsqew%3D%3D"
  },
  {
    name: "Yves",
    base: "Rye",
    mods: ["LFA", "Spinner", "Electronic Spinner", "Indicator Extension"],
    maxTravelFromBase: 35,
    hardZone: true,
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

function timeToMins(t) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
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
  if (e.datetype === "date") return true;

  const start = new Date(e.start);
  const end = new Date(e.end);
  const melbTZ = { timeZone: "Australia/Melbourne", hour: "2-digit", minute: "2-digit", hour12: false };
  const startHHMM = start.toLocaleTimeString("en-AU", melbTZ);
  const endHHMM = end.toLocaleTimeString("en-AU", melbTZ);
  if (startHHMM === "00:00" && endHHMM === "00:00") return true;

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
    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(origin + ", VIC, Australia")}&destinations=${encodeURIComponent(destination + ", VIC, Australia")}&mode=driving&key=${GOOGLE_MAPS_API_KEY}`;
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
async function computeDayWindows(dayAppts, clientSuburb, durationMins, instructorBase, instructorEarliestStart) {
  const WORKDAY_START = timeToMins(instructorEarliestStart || "08:00");
  const WORKDAY_END = timeToMins("17:30");
  const LESSON_END_CAP = timeToMins("18:00");
  const BUFFER = 5;

  const sorted = [...dayAppts]
    .filter(a => !(a.startTime === "00:00" && a.endTime === "00:00"))
    .filter(a => timeToMins(a.endTime) > timeToMins(a.startTime))
    .sort((a, b) => timeToMins(a.startTime) - timeToMins(b.startTime));

  const windows = [];

  async function checkGap(gapStartMins, gapStartLocation, gapEndMins, gapEndLocation) {
    const travelIn = await getTravelTime(gapStartLocation, clientSuburb);
    const travelOut = gapEndLocation ? await getTravelTime(clientSuburb, gapEndLocation) : 0;

    const earliestStart = gapStartMins + travelIn + BUFFER;
    const latestStart = gapEndMins - durationMins - travelOut - BUFFER;

    const clampedEarliest = Math.max(earliestStart, WORKDAY_START);
    const clampedLatest = Math.min(latestStart, WORKDAY_END);
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
    await checkGap(WORKDAY_START, instructorBase, LESSON_END_CAP, null);
  } else {
    const first = sorted[0];
    await checkGap(WORKDAY_START, instructorBase, timeToMins(first.startTime), first.location);

    for (let i = 0; i < sorted.length - 1; i++) {
      const prev = sorted[i];
      const next = sorted[i + 1];
      await checkGap(timeToMins(prev.endTime), prev.location, timeToMins(next.startTime), next.location);
    }

    const last = sorted[sorted.length - 1];
    await checkGap(timeToMins(last.endTime), last.location, LESSON_END_CAP, null);
  }

  return windows;
}

// ─── Availability Parser ──────────────────────────────────────────────────────
const TIME_BLOCKS = {
  "early-morning": [timeToMins("08:00"), timeToMins("10:00")],
  "mid-morning":   [timeToMins("10:00"), timeToMins("12:00")],
  "afternoon":     [timeToMins("12:00"), timeToMins("14:00")],
  "late-afternoon":[timeToMins("14:00"), timeToMins("17:30")],
  "all-day":       [timeToMins("08:00"), timeToMins("17:30")],
  "AM":            [timeToMins("08:00"), timeToMins("12:00")],
  "PM":            [timeToMins("12:00"), timeToMins("17:30")],
};

function parseAvailability(availStr) {
  const result = {};
  if (!availStr || availStr === "No specific availability selected") return result;
  const parts = availStr.split(",").map(s => s.trim());
  parts.forEach(p => {
    if (p.includes(":")) {
      const [day, block] = p.split(":").map(s => s.trim());
      if (!result[day]) result[day] = [];
      if (block) result[day].push(block);
    } else {
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
  return winEarliest < blockEnd && winLatest >= blockStart;
}

function bestStartInBlock(window, block, durationMins) {
  const winEarliest = timeToMins(window.earliestStart);
  const winLatest = timeToMins(window.latestStart);
  const blockRange = TIME_BLOCKS[block] || [winEarliest, winLatest];
  const [blockStart, blockEnd] = blockRange;

  const clampedEarliest = Math.max(winEarliest, blockStart);
  const clampedLatest = Math.min(winLatest, blockEnd - durationMins);

  if (clampedEarliest > clampedLatest) return null;
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

    const normalisedMods = requiredMods.map(mod => {
      const lower = mod.toLowerCase().trim();
      for (const [kw, canonical] of Object.entries(MOD_KEYWORDS)) {
        if (lower === kw || lower === kw.toLowerCase()) return canonical;
        if (kw.includes(" ") && lower.includes(kw)) return canonical;
        if (!kw.includes(" ") && new RegExp(`\\b${kw}\\b`).test(lower)) return canonical;
      }
      return mod;
    });

    let eligibleInstructors = INSTRUCTORS.filter(inst => {
      if (normalisedMods.length === 0) return true;
      return normalisedMods.every(mod =>
        inst.mods.some(m => m.toLowerCase() === mod.toLowerCase())
      );
    });

    const availPref = parseAvailability(booking.availability);
    const prefDays = Object.keys(availPref);
    const now = new Date();
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() + 1);
    const endDate = new Date(now.getTime() + 42 * 24 * 60 * 60 * 1000);

    const gabrielHolidayStart = new Date("2026-04-25");
    const gabrielHolidayEnd = new Date("2026-04-30");

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
          let rawLoc = (e.location || "").replace(/^[^a-zA-Z0-9]+/, "").split(",")[0].trim();
          const isGarbledLocation = !rawLoc || 
            rawLoc.toLowerCase().includes("driving matters") ||
            rawLoc.toLowerCase() === inst.name.toLowerCase() ||
            rawLoc.split(" ").every(w => /^[A-Z][a-z]+$/.test(w) && w.length > 2);
          
          let cleanLoc = inst.base;
          if (!isGarbledLocation) {
            cleanLoc = rawLoc;
          } else {
            const notesText = (e.description || e.notes || e.summary || "");
            const firstLine = notesText.split(/\n|\r/)[0].trim();
            const NOT_SUBURB = new Set(["HOLD","TEST","LESSON","NEW","INITIAL","PRE","PLEASE","COLLECT","NOTE","NDIS","OT","TAC","SDT","LFA","AX","FROM","HOME","LOCAL","WITH","FOR","TOTAL","ABILITY","VAN","MELBOURNE","SMARTBOX","RETURN","JAMIESON","HOLIDAY","HOLIDAYS","CONFIRMED","PERSONAL","PRIVATE","EASTER","CAR","SERVICE","AWAY","AND","THE","THIS","WILL","HAVE","THAT","DRIVING","MATTERS","PTY","LTD","JASON","GREG","MARC","CHRISTIAN","GABRIEL","SHERRI","YVES","SIMMONDS","EKKEL","SEOW","SALZMANN","LAGOS"]);
            const firstLineWords = firstLine.split(/\s+/).filter(w => w.length > 0);
            const isSuburbLine = firstLineWords.length >= 1 && firstLineWords.length <= 4 && firstLineWords.every(w => /^[A-Z][A-Z0-9]*$/.test(w)) && !firstLineWords.some(w => NOT_SUBURB.has(w)) && firstLine.length >= 3;
            
            if (isSuburbLine) {
              cleanLoc = firstLine;
            } else {
              const allLines = notesText.split(/\n|\r/).map(l => l.trim()).filter(Boolean);
              for (const line of allLines.slice(0, 3)) {
                const lineWords = line.split(/\s+/).filter(w => w.length > 0);
                if (lineWords.length >= 1 && lineWords.length <= 4 && lineWords.every(w => /^[A-Z][A-Z0-9]*$/.test(w)) && !lineWords.some(w => NOT_SUBURB.has(w)) && line.length >= 3) {
                  cleanLoc = line;
                  break;
                }
              }
            }
          }
          appointments[dateStr].push({ startTime, endTime, location: cleanLoc, summary: e.summary || "", isHold: (e.summary || "").toUpperCase().includes("HOLD") });
        });

        if (inst.name === "Gabriel") {
          const d = new Date(gabrielHolidayStart);
          while (d <= gabrielHolidayEnd) { blockedDates.add(toMelbDateStr(d)); d.setDate(d.getDate() + 1); }
        }
        return { inst, blockedDates, appointments };
      } catch (e) {
        return { inst, blockedDates: new Set(), appointments: {}, error: e.message };
      }
    }));

    const baseTravelTimes = {};
    for (const diary of diaries) {
      baseTravelTimes[diary.inst.name] = await getTravelTime(diary.inst.base, clientSuburb);
    }

    const validSlots = [];
    for (const diary of diaries) {
      const { inst, blockedDates, appointments } = diary;
      const d = new Date(startDate);
      while (d <= endDate) {
        const dateStr = toMelbDateStr(d);
        const dayName = getDayName(dateStr);
        if (dayName === "Sat" || dayName === "Sun" || blockedDates.has(dateStr)) { d.setDate(d.getDate() + 1); continue; }
        const preferredPeriods = availPref[dayName];
        if (prefDays.length !== 0 && preferredPeriods === undefined) { d.setDate(d.getDate() + 1); continue; }

        const baseTravel = baseTravelTimes[inst.name] || 0;
        const maxTravel = inst.maxTravelFromBase || inst.maxTravelMins || 60;
        if (inst.hardZone && baseTravel > maxTravel) { d.setDate(d.getDate() + 1); continue; }
        if (!inst.allAreas && baseTravel > maxTravel * 1.4) { d.setDate(d.getDate() + 1); continue; }

        const dayAppts = appointments[dateStr] || [];
        const windows = await computeDayWindows(dayAppts, clientSuburb, durationMins, inst.base, inst.earliestStart);

        for (const window of windows) {
          const periods = preferredPeriods || [null];
          for (const period of periods) {
            if (windowMatchesAvailability(window, period)) {
              const suggestedStart = bestStartInBlock(window, period, durationMins);
              if (!suggestedStart) continue;
              if (window.travelIn > (inst.maxTravelMins || 60) && baseTravel > (inst.maxTravelMins || 60)) continue;

              const bTravel = baseTravelTimes[inst.name] || 999;
              const aTravel = window.travelIn;
              const maxT = inst.maxTravelFromBase || inst.maxTravelMins || 60;
              const inNaturalZone = inst.allAreas || bTravel <= maxT;
              const nearbyOnDay = aTravel <= 20;
              
              let tier;
              if (inNaturalZone && nearbyOnDay) tier = 1;
              else if (inNaturalZone && !nearbyOnDay) tier = 2;
              else if (!inNaturalZone && nearbyOnDay) tier = 3;
              else tier = 4;

              validSlots.push({
                instructor: inst.name, base: inst.base, mods: inst.mods, date: dateStr, dayName, suggestedStart,
                windowEarliest: window.earliestStart, windowLatest: window.latestStart, travelIn: window.travelIn,
                travelOut: window.travelOut, prevLocation: window.prevLocation, nextLocation: window.nextLocation,
                isPreferred: true, period: period || "ANY", tier, slotNotes: booking.availabilityNotes?.[`${dayName}:${period}`] || "",
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

    if (validSlots.length === 0) {
      const closestInst = eligibleInstructors.map(i => ({ name: i.name, travel: baseTravelTimes[i.name] || 999 })).sort((a, b) => a.travel - b.travel)[0];
      return res.json({ content: [{ type: "text", text: `No slots found for ${booking.clientName}. Closest instructor is ${closestInst ? closestInst.name : "unknown"}.` }] });
    }

    validSlots.sort((a, b) => {
      let sa = a.tier === 1 ? 500 : a.tier === 2 ? 300 : a.tier === 3 ? 100 : 0;
      let sb = b.tier === 1 ? 500 : b.tier === 2 ? 300 : b.tier === 3 ? 100 : 0;
      return (sb - b.travelIn) - (sa - a.travelIn);
    });

    const selectedSlots = validSlots.slice(0, 10);
    const slotDescriptions = selectedSlots.map((s, i) => {
      const tierLabels = {1: "Tier 1 — Ideal", 2: "Tier 2 — Good", 3: "Tier 3 — Workable", 4: "Tier 4 — Stretch"};
      return `Slot ${i + 1}: ${s.instructor} — ${formatDate(s.date)} at ${s.suggestedStart} (${tierLabels[s.tier]})`;
    }).join("\n\n");

    const systemPrompt = `You are the SDT Booking Assistant. Today is ${toMelbDateStr(now)}.`;
    const userMessage = `CLIENT: ${booking.clientName}\nSUBURB: ${clientSuburb}\nVERIFIED SLOTS:\n${slotDescriptions}`;

    const aiRes = await axios.post("https://api.anthropic.com/v1/messages", {
      model: "claude-sonnet-4-20250514",
      max_tokens: 1500,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }]
    }, {
      headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" }
    });

    res.json(aiRes.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => console.log(`SDT Smart Backend active on ${PORT}`));

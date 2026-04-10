const express = require("express");
const cors = require("cors");
const ical = require("node-ical");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

const INSTRUCTORS = [
  {
    name: "Christian", base: "Montmorency",
    mods: ["LFA", "Spinner", "Hand Controls", "Satellite", "Indicator Extension", "Extension Pedals"],
    icsUrl: "https://calsync.nookal.com/icsFile.php?HhXBkBCdHTLQaK4lrqfVa9ew%2FKnxwK8N60bfEsnM4Tix4fvM5lyQStblMTQiqaNaGeCeSgeSmXf%2F4kKI9OvU2fnXpnN%2FtMeidfD9E6WmLBWPsPF881mF4%2FDKjqX6mENEnlggTWF2jMn8Em8aKgSGXA%3D%3D"
  },
  {
    name: "Gabriel", base: "Croydon North",
    mods: ["LFA", "Spinner", "Hand Controls", "Satellite", "Indicator Extension"],
    earliestStart: "09:30",
    icsUrl: "https://calsync.nookal.com/icsFile.php?HhXBkBCdHTLQaK4lrqfVa9ew%2FKnxwK8N60bfEsnM4Tix4fvM5lyQStblMTQiqaNaGeCeSgeSmXf%2F4kKI9OvU2a52GEgwyPVJ%2B0I6mOab2rD4%2Bmqr7EYvQGR9ykfeKAj%2F"
  },
  {
    name: "Greg", base: "Kilsyth",
    mods: ["LFA", "Spinner", "Indicator Extension"],
    icsUrl: "https://calsync.nookal.com/icsFile.php?HhXBkBCdHTLQaK4lrqfVa9ew%2FKnxwK8N60bfEsnM4Tix4fvM5lyQStblMTQiqaNaGeCeSgeSmXf%2F4kKI9OvU2fgA7lzqZCrNH6P0mJPZWpJqu4G4d87qHmXHYUUq3ZhplneSIXp12lfHZzfvGyQdDw%3D%3D"
  },
  {
    name: "Jason", base: "Wandin North",
    mods: ["LFA", "Spinner"],
    icsUrl: "https://calsync.nookal.com/icsFile.php?HhXBkBCdHTLQaK4lrqfVa9ew%2FKnxwK8N60bfEsnM4Tix4fvM5lyQStblMTQiqaNaGeCeSgeSmXf%2F4kKI9OvU2Sks8REnxfIzFLWWhJgXRykKsTkQKIlND6Q3P8UWc8WWFJCS5Y5gIU0xiqPfnSz%2FkQ%3D%3D"
  },
  {
    name: "Marc", base: "Werribee",
    mods: ["LFA", "Spinner", "Indicator Extension", "Extension Pedals"],
    icsUrl: "https://calsync.nookal.com/icsFile.php?HhXBkBCdHTLQaK4lrqfVa9ew%2FKnxwK8N60bfEsnM4Tix4fvM5lyQStblMTQiqaNaGeCeSgeSmXf%2F4kKI9OvU2ecoRZN2xzdtmsUYY9vDrAuMuEJAzQSivaNXrwqSOqrMT982Jq4gficfE9XDNSVl0A%3D%3D"
  },
  {
    name: "Sherri", base: "Wandin North",
    mods: [],
    icsUrl: "https://calsync.nookal.com/icsFile.php?HhXBkBCdHTLQaK4lrqfVa9ew%2FKnxwK8N60bfEsnM4Tix4fvM5lyQStblMTQiqaNaGeCeSgeSmXf%2F4kKI9OvU2Qm9F8eQzb%2B6bu2IC%2FLaNBOOWmK9yskJZYl8guOGtP67bXXfuA0nBVLMaaPL2rsqew%3D%3D"
  },
  {
    name: "Yves", base: "Rye",
    mods: ["LFA", "Spinner", "Indicator Extension"],
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
    "non-sdt", "late start after hols", "early finish", "confirmed",
    "no sdt", "not working", "away", "sick", "personal",
    "school pickup", "pickup", "school run", "pick up",
    "family", "appointment", "dentist", "doctor", "medical",
    "lunch", "break", "not available", "do not book", "dnb"
  ];
  if (blockWords.some(w => summary.includes(w))) return true;

  const start = new Date(e.start);
  const end = new Date(e.end);
  const durationHours = (end - start) / (1000 * 60 * 60);
  if (durationHours >= 5) return true;
  if (e.datetype === "date") return true;
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

  // Sort appointments by start time
  const sorted = [...dayAppts].sort((a, b) => timeToMins(a.startTime) - timeToMins(b.startTime));

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
    let eligibleInstructors = INSTRUCTORS.filter(inst => {
      if (requiredMods.length === 0) return true;
      return requiredMods.every(mod =>
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
          appointments[dateStr].push({
            startTime,
            endTime,
            location: (e.location || inst.base).split(",")[0].trim(),
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

        debugLog.push(`${inst.name}: ${Object.keys(appointments).length} days with appts, ${blockedDates.size} blocked dates`);
        return { inst, blockedDates, appointments };
      } catch (e) {
        debugLog.push(`${inst.name}: FAILED - ${e.message}`);
        return { inst, blockedDates: new Set(), appointments: {}, error: e.message };
      }
    }));

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

        // Check if this day matches client preference (if any)
        const preferredPeriods = availPref[dayName]; // e.g. ["AM"] or ["PM"] or undefined
        const dayIsPreferred = prefDays.length === 0 || preferredPeriods !== undefined;

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
    // Scoring: preferred day > geographic proximity > fewer travel minutes > earlier in the 6-week window
    function scoreSlot(slot) {
      let score = 0;
      if (slot.isPreferred) score += 1000;
      // Geographic: lower travel = better
      score -= slot.travelIn * 2;
      // Earlier in the window = slightly better
      score -= (new Date(slot.date) - new Date()) / (1000 * 60 * 60 * 24);
      return score;
    }

    validSlots.sort((a, b) => scoreSlot(b) - scoreSlot(a));

    // Pick top 10 diverse slots (spread across instructors and weeks) to send to Claude
    const selectedSlots = [];
    const usedWeeks = new Set();
    const usedInstructors = new Set();

    // First pass: preferred days, diverse instructors and weeks
    for (const slot of validSlots) {
      if (selectedSlots.length >= 10) break;
      if (!slot.isPreferred) continue;
      const week = slot.date.substring(0, 7); // YYYY-MM as rough week proxy
      selectedSlots.push(slot);
      usedWeeks.add(week);
      usedInstructors.add(slot.instructor);
    }

    // Second pass: fill up with non-preferred if needed
    for (const slot of validSlots) {
      if (selectedSlots.length >= 10) break;
      if (slot.isPreferred) continue;
      selectedSlots.push(slot);
    }

    debugLog.push(`Sending ${selectedSlots.length} slots to Claude for ranking`);

    // ── 7. Format slots for Claude ──
    const slotDescriptions = selectedSlots.map((s, i) => {
      const apptsBefore = s.appointmentsBefore > 0 ? `${s.appointmentsBefore} appt(s) before` : "first lesson of day";
      const apptsAfter = s.appointmentsAfter > 0 ? `${s.appointmentsAfter} appt(s) after` : "last lesson of day";
      const notesLine = s.slotNotes ? `\n  Client note for this slot: "${s.slotNotes}"` : "";
      return `Slot ${i + 1}: ${s.instructor} — ${formatDate(s.date)} (${s.dayName}) at ${s.suggestedStart}
  Window: ${s.windowEarliest}–${s.windowLatest} | Travel to client: ${s.travelIn} min from ${s.prevLocation} | Travel to next: ${s.travelOut > 0 ? s.travelOut + " min to " + s.nextLocation : "n/a (last lesson)"}
  Day context: ${apptsBefore}, ${apptsAfter} (${s.totalApptsThatDay} total bookings that day)
  Preferred slot: ${s.isPreferred ? "YES (" + s.period + ")" : "NO"}${notesLine}`;
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
Why: [Plain English explanation referencing travel time, day preference, geography]`;

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

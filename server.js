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
    icsUrl: "https://calsync.nookal.com/icsFile.php?HhXBkBCdHTLQaK4lrqfVa9ew%2FKnxwK8N60bfEsnM4Tix4fvM5lyQStblMTQiqaNaJ6xepUO6AS0mQIBuSqW%2BOWjh2dEdLM2ryJYQBbgLemmcR6jFHgrJeGdQCO3yfSW7dInaTI63gFq7aNCi2ArGCg%3D%3D"
  }
];

function toMelbDate(date) {
  return new Date(date).toLocaleDateString("en-CA", { timeZone: "Australia/Melbourne" });
}

function toMelbTime(date) {
  return new Date(date).toLocaleTimeString("en-AU", {
    timeZone: "Australia/Melbourne", hour: "2-digit", minute: "2-digit", hour12: false
  });
}

function isBlockOut(summary) {
  if (!summary) return false;
  const s = summary.toLowerCase();
  return s.includes("holiday") || s.includes("day off") || s.includes("no lesson") ||
    s.includes("leave") || s.includes("bali") || s.includes("travel") ||
    s.includes("unavailable") || s.includes("time held") || s.includes("private stuff") ||
    s.includes("car service") || s.includes("non-sdt");
}

async function getTravelTime(origin, destination) {
  if (!origin || !destination || origin === "Unknown" ||
    origin.toLowerCase() === destination.toLowerCase()) return 10;
  try {
    const url = `https://maps.googleapis.com/maps/api/distancematrix/json` +
      `?origins=${encodeURIComponent(origin + ", VIC, Australia")}` +
      `&destinations=${encodeURIComponent(destination + ", VIC, Australia")}` +
      `&mode=driving&key=${GOOGLE_MAPS_API_KEY}`;
    const res = await axios.get(url);
    const el = res.data.rows[0].elements[0];
    if (el.status === "OK") return Math.ceil(el.duration.value / 60);
    return 45;
  } catch (e) {
    return 45;
  }
}

app.get("/", (req, res) => res.json({ status: "ok", message: "SDT Smart Backend is Live" }));
app.get("/health", (req, res) => res.json({ status: "ok", message: "SDT Smart Backend is Live and Running!" }));

app.post("/analyse", async (req, res) => {
  const debugLog = [];
  try {
    const booking = req.body;
    const clientSuburb = booking.suburb;

    if (!clientSuburb) return res.status(400).json({ error: "Missing suburb in form data" });
    if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: "Missing ANTHROPIC_API_KEY" });
    if (!GOOGLE_MAPS_API_KEY) return res.status(500).json({ error: "Missing GOOGLE_MAPS_API_KEY" });

    // 1. Fetch and parse all diaries
    debugLog.push("Fetching diaries...");
    const now = new Date();
    const sixWeeksOut = new Date(now.getTime() + 42 * 24 * 60 * 60 * 1000);

    const diaries = await Promise.all(INSTRUCTORS.map(async inst => {
      try {
        const rawData = await ical.async.fromURL(inst.icsUrl);
        const blockedDates = new Set();
        const appointments = [];

        Object.values(rawData).forEach(e => {
          if (e.type !== "VEVENT") return;
          const start = new Date(e.start);
          const end = new Date(e.end);
          if (start > sixWeeksOut) return;
          if (end < now) return;

          const dateStr = toMelbDate(start);
          const summary = e.summary || "";

          // All-day block or holiday keyword = block entire day
          if (isBlockOut(summary)) {
            blockedDates.add(dateStr);
            return;
          }

          // Check if it's a genuine timed appointment
          const startTime = toMelbTime(start);
          const endTime = toMelbTime(end);

          // Skip if it looks like an all-day event with no real time
          if (startTime === "00:00" && endTime === "00:00") {
            blockedDates.add(dateStr);
            return;
          }

          const location = (e.location || "Unknown").split(",")[0].trim();
          appointments.push({
            date: dateStr,
            startTime: startTime,
            endTime: endTime,
            location: location,
            summary: summary,
            isHold: summary.toUpperCase().includes("HOLD")
          });
        });

        debugLog.push(`${inst.name}: ${appointments.length} appts, ${blockedDates.size} blocked days`);
        return { name: inst.name, base: inst.base, mods: inst.mods, blockedDates: [...blockedDates], appointments };
      } catch (e) {
        debugLog.push(`${inst.name}: FAILED - ${e.message}`);
        return { name: inst.name, base: inst.base, mods: inst.mods, blockedDates: [], appointments: [], error: e.message };
      }
    }));

    // 2. Get travel times from client suburb to all appointment locations + instructor bases
    debugLog.push("Getting travel times...");
    const allLocations = new Set();
    INSTRUCTORS.forEach(i => allLocations.add(i.base));
    diaries.forEach(d => d.appointments.forEach(a => {
      if (a.location && a.location !== "Unknown") allLocations.add(a.location);
    }));

    const travelTimes = {};
    for (const loc of allLocations) {
      travelTimes[loc] = await getTravelTime(loc, clientSuburb);
    }
    debugLog.push(`Travel times calculated for ${Object.keys(travelTimes).length} locations`);

    // 3. Build a clear structured diary summary for Claude
    const today = toMelbDate(now);
    let diarySummary = "";
    diaries.forEach(d => {
      diarySummary += `\n=== ${d.name} (base: ${d.base}, drive to client: ${travelTimes[d.base] || 45} mins) ===\n`;
      diarySummary += `Mods: ${d.mods.length > 0 ? d.mods.join(", ") : "NONE - standard vehicle only"}\n`;

      if (d.error) {
        diarySummary += `ERROR loading diary: ${d.error}\n`;
        return;
      }

      if (d.blockedDates.length > 0) {
        diarySummary += `FULLY BLOCKED DATES (do not book): ${d.blockedDates.join(", ")}\n`;
      }

      // Group appointments by date
      const byDate = {};
      d.appointments.forEach(a => {
        if (!byDate[a.date]) byDate[a.date] = [];
        byDate[a.date].push(a);
      });

      const sortedDates = Object.keys(byDate).sort();
      if (sortedDates.length === 0) {
        diarySummary += `No appointments found in next 6 weeks\n`;
      } else {
        sortedDates.forEach(date => {
          const dayAppts = byDate[date].sort((a, b) => a.startTime.localeCompare(b.startTime));
          diarySummary += `${date}:\n`;
          dayAppts.forEach(a => {
            const travelFromHere = travelTimes[a.location] || 45;
            const earliestNext = `earliest next slot after this: ${a.endTime} + ${travelFromHere}min travel + 5min buffer`;
            diarySummary += `  ${a.startTime}-${a.endTime} | ${a.location} | ${a.summary}${a.isHold ? " [HOLD]" : ""} | (${earliestNext})\n`;
          });
        });
      }
    });

    // 4. Call Claude with structured data
    const systemPrompt = `You are the SDT Booking Assistant for Specialised Driver Training in Melbourne.
Today is ${today}.

YOUR JOB: Find the 3 best available slots for this client across the next 6 weeks. Look across ALL upcoming weeks, not just the nearest date.

CRITICAL RULES:
1. MODS: If client needs modifications, only recommend instructors who have those mods. Sherri has NO mods.
2. BLOCKED DATES: Never book an instructor on a blocked date. These are holidays, days off, car service days etc.
3. EXISTING APPOINTMENTS: Never double-book. If an instructor has an appointment at 9:30am, they are NOT available at 9:30am.
4. SLOT CALCULATION: After an appointment ends, add travel time to client suburb + 5 min buffer before they can start the next lesson.
   Formula: [Last appt end time] + [travel mins from that location to client] + 5 mins = earliest available start
5. EMPTY DAYS: If an instructor has no appointments on a day (and it is not blocked), they are available from 8:00am.
6. GEOGRAPHIC ROUTING: Prefer slots where the new booking fits naturally into the instructor's day without long dead runs.
7. LOOK AHEAD: Provide options spread across different weeks where possible - do not just suggest one date.
8. GABRIEL: On holiday 25 Apr - 30 Apr 2026.

OUTPUT FORMAT - provide exactly 3 options, ranked best to worst:
Option [N]: [Instructor name]
Date: [DD/MM/YYYY - Day name]
Time: [HH:MM AM/PM]
Why: [One sentence explaining why this slot works - reference actual diary entries and travel times]
Travel to client: [X mins from their last location or base]`;

    const userMessage = `CLIENT: ${booking.clientName}
SUBURB: ${clientSuburb}
AVAILABILITY PREFERENCE: ${booking.availability}
DURATION: ${booking.duration || "60 mins"}
MODIFICATIONS NEEDED: ${booking.modifications || "None"}
FUNDING: ${booking.funding || "Not specified"}

INSTRUCTOR DIARIES AND TRAVEL TIMES:
${diarySummary}`;

    debugLog.push("Calling Anthropic API...");
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
    let errorDetail = err.message;
    if (err.response) {
      errorDetail = `HTTP ${err.response.status} from ${err.config?.url}: ${JSON.stringify(err.response.data).substring(0, 300)}`;
    }
    res.status(500).json({
      error: "Analysis failed: " + err.message,
      errorDetail: errorDetail,
      debugLog: debugLog
    });
  }
});

app.listen(PORT, () => console.log(`SDT Smart Backend active on ${PORT}`));

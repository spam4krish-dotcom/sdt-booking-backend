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

function toMelbHour(date) {
  return new Date(date).getHours();
}

// Detect if an event should block the whole day
function isBlockOutEvent(e) {
  const summary = (e.summary || "").toLowerCase();
  
  // Keyword based blocks
  const blockWords = [
    "holiday", "day off", "no lesson", "leave", "bali", "travel", 
    "unavailable", "time held", "private stuff", "car service", 
    "non-sdt", "late start after hols", "early finish", "confirmed",
    "no sdt", "not working", "away", "sick", "personal"
  ];
  if (blockWords.some(w => summary.includes(w))) return true;

  // Duration based - if event spans more than 5 hours treat as block
  const start = new Date(e.start);
  const end = new Date(e.end);
  const durationHours = (end - start) / (1000 * 60 * 60);
  if (durationHours >= 5) return true;

  // All-day event type
  if (e.datetype === "date") return true;

  return false;
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

    if (!clientSuburb) return res.status(400).json({ error: "Missing suburb" });
    if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: "Missing ANTHROPIC_API_KEY" });
    if (!GOOGLE_MAPS_API_KEY) return res.status(500).json({ error: "Missing GOOGLE_MAPS_API_KEY" });

    // 1. Fetch diaries
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
          if (end < now || start > sixWeeksOut) return;

          const dateStr = toMelbDate(start);

          if (isBlockOutEvent(e)) {
            // Block all days this event spans
            const d = new Date(start);
            while (d <= end) {
              blockedDates.add(toMelbDate(d));
              d.setDate(d.getDate() + 1);
            }
            return;
          }

          const startTime = toMelbTime(start);
          const endTime = toMelbTime(end);

          // Skip midnight-to-midnight events
          if (startTime === "00:00" && endTime === "00:00") {
            blockedDates.add(dateStr);
            return;
          }

          const location = (e.location || "Unknown").split(",")[0].trim();
          appointments.push({
            date: dateStr,
            startTime,
            endTime,
            location,
            summary: e.summary || "",
            isHold: (e.summary || "").toUpperCase().includes("HOLD")
          });
        });

        debugLog.push(`${inst.name}: ${appointments.length} appts, blocked: ${[...blockedDates].slice(0,5).join(", ")}`);
        return { name: inst.name, base: inst.base, mods: inst.mods, blockedDates: [...blockedDates], appointments };
      } catch (e) {
        debugLog.push(`${inst.name}: FAILED - ${e.message}`);
        return { name: inst.name, base: inst.base, mods: inst.mods, blockedDates: [], appointments: [], error: e.message };
      }
    }));

    // 2. Travel times
    debugLog.push("Getting travel times...");
    const allLocations = new Set(INSTRUCTORS.map(i => i.base));
    diaries.forEach(d => d.appointments.forEach(a => {
      if (a.location && a.location !== "Unknown") allLocations.add(a.location);
    }));

    const travelTimes = {};
    for (const loc of allLocations) {
      travelTimes[loc] = await getTravelTime(loc, clientSuburb);
    }

    // 3. Build diary summary
    let diarySummary = "";
    diaries.forEach(d => {
      diarySummary += `\n=== ${d.name} (base: ${d.base}, drive from base to ${clientSuburb}: ${travelTimes[d.base] || 45} mins) ===\n`;
      diarySummary += `Mods available: ${d.mods.length > 0 ? d.mods.join(", ") : "NONE"}\n`;
      if (d.error) { diarySummary += `ERROR loading diary\n`; return; }
      if (d.blockedDates.length > 0) {
        diarySummary += `BLOCKED DATES (unavailable all day): ${d.blockedDates.sort().join(", ")}\n`;
      }

      const byDate = {};
      d.appointments.forEach(a => {
        if (!byDate[a.date]) byDate[a.date] = [];
        byDate[a.date].push(a);
      });

      const sortedDates = Object.keys(byDate).sort();
      if (sortedDates.length === 0) {
        diarySummary += `No appointments in diary for next 6 weeks\n`;
      } else {
        sortedDates.forEach(date => {
          const dayAppts = byDate[date].sort((a, b) => a.startTime.localeCompare(b.startTime));
          diarySummary += `${date}:\n`;
          dayAppts.forEach(a => {
            const travelFromHere = travelTimes[a.location] || 45;
            const bufferMins = travelFromHere + 5;
            diarySummary += `  BOOKED ${a.startTime}-${a.endTime} at ${a.location}${a.isHold ? " [HOLD]" : ""} — next slot earliest: ${a.endTime} + ${bufferMins}min (${travelFromHere}min travel + 5min buffer)\n`;
          });
        });
      }
    });

    const today = toMelbDate(now);
    const systemPrompt = `You are the SDT Booking Assistant for Specialised Driver Training in Melbourne.
Today is ${today}.

YOUR JOB: Find the 3 best available time slots for this client across the next 6 weeks.

ABSOLUTE RULES - these cannot be broken:
1. NEVER book an instructor on a BLOCKED DATE. If a date appears in their blocked dates list, they are completely unavailable that entire day.
2. NEVER double-book. If a time slot shows as BOOKED, the instructor is not available at that time.
3. HOLD entries count as BOOKED - never book over a HOLD.
4. After a BOOKED slot, the instructor cannot start the next lesson until: end time + travel mins to client + 5 min buffer.
5. MODS: Only recommend instructors who have the required mods. Sherri has NO mods.
6. GABRIEL: Additional holiday block 25 Apr - 30 Apr 2026. Gabriel does not start before 09:30.
7. WEEKENDS: Do not suggest Saturday or Sunday slots.
8. WORKING HOURS: No lessons before 08:00 or after 17:30.
9. Look across ALL 6 weeks - spread options across different weeks where possible.
10. If an instructor has NO appointments on a day (and it is NOT blocked), they are available from 08:00.
11. GEOGRAPHIC PREFERENCE: Prefer instructors who are already working near the client suburb that day.

OUTPUT: Provide exactly 3 options ranked best to worst. Format each as:
Option [N]: [Instructor]
Date: [DD/MM/YYYY - Day]
Time: [HH:MM]
Why: [Specific reason referencing actual diary data and travel time]`;

    const userMessage = `CLIENT: ${booking.clientName}
SUBURB: ${clientSuburb}
PREFERRED AVAILABILITY: ${booking.availability}
DURATION: ${booking.duration || "60 mins"}
MODIFICATIONS NEEDED: ${booking.modifications || "None"}
FUNDING: ${booking.funding || "Not specified"}

DIARY DATA (next 6 weeks):
${diarySummary}`;

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

const express = require("express");
const cors = require("cors");
const ical = require("node-ical");

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());

// ─── INSTRUCTOR DATABASE ─────────────────────────────────────────────────────
const INSTRUCTORS = [
  {
    name: "Christian",
    gender: "Male",
    mods: ["LFA", "Spinner", "Hand Controls", "Satellite", "Indicator Extension", "Extension Pedals"],
    base: "Montmorency",
    notes: "Covers all areas by arrangement. Full modifications vehicle.",
    icsUrl: "https://calsync.nookal.com/icsFile.php?HhXBkBCdHTLQaK4lrqfVa9ew%2FKnxwK8N60bfEsnM4Tix4fvM5lyQStblMTQiqaNaGeCeSgeSmXf%2F4kKI9OvU2fnXpnN%2FtMeidfD9E6WmLBWPsPF881mF4%2FDKjqX6mENEnlggTWF2jMn8Em8aKgSGXA%3D%3D"
  },
  {
    name: "Gabriel",
    gender: "Male",
    mods: ["LFA", "Spinner", "Hand Controls", "Satellite", "Indicator Extension"],
    base: "Croydon North",
    notes: "Prefers East Melbourne but flexible. ON HOLIDAY 25 Apr 2026 to 30 Apr 2026 — do NOT book on these dates.",
    icsUrl: "https://calsync.nookal.com/icsFile.php?HhXBkBCdHTLQaK4lrqfVa9ew%2FKnxwK8N60bfEsnM4Tix4fvM5lyQStblMTQiqaNaGeCeSgeSmXf%2F4kKI9OvU2a52GEgwyPVJ%2B0I6mOab2rD4%2Bmqr7EYvQGR9ykfeKAj%2F"
  },
  {
    name: "Greg",
    gender: "Male",
    mods: ["LFA", "Spinner", "Indicator Extension"],
    base: "Kilsyth",
    notes: "Extended East and South-East coverage.",
    icsUrl: "https://calsync.nookal.com/icsFile.php?HhXBkBCdHTLQaK4lrqfVa9ew%2FKnxwK8N60bfEsnM4Tix4fvM5lyQStblMTQiqaNaGeCeSgeSmXf%2F4kKI9OvU2fgA7lzqZCrNH6P0mJPZWpJqu4G4d87qHmXHYUUq3ZhplneSIXp12lfHZzfvGyQdDw%3D%3D"
  },
  {
    name: "Jason",
    gender: "Male",
    mods: ["LFA", "Spinner"],
    base: "Wandin North",
    notes: "East and South-East up to Bayside wedge only.",
    icsUrl: "https://calsync.nookal.com/icsFile.php?HhXBkBCdHTLQaK4lrqfVa9ew%2FKnxwK8N60bfEsnM4Tix4fvM5lyQStblMTQiqaNaGeCeSgeSmXf%2F4kKI9OvU2Sks8REnxfIzFLWWhJgXRykKsTkQKIlND6Q3P8UWc8WWFJCS5Y5gIU0xiqPfnSz%2FkQ%3D%3D"
  },
  {
    name: "Marc",
    gender: "Male",
    mods: ["LFA", "Spinner", "Indicator Extension", "Extension Pedals"],
    base: "Werribee",
    notes: "West Melbourne specialist.",
    icsUrl: "https://calsync.nookal.com/icsFile.php?HhXBkBCdHTLQaK4lrqfVa9ew%2FKnxwK8N60bfEsnM4Tix4fvM5lyQStblMTQiqaNaGeCeSgeSmXf%2F4kKI9OvU2ecoRZN2xzdtmsUYY9vDrAuMuEJAzQSivaNXrwqSOqrMT982Jq4gficfE9XDNSVl0A%3D%3D"
  },
  {
    name: "Sherri",
    gender: "Female",
    mods: [],
    base: "Wandin North",
    notes: "STANDARD LESSONS ONLY. Cannot perform any vehicle modifications whatsoever.",
    icsUrl: "https://calsync.nookal.com/icsFile.php?HhXBkBCdHTLQaK4lrqfVa9ew%2FKnxwK8N60bfEsnM4Tix4fvM5lyQStblMTQiqaNaGeCeSgeSmXf%2F4kKI9OvU2Qm9F8eQzb%2B6bu2IC%2FLaNBOOWmK9yskJZYl8guOGtP67bXXfuA0nBVLMaaPL2rsqew%3D%3D"
  },
  {
    name: "Yves",
    gender: "Male",
    mods: ["LFA", "Spinner", "Indicator Extension"],
    base: "Rye",
    notes: "Mornington Peninsula specialist.",
    icsUrl: "https://calsync.nookal.com/icsFile.php?HhXBkBCdHTLQaK4lrqfVa9ew%2FKnxwK8N60bfEsnM4Tix4fvM5lyQStblMTQiqaNaJ6xepUO6AS0mQIBuSqW%2BOWjh2dEdLM2ryJYQBbgLemmcR6jFHgrJeGdQCO3yfSW7dInaTI63gFq7aNCi2ArGCg%3D%3D"
  }
];

// ─── HELPERS ─────────────────────────────────────────────────────────────────

// Robust Melbourne Date Formatter
const melbOptions = { timeZone: 'Australia/Melbourne', hour12: true };

async function fetchInstructorCalendar(instructor) {
  try {
    const rawData = await Promise.race([
      ical.async.fromURL(instructor.icsUrl),
      new Promise((_, reject) => setTimeout(() => reject(new Error("ICS timeout")), 12000))
    ]);

    const now = new Date();
    const future = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const appts = [];

    for (const key in rawData) {
      const event = rawData[key];
      if (event.type !== "VEVENT") continue;

      const start = new Date(event.start);
      const end = new Date(event.end);
      if (isNaN(start.getTime()) || start < now || start > future) continue;

      appts.push({
        startISO: start.toISOString(),
        date: start.toLocaleDateString("en-AU", { ...melbOptions, weekday: "short", day: "numeric", month: "short" }),
        startTime: start.toLocaleTimeString("en-AU", { ...melbOptions, hour: "2-digit", minute: "2-digit" }),
        endTime: end.toLocaleTimeString("en-AU", { ...melbOptions, hour: "2-digit", minute: "2-digit" }),
        summary: event.summary || "Appointment",
        location: event.location || "",
        notes: (event.description || "").replace(/\n/g, " ").trim()
      });
    }
    // Reduced logging to avoid Railway rate limits
    return appts.sort((a, b) => new Date(a.startISO) - new Date(b.startISO));
  } catch (err) {
    return [];
  }
}

// (The rest of your Nookal and Suburb detection logic remains unchanged)
// ...

app.post("/analyse", async (req, res) => {
  try {
    const booking = req.body;
    const diaries = await Promise.all(INSTRUCTORS.map(async i => ({
      name: i.name,
      base: i.base,
      mods: i.mods,
      appointments: await fetchInstructorCalendar(i)
    })));

    // Your Travel Table calculation
    const travelInfo = ""; // Placeholder for your buildInterApptTravelTable call

    const systemPrompt = `You are the SDT Booking Assistant. 
STRICT SPEED RULES: Find 3 valid options and STOP. Do not analyze the whole month.
LOGIC: Exclude Sherri if mods are needed. 
FORMAT: No bolding. Plain text only.
Date Context: Today is ${new Date().toLocaleDateString("en-AU", melbOptions)}.`;

    const userMessage = `
CLIENT: ${booking.clientName}
SUBURB: ${booking.suburb}
MODS: ${booking.modifications}
DIARIES: ${JSON.stringify(diaries)}
TRAVEL TIMES: ${travelInfo}`;

    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6", // Ensure this matches your API tier
        max_tokens: 1000,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }]
      })
    });

    const data = await aiRes.json();
    
    // Safety check for empty content
    if (data.error) {
        throw new Error(`Anthropic API Error: ${data.error.message}`);
    }

    res.json(data);

  } catch (err) {
    console.error("ANALYSIS ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => console.log(`SDT Backend Active on Port ${PORT}`));

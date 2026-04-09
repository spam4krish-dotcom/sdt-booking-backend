const express = require("express");
const cors = require("cors");
const ical = require("node-ical");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
const melbOptions = { timeZone: 'Australia/Melbourne', hour12: true };

// ─── INSTRUCTOR DATABASE ─────────────────────────────────────────────────────
const INSTRUCTORS = [
  {
    name: "Christian",
    mods: ["LFA", "Spinner", "Hand Controls", "Satellite", "Indicator Extension", "Extension Pedals"],
    icsUrl: "https://calsync.nookal.com/icsFile.php?HhXBkBCdHTLQaK4lrqfVa9ew%2FKnxwK8N60bfEsnM4Tix4fvM5lyQStblMTQiqaNaGeCeSgeSmXf%2F4kKI9OvU2fnXpnN%2FtMeidfD9E6WmLBWPsPF881mF4%2FDKjqX6mENEnlggTWF2jMn8Em8aKgSGXA%3D%3D"
  },
  {
    name: "Gabriel",
    mods: ["LFA", "Spinner", "Hand Controls", "Satellite", "Indicator Extension"],
    icsUrl: "https://calsync.nookal.com/icsFile.php?HhXBkBCdHTLQaK4lrqfVa9ew%2FKnxwK8N60bfEsnM4Tix4fvM5lyQStblMTQiqaNaGeCeSgeSmXf%2F4kKI9OvU2a52GEgwyPVJ%2B0I6mOab2rD4%2Bmqr7EYvQGR9ykfeKAj%2F"
  },
  {
    name: "Greg",
    mods: ["LFA", "Spinner", "Indicator Extension"],
    icsUrl: "https://calsync.nookal.com/icsFile.php?HhXBkBCdHTLQaK4lrqfVa9ew%2FKnxwK8N60bfEsnM4Tix4fvM5lyQStblMTQiqaNaGeCeSgeSmXf%2F4kKI9OvU2fgA7lzqZCrNH6P0mJPZWpJqu4G4d87qHmXHYUUq3ZhplneSIXp12lfHZzfvGyQdDw%3D%3D"
  },
  {
    name: "Jason",
    mods: ["LFA", "Spinner"],
    icsUrl: "https://calsync.nookal.com/icsFile.php?HhXBkBCdHTLQaK4lrqfVa9ew%2FKnxwK8N60bfEsnM4Tix4fvM5lyQStblMTQiqaNaGeCeSgeSmXf%2F4kKI9OvU2Sks8REnxfIzFLWWhJgXRykKsTkQKIlND6Q3P8UWc8WWFJCS5Y5gIU0xiqPfnSz%2FkQ%3D%3D"
  },
  {
    name: "Marc",
    mods: ["LFA", "Spinner", "Indicator Extension", "Extension Pedals"],
    icsUrl: "https://calsync.nookal.com/icsFile.php?HhXBkBCdHTLQaK4lrqfVa9ew%2FKnxwK8N60bfEsnM4Tix4fvM5lyQStblMTQiqaNaGeCeSgeSmXf%2F4kKI9OvU2ecoRZN2xzdtmsUYY9vDrAuMuEJAzQSivaNXrwqSOqrMT982Jq4gficfE9XDNSVl0A%3D%3D"
  },
  {
    name: "Sherri",
    mods: [],
    icsUrl: "https://calsync.nookal.com/icsFile.php?HhXBkBCdHTLQaK4lrqfVa9ew%2FKnxwK8N60bfEsnM4Tix4fvM5lyQStblMTQiqaNaGeCeSgeSmXf%2F4kKI9OvU2Qm9F8eQzb%2B6bu2IC%2FLaNBOOWmK9yskJZYl8guOGtP67bXXfuA0nBVLMaaPL2rsqew%3D%3D"
  },
  {
    name: "Yves",
    mods: ["LFA", "Spinner", "Indicator Extension"],
    icsUrl: "https://calsync.nookal.com/icsFile.php?HhXBkBCdHTLQaK4lrqfVa9ew%2FKnxwK8N60bfEsnM4Tix4fvM5lyQStblMTQiqaNaJ6xepUO6AS0mQIBuSqW%2BOWjh2dEdLM2ryJYQBbgLemmcR6jFHgrJeGdQCO3yfSW7dInaTI63gFq7aNCi2ArGCg%3D%3D"
  }
];

// ─── TRAVEL TIME HELPER ──────────────────────────────────────────────────────
async function getTravelTime(origin, destination) {
  if (!origin || !destination || origin.toLowerCase() === destination.toLowerCase() || origin === "Unknown") return 10;
  try {
    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(origin + ", VIC")}&destinations=${encodeURIComponent(destination + ", VIC")}&mode=driving&key=${GOOGLE_MAPS_API_KEY}`;
    const res = await axios.get(url);
    if (res.data.rows[0].elements[0].status === "OK") {
      const durationSeconds = res.data.rows[0].elements[0].duration.value;
      return Math.ceil(durationSeconds / 60);
    }
    return 60; // Safe default for traffic
  } catch (err) {
    return 60; 
  }
}

// ─── ROUTES ──────────────────────────────────────────────────────────────────

// Diagnostic route
app.get("/health", (req, res) => res.send("SDT Smart Backend is Live and Running!"));

app.post("/analyse", async (req, res) => {
  try {
    const booking = req.body;
    const clientSuburb = booking.suburb;

    // 1. Fetch Diaries
    const diaries = await Promise.all(INSTRUCTORS.map(async inst => {
      try {
        const rawData = await ical.async.fromURL(inst.icsUrl);
        const appts = Object.values(rawData)
          .filter(e => e.type === "VEVENT")
          .map(e => ({
            start: e.start,
            end: e.end,
            location: (e.location || "Unknown").split(',')[0].trim(), // Get just the suburb
            summary: e.summary
          }));
        return { name: inst.name, mods: inst.mods, appts };
      } catch (e) { return { name: inst.name, mods: inst.mods, appts: [] }; }
    }));

    // 2. Build Travel Matrix
    const uniqueSuburbs = [...new Set(diaries.flatMap(d => d.appts.map(a => a.location)))];
    const travelMatrix = {};
    for (const s of uniqueSuburbs) {
      travelMatrix[s] = await getTravelTime(s, clientSuburb);
    }

    const systemPrompt = `You are the SDT Booking Assistant. 
Date Context: Today is ${new Date().toLocaleDateString("en-AU", melbOptions)}.

STRICT LOGIC:
1. THE 5-MINUTE RULE: You MUST add a 5-minute prep buffer to every drive.
   Calculation: [Appt End Time] + [Travel Time from Matrix] + [5 Mins] = Earliest Start.
2. TRAFFIC FACTS: Use the TRAVEL_MINUTES matrix. If a suburb isn't listed, assume 60 mins.
3. MODS: If client needs modifications, Sherri is strictly excluded.
4. GABRIEL: On holiday 25 Apr - 30 Apr 2026.
5. NO CHAT: Only output the final 3 formatted options. Do not show reasoning.

TRAVEL_MINUTES (Drive time to/from ${clientSuburb}):
${JSON.stringify(travelMatrix, null, 2)}`;

    const userMessage = `
CLIENT: ${booking.clientName} in ${clientSuburb}
AVAILABILITY: ${booking.availability}
MODS: ${booking.modifications || "None"}
DIARIES: ${JSON.stringify(diaries)}`;

    const aiRes = await axios.post("https://api.anthropic.com/v1/messages", {
      model: "claude-3-5-sonnet-20240620",
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

    res.json(aiRes.data);

  } catch (err) {
    console.error("ANALYSIS ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => console.log(`SDT Smart Backend active on ${PORT}`));

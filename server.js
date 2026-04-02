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
    mods: ["LFA", "Spinner", "Hand Controls", "Satellite", "Indicator Extension", "Extension Pedals"],
    base: "Montmorency",
    icsUrl: "https://calsync.nookal.com/icsFile.php?HhXBkBCdHTLQaK4lrqfVa9ew%2FKnxwK8N60bfEsnM4Tix4fvM5lyQStblMTQiqaNaGeCeSgeSmXf%2F4kKI9OvU2fnXpnN%2FtMeidfD9E6WmLBWPsPF881mF4%2FDKjqX6mENEnlggTWF2jMn8Em8aKgSGXA%3D%3D"
  },
  {
    name: "Gabriel",
    mods: ["LFA", "Spinner", "Hand Controls", "Satellite", "Indicator Extension"],
    base: "Croydon North",
    icsUrl: "https://calsync.nookal.com/icsFile.php?HhXBkBCdHTLQaK4lrqfVa9ew%2FKnxwK8N60bfEsnM4Tix4fvM5lyQStblMTQiqaNaGeCeSgeSmXf%2F4kKI9OvU2a52GEgwyPVJ%2B0I6mOab2rD4%2Bmqr7EYvQGR9ykfeKAj%2F"
  },
  {
    name: "Greg",
    mods: ["LFA", "Spinner"],
    base: "Kilsyth",
    icsUrl: "https://calsync.nookal.com/icsFile.php?HhXBkBCdHTLQaK4lrqfVa9ew%2FKnxwK8N60bfEsnM4Tix4fvM5lyQStblMTQiqaNaGeCeSgeSmXf%2F4kKI9OvU2fgA7lzqZCrNH6P0mJPZWpJqu4G4d87qHmXHYUUq3ZhplneSIXp12lfHZzfvGyQdDw%3D%3D"
  },
  {
    name: "Jason",
    mods: ["LFA", "Spinner"],
    base: "Wandin North",
    icsUrl: "https://calsync.nookal.com/icsFile.php?HhXBkBCdHTLQaK4lrqfVa9ew%2FKnxwK8N60bfEsnM4Tix4fvM5lyQStblMTQiqaNaGeCeSgeSmXf%2F4kKI9OvU2Sks8REnxfIzFLWWhJgXRykKsTkQKIlND6Q3P8UWc8WWFJCS5Y5gIU0xiqPfnSz%2FkQ%3D%3D"
  },
  {
    name: "Marc",
    mods: ["LFA", "Hand Controls"],
    base: "Werribee",
    icsUrl: "https://calsync.nookal.com/icsFile.php?HhXBkBCdHTLQaK4lrqfVa9ew%2FKnxwK8N60bfEsnM4Tix4fvM5lyQStblMTQiqaNaGeCeSgeSmXf%2F4kKI9OvU2ecoRZN2xzdtmsUYY9vDrAuMuEJAzQSivaNXrwqSOqrMT982Jq4gficfE9XDNSVl0A%3D%3D"
  },
  {
    name: "Sherri",
    mods: [], // Standard only
    base: "Wandin North",
    icsUrl: "https://calsync.nookal.com/icsFile.php?HhXBkBCdHTLQaK4lrqfVa9ew%2FKnxwK8N60bfEsnM4Tix4fvM5lyQStblMTQiqaNaGeCeSgeSmXf%2F4kKI9OvU2Qm9F8eQzb%2B6bu2IC%2FLaNBOOWmK9yskJZYl8guOGtP67bXXfuA0nBVLMaaPL2rsqew%3D%3D"
  },
  {
    name: "Yves",
    mods: ["LFA", "Spinner"],
    base: "Rye",
    icsUrl: "https://calsync.nookal.com/icsFile.php?HhXBkBCdHTLQaK4lrqfVa9ew%2FKnxwK8N60bfEsnM4Tix4fvM5lyQStblMTQiqaNaJ6xepUO6AS0mQIBuSqW%2BOWjh2dEdLM2ryJYQBbgLemmcR6jFHgrJeGdQCO3yfSW7dInaTI63gFq7aNCi2ArGCg%3D%3D"
  }
];

// ─── HELPERS ─────────────────────────────────────────────────────────────────

// Fixes the Daylight Savings bug by forcing the date into Melbourne format strings
function toMelb(date) {
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Melbourne',
    weekday: 'short', day: 'numeric', month: 'short',
    hour: 'numeric', minute: '2-digit', hour12: true
  }).format(date);
}

app.post("/analyse", async (req, res) => {
  try {
    const booking = req.body;
    const now = new Date();
    const limit = new Date();
    limit.setDate(now.getDate() + 31);

    // 1. Fetch Diaries (SILENTLY - no loop logging to avoid Railway rate limit)
    const diaryData = {};
    for (const inst of INSTRUCTORS) {
      try {
        const events = await ical.fromURL(inst.icsUrl);
        diaryData[inst.name] = Object.values(events)
          .filter(e => e.type === 'VEVENT' && e.start >= now && e.start <= limit)
          .map(e => ({
            start: toMelb(e.start),
            end: toMelb(e.end),
            location: e.location || "Unknown",
            summary: e.summary || "Busy"
          }));
      } catch (err) {
        diaryData[inst.name] = [];
      }
    }

    // 2. Prepare AI instructions (With strict speed and logic rules)
    const systemPrompt = `You are the SDT Booking Assistant. 
Today is ${toMelb(now)}.
Client Location: ${booking.suburb}.
Mods Required: ${booking.modifications}.

INSTRUCTOR PROFILES:
${JSON.stringify(INSTRUCTORS.map(i => ({ name: i.name, mods: i.mods, base: i.base })))}

STRICT RULES:
1. EXCLUDE Sherri immediately if LFA or modifications are required.
2. EXCLUDE Marc (Werribee) and Yves (Rye) for Northern suburbs unless they are already nearby in their diary.
3. SPEED: Find 3 valid options and STOP. Do not map the whole month. 
4. THINKING: Keep internal analysis under 100 words.
5. FORMAT: No bolding (**). Use plain text. Provide "Appointment Before" and "Appointment After" drive times.`;

    const userMessage = `
CLIENT: ${booking.clientName}
SUBURB: ${booking.suburb}
MODS: ${booking.modifications}
AVAILABILITY: ${booking.availability}
DIARY: ${JSON.stringify(diaryData)}

Recommend 3 slots.`;

    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: "claude-3-5-sonnet-20240620",
        max_tokens: 800,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }]
      })
    });

    const data = await aiRes.json();
    res.json(data);

  } catch (err) {
    console.error("FATAL ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => console.log(`SDT Backend Active on Port ${PORT}`));

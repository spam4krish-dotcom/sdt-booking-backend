const express = require("express");
const cors = require("cors");
const ical = require("node-ical");

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());

// The ICS feeds you provided
const INSTRUCTOR_FEEDS = {
  "Greg": "https://calsync.nookal.com/icsFile.php?HhXBkBCdHTLQaK4lrqfVa9ew%2FKnxwK8N60bfEsnM4Tix4fvM5lyQStblMTQiqaNaGeCeSgeSmXf%2F4kKI9OvU2fgA7lzqZCrNH6P0mJPZWpJqu4G4d87qHmXHYUUq3ZhplneSIXp12lfHZzfvGyQdDw%3D%3D",
  "Christian": "https://calsync.nookal.com/icsFile.php?HhXBkBCdHTLQaK4lrqfVa9ew%2FKnxwK8N60bfEsnM4Tix4fvM5lyQStblMTQiqaNaGeCeSgeSmXf%2F4kKI9OvU2fnXpnN%2FtMeidfD9E6WmLBWPsPF881mF4%2FDKjqX6mENEnlggTWF2jMn8Em8aKgSGXA%3D%3D",
  "Gabriel": "https://calsync.nookal.com/icsFile.php?HhXBkBCdHTLQaK4lrqfVa9ew%2FKnxwK8N60bfEsnM4Tix4fvM5lyQStblMTQiqaNaGeCeSgeSmXf%2F4kKI9OvU2a52GEgwyPVJ%2B0I6mOab2rD4%2Bmqr7EYvQGR9ykfeKAj%2F",
  "Yves": "https://calsync.nookal.com/icsFile.php?HhXBkBCdHTLQaK4lrqfVa9ew%2FKnxwK8N60bfEsnM4Tix4fvM5lyQStblMTQiqaNaJ6xepUO6AS0mQIBuSqW%2BOWjh2dEdLM2ryJYQBbgLemmcR6jFHgrJeGdQCO3yfSW7dInaTI63gFq7aNCi2ArGCg%3D%3D",
  "Marc": "https://calsync.nookal.com/icsFile.php?HhXBkBCdHTLQaK4lrqfVa9ew%2FKnxwK8N60bfEsnM4Tix4fvM5lyQStblMTQiqaNaGeCeSgeSmXf%2F4kKI9OvU2ecoRZN2xzdtmsUYY9vDrAuMuEJAzQSivaNXrwqSOqrMT982Jq4gficfE9XDNSVl0A%3D%3D",
  "Jason": "https://calsync.nookal.com/icsFile.php?HhXBkBCdHTLQaK4lrqfVa9ew%2FKnxwK8N60bfEsnM4Tix4fvM5lyQStblMTQiqaNaGeCeSgeSmXf%2F4kKI9OvU2Sks8REnxfIzFLWWhJgXRykKsTkQKIlND6Q3P8UWc8WWFJCS5Y5gIU0xiqPfnSz%2FkQ%3D%3D",
  "Sherri": "https://calsync.nookal.com/icsFile.php?HhXBkBCdHTLQaK4lrqfVa9ew%2FKnxwK8N60bfEsnM4Tix4fvM5lyQStblMTQiqaNaGeCeSgeSmXf%2F4kKI9OvU2Qm9F8eQzb%2B6bu2IC%2FLaNBOOWmK9yskJZYl8guOGtP67bXXfuA0nBVLMaaPL2rsqew%3D%3D"
};

const INSTRUCTOR_BASES = {
  "Christian": "Montmorency VIC",
  "Gabriel": "Croydon North VIC",
  "Greg": "Kilsyth VIC",
  "Jason": "Wandin North VIC",
  "Marc": "Werribee VIC",
  "Sherri": "Wandin North VIC",
  "Yves": "Rye VIC"
};

// Helper to fetch and clean diary events
async function getAllDiaries() {
  const allEvents = {};
  const now = new Date();
  const thirtyDaysLater = new Date();
  thirtyDaysLater.setDate(now.getDate() + 30);

  for (const [name, url] of Object.entries(INSTRUCTOR_FEEDS)) {
    try {
      const data = await ical.fromURL(url);
      const events = [];
      
      for (const k in data) {
        if (data.hasOwnProperty(k)) {
          const ev = data[k];
          if (ev.type === 'VEVENT') {
            const start = new Date(ev.start);
            // Only grab events in the next 30 days to keep the AI prompt small
            if (start >= now && start <= thirtyDaysLater) {
              events.push({
                start: ev.start,
                end: ev.end,
                summary: ev.summary || "Busy",
                location: ev.location || "On Road"
              });
            }
          }
        }
      }
      allEvents[name] = events.sort((a, b) => new Date(a.start) - new Date(b.start));
    } catch (e) {
      allEvents[name] = "Error fetching diary: " + e.message;
    }
  }
  return allEvents;
}

// Google Maps travel time helper
async function getDriveTime(origin, destination) {
  try {
    const key = process.env.GOOGLE_MAPS_API_KEY;
    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(origin + ", VIC")}&destinations=${encodeURIComponent(destination + ", VIC")}&mode=driving&key=${key}`;
    const response = await fetch(url);
    const data = await response.json();
    if (data.rows?.[0]?.elements?.[0]?.status === "OK") {
      return {
        duration: data.rows[0].elements[0].duration.text,
        distance: data.rows[0].elements[0].distance.text
      };
    }
    return null;
  } catch (err) { return null; }
}

app.post("/analyse", async (req, res) => {
  try {
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    const booking = req.body;
    const clientAddress = booking.suburb || "Melbourne, VIC";

    // 1. Fetch all ICS Diaries
    const diaries = await getAllDiaries();

    // 2. Fetch Travel Times
    const travelResults = {};
    for (const [name, addr] of Object.entries(INSTRUCTOR_BASES)) {
      const dt = await getDriveTime(clientAddress, addr);
      if (dt) travelResults[name] = dt;
    }

    // 3. AI Analysis
    const systemPrompt = `You are the SDT Booking Assistant.
MODEL: claude-sonnet-4-20250514.

INSTRUCTOR MODS:
- Christian: Fadiel, satellite acc, e-radial, LFA, etc. (High level)
- Gabriel: Fadiel, Monarch, LFA. (Holiday 25-30 Apr 2026)
- Greg: LFA, spinner, lollipop.
- Jason: LFA, spinner.
- Marc: LFA, extension pedals, spinner.
- Sherri: Standard only (No mods).
- Yves: LFA, spinner, lollipop.

TASK: Find the best instructor based on:
1. Required modifications.
2. Proximity (travel time).
3. Diary Gaps (Check the 'start' and 'end' times provided in the DIARY DATA).`;

    const userMessage = `
CLIENT: ${booking.clientName}
LOCATION: ${clientAddress}
MODS NEEDED: ${booking.modifications}
AVAILABILITY: ${booking.availability}

TRAVEL FROM BASE: ${JSON.stringify(travelResults)}
DIARY DATA (Next 30 Days): ${JSON.stringify(diaries)}

Respond with: Recommended Instructor, Geographic Routing, Suggested Time Slot, Backup, and a Booking Note.`;

    const aiResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }]
      })
    });

    const data = await aiResponse.json();
    res.json(data);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => console.log(`SDT running on ${PORT}`));

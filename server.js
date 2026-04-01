const express = require("express");
const cors = require("cors");
const ical = require("node-ical");

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());

const INSTRUCTOR_FEEDS = {
  "Greg": "https://calsync.nookal.com/icsFile.php?HhXBkBCdHTLQaK4lrqfVa9ew%2FKnxwK8N60bfEsnM4Tix4fvM5lyQStblMTQiqaNaGeCeSgeSmXf%2F4kKI9OvU2fgA7lzqZCrNH6P0mJPZWpJqu4G4d87qHmXHYUUq3ZhplneSIXp12lfHZzfvGyQdDw%3D%3D",
  "Christian": "https://calsync.nookal.com/icsFile.php?HhXBkBCdHTLQaK4lrqfVa9ew%2FKnxwK8N60bfEsnM4Tix4fvM5lyQStblMTQiqaNaGeCeSgeSmXf%2F4kKI9OvU2fnXpnN%2FtMeidfD9E6WmLBWPsPF881mF4%2FDKjqX6mENEnlggTWF2jMn8Em8aKgSGXA%3D%3D",
  "Gabriel": "https://calsync.nookal.com/icsFile.php?HhXBkBCdHTLQaK4lrqfVa9ew%2FKnxwK8N60bfEsnM4Tix4fvM5lyQStblMTQiqaNaGeCeSgeSmXf%2F4kKI9OvU2a52GEgwyPVJ%2B0I6mOab2rD4%2Bmqr7EYvQGR9ykfeKAj%2F",
  "Yves": "https://calsync.nookal.com/icsFile.php?HhXBkBCdHTLQaK4lrqfVa9ew%2FKnxwK8N60bfEsnM4Tix4fvM5lyQStblMTQiqaNaJ6xepUO6AS0mQIBuSqW%2BOWjh2dEdLM2ryJYQBbgLemmcR6jFHgrJeGdQCO3yfSW7dInaTI63gFq7aNCi2ArGCg%3D%3D",
  "Marc": "https://calsync.nookal.com/icsFile.php?HhXBkBCdHTLQaK4lrqfVa9ew%2FKnxwK8N60bfEsnM4Tix4fvM5lyQStblMTQiqaNaGeCeSgeSmXf%2F4kKI9OvU2ecoRZN2xzdtmsUYY9vDrAuMuEJAzQSivaNXrwqSOqrMT982Jq4gficfE9XDNSVl0A%3D%3D",
  "Jason": "https://calsync.nookal.com/icsFile.php?HhXBkBCdHTLQaK4lrqfVa9ew%2FKnxwK8N60bfEsnM4Tix4fvM5lyQStblMTQiqaNaGeCeSgeSmXf%2F4kKI9OvU2Sks8REnxfIzFLWWhJgXRykKsTkQKIlND6Q3P8UWc8WWFJCS5Y5gIU0xiqPfnSz%2FkQ%3D%3D",
  "Sherri": "https://calsync.nookal.com/icsFile.php?HhXBkBCdHTLQaK4lrqfVa9ew%2FKnxwK8N60bfEsnM4Tix4fvM5lyQStblMTQiqaNaGeCeSgeSmXf%2F4kKI9OvU2Qm9F8eQzb%2B6bu2IC%2FLaNBOOWmK9yskJZYl8guOGtP67bXXfuA0nBVLMaaPL2rsqew%3D%3D"
};

app.post("/analyse", async (req, res) => {
  try {
    const booking = req.body;
    
    // Fix Timezone: Get Melbourne Date/Time
    const now = new Date();
    const melbTime = now.toLocaleString("en-AU", { timeZone: "Australia/Melbourne" });
    const melbDay = now.toLocaleDateString("en-AU", { weekday: 'long', timeZone: "Australia/Melbourne" });

    // Fetch Diaries
    const diaries = {};
    for (const [name, url] of Object.entries(INSTRUCTOR_FEEDS)) {
      const data = await ical.fromURL(url);
      diaries[name] = Object.values(data)
        .filter(ev => ev.type === 'VEVENT')
        .map(ev => ({
          start: ev.start,
          end: ev.end,
          location: ev.location || "Unknown",
          summary: ev.summary
        }));
    }

    const systemPrompt = `You are the SDT Booking Assistant. 
STRICT RULES:
1. NO MARKDOWN BOLDING (**). Use plain text or simple dashes.
2. NO EXTRA FLUFF. Do not list mods the instructor has if they aren't the ones requested.
3. START WITH THE OPTIONS. Put the best 3-5 specific time slots first.
4. CHAIN ROUTING: Check the "location" of the appointment immediately before and after a gap. If an instructor is in Brunswick and the client is in Templestowe, factor in 30 mins travel.

CURRENT MELBOURNE CONTEXT:
Date/Time: ${melbTime} (${melbDay})

INSTRUCTOR MODS:
- Christian: LFA, Fadiel, satellite acc, e-radial.
- Gabriel: LFA, Fadiel, Monarch. (Holiday 25-30 Apr)
- Greg: LFA, spinner.
- Jason: LFA, spinner.
- Marc: LFA, extension pedals.
- Sherri: Standard only.
- Yves: LFA, spinner.`;

    const userMessage = `
CLIENT: ${booking.clientName}
SUBURB: ${booking.suburb}
MODS: ${booking.modifications}
AVAILABILITY PREFERENCE: ${booking.availability}
DIARY DATA: ${JSON.stringify(diaries)}

Task: Provide 3-5 specific booking options. Mention travel time between their previous appointment location and the client's suburb.`;

    const aiResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }]
      })
    });

    const result = await aiResponse.json();
    res.json(result);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => console.log(`SDT Server Active`));

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

// Helper to fetch deep notes from API v3
async function getDetailedNotes() {
  const credentials = Buffer.from(process.env.NOOKAL_CLIENT_ID + ":" + process.env.NOOKAL_BASIC_KEY).toString("base64");
  const query = `query { appointments(pagination: { data: { notes: true, comments: true, startTime: true, date: true, practitioner: { firstName: true } } }) }`;
  
  try {
    const r = await fetch("https://auzone1.nookal.com/api/v3.0/graphql", {
      method: "POST",
      headers: { "Authorization": "Basic " + credentials, "Content-Type": "application/json" },
      body: JSON.stringify({ query })
    });
    const json = await r.json();
    return json.data?.appointments?.data || [];
  } catch (e) { return []; }
}

app.post("/analyse", async (req, res) => {
  try {
    const melbTime = new Date().toLocaleString("en-AU", { timeZone: "Australia/Melbourne", dateStyle: "full", timeStyle: "short" });

    // 1. Fetch Calendar Feeds (Structural Availability)
    const diarySummary = {};
    for (const [name, url] of Object.entries(INSTRUCTOR_FEEDS)) {
      try {
        const data = await ical.fromURL(url);
        diarySummary[name] = Object.values(data)
          .filter(ev => ev.type === 'VEVENT')
          .map(ev => ({
            start: new Date(ev.start).toLocaleString("en-AU", {timeZone: "Australia/Melbourne"}),
            end: new Date(ev.end).toLocaleString("en-AU", {timeZone: "Australia/Melbourne"}),
            title: ev.summary
          }));
      } catch (e) { diarySummary[name] = "Feed error"; }
    }

    // 2. Fetch Deep Notes (For location tracking like "Berwick")
    const apiNotes = await getDetailedNotes();

    const systemPrompt = `You are the SDT Assistant. Today is ${melbTime}.
STRICT: 
- Use the DIARY DATA for gaps.
- Use the API NOTES to find suburbs (like Berwick) mentioned in notes/comments.
- If an instructor is in Berwick at 9am, they are NOT in Brunswick.
- Suggested slots must be 3-5 options. No bold (**) text.`;

    const userMessage = `
CLIENT: ${req.body.suburb}
MODS: ${req.body.modifications}
DIARY DATA: ${JSON.stringify(diarySummary)}
API NOTES: ${JSON.stringify(apiNotes)}
`;

    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }]
      })
    });

    const aiData = await aiRes.json();
    
    // Safety check to prevent the "Unexpected Token <" error
    if (aiData.error) throw new Error(aiData.error.message);

    res.json(aiData);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Configuration Error: Ensure API Keys are correct in Railway." });
  }
});

app.listen(PORT);

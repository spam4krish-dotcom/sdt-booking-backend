const express = require("express");
const cors = require("cors");
const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());

// STRICT INSTRUCTOR DATABASE (Update these details as needed)
const INSTRUCTORS = [
  { name: "Christian", mods: ["LFA", "Spinner", "Satellite", "Hand Controls"], base: "Montmorency" },
  { name: "Greg", mods: ["LFA", "Spinner", "Satellite", "Hand Controls"], base: "Kilsyth" },
  { name: "Marc", mods: ["LFA", "Hand Controls"], base: "Werribee" },
  { name: "Sherri", mods: [], base: "Northern Suburbs" }, // Standard Only
  { name: "Gabriel", mods: ["LFA", "Spinner"], base: "Eastern Suburbs" }
];

async function getNookalDiary() {
  const credentials = Buffer.from(process.env.NOOKAL_CLIENT_ID + ":" + process.env.NOOKAL_BASIC_KEY).toString("base64");
  const query = `query { appointments(pagination: { data: { date: true, startTime: true, endTime: true, notes: true, comments: true, practitioner: { firstName: true }, location: { name: true } } }) }`;

  const response = await fetch("https://auzone1.nookal.com/api/v3.0/graphql", {
    method: "POST",
    headers: { "Authorization": "Basic " + credentials, "Content-Type": "application/json" },
    body: JSON.stringify({ query })
  });
  const result = await response.json();
  return result.data?.appointments?.data || [];
}

app.post("/analyse", async (req, res) => {
  try {
    const booking = req.body;
    const diaryData = await getNookalDiary();
    
    // 1. HARD FILTER: Remove instructors who can't do the requested mod
    const reqMod = booking.modifications.toUpperCase();
    const qualifiedInstructors = INSTRUCTORS.filter(ins => {
      if (reqMod.includes("LFA") || reqMod.includes("LEFT FOOT")) {
        return ins.mods.includes("LFA");
      }
      return true; // Default to all for standard
    });

    const instructorNames = qualifiedInstructors.map(i => i.name);

    // 2. GET CURRENT TIME (Now accurate thanks to Railway TZ variable)
    const melbContext = new Date().toLocaleString("en-AU", {
        timeZone: "Australia/Melbourne",
        weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit"
    });

    const systemPrompt = `You are the SDT Booking Assistant. 
Today is: ${melbContext}. 
Client Location: ${booking.suburb}.
Qualified Instructors for this job: ${instructorNames.join(", ")}.

RULES:
1. ONLY suggest the qualified instructors listed above.
2. If an instructor is not on the qualified list, DO NOT mention them.
3. Use the Diary Data to find gaps of ${booking.duration} minutes.
4. If an instructor base is >45 mins from ${booking.suburb}, do not suggest them unless they have a nearby appointment.
5. NO bolding. No flowery language. Just the facts.`;

    const userMessage = `Diary: ${JSON.stringify(diaryData)} \nSuggest 3 slots for ${booking.suburb}.`;

    const aiResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 800,
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

app.listen(PORT, () => console.log("SDT Logic Updated"));

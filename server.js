const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());

// Set your credentials in Railway Environment Variables:
// NOOKAL_CLIENT_ID, NOOKAL_BASIC_KEY, ANTHROPIC_API_KEY, GOOGLE_MAPS_API_KEY

async function getNookalDiary() {
  const clientId = process.env.NOOKAL_CLIENT_ID;
  const basickey = process.env.NOOKAL_BASIC_KEY;

  if (!clientId || !basickey) throw new Error("Missing Nookal Credentials");

  const credentials = Buffer.from(clientId + ":" + basickey).toString("base64");
  
  // Calculate date range in Melbourne Time
  const now = new Date();
  const melbNow = new Date(now.toLocaleString("en-US", {timeZone: "Australia/Melbourne"}));
  const from = melbNow.toISOString().split("T")[0];
  const future = new Date(melbNow.getTime() + (14 * 24 * 60 * 60 * 1000));
  const to = future.toISOString().split("T")[0];

  // We explicitly request 'notes' and 'comments' here to find locations like "Berwick"
  const query = `
    query {
      appointments(filters: { dateFrom: "${from}", dateTo: "${to}" }, pagination: { data: { 
        id: true, 
        date: true, 
        startTime: true, 
        endTime: true, 
        notes: true,
        comments: true,
        practitioner: { firstName: true, lastName: true }, 
        location: { name: true },
        service: { name: true }
      } })
    }
  `;

  const response = await fetch("https://auzone1.nookal.com/api/v3.0/graphql", {
    method: "POST",
    headers: {
      "Authorization": "Basic " + credentials,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ query: query })
  });

  const result = await response.json();
  if (result.errors) throw new Error(JSON.stringify(result.errors));
  return result.data.appointments.data;
}

app.post("/analyse", async (req, res) => {
  try {
    const booking = req.body;
    const diaryData = await getNookalDiary();
    
    // Get Current Melbourne Time for the AI
    const melbTime = new Date().toLocaleString("en-AU", {
      timeZone: "Australia/Melbourne",
      dateStyle: "full",
      timeStyle: "short"
    });

    const systemPrompt = `You are the SDT Booking Assistant. 
Today is ${melbTime}. 
CRITICAL: Use the "notes" and "comments" fields in the diary data to identify if an instructor is in a specific suburb (e.g., Berwick). 
If the notes say "Berwick," assume the instructor is there for that time slot.
If a day is Thursday April 2nd, do not call it April 3rd.`;

    const userMessage = `
NEW BOOKING: ${booking.suburb}
DIARY DATA: ${JSON.stringify(diaryData)}
Provide 3 specific options based on these gaps. No bold text.`;

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

    const data = await aiResponse.json();
    res.json(data);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => console.log(`Server running on ${PORT}`));

const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());

// 1. INSTRUCTOR DATABASE & CAPABILITIES
const INSTRUCTORS = [
  { name: "Christian", mods: ["LFA", "Spinner", "Satellite", "Hand Controls"], base: "Montmorency" },
  { name: "Gabriel", mods: ["LFA", "Spinner"], base: "Croydon North" },
  { name: "Greg", mods: ["LFA", "Spinner", "Indicator Extension"], base: "Kilsyth" },
  { name: "Jason", mods: ["LFA", "Spinner"], base: "Wandin North" },
  { name: "Marc", mods: ["LFA", "Hand Controls"], base: "Werribee" },
  { name: "Sherri", mods: [], base: "Wandin North" }, // Standard lessons only
  { name: "Yves", mods: ["LFA", "Spinner"], base: "Rye" }
];

// 2. FETCH DATA FROM NOOKAL V3.0
async function getNookalDiary() {
  const clientId = process.env.NOOKAL_CLIENT_ID;
  const basickey = process.env.NOOKAL_BASIC_KEY;

  if (!clientId || !basickey) {
    throw new Error("Missing NOOKAL_CLIENT_ID or NOOKAL_BASIC_KEY");
  }

  // Use Basic Auth directly for the GraphQL endpoint
  const credentials = Buffer.from(clientId + ":" + basickey).toString("base64");

  const today = new Date();
  const from = today.toISOString().split("T")[0];
  const future = new Date(today.getTime() + (30 * 24 * 60 * 60 * 1000));
  const to = future.toISOString().split("T")[0];

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

  if (!response.ok) {
    const text = await response.text();
    console.error("Nookal API Error Page:", text);
    throw new Error(`Nookal API error ${response.status}`);
  }

  const result = await response.json();
  if (result.errors) {
    throw new Error("Nookal GraphQL errors: " + JSON.stringify(result.errors));
  }
  return result.data?.appointments?.data || [];
}

// 3. MAIN ANALYSIS ROUTE
app.post("/analyse", async (req, res) => {
  try {
    const booking = req.body;
    const diaryData = await getNookalDiary();

    // HARD FILTER: Identify qualified instructors based on modifications
    const reqMod = (booking.modifications || "").toUpperCase();
    const isLfaRequest = reqMod.includes("LFA") || reqMod.includes("LEFT FOOT");
    
    const qualifiedInstructors = INSTRUCTORS.filter(ins => {
      if (isLfaRequest) return ins.mods.includes("LFA");
      return true;
    });

    const instructorNames = qualifiedInstructors.map(i => i.name);

    // Get current Melbourne time (Reliant on Railway TZ variable)
    const melbTime = new Date().toLocaleString("en-AU", {
      dateStyle: "full",
      timeStyle: "short"
    });

    const systemPrompt = `You are the SDT Booking Assistant. 
Today is ${melbTime}.
Client Suburb: ${booking.suburb}.
Modification Requested: ${booking.modifications}.

INSTRUCTOR DATA:
${JSON.stringify(qualifiedInstructors)}

RULES:
1. ONLY suggest instructors from this qualified list: ${instructorNames.join(", ")}.
2. If an instructor is not on that list, do not mention them.
3. Review the provided diary data to find gaps of ${booking.duration} minutes.
4. Account for travel from the instructor's base or their previous appointment.
5. NO bolding. No flowery justifications.`;

    const userMessage = `
NEW BOOKING REQUEST:
Suburb: ${booking.suburb}
Availability: ${booking.availability}
Diary Data: ${JSON.stringify(diaryData)}

Provide 3 specific slot recommendations.`;

    const aiResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1200,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }]
      })
    });

    const data = await aiResponse.json();
    res.json(data);

  } catch (error) {
    console.error("Server Error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get("/health", (req, res) => res.json({ status: "ok" }));

app.listen(PORT, () => console.log(`SDT Backend running on port ${PORT}`));

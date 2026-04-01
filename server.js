const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.json({ status: "ok", message: "SDT Booking Assistant backend is live" });
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", message: "SDT running" });
});

/**
 * NOOKAL V3 AUTH & DATA FETCH
 */
async function getNookalDiary() {
  const clientId = process.env.NOOKAL_CLIENT_ID;
  const clientSecret = process.env.NOOKAL_BASIC_KEY;

  if (!clientId || !clientSecret) {
    throw new Error("Missing NOOKAL_CLIENT_ID or NOOKAL_BASIC_KEY in Railway environment.");
  }

  // 1. EXCHANGE CLIENT ID AND SECRET FOR AN ACCESS TOKEN
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  
  const tokenResponse = await fetch("https://auzone1.nookal.com/api/v3.0/token", {
    method: "POST",
    headers: {
      "Authorization": `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: "grant_type=client_credentials&scope=all"
  });

  if (!tokenResponse.ok) {
    const errText = await tokenResponse.text();
    throw new Error(`Auth Failed (${tokenResponse.status}): Ensure the Basic Key is the v3 Client Secret.`);
  }

  const tokenData = await tokenResponse.json();
  const accessToken = tokenData.access_token;

  // 2. FETCH DIARY VIA GRAPHQL (Next 30 Days)
  const today = new Date();
  const from = today.toISOString().split("T")[0];
  const future = new Date(today.getTime() + (30 * 24 * 60 * 60 * 1000));
  const to = future.toISOString().split("T")[0];

  const query = `
    query {
      appointments(filters: { dateFrom: "${from}", dateTo: "${to}" }, pagination: { data: { limit: 250 } }) {
        data {
          id
          date
          startTime
          endTime
          status
          practitioner { firstName lastName }
          client { firstName lastName }
          location { name }
          service { name }
        }
      }
    }
  `;

  const response = await fetch("https://auzone1.nookal.com/api/v3.0/graphql", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ query })
  });

  const result = await response.json();
  if (result.errors) {
    throw new Error(`Nookal Data Error: ${result.errors[0].message}`);
  }

  return result;
}

/**
 * GOOGLE MAPS DRIVE TIME HELPER
 */
async function getDriveTime(origin, destination) {
  try {
    const key = process.env.GOOGLE_MAPS_API_KEY;
    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(origin + ", VIC, Australia")}&destinations=${encodeURIComponent(destination + ", VIC, Australia")}&mode=driving&key=${key}`;

    const response = await fetch(url);
    const data = await response.json();

    if (data.rows?.[0]?.elements?.[0]?.status === "OK") {
      return {
        duration: data.rows[0].elements[0].duration.text,
        distance: data.rows[0].elements[0].distance.text
      };
    }
    return null;
  } catch (err) {
    return null;
  }
}

/**
 * MAIN ANALYSIS ENDPOINT
 */
app.post("/analyse", async (req, res) => {
  try {
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicKey) return res.status(500).json({ error: "Missing ANTHROPIC_API_KEY" });

    const booking = req.body;
    const clientAddress = booking.suburb || booking.clientAddress || "Melbourne, VIC";

    // 1. Get Diary
    let diaryData = null;
    let diaryStatus = "";
    try {
      const result = await getNookalDiary();
      diaryData = result.data?.appointments?.data || [];
      diaryStatus = `OK: Found ${diaryData.length} records.`;
    } catch (err) {
      diaryStatus = `DIARY ERROR: ${err.message}`;
    }

    // 2. Get Travel Times
    const bases = {
      "Christian": "Montmorency VIC",
      "Gabriel": "Croydon North VIC",
      "Greg": "Kilsyth VIC",
      "Jason": "Wandin North VIC",
      "Marc": "Werribee VIC",
      "Sherri": "Wandin North VIC",
      "Yves": "Rye VIC"
    };

    const travelResults = {};
    for (const [name, addr] of Object.entries(bases)) {
      const dt = await getDriveTime(clientAddress, addr);
      if (dt) travelResults[name] = dt;
    }

    // 3. Prepare AI Prompt
    const systemPrompt = `You are the SDT Booking Assistant. 
MODEL LOCK: claude-sonnet-4-20250514.

INSTRUCTOR MODS:
- Christian: Most comprehensive (Fadiel, satellite acc, e-radial, LFA, etc.)
- Gabriel: Comprehensive (Fadiel, Monarch, LFA). HOLIDAY 25-30 Apr 2026.
- Greg: LFA, spinner, lollipop.
- Jason: LFA, spinner only.
- Marc: LFA, extension pedals, spinner.
- Sherri: NO MODS. Standard only.
- Yves: LFA, spinner, lollipop.

DIARY DATA: Analyze the provided diary to identify gaps. 
If status is "DIARY ERROR", provide recommendations based on location and vehicle modifications only.`;

    const userMessage = `
CLIENT INFO:
Name: ${booking.clientName}
Location: ${clientAddress}
Mods Needed: ${booking.modifications}
Notes: ${booking.modNotes}
Availability: ${booking.availability}

TRAVEL TIMES (Base to Client):
${JSON.stringify(travelResults, null, 2)}

DIARY DATA (Status: ${diaryStatus}):
${JSON.stringify(diaryData, null, 2)}

Respond with: Recommended Instructor, Geographic Routing, Suggested Time Slot (if diary available), Backup, and a Booking Note.`;

    const aiResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1500,
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

app.listen(PORT, () => console.log(`SDT Assistant running on ${PORT}`));

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

// Get Nookal v3.0 access token using Basic Auth
async function getNookalToken() {
  const clientId = process.env.NOOKAL_CLIENT_ID;
  const basicKey = process.env.NOOKAL_BASIC_KEY;

  if (!clientId || !basicKey) {
    throw new Error("Missing NOOKAL_CLIENT_ID or NOOKAL_BASIC_KEY");
  }

  const credentials = Buffer.from(clientId + ":" + basicKey).toString("base64");

  const response = await fetch("https://auzone1.nookal.com/api/v3.0/token", {
    method: "POST",
    headers: {
      "Authorization": "Basic " + credentials,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: "grant_type=client_credentials"
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error("Nookal token error " + response.status + ": " + text);
  }

  const data = await response.json();
  return data.access_token;
}

// Fetch Nookal appointments for a date range
async function getNookalDiary(token) {
  try {
    const today = new Date();
    const from = today.toISOString().split("T")[0];
    const future = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
    const to = future.toISOString().split("T")[0];

    const url = "https://auzone1.nookal.com/api/v3.0/appointments?from=" + from + "&to=" + to + "&length=200";

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Authorization": "Bearer " + token,
        "Content-Type": "application/json"
      }
    });

    if (!response.ok) {
      const errText = await response.text();
      return { error: "Nookal API error " + response.status + ": " + errText };
    }

    return await response.json();
  } catch (error) {
    return { error: error.message };
  }
}

// Get travel times from Google Maps
async function getDriveTimes(clientSuburb) {
  const instructorBases = {
    Christian: "Montmorency, VIC",
    Gabriel: "Croydon North, VIC",
    Greg: "Kilsyth, VIC",
    Jason: "Wandin North, VIC",
    Marc: "Werribee, VIC",
    Sherri: "Wandin North, VIC",
    Yves: "Rye, VIC"
  };

  const results = {};
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;

  if (!apiKey) return { error: "Missing Google Maps API Key" };

  try {
    const destinations = Object.values(instructorBases).join("|");
    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(clientSuburb)}&destinations=${encodeURIComponent(destinations)}&key=${apiKey}`;

    const response = await fetch(url);
    const data = await response.json();

    if (data.status === "OK") {
      const names = Object.keys(instructorBases);
      data.rows[0].elements.forEach((element, index) => {
        results[names[index]] = {
          distance: element.distance?.text || "Unknown",
          duration: element.duration?.text || "Unknown"
        };
      });
    }
    return results;
  } catch (error) {
    return { error: error.message };
  }
}

app.post("/analyse", async (req, res) => {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Missing ANTHROPIC_API_KEY" });
    }

    // 1. Get Live Data
    const nookalToken = await getNookalToken();
    const [diary, driveTimes] = await Promise.all([
      getNookalDiary(nookalToken),
      getDriveTimes(req.body.suburb)
    ]);

    // 2. Prepare context for AI
    const diaryText = JSON.stringify(diary).substring(0, 5000);
    const driveText = Object.entries(driveTimes).map(([k, v]) => k + ": " + v.duration + "/" + v.distance).join(", ");

    const userMessage = `
CLIENT REQUEST:
${JSON.stringify(req.body, null, 2)}

DRIVE TIMES (Client to Base):
${driveText}

LIVE NOOKAL DIARY (grouped by instructor, next 30 days):
${diaryText}
`;

    const systemPrompt = `You are the SDT Booking Assistant for Specialised Driver Training in Melbourne, Victoria, Australia.

Your job is to recommend the best instructor for a new client booking based on:
1. MODS FIRST - Instructor must have required mods.
2. ZONE - Match instructor area to client suburb.
3. ROUTING - New booking should fit geographically into instructor existing day using real Google Maps data and diary gaps.

Respond with:
1. RECOMMENDED INSTRUCTOR - name and justification based on actual mods, actual distance, and diary.
2. GEOGRAPHIC ROUTING - using real Google Maps times and real diary locations.
3. SUGGESTED TIME SLOT - specific date and time based on actual diary gaps.
4. BACKUP OPTIONS - 1-2 alternatives with real reasoning.
5. FLAGS - anything to resolve before confirming.
6. NOOKAL BOOKING NOTE - ready-to-paste in SDT style`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: "claude-3-5-sonnet-latest",
        max_tokens: 1500,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Anthropic error:", data.error);
      return res.status(response.status).json({ error: data.error?.message || "AI service error" });
    }

    res.json({
      ...data,
      _debug: {
        nookal: diary.error ? "ERROR: " + diary.error : "OK",
        driveTimes: Object.keys(driveTimes).length + " of 7 instructors"
      }
    });

  } catch (error) {
    console.error("Server error:", error);
    res.status(500).json({ error: "Internal server error: " + error.message });
  }
});

app.listen(PORT, () => {
  console.log("SDT Server active on port " + PORT);
});

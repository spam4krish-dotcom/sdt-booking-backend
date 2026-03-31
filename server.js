const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());

// 1. Health Check & Root
app.get("/", (req, res) => {
  res.json({ status: "ok", message: "SDT Booking Assistant with Nookal & Google Maps is live" });
});

// 2. Nookal Integration: Fetch Live Appointments
async function getNookalDiary() {
  try {
    const today = new Date();
    const fromDate = today.toISOString().split("T")[0];
    const futureDate = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
    const toDate = futureDate.toISOString().split("T")[0];

    const url = `https://auzone1.nookal.com/api/v1/appointments?from=${fromDate}&to=${toDate}&length=500`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "X-API-Key": process.env.NOOKAL_API_KEY,
        "Content-Type": "application/json"
      }
    });

    if (!response.ok) return { error: "Nookal API unreachable" };
    return await response.json();
  } catch (error) {
    return { error: error.message };
  }
}

// 3. Google Maps Integration: Calculate Drive Times
async function getDriveTimes(clientSuburb, instructorBases) {
  try {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    const origins = [clientSuburb];
    const destinations = Object.values(instructorBases).join("|");

    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(origins)}&destinations=${encodeURIComponent(destinations)}&key=${apiKey}`;

    const response = await fetch(url);
    const data = await response.json();
    
    if (data.status !== "OK") return { error: "Google Maps Error: " + data.status };
    return data;
  } catch (error) {
    return { error: error.message };
  }
}

// 4. The Main Route
app.post("/analyse", async (req, res) => {
  try {
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    
    // Define instructor base locations for Google Maps calculation
    const instructorBases = {
      Christian: "Montmorency, VIC",
      Gabriel: "Croydon North, VIC",
      Greg: "Kilsyth, VIC",
      Jason: "Wandin North, VIC",
      Marc: "Werribee, VIC",
      Sherri: "Wandin North, VIC",
      Yves: "Rye, VIC"
    };

    // Step A: Fetch Live Data in Parallel
    const [diary, driveTimes] = await Promise.all([
      getNookalDiary(),
      getDriveTimes(req.body.suburb, instructorBases)
    ]);

    // Step B: Build the AI Message
    const systemPrompt = `You are the SDT Booking Assistant. 
    You have access to:
    1. LIVE NOOKAL DIARY: Actual appointments for the next 30 days.
    2. LIVE DRIVE TIMES: Real-world travel time from the client to instructor bases.
    
    CRITICAL RULES:
    - Disqualify instructors missing required vehicle modifications.
    - Prioritize instructors already working near the client's suburb on that day.
    - Minimize "dead runs" (unpaid travel time).
    
    INSTRUCTOR ROSTER & MODS:
    - Christian: Full Mods (Fadiel, Satellite, etc.). All areas.
    - Gabriel: Full Mods. East specialist.
    - Greg: LFA, Spinner, Indicator. East/SE.
    - Jason: LFA, Spinner only. East/Bayside.
    - Marc: LFA, Spinner, Extensions. West specialist.
    - Sherri: NO MODS. Standard lessons only.
    - Yves: LFA, Spinner, Indicator. Peninsula only.`;

    const userMessage = `
    CLIENT REQUEST:
    ${JSON.stringify(req.body, null, 2)}

    LIVE DIARY DATA (Nookal):
    ${JSON.stringify(diary).substring(0, 5000)} 

    DRIVE TIME ESTIMATES (Google Maps):
    ${JSON.stringify(driveTimes)}
    `;

    // Step C: Call Anthropic
    const response = await fetch("https://api.anthropic.com/v1/messages", {
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

    const data = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: data.error?.message });

    res.json(data);

  } catch (error) {
    console.error("Analysis Error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => { console.log(`SDT Server active on port ${PORT}`); });

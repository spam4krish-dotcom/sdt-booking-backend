const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());

[span_6](start_span)// 1. Root & Health Routes[span_6](end_span)
app.get("/", (req, res) => {
  res.json({ status: "ok", message: "SDT Booking Assistant backend is live" });
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", message: "SDT running" });
});

[span_7](start_span)[span_8](start_span)// 2. Nookal GraphQL Fetcher[span_7](end_span)[span_8](end_span)
async function getNookalDiary() {
  const clientId = process.env.NOOKAL_CLIENT_ID;
  const basickey = process.env.NOOKAL_BASIC_KEY;

  if (!clientId || !basickey) {
    throw new Error("Missing NOOKAL CLIENT ID or NOOKAL BASIC KEY");
  }

  const credentials = Buffer.from(clientId + ":" + basickey).toString("base64");
  const today = new Date();
  const from = today.toISOString().split("T")[0];
  const future = new Date(today.getTime() + (30 * 24 * 60 * 60 * 1000));
  const to = future.toISOString().split("T")[0];

  [span_9](start_span)// Defining the GraphQL query as a clean string[span_9](end_span)
  const query = `
    query {
      appointments(filters: { dateFrom: "${from}", dateTo: "${to}" }, pagination: { data: { 
        id: true, 
        date: true, 
        startTime: true, 
        endTime: true, 
        status: true, 
        practitioner: { firstName: true, lastName: true }, 
        client: { firstName: true, lastName: true }, 
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
    throw new Error("Nookal GraphQL error " + response.status + ": " + text.substring(0, 100));
  }

  const data = await response.json();
  if (data.errors) {
    throw new Error("Nookal GraphQL errors: " + JSON.stringify(data.errors));
  }

  return data;
}

[span_10](start_span)// 3. Google Maps Drive Time Fetcher[span_10](end_span)
async function getDriveTime(origin, destination) {
  try {
    const key = process.env.GOOGLE_MAPS_API_KEY;
    const url = "https://maps.googleapis.com/maps/api/distancematrix/json?origins=" + 
      encodeURIComponent(origin + ", VIC, Australia") +
      "&destinations=" + encodeURIComponent(destination + ", VIC, Australia") +
      "&mode=driving&key=" + key;

    const response = await fetch(url);
    const data = await response.json();

    if (data.rows && data.rows[0] && data.rows[0].elements && data.rows[0].elements[0].status === "OK") {
      return {
        duration: data.rows[0].elements[0].duration.text,
        durationSeconds: data.rows[0].elements[0].duration.value,
        distance: data.rows[0].elements[0].distance.text
      };
    }
    return null;
  } catch (err) {
    console.error("Google Maps error:", err.message);
    return null;
  }
}

[span_11](start_span)[span_12](start_span)// 4. Main Analysis Route[span_11](end_span)[span_12](end_span)
app.post("/analyse", async (req, res) => {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Missing ANTHROPIC_API_KEY" });
    }

    const booking = req.body;
    const clientAddress = booking.clientAddress || "";

    [span_13](start_span)// A. Fetch Nookal diary[span_13](end_span)
    let diary = null;
    let nookalStatus = "";
    try {
      diary = await getNookalDiary();
      const apptCount = diary?.data?.appointments?.data?.length || 0;
      nookalStatus = "OK " + apptCount + " appointments fetched";
    } catch (err) {
      nookalStatus = "ERROR: " + err.message;
    }

    [span_14](start_span)[span_15](start_span)// B. Get Google Maps drive times[span_14](end_span)[span_15](end_span)
    const instructorBases = {
      "Christian": "Montmorency VIC",
      "Gabriel": "Croydon North VIC",
      "Greg": "Kilsyth VIC",
      "Jason": "Wandin North VIC",
      "Marc": "Werribee VIC",
      "Sherri": "Wandin North VIC",
      "Yves": "Rye VIC"
    };

    const driveTimes = {};
    for (const [name, base] of Object.entries(instructorBases)) {
      const dt = await getDriveTime(clientAddress, base);
      if (dt) driveTimes[name] = dt;
    }

    [span_16](start_span)// C. Format diary data for the AI[span_16](end_span)
    let diaryText = "";
    if (diary && diary.data && diary.data.appointments && diary.data.appointments.data) {
      const appts = diary.data.appointments.data;
      const byPractitioner = {};

      appts.forEach(a => {
        const name = (a.practitioner?.firstName || "") + " " + (a.practitioner?.lastName || "");
        if (!byPractitioner[name]) byPractitioner[name] = [];
        byPractitioner[name].push({
          date: a.date,
          start: a.startTime,
          end: a.endTime,
          location: a.location?.name || "",
          service: a.service?.name || ""
        });
      });
      diaryText = JSON.stringify(byPractitioner, null, 2);
    } else {
      diaryText = "UNAVAILABLE: " + nookalStatus;
    }

    [span_17](start_span)[span_18](start_span)// D. Anthropic System Prompt[span_17](end_span)[span_18](end_span)
    const systemPrompt = `You are the SDT Booking Assistant. Use REAL live diary data and drive times.
    
    INSTRUCTOR ROSTER:
    Christian Lagos (Montmorency): Comprehensive mods.
    Gabriel Lagos (Croydon North): Comprehensive mods.
    Greg Ekkel (Kilsyth): LFA, Indicator, Spinner.
    Jason Simmonds (Wandin North): LFA, Spinner only.
    Marc Seow (Werribee): LFA, Indicator, Extensions.
    Sherri Simmonds (Wandin North): NO adaptive mods.
    Yves Salzmann (Rye): LFA, Indicator, Spinner.`;

    const userMessage = `NEW BOOKING REQUEST:
    Client: ${booking.clientName}
    Address: ${clientAddress}
    Availability: ${booking.availability}
    Mods Needed: ${booking.modifications}
    
    DRIVE TIMES (To Base): ${JSON.stringify(driveTimes)}
    
    LIVE DIARY DATA: ${diaryText}`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        [span_19](start_span)model: "claude-3-5-sonnet-latest", // Updated to a stable, current model ID[span_19](end_span)
        max_tokens: 1500,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }]
      })
    });

    const data = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: data.error?.message || "AI Error" });

    res.json({
      ...data,
      debug: { nookal: nookalStatus, driveTimes: Object.keys(driveTimes).length }
    });

  } catch (error) {
    res.status(500).json({ error: "Internal server error: " + error.message });
  }
});

app.listen(PORT, () => {
  console.log("SDT Server active on port " + PORT);
});

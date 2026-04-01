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

// Fetch Nookal appointments using Token Exchange + GraphQL
async function getNookalDiary() {
  const clientId = process.env.NOOKAL_CLIENT_ID;
  const basickey = process.env.NOOKAL_BASIC_KEY;

  if (!clientId || !basickey) {
    throw new Error("Missing NOOKAL_CLIENT_ID or NOOKAL_BASIC_KEY");
  }

  // 1. Get Access Token via Basic Auth
  const credentials = Buffer.from(clientId + ":" + basickey).toString("base64");
  
  const tokenResponse = await fetch("https://auzone1.nookal.com/api/v3.0/token", {
    method: "POST",
    headers: {
      "Authorization": "Basic " + credentials,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: "grant_type=client_credentials"
  });

  if (!tokenResponse.ok) {
    const errText = await tokenResponse.text();
    throw new Error("Nookal token error " + tokenResponse.status + ": " + errText);
  }

  const tokenData = await tokenResponse.json();
  const accessToken = tokenData.access_token;

  if (!accessToken) {
    throw new Error("Failed to retrieve Nookal access token.");
  }

  // 2. Fetch Appointments via GraphQL with Bearer Token
  const today = new Date();
  const from = today.toISOString().split("T")[0];
  const future = new Date(today.getTime() + (30 * 24 * 60 * 60 * 1000));
  const to = future.toISOString().split("T")[0];

  const query = `query {
    appointments(filters: { dateFrom: "${from}", dateTo: "${to}" }, pagination: { limit: 200 }) {
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
  }`;

  const response = await fetch("https://auzone1.nookal.com/api/v3.0/graphql", {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + accessToken,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ query: query })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error("Nookal GraphQL error " + response.status + ": " + text.substring(0, 200));
  }

  const data = await response.json();
  if (data.errors) {
    throw new Error("Nookal GraphQL errors: " + JSON.stringify(data.errors));
  }

  return data;
}

// Get drive time from Google Maps
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

app.post("/analyse", async (req, res) => {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Missing ANTHROPIC_API_KEY" });
    }

    const booking = req.body;
    const clientAddress = booking.suburb || booking.clientAddress || "";

    // 1. Fetch Nookal diary
    let diary = null;
    let nookalStatus = "";
    try {
      console.log("Fetching Nookal diary...");
      diary = await getNookalDiary();
      const apptCount = diary?.data?.appointments?.data?.length || 0;
      nookalStatus = "OK " + apptCount + " appointments fetched";
      console.log("Nookal:", nookalStatus);
    } catch (err) {
      nookalStatus = "ERROR: " + err.message;
      console.error("Nookal failed:", err.message);
    }

    // 2. Get Google Maps drive times
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

    // 3. Format diary for Claude
    let diaryText = "";
    if (diary && diary.data && diary.data.appointments && diary.data.appointments.data) {
      const appts = diary.data.appointments.data;

      const byPractitioner = {};
      appts.forEach(a => {
        const name = (a.practitioner?.firstName || "") + " " + (a.practitioner?.lastName || "");
        const trimmedName = name.trim();
        if (!byPractitioner[trimmedName]) byPractitioner[trimmedName] = [];
        byPractitioner[trimmedName].push({
          date: a.date,
          start: a.startTime,
          end: a.endTime,
          client: (a.client?.firstName || "") + " " + (a.client?.lastName || ""),
          location: a.location?.name || "",
          service: a.service?.name || "",
          status: a.status
        });
      });

      Object.keys(byPractitioner).forEach(name => {
        byPractitioner[name].sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
      });

      diaryText = JSON.stringify(byPractitioner, null, 2);
    } else {
      diaryText = "UNAVAILABLE " + nookalStatus;
    }

    // 4. Build prompt
    const systemPrompt = `You are the SDT Booking Assistant for Specialised Driver Training in Melbourne, Victoria, Australia.
You have REAL live diary data from Nookal and REAL drive times from Google Maps.

INSTRUCTOR ROSTER AND VEHICLE MODIFICATIONS:
- Christian Lagos (base: Montmorency) Most comprehensive mods: Fadiel FSK2005, satellite accelerator, e-radial, Easy Drive LHS, all steering aids, left foot accelerator, extension pedals.
- Gabriel Lagos (base: Croydon North) Most comprehensive mods: Fadiel FSK2005, satellite accelerator, e-radial, over-ring accelerator, Monarch hand controls, all steering aids, left foot accelerator. Prefers East Melbourne. ON HOLIDAY 25-30 Apr 2026.
- Greg Ekkel (base: Kilsyth) Left foot accelerator, indicator extension, lollipop grip, steering ball.
- Jason Simmonds (base: Wandin North) ONLY left foot accelerator and standard spinner knob.
- Marc Seow (base: Werribee) Left foot accelerator, indicator extension, extension pedals, lollipop grip, steering ball.
- Sherri Simmonds (base: Wandin North) NO adaptive mods whatsoever. Standard lessons only.
- Yves Salzmann (base: Rye) Left foot accelerator, indicator extension, lollipop grip, steering ball.

RULES (apply in this order):
1. MODS FIRST Disqualify any instructor who does not have the required modifications.
2. ZONE Match instructor working area to client suburb
3. ROUTING Look at the actual diary. Find where the instructor is on each day and check drive times.
4. Be specific - name actual dates and times based on real diary gaps, not vague suggestions.`;

    const userMessage = `NEW BOOKING:
Client: ${booking.clientName || "Not provided"}
Address: ${clientAddress || "Not provided"}
Service: ${booking.serviceType || "Standard Driver Training"}
Funding: ${booking.funding || "Not provided"}
Availability: ${booking.availability || "Not provided"}
Duration: ${booking.duration || "Not provided"}
Modifications required: ${booking.modifications || "None"}
Mod notes: ${booking.modNotes || "None"}
Instructor preference: ${booking.instructorPreference || "None"}
Gender preference: ${booking.genderPreference || "None"}
Notes: ${booking.schedulingNotes || ""} ${booking.otherNotes || ""}

GOOGLE MAPS DRIVE TIMES (client to instructor home base):
${Object.entries(driveTimes).map(([k, v]) => k + ": " + v.duration + "/" + v.distance).join("\n")}

LIVE NOOKAL DIARY (grouped by instructor, next 30 days):
${diaryText}

Provide:
1. RECOMMENDED INSTRUCTOR - name and justification based on actual mods, actual drive times, and actual diary availability
2. GEOGRAPHIC ROUTING - using real Google Maps times and real diary locations
3. SUGGESTED TIME SLOT - specific date and time based on actual diary gaps
4. BACKUP OPTIONS - 1-2 alternatives with real reasoning
5. FLAGS - anything to resolve before confirming
6. NOOKAL BOOKING NOTE - ready-to-paste in SDT style`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
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

    if (!response.ok) {
      return res.status(response.status).json({ error: data.error?.message || "AI Error" });
    }

    res.json({
      ...data,
      _debug: {
        nookal: nookalStatus,
        driveTimes: Object.keys(driveTimes).length + " of 7 instructors"
      }
    });

  } catch (error) {
    console.error("Server error:", error);
    res.status(500).json({ error: "Internal server error: " + error.message });
  }
});

app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

app.listen(PORT, () => {
  console.log("SDT Server active on port " + PORT);
});

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

[span_1](start_span)// Fetch Nookal appointments via v3.0 GraphQL using Basic Auth directly[span_1](end_span)
async function getNookalDiary() {
  const clientId = process.env.NOOKAL_CLIENT_ID;
  [span_2](start_span)const basickey = process.env.NOOKAL_BASIC_KEY;[span_2](end_span)

  if (!clientId || !basickey) {
    [span_3](start_span)throw new Error("Missing NOOKAL CLIENT ID or NOOKAL BASIC KEY");[span_3](end_span)
  }

  [span_4](start_span)const credentials = Buffer.from(clientId + ":" + basickey).toString("base64");[span_4](end_span)
  const today = new Date();
  [span_5](start_span)const from = today.toISOString().split("T")[0];[span_5](end_span)
  const future = new Date(today.getTime() + (30 * 24 * 60 * 60 * 1000));
  [span_6](start_span)const to = future.toISOString().split("T")[0];[span_6](end_span)

  const query = `
    query {
      appointments(filters: { dateFrom: "${from}", dateTo: "${to}" }, pagination: { data: { id: true, date: true, startTime: true, endTime: true, status: true, practitioner: { firstName: true, lastName: true }, client: { firstName: true, lastName: true }, location: { name: true }, service: { name: true } } })
    }
  [span_7](start_span)`;[span_7](end_span)

  const response = await fetch("https://auzone1.nookal.com/api/v3.0/graphql", {
    method: "POST",
    headers: {
      "Authorization": "Basic " + credentials,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ query: query })
  [span_8](start_span)});[span_8](end_span)

  if (!response.ok) {
    const text = await response.text();
    throw new Error("Nookal GraphQL error " + response.status + ": " + text.substring(0, 100));
  }

  const data = await response.json();
  if (data.errors) {
    throw new Error("Nookal GraphQL errors: " + JSON.stringify(data.errors));
  }

  [span_9](start_span)return data;[span_9](end_span)
}

[span_10](start_span)// Get drive time from Google Maps[span_10](end_span)
async function getDriveTime(origin, destination) {
  try {
    const key = process.env.GOOGLE_MAPS_API_KEY;
    const url = "https://maps.googleapis.com/maps/api/distancematrix/json?origins=" + 
      encodeURIComponent(origin + ", VIC, Australia") +
      "&destinations=" + encodeURIComponent(destination + ", VIC, Australia") +
      [span_11](start_span)"&mode=driving&key=" + key;[span_11](end_span)

    [span_12](start_span)const response = await fetch(url);[span_12](end_span)
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
    [span_13](start_span)const clientAddress = booking.clientAddress || "";[span_13](end_span)

    [span_14](start_span)// 1. Fetch Nookal diary[span_14](end_span)
    let diary = null;
    let nookalStatus = "";
    try {
      console.log("Fetching Nookal diary...");
      diary = await getNookalDiary();
      const apptCount = diary?.data?.appointments?.data?.length || 0;
      [span_15](start_span)nookalStatus = "OK " + apptCount + " appointments fetched";[span_15](end_span)
      console.log("Nookal:", nookalStatus);
    } catch (err) {
      nookalStatus = "ERROR: " + err.message;
      [span_16](start_span)console.error("Nookal failed:", err.message);[span_16](end_span)
    }

    [span_17](start_span)// 2. Get Google Maps drive times[span_17](end_span)
    const instructorBases = {
      "Christian": "Montmorency VIC",
      "Gabriel": "Croydon North VIC",
      "Greg": "Kilsyth VIC",
      "Jason": "Wandin North VIC",
      "Marc": "Werribee VIC",
      "Sherri": "Wandin North VIC",
      "Yves": "Rye VIC"
    [span_18](start_span)};[span_18](end_span)

    const driveTimes = {};
    for (const [name, base] of Object.entries(instructorBases)) {
      const dt = await getDriveTime(clientAddress, base);
      [span_19](start_span)if (dt) driveTimes[name] = dt;[span_19](end_span)
    }

    [span_20](start_span)// 3. Format diary grouped by instructor[span_20](end_span)
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
          client: (a.client?.firstName || "") + " " + (a.client?.lastName || ""),
          location: a.location?.name || "",
          service: a.service?.name || "",
          status: a.status
        });
      [span_21](start_span)});[span_21](end_span)

      Object.keys(byPractitioner).forEach(name => {
        byPractitioner[name].sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
      });
      [span_22](start_span)diaryText = JSON.stringify(byPractitioner, null, 2);[span_22](end_span)
    } else {
      diaryText = "UNAVAILABLE " + nookalStatus;
    }

    const systemPrompt = `You are the SDT Booking Assistant for Specialised Driver Training...
You have REAL live diary data from Nookal and REAL drive times from Google Maps.

INSTRUCTOR ROSTER AND MODIFICATIONS:
Christian Lagos (base: Montmorency) Most comprehensive mods...
Gabriel Lagos (base: Croydon North) Most comprehensive mods...
Greg Ekkel (base: Kilsyth) Left foot accelerator, indicator extension...
Jason Simmonds (base: Wandin North) ONLY left foot accelerator...
Marc Seow (base: Werribee) Left foot accelerator, indicator extension...
Sherri Simmonds (base: Wandin North) NO adaptive mods...
Yves Salzmann (base: Rye) Left foot accelerator, indicator extension...

RULES:
1. MODS FIRST Disqualify instructor if they lack a required mod
2. ZONE Match instructor area to client suburb
3. ROUTING Use actual diary to find gaps. Check where instructor physically is
4. [span_23](start_span)Give specific dates and times from real diary gaps not vague suggestions;`;[span_23](end_span)

    const userMessage = `NEW BOOKING:
Client: ${booking.clientName}
Address: ${booking.clientAddress}
DOB: ${booking.clientDOB || "Not provided"}
Phone: ${booking.clientPhone || "Not provided"}
Service: ${booking.serviceType}
Funding: ${booking.funding}
Referral: ${booking.referral}
Availability: ${booking.availability}
Duration: ${booking.duration}
Pickup: ${booking.pickupLocation || "Client home"}
Modifications: ${booking.modifications}
Mod notes: ${booking.modNotes || "None"}
Instructor preference: ${booking.instructorPreference || "None"}
Gender preference: ${booking.genderPreference || "None"}
Notes: ${booking.schedulingNotes || ""} ${booking.otherNotes || ""}

GOOGLE MAPS DRIVE TIMES (client to instructor home base):
${Object.entries(driveTimes).map(([k, v]) => k + ": " + v.duration + "/" + v.distance).join(", ")}

LIVE NOOKAL DIARY (grouped by instructor, next 30 days):
[span_24](start_span)${diaryText}`;[span_24](end_span)

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
    [span_25](start_span)});[span_25](end_span)

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({ error: data.error?.message || "AI Error" });
    }

    res.json({
      ...data,
      debug: {
        nookal: nookalStatus,
        driveTimes: Object.keys(driveTimes).length + " of 7 instructors"
      }
    [span_26](start_span)});[span_26](end_span)

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
[span_27](start_span)});[span_27](end_span)

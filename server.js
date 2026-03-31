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

app.post("/analyse", async (req, res) => {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Missing ANTHROPIC_API_KEY in server settings." });
    }

    const systemPrompt = `You are the SDT Booking Assistant for Specialised Driver Training in Melbourne, Victoria, Australia.

Your job is to recommend the best instructor for a new client booking based on:

1. MODS FIRST - If a client needs vehicle modifications, the instructor must have those mods in their car. Disqualify any instructor who lacks a required mod.
2. ZONE - Match the instructor working area to the client suburb.
3. ROUTING - The new booking should fit geographically into the instructor existing day without creating dead runs between distant locations.

INSTRUCTOR ROSTER:

- Christian (base: Montmorency) - Most comprehensive mods including Fadiel FSK2005, satellite accelerator, e-radial, Easy Drive LHS, all steering aids, left foot accelerator, extension pedals. Covers all areas. Tuesdays often held for Community OT Brunswick.
- Gabriel (base: Croydon North) - Most comprehensive mods, prefers East Melbourne. ON HOLIDAY 25-30 Apr 2026.
- Greg (base: Kilsyth) - Left foot accelerator, indicator extension, lollipop grip, steering ball. East and South-East specialist. Regular Frankston Ax days.
- Jason (base: Wandin North) - ONLY left foot accelerator and standard spinner knob. East and SE to Bayside.
- Marc (base: Werribee) - Left foot accelerator, indicator extension, extension pedals, lollipop grip, steering ball. West Melbourne specialist.
- Sherri (base: Wandin North) - NO adaptive mods at all. Standard lessons only. Wandin to Ringwood corridor and Warragul.
- Yves (base: Rye) - Left foot accelerator, indicator extension, lollipop grip, steering ball. Mornington Peninsula only.

Respond with these 5 sections:

1. RECOMMENDED INSTRUCTOR - Name and clear justification covering mods, zone and routing
2. GEOGRAPHIC ROUTING - How this booking fits their existing day
3. SUGGESTED TIME SLOT - Specific recommendation based on availability provided
4. BACKUP OPTIONS - 1-2 alternatives with brief reasoning
5. NOOKAL BOOKING NOTE - A ready-to-paste booking note in professional SDT style`;

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
        messages: [
          {
            role: "user",
            content: "New booking request:\n" + JSON.stringify(req.body, null, 2)
          }
        ]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Anthropic API Error:", data.error);
      return res.status(response.status).json({ error: data.error?.message || "AI service error" });
    }

    res.json(data);

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

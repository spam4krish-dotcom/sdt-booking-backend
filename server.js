const express = require("express");
const cors = require("cors");
const ical = require("node-ical");

const app = express();
const PORT = process.env.PORT || 8080;

// ─── INSTRUCTOR DATABASE ─────────────────────────────────────────────────────
// Mods reflect actual vehicle equipment from vehicle inventory sheets.
// ICS URLs are the live Nookal calendar feeds for each instructor.
const INSTRUCTORS = [
  {
    name: "Christian",
    gender: "Male",
    mods: ["LFA", "Spinner", "Hand Controls", "Satellite", "Indicator Extension", "Extension Pedals"],
    base: "Montmorency",
    notes: "Covers all areas by arrangement. Full modifications vehicle.",
    icsUrl: "https://calsync.nookal.com/icsFile.php?HhXBkBCdHTLQaK4lrqfVa9ew%2FKnxwK8N60bfEsnM4Tix4fvM5lyQStblMTQiqaNaGeCeSgeSmXf%2F4kKI9OvU2fnXpnN%2FtMeidfD9E6WmLBWsPF881mF4%2FDKjqX6mENEnlggTWF2jMn8Em8aKgSGXA%3D%3D"
  },
  {
    name: "Gabriel",
    gender: "Male",
    mods: ["LFA", "Spinner", "Hand Controls", "Satellite", "Indicator Extension"],
    base: "Croydon North",
    notes: "Prefers East Melbourne but flexible. ON HOLIDAY 25 Apr 2026 to 30 Apr 2026 — do NOT book on these dates.",
    icsUrl: "https://calsync.nookal.com/icsFile.php?HhXBkBCdHTLQaK4lrqfVa9ew%2FKnxwK8N60bfEsnM4Tix4fvM5lyQStblMTQiqaNaGeCeSgeSmXf%2F4kKI9OvU2a52GEgwyPVJ%2B0I6mOab2rD4%2Bmqr7EYvQGR9ykfeKAj%2F"
  },
  {
    name: "Greg",
    gender: "Male",
    mods: ["LFA", "Spinner", "Indicator Extension"],
    base: "Kilsyth",
    notes: "Extended East and South-East coverage.",
    icsUrl: "https://calsync.nookal.com/icsFile.php?HhXBkBCdHTLQaK4lrqfVa9ew%2FKnxwK8N60bfEsnM4Tix4fvM5lyQStblMTQiqaNaGeCeSgeSmXf%2F4kKI9OvU2fgA7lzqZCrNH6P0mJPZWpJqu4G4d87qHmXHYUUq3ZhplneSIXp12lfHZzfvGyQdDw%3D%3D"
  },
  {
    name: "Jason",
    gender: "Male",
    mods: ["LFA", "Spinner"],
    base: "Wandin North",
    notes: "East and South-East up to Bayside wedge only.",
    icsUrl: "https://calsync.nookal.com/icsFile.php?HhXBkBCdHTLQaK4lrqfVa9ew%2FKnxwK8N60bfEsnM4Tix4fvM5lyQStblMTQiqaNaGeCeSgeSmXf%2F4kKI9OvU2Sks8REnxfIzFLWWhJgXRykKsTkQKIlND6Q3P8UWc8WWFJCS5Y5gIU0xiqPfnSz%2FkQ%3D%3D"
  },
  {
    name: "Marc",
    gender: "Male",
    mods: ["LFA", "Spinner", "Indicator Extension", "Extension Pedals"],
    base: "Werribee",
    notes: "West Melbourne specialist.",
    icsUrl: "https://calsync.nookal.com/icsFile.php?HhXBkBCdHTLQaK4lrqfVa9ew%2FKnxwK8N60bfEsnM4Tix4fvM5lyQStblMTQiqaNaGeCeSgeSmXf%2F4kKI9OvU2ecoRZN2xzdtmsUYY9vDrAuMuEJAzQSivaNXrwqSOqrMT982Jq4gficfE9XDNSVl0A%3D%3D"
  },
  {
    name: "Sherri",
    gender: "Female",
    mods: [],
    base: "Wandin North",
    notes: "STANDARD LESSONS ONLY. Cannot perform any vehicle modifications whatsoever. Area: Wandin to Ringwood radius, plus Warragul.",
    icsUrl: "https://calsync.nookal.com/icsFile.php?HhXBkBCdHTLQaK4lrqfVa9ew%2FKnxwK8N60bfEsnM4Tix4fvM5lyQStblMTQiqaNaGeCeSgeSmXf%2F4kKI9OvU2Qm9F8eQzb%2B6bu2IC%2FLaNBOOWmK9yskJZYl8guOGtP67bXXfuA0nBVLMaaPL2rsqew%3D%3D"
  },
  {
    name: "Yves",
    gender: "Male",
    mods: ["LFA", "Spinner", "Indicator Extension"],
    base: "Rye",
    notes: "Mornington Peninsula specialist.",
    icsUrl: "https://calsync.nookal.com/icsFile.php?HhXBkBCdHTLQaK4lrqfVa9ew%2FKnxwK8N60bfEsnM4Tix4fvM5lyQStblMTQiqaNaJ6xepUO6AS0mQIBuSqW%2BOWjh2dEdLM2ryJYQBbgLemmcR6jFHgrJeGdQCO3yfSW7dInaTI63gFq7aNCi2ArGCg%3D%3D"
  }
];

// ─── ICS CALENDAR FETCH ───────────────────────────────────────────────────────
// Wraps ical.async.fromURL with a timeout so a slow feed doesn't stall the request.
async function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("timeout")), ms);
  });
  try {
    const result = await Promise.race([promise, timeout]);
    clearTimeout(timer);
    return result;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

async function fetchInstructorCalendar(instructor) {
  try {
    const rawData = await withTimeout(ical.async.fromURL(instructor.icsUrl), 12000);
    const now = new Date();
    const future = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const appts = [];

    for (const [, event] of Object.entries(rawData)) {
      if (event.type !== "VEVENT") continue;

      const start = new Date(event.start);
      const end = new Date(event.end);

      if (isNaN(start.getTime()) || start < now || start > future) continue;

      appts.push({
        _sort: start.getTime(),
        date: start.toLocaleDateString("en-AU", {
          timeZone: "Australia/Melbourne",
          weekday: "short",
          day: "numeric",
          month: "short",
          year: "numeric"
        }),
        startTime: start.toLocaleTimeString("en-AU", {
          timeZone: "Australia/Melbourne",
          hour: "2-digit",
          minute: "2-digit",
          hour12: true
        }),
        endTime: end.toLocaleTimeString("en-AU", {
          timeZone: "Australia/Melbourne",
          hour: "2-digit",
          minute: "2-digit",
          hour12: true
        }),
        summary: event.summary || "Appointment",
        location: event.location || ""
      });
    }

    appts.sort((a, b) => a._sort - b._sort);
    return appts.map(({ _sort, ...rest }) => rest);

  } catch (err) {
    console.error(`ICS fetch failed for ${instructor.name}: ${err.message}`);
    return [];
  }
}

// ─── HARD FILTER HELPERS ──────────────────────────────────────────────────────
function modRequested(text, ...terms) {
  const upper = text.toUpperCase();
  return terms.some(t => upper.includes(t));
}

function filterInstructors(booking) {
  const mods = booking.modifications || "";

  const needsLFA         = modRequested(mods, "LFA", "LEFT FOOT");
  const needsHandCtrls   = modRequested(mods, "HAND CONTROL");
  const needsSatellite   = modRequested(mods, "SATELLITE");
  const needsSpinner     = modRequested(mods, "SPINNER", "STEERING AID", "SPINNER KNOB");
  const needsExtPedals   = modRequested(mods, "EXTENSION PEDAL", "EXT PEDAL", "PEDAL EXTENSION");
  const needsIndicator   = modRequested(mods, "INDICATOR");

  let qualified = INSTRUCTORS.filter(ins => {
    if (needsLFA       && !ins.mods.includes("LFA"))               return false;
    if (needsHandCtrls && !ins.mods.includes("Hand Controls"))     return false;
    if (needsSatellite && !ins.mods.includes("Satellite"))         return false;
    if (needsSpinner   && !ins.mods.includes("Spinner"))           return false;
    if (needsExtPedals && !ins.mods.includes("Extension Pedals"))  return false;
    if (needsIndicator && !ins.mods.includes("Indicator Extension")) return false;
    return true;
  });

  // Apply gender preference — only filter if it would leave at least one result
  const genderPref = booking.genderPreference;
  if (genderPref && genderPref !== "None") {
    const byGender = qualified.filter(i => i.gender === genderPref);
    if (byGender.length > 0) qualified = byGender;
  }

  return qualified;
}

// ─── MAIN ANALYSIS ROUTE ──────────────────────────────────────────────────────
app.post("/analyse", async (req, res) => {
  try {
    const booking = req.body;

    // 1. Filter instructors by modification capability (hard filter — runs before AI)
    const qualifiedInstructors = filterInstructors(booking);

    if (qualifiedInstructors.length === 0) {
      return res.status(400).json({
        error: "No instructors are qualified for the combination of modifications requested. Please check the modification details."
      });
    }

    // 2. Fetch ICS calendars only for qualified instructors (parallel)
    const diaries = await Promise.all(
      qualifiedInstructors.map(async (instructor) => {
        const appointments = await fetchInstructorCalendar(instructor);
        return {
          name: instructor.name,
          gender: instructor.gender,
          base: instructor.base,
          mods: instructor.mods,
          notes: instructor.notes,
          appointments
        };
      })
    );

    // 3. Current Melbourne time (Railway TZ=Australia/Melbourne ensures this is correct)
    const melbTime = new Date().toLocaleString("en-AU", {
      timeZone: "Australia/Melbourne",
      dateStyle: "full",
      timeStyle: "short"
    });

    // 4. Build system prompt
    const systemPrompt = `You are the SDT Booking Assistant for Specialised Driver Training (SDT) in Melbourne, Australia.

CURRENT MELBOURNE DATE & TIME: ${melbTime}
This is the authoritative "now". All date calculations must start from this exact date. Do not infer, guess, or recalculate the current date yourself.

═══════════════════════════════════════════
CLIENT REQUEST DETAILS
═══════════════════════════════════════════
Name:                ${booking.clientName}
Suburb:              ${booking.suburb}
Funding:             ${booking.funding}
Lesson Duration:     ${booking.duration} minutes
Modifications:       ${booking.modifications || "None (standard lesson)"}
Modification Notes:  ${booking.modNotes || "N/A"}
Client Availability: ${booking.availability}
Instructor Pref:     ${booking.instructorPreference || "None"}
Gender Preference:   ${booking.genderPreference || "No Preference"}
Scheduling Notes:    ${booking.schedulingNotes || "None"}
Other Notes:         ${booking.otherNotes || "None"}

═══════════════════════════════════════════
QUALIFIED INSTRUCTOR DIARIES
(Pre-filtered — every instructor below CAN do the requested modifications)
═══════════════════════════════════════════
${JSON.stringify(diaries, null, 2)}

═══════════════════════════════════════════
HARD RULES — NON-NEGOTIABLE
═══════════════════════════════════════════
1. ONLY recommend instructors from the QUALIFIED list above. Never suggest anyone else.
2. Sherri does ZERO modifications. If she appears above, the client has no modification requirements.
3. Gabriel is on holiday 25 Apr 2026 to 30 Apr 2026. Do NOT suggest him on those dates.
4. Find gaps in the diary that can fit [lesson duration] PLUS realistic travel time to the client's suburb.
5. TRAVEL LOGIC:
   a. If the instructor has an appointment ending before the proposed slot, travel comes FROM that appointment's location.
   b. If it is the instructor's first appointment of the day, travel comes FROM their home base suburb.
   c. Use your knowledge of Melbourne geography to estimate realistic drive times (e.g. Kilsyth to Werribee ≈ 55 min, Montmorency to Frankston ≈ 60 min).
6. Match the client's stated availability (days and AM/PM) to real upcoming calendar dates based on the current Melbourne date.
7. Do NOT suggest a slot that is already occupied in the diary.
8. If the diary shows no appointments (empty), the instructor is fully open — any slot that matches client availability is valid.

═══════════════════════════════════════════
OUTPUT FORMAT
═══════════════════════════════════════════
Plain text only. No markdown bold, no asterisks, no bullet symbols.
Provide exactly 3 ranked recommendations.

For each recommendation use this structure:
RECOMMENDATION [N]
Instructor: [name]
Date: [day, date Month Year]
Proposed Start: [time]
Proposed End: [time]
Previous Appointment Ends: [time and location, or "First appointment of the day"]
Travel from: [suburb/location] to [client suburb] — estimated [X] min drive
Why this slot works: [one concise sentence]`;

    // 5. Call Claude AI
    const aiResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{
          role: "user",
          content: `Please analyse the diary data and provide 3 booking recommendations for ${booking.clientName} in ${booking.suburb}. Lesson: ${booking.duration} min${booking.modifications ? ", requires " + booking.modifications : ""}. Client availability: ${booking.availability}.`
        }]
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

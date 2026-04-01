const express = require("express");
const cors = require("cors");
const ical = require("node-ical");

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());

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
    icsUrl: "https://calsync.nookal.com/icsFile.php?HhXBkBCdHTLQaK4lrqfVa9ew%2FKnxwK8N60bfEsnM4Tix4fvM5lyQStblMTQiqaNaGeCeSgeSmXf%2F4kKI9OvU2fnXpnN%2FtMeidfD9E6WmLBWPsPF881mF4%2FDKjqX6mENEnlggTWF2jMn8Em8aKgSGXA%3D%3D"
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
async function fetchInstructorCalendar(instructor) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      console.error(`ICS timeout for ${instructor.name}`);
      resolve([]);
    }, 12000);

    ical.fromURL(instructor.icsUrl, {}, (err, rawData) => {
      clearTimeout(timer);
      if (err) {
        console.error(`ICS fetch failed for ${instructor.name}: ${err.message}`);
        return resolve([]);
      }

      const now = new Date();
      const future = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      const appts = [];

      for (const key in rawData) {
        const event = rawData[key];
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
      resolve(appts.map(({ _sort, ...rest }) => rest));
    });
  });
}

// ─── GOOGLE MAPS TRAVEL TIME ──────────────────────────────────────────────────
async function getDriveTime(origin, destination) {
  try {
    const key = process.env.GOOGLE_MAPS_API_KEY;
    if (!key) return null;
    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(origin + ", VIC, Australia")}&destinations=${encodeURIComponent(destination + ", VIC, Australia")}&mode=driving&key=${key}`;
    const resp = await fetch(url);
    const data = await resp.json();
    const el = data.rows?.[0]?.elements?.[0];
    if (el?.status === "OK") {
      return { duration: el.duration.text, distance: el.distance.text };
    }
    return null;
  } catch {
    return null;
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
    const clientSuburb = booking.suburb || "Melbourne";

    // 1. Hard-filter instructors by modification capability (before AI ever sees anything)
    const qualifiedInstructors = filterInstructors(booking);
    if (qualifiedInstructors.length === 0) {
      return res.status(400).json({
        error: "No instructors are qualified for the modifications requested. Please check the modification details."
      });
    }

    // 2. Fetch ICS calendars + Google Maps travel times in parallel
    const [diaries, travelTimes] = await Promise.all([
      Promise.all(
        qualifiedInstructors.map(async (instructor) => {
          const appointments = await fetchInstructorCalendar(instructor);
          return {
            name: instructor.name,
            base: instructor.base,
            mods: instructor.mods,
            notes: instructor.notes,
            appointments
          };
        })
      ),
      Promise.all(
        qualifiedInstructors.map(async (instructor) => {
          const travel = await getDriveTime(instructor.base, clientSuburb);
          return { name: instructor.name, fromBase: travel };
        })
      )
    ]);

    // 3. Authoritative Melbourne time
    const melbTime = new Date().toLocaleString("en-AU", {
      timeZone: "Australia/Melbourne",
      dateStyle: "full",
      timeStyle: "short"
    });

    // Build travel lookup string for the prompt
    const travelSummary = travelTimes
      .map(t => `${t.name}: ${t.fromBase ? t.fromBase.duration + " / " + t.fromBase.distance : "unknown"} from base to ${clientSuburb}`)
      .join("\n");

    // 4. Prompt
    const systemPrompt = `You are the SDT Booking Assistant for Specialised Driver Training in Melbourne, Australia.

CURRENT MELBOURNE DATE & TIME: ${melbTime}
Use this as today. Do not recalculate or guess the date.

CLIENT
Name: ${booking.clientName}
Suburb: ${clientSuburb}
Funding: ${booking.funding}
Duration: ${booking.duration} min
Modifications required: ${booking.modifications || "None"}
Modification notes: ${booking.modNotes || ""}
Availability: ${booking.availability}
Scheduling notes: ${booking.schedulingNotes || ""}
Other notes: ${booking.otherNotes || ""}
Instructor preference: ${booking.instructorPreference || "None"}

TRAVEL TIMES FROM INSTRUCTOR HOME BASE TO CLIENT SUBURB
${travelSummary}

QUALIFIED INSTRUCTOR DIARIES (next 30 days)
Every instructor in this list has the required vehicle modifications. Do not suggest anyone outside this list.
${JSON.stringify(diaries, null, 2)}

RULES
1. Only recommend instructors from the list above.
2. Sherri has no modifications — she only appears if no modifications were requested.
3. Gabriel is on holiday 25–30 Apr 2026. Do not suggest him on those dates.
4. A slot is only valid if it fits the lesson duration PLUS travel time.
5. Travel origin: if the instructor has a lesson ending before the proposed slot, travel comes FROM that lesson's location. If it is their first lesson of the day, travel comes FROM their home base.
6. Use real travel times from the TRAVEL TIMES section above where available. For travel from mid-day locations, estimate using your Melbourne geography knowledge.
7. Match the client's availability to real upcoming dates (day-of-week → next actual calendar date).
8. Do not suggest a slot already blocked in the diary.
9. Multiple options can be the same instructor on different days — pick whatever is genuinely optimal.

OUTPUT
Plain text only. No asterisks, no bold, no bullet points, no filler sentences.
Give 3 to 5 options ranked best-first. Start each directly with the slot details.

Format each option exactly like this:

OPTION [N]
[Instructor] — [Day] [Date] [Month], [Start time] to [End time]
Travel: from [location] (~[X] min drive)
Previous appointment: [ends HH:MM at Location] or [first appointment of the day]`;

    // 5. Call Claude
    const aiResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1500,
        system: systemPrompt,
        messages: [{
          role: "user",
          content: `Find the best ${booking.duration}-min booking options for ${booking.clientName} in ${clientSuburb}. Availability: ${booking.availability}. Modifications: ${booking.modifications || "none"}.`
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

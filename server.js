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
// node-ical 0.20.x fromURL is an async function — must be awaited, not called with a callback.
async function fetchInstructorCalendar(instructor) {
  try {
    const rawData = await Promise.race([
      ical.async.fromURL(instructor.icsUrl),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("ICS timeout")), 12000)
      )
    ]);

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
        startISO: start.toISOString(),
        endISO: end.toISOString(),
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
        location: event.location || "",
        notes: (event.description || "").replace(/\n/g, " ").trim()
      });
    }

    appts.sort((a, b) => new Date(a.startISO) - new Date(b.startISO));

    // Post-process: resolve lesson location for each appointment.
    //
    // Priority order:
    //  1. "from home" wording in notes → use ICS location field if populated
    //     (Nookal auto-fills it with the client's registered address), otherwise
    //     look the client up in Nookal by name.
    //  2. A Melbourne suburb name appears in the notes (e.g. "Preston") →
    //     look the client up in Nookal to get their registered address; fall back
    //     to the suburb extracted from the notes if Nookal returns nothing.
    for (const appt of appts) {
      if (appointmentIsFromHome(appt.notes)) {
        if (appt.location) {
          appt.lessonLocation = appt.location + " (client home)";
        } else {
          const suburb = await getNookalClientSuburb(appt.summary);
          if (suburb) appt.lessonLocation = suburb + " (client home, from Nookal)";
        }
      } else if (!appt.lessonLocation) {
        // Suburb mentioned in notes but not an explicit "from home" phrase
        const suburbInNotes = extractNoteSuburb(appt.notes);
        if (suburbInNotes) {
          // Try Nookal first for the registered street/suburb; fall back to the
          // suburb name found in the notes.
          const nookalSuburb = await getNookalClientSuburb(appt.summary);
          if (nookalSuburb) {
            appt.lessonLocation = nookalSuburb + " (from Nookal)";
          } else {
            appt.lessonLocation = suburbInNotes + " (from notes)";
          }
          console.log(`Location from notes: "${suburbInNotes}" → resolved to "${appt.lessonLocation}" for ${appt.summary}`);
        }
      }
    }

    console.log(`ICS OK: ${instructor.name} — ${appts.length} appointments fetched`);
    return appts;

  } catch (err) {
    console.error(`ICS fetch error for ${instructor.name}: ${err.message}`);
    return [];
  }
}

// ─── FORMAT DIARY AS READABLE TEXT FOR AI ────────────────────────────────────
// Converts appointment arrays into a clear per-day schedule the AI can reason about.
function formatDiaryForAI(diary) {
  if (!diary.appointments || diary.appointments.length === 0) {
    return `${diary.name} (base: ${diary.base}): No appointments on record for the next 30 days — fully available.\n`;
  }

  // Group by date label
  const byDate = {};
  for (const appt of diary.appointments) {
    if (!byDate[appt.date]) byDate[appt.date] = [];
    byDate[appt.date].push(appt);
  }

  let text = `${diary.name} (base: ${diary.base}):\n`;
  for (const [date, appts] of Object.entries(byDate)) {
    const sorted = [...appts].sort((a, b) => new Date(a.startISO) - new Date(b.startISO));
    text += `  ${date}:\n`;
    for (const appt of sorted) {
      // lessonLocation = resolved actual meeting point (home addr or notes-derived suburb)
      // location = raw ICS field (client's Nookal address, not always the lesson pickup)
      const lessonLoc = appt.lessonLocation ? ` | LESSON LOCATION: ${appt.lessonLocation}` : "";
      const addrField = (!appt.lessonLocation && appt.location) ? ` | addr: ${appt.location}` : "";
      const notesField = appt.notes ? ` | notes: ${appt.notes}` : "";
      text += `    [BUSY] ${appt.startTime} – ${appt.endTime}: ${appt.summary}${lessonLoc}${addrField}${notesField}\n`;
    }
  }
  return text;
}

// ─── NOOKAL CLIENT ADDRESS LOOKUP ────────────────────────────────────────────
// Looks up the client's registered suburb in Nookal by their name (parsed from
// the ICS summary line). Used both for "from home" appointments and when notes
// mention a suburb name — in both cases we want the actual registered address.
// Results are cached in-memory for the life of the process.
const clientSuburbCache = {};

async function getNookalClientSuburb(rawSummary) {
  // Strip Nookal display prefixes ($ ★ ☆ emoji) from the client name
  const name = rawSummary.replace(/^[$★☆\s]+/, "").trim();
  if (!name || name.length < 3) return null;

  if (clientSuburbCache[name] !== undefined) return clientSuburbCache[name];

  try {
    const cid = process.env.NOOKAL_CLIENT_ID;
    const key = process.env.NOOKAL_BASIC_KEY;
    if (!cid || !key) return null;

    const creds = Buffer.from(`${cid}:${key}`).toString("base64");
    const parts = name.split(/\s+/);
    const firstName = parts[0];
    const lastName = parts.slice(1).join(" ");

    const query = `{
      clients(filters: { firstName: "${firstName}", lastName: "${lastName}" }) {
        data {
          firstName
          lastName
          address { suburb }
        }
      }
    }`;

    const resp = await fetch("https://auzone1.nookal.com/api/v3.0/graphql", {
      method: "POST",
      headers: {
        "Authorization": "Basic " + creds,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(8000)
    });

    if (!resp.ok) {
      console.error(`Nookal client lookup HTTP ${resp.status} for "${name}"`);
      clientSuburbCache[name] = null;
      return null;
    }

    const result = await resp.json();

    if (result.errors) {
      console.error(`Nookal GraphQL error for "${name}":`, JSON.stringify(result.errors[0]));
      clientSuburbCache[name] = null;
      return null;
    }

    const suburb = result?.data?.clients?.data?.[0]?.address?.suburb || null;
    clientSuburbCache[name] = suburb;
    console.log(`Nookal address lookup: "${name}" → ${suburb || "not found"}`);
    return suburb;

  } catch (err) {
    console.error(`Nookal client lookup error for "${name}": ${err.message}`);
    clientSuburbCache[name] = null;
    return null;
  }
}

// Detect "from home" / "pickup from home" type notes
function appointmentIsFromHome(notes) {
  const l = (notes || "").toLowerCase();
  return l.includes("from home") || l.includes("p/u home") ||
         l.includes("p/u from home") || l.includes("pickup from home") ||
         l.includes("pick up from home") || l.includes("start at home") ||
         l.includes("start from home") || l.includes("lesson from home") ||
         l.includes("lesson at home") || l.includes("at home") ||
         l.includes("home lesson") || l.includes("home pickup");
}

// ─── MELBOURNE SUBURB DETECTION ───────────────────────────────────────────────
// When notes mention a suburb (e.g. "Preston") instead of "from home",
// extract it so we can resolve the client's full address via Nookal.
const MELBOURNE_SUBURBS = new Set([
  // Inner / CBD
  "Melbourne","CBD","Docklands","Southbank","South Yarra","Toorak","Prahran",
  "Windsor","Fitzroy","Collingwood","Abbotsford","Richmond","Cremorne",
  "Hawthorn","Camberwell","Glen Iris","Malvern","Caulfield","Carnegie",
  // North
  "Carlton","Parkville","Kensington","Flemington","Moonee Ponds","Ascot Vale",
  "Brunswick","Coburg","Preston","Thornbury","Northcote","Reservoir","Bundoora",
  "Heidelberg","Ivanhoe","Doncaster","Templestowe","Eltham","Greensborough",
  "Diamond Creek","Hurstbridge","Epping","South Morang","Mill Park","Lalor",
  "Thomastown","Kingsbury","Macleod","Watsonia","Montmorency","Eltham North",
  "Craigieburn","Broadmeadows","Glenroy","Pascoe Vale","Essendon","Keilor",
  // East
  "Box Hill","Mitcham","Nunawading","Blackburn","Forest Hill","Ringwood",
  "Croydon","Bayswater","Boronia","Ferntree Gully","Knoxfield","Wantirna",
  "Vermont","Balwyn","Kew","Doncaster East","Warrandyte","Lilydale","Mooroolbark",
  "Kilsyth","Wandin North","Wandin","Yarra Glen","Healesville",
  // South / Bayside
  "Oakleigh","Clayton","Springvale","Mulgrave","Wheelers Hill","Rowville",
  "Glen Waverley","Burwood","Mount Waverley","Syndal","Glen Iris","Ashwood",
  "Cheltenham","Moorabbin","Mentone","Parkdale","Mordialloc","Sandringham",
  "Hampton","Beaumaris","Brighton","Elwood","St Kilda","Port Melbourne",
  "South Melbourne","Middle Park","Albert Park",
  // South-East
  "Dandenong","Noble Park","Keysborough","Hallam","Narre Warren","Berwick",
  "Officer","Pakenham","Cranbourne","Lyndhurst","Bangholme","Seaford",
  "Carrum Downs","Langwarrin","Patterson Lakes","Chelsea","Bonbeach",
  "Edithvale","Aspendale","Braeside","Dingley Village",
  // Frankston / Peninsula
  "Frankston","Karingal","Carrum Downs","Skye","Baxter","Somerville",
  "Mornington","Mount Eliza","Mt Eliza","Rosebud","Rye","Sorrento","McCrae",
  "Safety Beach","Dromana","Hastings","Tyabb","Pearcedale","Tooradin",
  // West
  "Williamstown","Newport","Altona","Laverton","Hoppers Crossing","Werribee",
  "Point Cook","Tarneit","Wyndham Vale","Melton","Caroline Springs",
  "Sunshine","Footscray","Yarraville","Seddon","Kingsville","Maribyrnong",
  // Geelong direction
  "Little River","Lara","Norlane","Corio","Geelong",
]);

/**
 * Scans appointment notes for a Melbourne suburb name.
 * Handles patterns like "Preston", "at Preston", "pickup Preston",
 * "from Preston", "lesson in Preston", etc.
 * Returns the suburb string if found, otherwise null.
 */
function extractNoteSuburb(notes) {
  if (!notes || notes.trim().length === 0) return null;

  // Try explicit preposition patterns first: "at X", "from X", "in X", "pickup X"
  const prepPattern = /\b(?:at|from|in|pickup|pick\s*up|p\/u)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)\b/g;
  let m;
  while ((m = prepPattern.exec(notes)) !== null) {
    const candidate = m[1].trim();
    if (MELBOURNE_SUBURBS.has(candidate)) return candidate;
    // Try just the first word (e.g. "Mount Eliza" where only "Mount" starts the match)
    const firstWord = candidate.split(/\s+/)[0];
    if (MELBOURNE_SUBURBS.has(firstWord)) return firstWord;
  }

  // Fall back: scan all Title-Case words/phrases in the notes
  const words = notes.match(/\b[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?\b/g) || [];
  for (const word of words) {
    if (MELBOURNE_SUBURBS.has(word)) return word;
  }

  return null;
}


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

    // 4. Format diary as readable text (not raw JSON) so AI can reason about busy/free times
    const diaryText = diaries.map(formatDiaryForAI).join("\n");

    // 5. Prompt
    const systemPrompt = `You are the SDT Booking Assistant for Specialised Driver Training in Melbourne, Australia.

CURRENT MELBOURNE DATE & TIME: ${melbTime}
Use this exact date/time as now. Do not recalculate it.

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

TRAVEL TIMES (instructor home base → client suburb, from Google Maps)
${travelSummary}

INSTRUCTOR SCHEDULES — NEXT 30 DAYS
Every instructor listed has already been confirmed capable of the required modifications.
[BUSY] lines are confirmed appointments. Any time NOT marked [BUSY] is potentially free.

${diaryText}

RULES
1. Only suggest instructors shown above.
2. Sherri has no vehicle modifications — she only appears here if the client needs no modifications.
3. Gabriel is on holiday 25–30 Apr 2026. Do not suggest him on those dates.

4. SLOT VALIDITY — run this exact calculation for EVERY candidate slot. Reject it if the numbers do not work out.

   Definitions:
     PREV_END    = clock time the appointment before the slot ends
     PREV_LOC    = suburb/location of that appointment
     TRAVEL_IN   = driving minutes from PREV_LOC to the client's suburb
     LESSON      = lesson duration in minutes (given above)
     NEXT_START  = clock time the appointment after the slot begins
     NEXT_LOC    = suburb/location of that next appointment
     TRAVEL_OUT  = driving minutes from client's suburb to NEXT_LOC
     BUFFER      = 10 minutes (mandatory padding on each travel leg for parking/delays)

   Calculations:
     EARLIEST_START = PREV_END + TRAVEL_IN + BUFFER
     EARLIEST_START must then be rounded UP to the next quarter-hour (:00, :15, :30, or :45).
     Examples: 1:25pm → 1:30pm, 2:50pm → 3:00pm, 10:08am → 10:15am, 9:00am → 9:00am (already on quarter).
     LESSON_END     = rounded EARLIEST_START + LESSON
     ARRIVE_NEXT    = LESSON_END + TRAVEL_OUT + BUFFER

   Validity check:
     ARRIVE_NEXT must be <= NEXT_START.
     If ARRIVE_NEXT > NEXT_START, the slot is IMPOSSIBLE. Discard it silently. Do not mention it in the output.
     If there is no next appointment, ARRIVE_NEXT does not need to meet any deadline.
     If there is no previous appointment, PREV_END = start of day; TRAVEL_IN comes from instructor home base.

5. TRAVEL TIMES:
   a. Use the Google Maps figures provided above for instructor base → client suburb.
   b. For travel between two mid-day appointments in different suburbs, use your knowledge of Melbourne geography. Be conservative — add 5 min to any estimate you are uncertain about.
   c. Travel IN (to client) always comes FROM wherever the instructor's previous appointment is located, not from their home base (unless it is the first appointment of the day).

6. LOCATION PRIORITY for each existing appointment (use the first available field):
   a. "LESSON LOCATION:" — confirmed pickup/meeting point. Always use this if present.
   b. "notes:" field — look for a suburb or place name (e.g. "from ActiveOne FRANKSTON" → Frankston).
   c. "addr:" field — client's registered Nookal address, last resort.

7. Map the client's availability (e.g. "Mon AM") to real upcoming calendar dates from today's date.
8. Never suggest a time that overlaps with a [BUSY] block.
9. Multiple options can be the same instructor on different days if that is genuinely the best fit.

OUTPUT RULES
Do all slot validity calculations silently — never print rejected candidates, never show your working.
Plain text only. No asterisks, no bold, no bullet symbols.
Give 3 to 5 valid options, best first.
Each option must follow this exact format with no extra lines or commentary between options:

OPTION [N]
[Instructor] — [Day] [Date] [Month], [Start time] to [End time]
Appointment before: [client name, ends HH:MM at suburb] OR [no appointment — travelling from base]
Appointment after: [client name, starts HH:MM at suburb] OR [no appointment after]
Travel to client: from [suburb] ~[X] min
Travel to next: ~[X] min to [next appointment suburb] OR [n/a]
Gap check: arrives next at [HH:MM] vs next appt [HH:MM] — OK`;

    // 6. Call Claude
    const aiResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 3000,
        system: systemPrompt,
        messages: [{
          role: "user",
          content: `Find the best ${booking.duration}-min booking options for ${booking.clientName} in ${clientSuburb}. Availability: ${booking.availability}. Modifications: ${booking.modifications || "none"}. Check every candidate slot against the SLOT VALIDITY formula before including it. Only output passing options in the required format.`
        }]
      })
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error(`Anthropic API error ${aiResponse.status}: ${errText}`);
      return res.status(502).json({ error: `AI service error: ${aiResponse.status}` });
    }

    const data = await aiResponse.json();
    res.json(data);

  } catch (error) {
    console.error("Server Error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// ─── DEBUG: verify Nookal client lookup ──────────────────────────────────────
// GET /debug-client?name=John+Mitford
// Returns the raw Nookal API response so we can see the exact field structure.
app.get("/debug-client", async (req, res) => {
  const name = req.query.name;
  if (!name) return res.status(400).json({ error: "Pass ?name=First+Last" });

  const parts = name.replace(/^[$★☆\s]+/, "").trim().split(/\s+/);
  const firstName = parts[0];
  const lastName = parts.slice(1).join(" ");

  try {
    const cid = process.env.NOOKAL_CLIENT_ID;
    const key = process.env.NOOKAL_BASIC_KEY;
    const creds = Buffer.from(`${cid}:${key}`).toString("base64");

    const query = `{
      clients(filters: { firstName: "${firstName}", lastName: "${lastName}" }) {
        data {
          firstName
          lastName
          address { suburb }
        }
      }
    }`;

    // Try three plausible Nookal endpoint formats and return all results
    const endpoints = [
      { label: "GraphQL POST", url: "https://auzone1.nookal.com/api/v3.0/graphql", method: "POST", body: JSON.stringify({ query }) },
      { label: "REST GET clients", url: `https://auzone1.nookal.com/api/v3.0/clients/?firstName=${encodeURIComponent(firstName)}&lastName=${encodeURIComponent(lastName)}`, method: "GET", body: null },
      { label: "REST POST clients", url: "https://auzone1.nookal.com/api/v3.0/clients/", method: "POST", body: JSON.stringify({ firstName, lastName }) }
    ];

    const results = [];
    for (const ep of endpoints) {
      try {
        const r = await fetch(ep.url, {
          method: ep.method,
          headers: { "Authorization": "Basic " + creds, "Content-Type": "application/json" },
          ...(ep.body ? { body: ep.body } : {}),
          signal: AbortSignal.timeout(8000)
        });
        const text = await r.text();
        let parsed = null;
        try { parsed = JSON.parse(text); } catch {}
        results.push({ label: ep.label, httpStatus: r.status, rawText: text.slice(0, 500), parsed });
      } catch (err) {
        results.push({ label: ep.label, error: err.message });
      }
    }

    res.json({ queriedName: name, firstName, lastName, results });
  } catch (err) {
    res.json({ error: err.message });
  }
});

// ─── DEBUG: verify ICS fetch for one instructor ───────────────────────────────
// GET /debug?name=Christian  (or Greg, Gabriel, etc.)
app.get("/debug", async (req, res) => {
  const name = req.query.name || "Christian";
  const instructor = INSTRUCTORS.find(i => i.name.toLowerCase() === name.toLowerCase());
  if (!instructor) return res.status(404).json({ error: `Unknown instructor: ${name}` });
  const appts = await fetchInstructorCalendar(instructor);
  res.json({ instructor: instructor.name, count: appts.length, appointments: appts });
});

app.get("/health", (req, res) => res.json({ status: "ok" }));

app.listen(PORT, () => console.log(`SDT Backend running on port ${PORT}`));

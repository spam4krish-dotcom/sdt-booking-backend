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
    mods: ["LFA", "Standard Spinner", "Electronic Spinner", "E-Radial", "Tri Pin", "Hand Controls", "Satellite", "Easy Drive", "Indicator Extension", "Extension Pedals"],
    base: "Montmorency",
    notes: "Covers all areas by arrangement. Full modifications vehicle.",
    icsUrl: "https://calsync.nookal.com/icsFile.php?HhXBkBCdHTLQaK4lrqfVa9ew%2FKnxwK8N60bfEsnM4Tix4fvM5lyQStblMTQiqaNaGeCeSgeSmXf%2F4kKI9OvU2fnXpnN%2FtMeidfD9E6WmLBWPsPF881mF4%2FDKjqX6mENEnlggTWF2jMn8Em8aKgSGXA%3D%3D"
  },
  {
    name: "Gabriel",
    gender: "Male",
    mods: ["LFA", "Standard Spinner", "Electronic Spinner", "E-Radial", "Tri Pin", "Hand Controls", "Satellite", "Indicator Extension"],
    base: "Croydon North",
    notes: "Prefers East Melbourne but flexible. Does NOT start before 10:00am. ON HOLIDAY 25 Apr 2026 to 30 Apr 2026 — do NOT book on these dates.",
    icsUrl: "https://calsync.nookal.com/icsFile.php?HhXBkBCdHTLQaK4lrqfVa9ew%2FKnxwK8N60bfEsnM4Tix4fvM5lyQStblMTQiqaNaGeCeSgeSmXf%2F4kKI9OvU2a52GEgwyPVJ%2B0I6mOab2rD4%2Bmqr7EYvQGR9ykfeKAj%2F"
  },
  {
    name: "Greg",
    gender: "Male",
    mods: ["LFA", "Standard Spinner", "Electronic Spinner", "Hand Controls", "Indicator Extension"],
    base: "Kilsyth",
    notes: "Extended East and South-East coverage. Does NOT work on Thursdays or Fridays.",
    icsUrl: "https://calsync.nookal.com/icsFile.php?HhXBkBCdHTLQaK4lrqfVa9ew%2FKnxwK8N60bfEsnM4Tix4fvM5lyQStblMTQiqaNaGeCeSgeSmXf%2F4kKI9OvU2fgA7lzqZCrNH6P0mJPZWpJqu4G4d87qHmXHYUUq3ZhplneSIXp12lfHZzfvGyQdDw%3D%3D"
  },
  {
    name: "Jason",
    gender: "Male",
    mods: ["LFA", "Standard Spinner", "Electronic Spinner"],
    base: "Wandin North",
    notes: "East and South-East up to Bayside wedge only.",
    icsUrl: "https://calsync.nookal.com/icsFile.php?HhXBkBCdHTLQaK4lrqfVa9ew%2FKnxwK8N60bfEsnM4Tix4fvM5lyQStblMTQiqaNaGeCeSgeSmXf%2F4kKI9OvU2Sks8REnxfIzFLWWhJgXRykKsTkQKIlND6Q3P8UWc8WWFJCS5Y5gIU0xiqPfnSz%2FkQ%3D%3D"
  },
  {
    name: "Marc",
    gender: "Male",
    mods: ["LFA", "Standard Spinner", "Electronic Spinner", "Indicator Extension", "Extension Pedals"],
    base: "Werribee",
    notes: "West Melbourne specialist. On Tuesdays and Thursdays must be back in Werribee by 3:30pm (school pick-up) — lesson must finish with enough travel time to reach Werribee by 3:30pm.",
    icsUrl: "https://calsync.nookal.com/icsFile.php?HhXBkBCdHTLQaK4lrqfVa9ew%2FKnxwK8N60bfEsnM4Tix4fvM5lyQStblMTQiqaNaGeCeSgeSmXf%2F4kKI9OvU2ecoRZN2xzdtmsUYY9vDrAuMuEJAzQSivaNXrwqSOqrMT982Jq4gficfE9XDNSVl0A%3D%3D"
  },
  {
    name: "Sherri",
    gender: "Female",
    mods: [],
    base: "Wandin North",
    notes: "STANDARD LESSONS ONLY. Cannot perform any vehicle modifications whatsoever. Area: Wandin to Ringwood radius, plus Warragul. Does NOT work on Fridays.",
    icsUrl: "https://calsync.nookal.com/icsFile.php?HhXBkBCdHTLQaK4lrqfVa9ew%2FKnxwK8N60bfEsnM4Tix4fvM5lyQStblMTQiqaNaGeCeSgeSmXf%2F4kKI9OvU2Qm9F8eQzb%2B6bu2IC%2FLaNBOOWmK9yskJZYl8guOGtP67bXXfuA0nBVLMaaPL2rsqew%3D%3D"
  },
  {
    name: "Yves",
    gender: "Male",
    mods: ["LFA", "Standard Spinner", "Electronic Spinner", "Indicator Extension"],
    base: "Rye",
    notes: "Mornington Peninsula and Frankston area specialist. For clients outside this area (more than ~40 min from Rye), only suggest by arrangement — append '(by arrangement — confirm with Yves first)' after his option line.",
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
      // Priority 1: Explicit suburb in notes (handles ALL CAPS entries like "PASCOE VALE",
      // "HEIDELBERG HEIGHTS", etc. and overrides any "from home" phrase in the same note —
      // e.g. "PASCOE VALE Initial Ax with OT, Matthew White from home address" → Pascoe Vale)
      const suburbInNotes = extractNoteSuburb(appt.notes);
      if (suburbInNotes) {
        const nookalSuburb = await getNookalClientSuburb(appt.summary);
        if (nookalSuburb) {
          appt.lessonLocation = nookalSuburb + " (from Nookal)";
        } else {
          appt.lessonLocation = suburbInNotes + " (from notes)";
        }
        console.log(`Location from notes: "${suburbInNotes}" → resolved to "${appt.lessonLocation}" for ${appt.summary}`);
      } else if (appointmentIsFromHome(appt.notes)) {
        // Priority 2: No suburb in notes, but "from home" / "pickup home" phrase present.
        // Use the ICS location field (Nookal auto-fills it), or fall back to Nookal lookup.
        if (appt.location) {
          appt.lessonLocation = appt.location + " (client home)";
        } else {
          const suburb = await getNookalClientSuburb(appt.summary);
          if (suburb) appt.lessonLocation = suburb + " (client home, from Nookal)";
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

  // Notes can be ALL CAPS (e.g. "PASCOE VALE Initial Ax") or Title Case or mixed.
  // Normalise to Title Case so the MELBOURNE_SUBURBS set can match either style.
  function toTitle(str) {
    return str.split(/\s+/).map(w => w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : "").join(" ");
  }

  // Try explicit preposition patterns first (case-insensitive)
  const prepPattern = /\b(?:at|from|in|pickup|pick\s*up|p\/u)\s+([A-Za-z]+(?:\s+[A-Za-z]+)?)\b/gi;
  let m;
  while ((m = prepPattern.exec(notes)) !== null) {
    const candidate = toTitle(m[1].trim());
    if (MELBOURNE_SUBURBS.has(candidate)) return candidate;
    const firstWord = candidate.split(/\s+/)[0];
    if (MELBOURNE_SUBURBS.has(firstWord)) return firstWord;
  }

  // Fall back: scan all word/phrase tokens (case-insensitive via title-case normalisation)
  const words = notes.match(/\b[A-Za-z]+(?:\s+[A-Za-z]+)?\b/g) || [];
  for (const word of words) {
    const titleCase = toTitle(word);
    if (MELBOURNE_SUBURBS.has(titleCase)) return titleCase;
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

// ─── INTER-APPOINTMENT TRAVEL LOOKUP ─────────────────────────────────────────
// Extract a clean suburb/location string from an appointment so we can look up
// Google Maps drive times for every location that appears in instructors' diaries.
function getApptSuburb(appt) {
  if (appt.lessonLocation) {
    // Strip qualifier like "(from Nookal)" or "(client home)" from the end
    return appt.lessonLocation.replace(/\s*\([^)]*\)\s*$/, "").trim();
  }
  if (appt.location) {
    // ICS location can be "123 Smith St, Brunswick VIC 3000" or just "Brunswick"
    // Try to extract a known Melbourne suburb from the field
    const parts = appt.location.split(",").map(s => s.replace(/\s*VIC\s*\d*/i, "").trim());
    for (const p of parts.reverse()) { // suburb is usually near the end
      if (p && MELBOURNE_SUBURBS.has(p)) return p;
    }
    // Fall back to the whole field trimmed (may be a street address; Maps can handle it)
    return appt.location.split(",")[0].trim() || null;
  }
  return extractNoteSuburb(appt.notes);
}

// Build a Google Maps travel-time table for all unique appointment locations →
// client suburb (and vice versa). Called once per /analyse request.
// Results are returned as a formatted string ready to drop into the AI prompt.
const travelTableCache = {};

async function buildInterApptTravelTable(diaries, clientSuburb) {
  // Collect unique locations across all instructors
  const locationSet = new Set();
  for (const diary of diaries) {
    for (const appt of diary.appointments) {
      const loc = getApptSuburb(appt);
      if (loc && loc.length > 2) locationSet.add(loc);
    }
  }

  // Remove the client suburb itself (trivially 0 min)
  locationSet.delete(clientSuburb);

  const locations = [...locationSet];
  if (locations.length === 0) return "";

  // Fetch both directions in parallel, with a simple in-request cache
  const results = await Promise.all(
    locations.map(async (loc) => {
      const cacheKey = `${loc}|${clientSuburb}`;
      if (!travelTableCache[cacheKey]) {
        travelTableCache[cacheKey] = await getDriveTime(loc, clientSuburb);
      }
      const travel = travelTableCache[cacheKey];
      return { loc, duration: travel ? travel.duration : null };
    })
  );

  // Format as a lookup table for the AI
  const rows = results
    .filter(r => r.duration)
    .sort((a, b) => a.loc.localeCompare(b.loc))
    .map(r => `  ${r.loc} → ${clientSuburb}: ${r.duration}`);

  if (rows.length === 0) return "";
  return `APPOINTMENT LOCATION → CLIENT TRAVEL TIMES (Google Maps):\n${rows.join("\n")}\nUse these exact figures for TRAVEL_IN. For TRAVEL_OUT (client → next appointment), reverse the direction — driving times are similar both ways for Melbourne suburbs.`;
}

// ─── HARD FILTER HELPERS ──────────────────────────────────────────────────────
function modRequested(text, ...terms) {
  const upper = text.toUpperCase();
  return terms.some(t => upper.includes(t));
}

function filterInstructors(booking) {
  const mods = booking.modifications || "";

  const needsLFA               = modRequested(mods, "LFA", "LEFT FOOT");
  const needsHandCtrls         = modRequested(mods, "HAND CONTROL");
  const needsSatellite         = modRequested(mods, "SATELLITE");
  const needsExtPedals         = modRequested(mods, "EXTENSION PEDAL", "EXT PEDAL", "PEDAL EXTENSION");
  const needsIndicator         = modRequested(mods, "INDICATOR");
  const needsEasyDrive         = modRequested(mods, "EASY DRIVE", "EASYDRIVE");
  const needsERadial           = modRequested(mods, "E-RADIAL", "E RADIAL", "ERADIAL");
  const needsTriPin            = modRequested(mods, "TRI PIN", "TRI-PIN", "TRIPIN");
  // "Electronic spinner" / keypad / lollipop / euro grip — all require Electronic Spinner mod
  const needsElecSpinner       = modRequested(mods, "ELECTRONIC SPINNER", "ELECTRONIC SPIN",
                                               "KEYPAD SPINNER", "KEYPAD", "LOLLIPOP", "EURO GRIP",
                                               "E-SPINNER");
  // Plain "spinner" with no electronic qualifier — any spinner type qualifies
  const needsAnySpinner        = modRequested(mods, "SPINNER", "STEERING AID", "SPINNER KNOB");

  let qualified = INSTRUCTORS.filter(ins => {
    if (needsLFA         && !ins.mods.includes("LFA"))               return false;
    if (needsHandCtrls   && !ins.mods.includes("Hand Controls"))     return false;
    if (needsSatellite   && !ins.mods.includes("Satellite"))         return false;
    if (needsExtPedals   && !ins.mods.includes("Extension Pedals"))  return false;
    if (needsIndicator   && !ins.mods.includes("Indicator Extension")) return false;
    if (needsEasyDrive   && !ins.mods.includes("Easy Drive"))        return false;
    if (needsERadial     && !ins.mods.includes("E-Radial"))          return false;
    if (needsTriPin      && !ins.mods.includes("Tri Pin"))           return false;
    if (needsElecSpinner && !ins.mods.includes("Electronic Spinner")) return false;
    // Plain spinner request (no electronic qualifier): needs at least one spinner type
    if (needsAnySpinner && !needsElecSpinner &&
        !ins.mods.includes("Standard Spinner") && !ins.mods.includes("Electronic Spinner")) return false;
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

// ─── SERVER-SIDE OPTION VALIDATOR ────────────────────────────────────────────
// Parses the AI text response and removes options that are provably invalid:
//  1. Gap check line says NOT OK
//  2. Gap check shows arrives_next > next_appt (even if AI wrote OK)
//  3. Lesson finishes after 6:00pm
//  4. "Appointment after" start time is before or equal to lesson start time
//    (means AI picked the wrong adjacent appointment)
// Re-numbers the surviving options 1..N.

function parseTimeToMinutes(str) {
  if (!str) return null;
  const m = str.toLowerCase().trim().match(/(\d+):(\d+)\s*(am|pm)/);
  if (!m) return null;
  let h = parseInt(m[1]);
  const min = parseInt(m[2]);
  if (m[3] === "pm" && h !== 12) h += 12;
  if (m[3] === "am" && h === 12) h = 0;
  return h * 60 + min;
}

function filterAIOptions(text, lessonMinutes, diaries) {
  // Preamble = everything before the first "OPTION N" occurrence.
  const firstOptionPos = text.search(/\bOPTION \d\b/);
  const preamble = firstOptionPos > 0 ? text.slice(0, firstOptionPos).trim() : "";

  // Split at every "OPTION N" boundary (lookahead keeps the delimiter in each chunk),
  // then filter to only keep chunks that actually start with an OPTION header.
  // This avoids the gm/$-matches-end-of-line bug that stripped block content.
  const optionBlocks = text
    .split(/(?=\bOPTION \d\b)/)
    .map(b => b.trim())
    .filter(b => /^OPTION \d/.test(b));

  const passing = [];
  for (const block of optionBlocks) {
    let reject = false;
    let reason = "";

    // 1. Explicit NOT OK in gap check line
    if (/gap check:.*not ok/i.test(block)) {
      reject = true; reason = "gap check NOT OK";
    }

    // 2. Parse gap check times and verify arithmetic
    if (!reject) {
      const gc = block.match(/arrives next at (\d+:\d+\s*[ap]m) vs next appt (\d+:\d+\s*[ap]m)/i);
      if (gc) {
        const arrives = parseTimeToMinutes(gc[1]);
        const nextAppt = parseTimeToMinutes(gc[2]);
        if (arrives !== null && nextAppt !== null) {
          // 2a. Can't arrive after the next appointment
          if (arrives > nextAppt) {
            reject = true; reason = `arrives ${gc[1]} > next appt ${gc[2]}`;
          }
          // 2b. PREFERRED_START = LATEST_START enforcement.
          // If the instructor arrives more than 30 min before the next appointment,
          // the lesson was scheduled too early — LATEST_START was not used.
          // Quarter-hour rounding creates at most ~15 min early arrival, so 30 min
          // is a safe threshold. This catches e.g. 8:30am starts when the only
          // following appointment is at 3:30pm.
          if (!reject && nextAppt - arrives > 30) {
            reject = true;
            reason = `arrives ${gc[1]} but next appt not until ${gc[2]} — start too early, LATEST_START not used`;
          }
        }
      }
    }

    // 3. Lesson must finish by 18:00 (6pm)
    if (!reject) {
      const timeLine = block.match(/,\s*(\d+:\d+[ap]m) to (\d+:\d+[ap]m)/i);
      if (timeLine) {
        const endMins = parseTimeToMinutes(timeLine[2]);
        if (endMins !== null && endMins > 18 * 60) {
          reject = true; reason = `lesson ends after 6pm (${timeLine[2]})`;
        }
      }
    }

    // 3b. Lesson must not start before 8:30am
    if (!reject) {
      const timeLine = block.match(/,\s*(\d+:\d+[ap]m) to/i);
      if (timeLine) {
        const startMins = parseTimeToMinutes(timeLine[1]);
        if (startMins !== null && startMins < 8 * 60 + 30) {
          reject = true; reason = `lesson starts before 8:30am (${timeLine[1]})`;
        }
      }
    }

    // 3c. Instructor-specific day/time constraints
    if (!reject) {
      const hdr = block.match(/^OPTION \d+\n(\w+) — (\w+)\s+\d+/im);
      if (hdr) {
        const instr = hdr[1].toLowerCase();
        const day   = hdr[2].toLowerCase();
        const timeLine = block.match(/,\s*(\d+:\d+[ap]m) to (\d+:\d+[ap]m)/i);
        const startMins = timeLine ? parseTimeToMinutes(timeLine[1]) : null;
        const endMins   = timeLine ? parseTimeToMinutes(timeLine[2]) : null;

        // Gabriel: no start before 10:00am
        if (instr === "gabriel" && startMins !== null && startMins < 10 * 60) {
          reject = true; reason = `Gabriel doesn't start before 10am (${timeLine[1]})`;
        }
        // Greg: no Thursdays or Fridays
        if (!reject && instr === "greg" && (day === "thursday" || day === "friday")) {
          reject = true; reason = `Greg doesn't work on ${hdr[2]}`;
        }
        // Sherri: no Fridays
        if (!reject && instr === "sherri" && day === "friday") {
          reject = true; reason = "Sherri doesn't work on Fridays";
        }
        // Marc Tue/Thu: lesson end + 30 min (minimum Werribee travel) must be ≤ 3:30pm
        if (!reject && instr === "marc" && (day === "tuesday" || day === "thursday")) {
          if (endMins !== null && endMins + 30 > 15 * 60 + 30) {
            reject = true; reason = `Marc can't make Werribee 3:30pm pick-up — lesson ends ${timeLine[2]}`;
          }
        }
      }
    }

    // 4. "Appointment after" must start AFTER the lesson ends
    if (!reject) {
      const lessonMatch = block.match(/,\s*(\d+:\d+[ap]m) to (\d+:\d+[ap]m)/i);
      const afterMatch  = block.match(/appointment after:.*starts (\d+:\d+[ap]m)/i);
      if (lessonMatch && afterMatch) {
        const lessonEnd = parseTimeToMinutes(lessonMatch[2]);
        const afterStart = parseTimeToMinutes(afterMatch[1]);
        if (lessonEnd !== null && afterStart !== null && afterStart < lessonEnd) {
          reject = true; reason = `appointment after (${afterMatch[1]}) is before lesson end (${lessonMatch[2]})`;
        }
      }
    }

    // 5. Lesson must start AFTER the previous appointment ends
    //    (catches cases where the AI starts the lesson at the exact moment
    //     the previous client ends, before any travel time has elapsed)
    if (!reject) {
      const lessonMatch = block.match(/,\s*(\d+:\d+[ap]m) to/i);
      const prevMatch   = block.match(/appointment before:.*ends (\d+:\d+[ap]m)/i);
      if (lessonMatch && prevMatch) {
        const prevEnd    = parseTimeToMinutes(prevMatch[1]);
        const lessonStart = parseTimeToMinutes(lessonMatch[1]);
        if (prevEnd !== null && lessonStart !== null && lessonStart <= prevEnd) {
          reject = true; reason = `lesson starts at ${lessonMatch[1]} but prev appt ends at ${prevMatch[1]}`;
        }
      }
    }

    // 6. Lesson start must respect travel time from previous appointment
    //    Parse "Travel to client: from X ~N min" and enforce
    //    lessonStart >= prevEnd + travelIn + 10 min buffer
    if (!reject) {
      const prevMatch2   = block.match(/appointment before:.*ends (\d+:\d+[ap]m)/i);
      const travelMatch  = block.match(/travel to client:.*~(\d+)\s*min/i);
      const startMatch2  = block.match(/,\s*(\d+:\d+[ap]m) to/i);
      if (prevMatch2 && travelMatch && startMatch2) {
        const prevEnd2    = parseTimeToMinutes(prevMatch2[1]);
        const travelIn    = parseInt(travelMatch[1]);
        const lessonStart2 = parseTimeToMinutes(startMatch2[1]);
        if (prevEnd2 !== null && lessonStart2 !== null) {
          const minStart = prevEnd2 + travelIn + 10;
          if (lessonStart2 < minStart) {
            const minH = Math.floor(minStart / 60);
            const minM = String(minStart % 60).padStart(2, "0");
            const ampm = minH >= 12 ? "pm" : "am";
            const h12  = minH > 12 ? minH - 12 : (minH === 0 ? 12 : minH);
            reject = true;
            reason = `lesson starts ${startMatch2[1]} but earliest valid start is ${h12}:${minM}${ampm} (prev ends ${prevMatch2[1]} + ${travelIn}min travel + 10min buffer)`;
          }
        }
      }
    }

    // 7. Cross-check against actual diary BUSY blocks for the named instructor/date.
    //    7a. Overlapping appointment (e.g. an ignored HOLD entry inside the lesson window).
    //    7b. AI claimed "no appointment before" but diary shows an appointment ending
    //        before the lesson start on the same day — means the AI fabricated a gap.
    if (!reject && diaries) {
      const headerMatch = block.match(/^OPTION \d+\n(\w+) — [^\d]*(\d+)\s+(\w+)/im);
      const timeMatch   = block.match(/,\s*(\d+:\d+[ap]m) to (\d+:\d+[ap]m)/i);
      if (headerMatch && timeMatch) {
        const instrName   = headerMatch[1].toLowerCase();
        const optDay      = parseInt(headerMatch[2]);
        const optMonthStr = headerMatch[3].toLowerCase().substring(0, 3);
        const lessonS     = parseTimeToMinutes(timeMatch[1]);
        const lessonE     = parseTimeToMinutes(timeMatch[2]);
        const noApptBefore = /appointment before:\s*no appointment/i.test(block);
        const diary = diaries.find(d => d.name.toLowerCase() === instrName);
        if (diary && lessonS !== null && lessonE !== null) {
          for (const appt of diary.appointments) {
            const apptDm = appt.date.toLowerCase().match(/(\d+)\s+(\w{3})/);
            if (!apptDm) continue;
            if (parseInt(apptDm[1]) !== optDay) continue;
            if (apptDm[2].substring(0, 3) !== optMonthStr) continue;
            const apptS = parseTimeToMinutes(appt.startTime);
            const apptE = parseTimeToMinutes(appt.endTime);
            if (apptS === null || apptE === null) continue;
            // 7a. Overlap: lesson window intersects a BUSY block
            if (lessonS < apptE && lessonE > apptS) {
              reject = true;
              reason = `overlaps ${appt.summary} (${appt.startTime}–${appt.endTime}) in diary`;
              break;
            }
            // 7b. AI said "no appointment before" but diary has one ending before lesson start
            if (noApptBefore && apptE <= lessonS) {
              reject = true;
              reason = `AI claimed no prior appointment but diary shows ${appt.summary} ending at ${appt.endTime}`;
              break;
            }
          }
        }
      }
    }

    // 8. AI cited an "appointment after" but the diary has an earlier appointment
    //    that starts between lesson end and the cited one — AI skipped over it.
    //    (e.g. Gabriel Thu 2 Apr: lesson ends 9:30am, AI cited Uthayakumari at 1:30pm
    //     but John Mitford at 11:00am was in between and should have been "after".)
    if (!reject && diaries) {
      const afterMatch  = block.match(/appointment after:.*starts (\d+:\d+[ap]m)/i);
      const headerMatch = block.match(/^OPTION \d+\n(\w+) — [^\d]*(\d+)\s+(\w+)/im);
      const timeMatch   = block.match(/,\s*(\d+:\d+[ap]m) to (\d+:\d+[ap]m)/i);
      if (afterMatch && headerMatch && timeMatch) {
        const instrName     = headerMatch[1].toLowerCase();
        const optDay        = parseInt(headerMatch[2]);
        const optMonthStr   = headerMatch[3].toLowerCase().substring(0, 3);
        const lessonE       = parseTimeToMinutes(timeMatch[2]);
        const citedAfterS   = parseTimeToMinutes(afterMatch[1]);
        const diary = diaries.find(d => d.name.toLowerCase() === instrName);
        if (diary && lessonE !== null && citedAfterS !== null) {
          for (const appt of diary.appointments) {
            const apptDm = appt.date.toLowerCase().match(/(\d+)\s+(\w{3})/);
            if (!apptDm) continue;
            if (parseInt(apptDm[1]) !== optDay) continue;
            if (apptDm[2].substring(0, 3) !== optMonthStr) continue;
            const apptS = parseTimeToMinutes(appt.startTime);
            if (apptS === null) continue;
            // An appointment starts after lesson end but before the one the AI cited
            if (apptS > lessonE && apptS < citedAfterS) {
              reject = true;
              reason = `AI skipped ${appt.summary} (starts ${appt.startTime}) — should be "appointment after", not ${afterMatch[1]}`;
              break;
            }
          }
        }
      }
    }

    if (reject) {
      console.log(`Filtered AI option: ${reason} — ${block.split("\n")[0]}`);
    } else {
      passing.push(block);
    }
  }

  // Deduplicate: remove options whose instructor+timeslot line is identical
  const seen = new Set();
  const deduped = passing.filter(block => {
    const key = (block.match(/^OPTION \d+\n(.+)/m) || ["", block])[1].trim();
    if (seen.has(key)) {
      console.log(`Filtered duplicate option: ${key}`);
      return false;
    }
    seen.add(key);
    return true;
  });

  // Re-number options 1..N
  const renumbered = deduped.map((b, i) =>
    b.replace(/^OPTION \d+/, `OPTION ${i + 1}`)
  );

  const prefix = preamble ? preamble + "\n\n" : "";
  return prefix + renumbered.join("\n");
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

    // 3. Authoritative Melbourne time + reference calendar for day-of-week verification
    const nowMelb = new Date(new Date().toLocaleString("en-US", { timeZone: "Australia/Melbourne" }));
    const melbTime = nowMelb.toLocaleString("en-AU", {
      timeZone: "Australia/Melbourne",
      dateStyle: "full",
      timeStyle: "short"
    });

    // Generate the next 30 days with correct day labels so the AI can verify
    // its own day-of-week calculations and never suggest dates outside this window.
    const calendarRef = Array.from({ length: 30 }, (_, i) => {
      const d = new Date(nowMelb);
      d.setDate(d.getDate() + i);
      return d.toLocaleDateString("en-AU", {
        timeZone: "Australia/Melbourne",
        weekday: "short",
        day: "numeric",
        month: "short"
      });
    }).join(", ");

    // Build travel lookup string for the prompt
    const travelSummary = travelTimes
      .map(t => `${t.name}: ${t.fromBase ? t.fromBase.duration + " / " + t.fromBase.distance : "unknown"} from base to ${clientSuburb}`)
      .join("\n");

    // Build inter-appointment travel table (all diary locations → client suburb)
    const interApptTravelTable = await buildInterApptTravelTable(diaries, clientSuburb);

    // 4. Format diary as readable text (not raw JSON) so AI can reason about busy/free times
    const diaryText = diaries.map(formatDiaryForAI).join("\n");

    // 5. Prompt
    const systemPrompt = `You are the SDT Booking Assistant for Specialised Driver Training in Melbourne, Australia.

CURRENT MELBOURNE DATE & TIME: ${melbTime}
Use this exact date/time as now. Do not recalculate it.

REFERENCE CALENDAR — next 30 days (correct day/date pairs, Melbourne time):
${calendarRef}
You MUST verify every date you suggest against this list. If the day-of-week you wrote does not match this calendar, correct it before outputting. Never suggest a date that does not appear in this list.

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

${interApptTravelTable ? interApptTravelTable + "\n" : ""}
INSTRUCTOR SCHEDULES — NEXT 30 DAYS
Every instructor listed has already been confirmed capable of the required modifications.
[BUSY] lines are confirmed appointments. Any time NOT marked [BUSY] is potentially free.

${diaryText}

RULES
1. Only suggest instructors shown above.
2. Sherri has no vehicle modifications — she only appears here if the client needs no modifications.
3. INSTRUCTOR AVAILABILITY CONSTRAINTS — treat these as absolute:
   a. Gabriel: never suggest a start time before 10:00am.
   b. Gabriel: on holiday 25–30 Apr 2026 — do not suggest him on those dates.
   c. Greg: does not work on Thursdays or Fridays — never suggest Greg on those days.
   d. Sherri: does not work on Fridays — never suggest Sherri on Fridays.
   e. Marc (Tue & Thu only): must finish his last lesson and travel back to Werribee by 3:30pm.
      Calculate: lesson end + drive time from lesson suburb to Werribee + 10 min buffer ≤ 3:30pm.
      If this constraint is not satisfied, the slot is impossible for Marc on that day.
   f. Yves: serves Mornington Peninsula and Frankston area. If the client suburb is more than
      ~40 min from Rye, Yves is only an option by arrangement — append the text
      "(by arrangement — confirm with Yves first)" on the same line as his name and time.

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
     EARLIEST_START = PREV_END + TRAVEL_IN + BUFFER, rounded UP to the next quarter-hour.
     Examples: 1:25pm → 1:30pm, 2:50pm → 3:00pm, 10:08am → 10:15am.

     LATEST_START   = NEXT_START - TRAVEL_OUT - BUFFER - LESSON, rounded DOWN to the nearest quarter-hour.
     Example: next appt 10:30am, travel out 25min, buffer 10min, lesson 60min → 10:30 - 25 - 10 - 60 = 8:55am → round down → 8:45am.

     PREFERRED_START = LATEST_START. Always. Start as late as possible to minimise dead time.
     Exception: if there is no next appointment, PREFERRED_START = EARLIEST_START.
     PREFERRED_START must be >= EARLIEST_START. If LATEST_START < EARLIEST_START, the slot is IMPOSSIBLE.
     PREFERRED_START must also be >= 8:30am (minimum working start — see Rule 10 below).

     LESSON_END     = PREFERRED_START + LESSON
     ARRIVE_NEXT    = LESSON_END + TRAVEL_OUT + BUFFER

   Validity check:
     ARRIVE_NEXT must be <= NEXT_START.
     If ARRIVE_NEXT > NEXT_START, the slot is IMPOSSIBLE — do not output it under any circumstances.
     A slot that fails the gap check must NEVER appear in your response, even if you label it NOT OK.
     The only options you output are ones where ARRIVE_NEXT <= NEXT_START (or there is no next appointment).
     If there is no previous appointment, PREV_END = 8:30am (earliest working start); TRAVEL_IN comes from instructor home base.

5. TRAVEL TIMES:
   a. For instructor base → client suburb: use the Google Maps figures in "TRAVEL TIMES" above.
   b. For any appointment location → client suburb (TRAVEL_IN): use the "APPOINTMENT LOCATION → CLIENT TRAVEL TIMES" table above. These are real Google Maps figures — do NOT substitute your own estimate if the location appears in the table.
   c. If a location is not in the table, use your Melbourne geography knowledge and be conservative (add at least 10 min to any estimate you are uncertain about).
   d. TRAVEL_OUT (client suburb → next appointment location) is approximately the same as TRAVEL_IN for that suburb — use the same table value in reverse.
   e. Travel IN always comes FROM the previous appointment's location, not from home base (unless it is the first appointment of the day).

6. LOCATION PRIORITY for each existing appointment (use the first available field):
   a. "LESSON LOCATION:" — confirmed pickup/meeting point. Always use this if present.
   b. "notes:" field — look for a suburb or place name (e.g. "from ActiveOne FRANKSTON" → Frankston).
   c. "addr:" field — client's registered Nookal address, last resort.

7. Map the client's availability (e.g. "Mon AM") to real upcoming calendar dates from today's date.
8. Never suggest a time that overlaps with a [BUSY] block.
9. INSTRUCTOR DIVERSITY — mandatory:
   a. For each qualified instructor, find their EARLIEST valid slot first — scan from today forward, week by week, and stop at the first gap that passes the SLOT VALIDITY formula.
   b. Once you have the earliest slot for each instructor, rank all candidates by date (soonest first) and pick the best 3–5.
   c. You MUST include at least 3 different instructors across the options unless fewer than 3 are qualified.
   d. Once you have 2 options from the same instructor, move on to find slots for others.
10. No lesson may finish after 6:00pm. The lesson end time must be 6:00pm or earlier.
    No lesson may START before 8:30am. Never output a start time earlier than 8:30am.
11. ADJACENT APPOINTMENT SELECTION — this is critical:
    "Appointment before" = the last [BUSY] block that ENDS before the lesson start time.
    "Appointment after"  = the first [BUSY] block that STARTS after the lesson END time.
    The "appointment after" start time MUST be later than the lesson end time.
    If you find yourself writing an "appointment after" that starts before the lesson ends, you have the wrong appointment — look further forward in the day.
12. GAP CHECK COMPARISON: if "arrives next" time is even 1 minute later than "next appt" time, that is NOT OK. Do not write OK unless arrives_next <= next_appt exactly.

OUTPUT RULES
Do all slot validity and date-verification checks silently — never print rejected candidates, never show your working.
Plain text only. No asterisks, no bold, no bullet symbols.
Give 3 to 5 valid options sorted by date, EARLIEST first. You MUST include at least 3 different instructors across the options (see Rule 9).
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
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 4000,
        system: systemPrompt,
        messages: [{
          role: "user",
          content: `Find the best ${booking.duration}-min booking options for ${booking.clientName} in ${clientSuburb}. Availability: ${booking.availability}. Modifications: ${booking.modifications || "none"}. For each qualified instructor, find their EARLIEST valid slot first, then rank all results by date soonest-first. Output the 3–5 earliest options across at least 3 different instructors. Required format only — no working, no rejected candidates.`
        }]
      })
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error(`Anthropic API error ${aiResponse.status}: ${errText}`);
      return res.status(502).json({ error: `AI service error: ${aiResponse.status}`, detail: errText });
    }

    const data = await aiResponse.json();

    // ── Server-side sanity filter ──────────────────────────────────────────
    const rawText = data?.content?.[0]?.text || "";
    const filteredText = filterAIOptions(rawText, parseInt(booking.duration) || 60, diaries);
    const textBlock = data?.content?.[0];
    if (textBlock) textBlock.text = filteredText;

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

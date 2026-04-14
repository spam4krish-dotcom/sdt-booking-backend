const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());

// ─── CONFIGURATION ──────────────────────────────────────────────────────────
// These must be set in your Railway Environment Variables
const NOOKAL_API_KEY = process.env.NOOKAL_API_KEY;
const GRAPHQL_ENDPOINT = "https://api.nookal.com/v3/graphql";

// ─── UTILITIES ──────────────────────────────────────────────────────────────

/**
 * Formats a date to YYYY-MM-DD for Melbourne time
 */
const toMelbDateStr = (date) => {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Melbourne",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date).split("/").reverse().join("-");
};

/**
 * Generates headers to bypass Nookal's "Hold it right there" firewall.
 * Spoofs a real Chrome browser on Windows.
 */
const getNookalHeaders = () => ({
  "Content-Type": "application/json",
  "api-key": NOOKAL_API_KEY,
  "Accept": "application/json",
  "Accept-Language": "en-US,en;q=0.9",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Origin": "https://api.nookal.com",
  "Referer": "https://api.nookal.com/v3/graphql"
});

// ─── ROUTES ──────────────────────────────────────────────────────────────────

/**
 * GET /test-nookal
 * The primary "Handshake" test to verify the firewall is bypassed and 
 * the API key is authorized to see your instructors (Locations).
 */
app.get("/test-nookal", async (req, res) => {
  const results = {};
  const headers = getNookalHeaders();
  
  // As per your research: including the key in the URL as a backup bypass
  const urlWithKey = `${GRAPHQL_ENDPOINT}?api_key=${NOOKAL_API_KEY}`;

  if (!NOOKAL_API_KEY) {
    return res.status(500).json({ 
      success: false, 
      message: "Missing NOOKAL_API_KEY variable in Railway." 
    });
  }

  // TEST 1: Fetch Locations (Should return Sherri, Greg, Jason, etc.)
  try {
    const locResponse = await axios.post(urlWithKey, {
      query: `query { 
        locations { 
          id 
          name 
          status 
        } 
      }`
    }, { headers, timeout: 20000 });

    results.locations = {
      status: locResponse.status,
      data: locResponse.data
    };
  } catch (err) {
    results.locations = {
      status: err.response?.status || "Connection Error",
      error: err.message,
      // If still blocked, this captures the "Hold it right there" HTML
      detail: typeof err.response?.data === "string" 
        ? "Blocked by Nookal Firewall (WAF)" 
        : err.response?.data
    };
  }

  // TEST 2: Fetch Appointments for Today
  try {
    const today = toMelbDateStr(new Date());
    const apptResponse = await axios.post(urlWithKey, {
      query: `query {
        appointments(start: "${today}", end: "${today}") {
          id
          start
          end
          locationID
          staffID
        }
      }`
    }, { headers, timeout: 20000 });

    results.appointments_today = {
      status: apptResponse.status,
      data: apptResponse.data
    };
  } catch (err) {
    results.appointments_today = {
      status: err.response?.status || "Connection Error",
      error: err.message
    };
  }

  // Final Response to Browser
  const isSuccessful = results.locations?.data?.data?.locations ? true : false;

  res.json({
    info: "Nookal v3 Firewall Bypass Test",
    success: isSuccessful,
    endpoint_used: GRAPHQL_ENDPOINT,
    results
  });
});

/**
 * Root Route
 */
app.get("/", (req, res) => {
  res.send("SDT Booking Backend is Active. Navigate to /test-nookal to verify connection.");
});

// ─── START SERVER ────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Test URL: http://localhost:${PORT}/test-nookal`);
});

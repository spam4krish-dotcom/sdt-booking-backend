const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());

// CONFIGURATION
const NOOKAL_API_KEY = process.env.NOOKAL_API_KEY;
// Updated to the v3 path to ensure correct routing
const GRAPHQL_ENDPOINT = "https://api.nookal.com/v3/graphql"; 

/**
 * Helper to get headers that bypass the Nookal Firewall
 */
const getNookalHeaders = () => ({
  "Content-Type": "application/json",
  "api-key": NOOKAL_API_KEY,
  // This header is CRITICAL to avoid the "Hold it right there!" 404 block
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
});

// ─── TEST ENDPOINT ──────────────────────────────────────────────────────────
// Use this to verify the connection is live and seeing your active locations
app.get("/test-nookal", async (req, res) => {
  const results = {};
  const headers = getNookalHeaders();

  if (!NOOKAL_API_KEY) {
    return res.status(500).json({ error: "Missing NOOKAL_API_KEY in environment variables." });
  }

  // Test 1: Fetch Locations (Verify Greg, Sherri, Jason, etc. are visible)
  try {
    const locResponse = await axios.post(GRAPHQL_ENDPOINT, {
      query: `query { 
        locations { 
          id 
          name 
          status 
        } 
      }`
    }, { headers, timeout: 15000 });

    results.locations = {
      status: locResponse.status,
      data: locResponse.data
    };
  } catch (err) {
    results.locations = {
      status: err.response?.status || 500,
      error: err.message,
      // Captures the first bit of the firewall error if it happens again
      detail: typeof err.response?.data === "string" 
        ? err.response.data.substring(0, 500) 
        : err.response?.data
    };
  }

  // Test 2: Fetch Appointments for Today
  try {
    const today = new Date().toISOString().split('T')[0];
    const apptResponse = await axios.post(GRAPHQL_ENDPOINT, {
      query: `query {
        appointments(start: "${today}", end: "${today}") {
          id
          start
          end
          locationID
          staffID
        }
      }`
    }, { headers, timeout: 15000 });

    results.appointments_today = {
      status: apptResponse.status,
      data: apptResponse.data
    };
  } catch (err) {
    results.appointments_today = {
      status: err.response?.status || 500,
      error: err.message
    };
  }

  res.json({
    info: "Nookal v3 Connection Test",
    endpoint: GRAPHQL_ENDPOINT,
    results
  });
});

// ─── BASE ROUTE ──────────────────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.send("SDT Booking Backend is Active. Use /test-nookal to verify API.");
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Test your connection at: http://localhost:${PORT}/test-nookal`);
});

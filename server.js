const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());

const NOOKAL_API_KEY = process.env.NOOKAL_API_KEY;
// Using the versioned v3 endpoint which is more stable for OAuth keys
const GRAPHQL_ENDPOINT = "https://api.nookal.com/v3/graphql";

// Helper for Melbourne Date
const toMelbDateStr = (date) => {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Melbourne",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date).split("/").reverse().join("-");
};

app.get("/test-nookal", async (req, res) => {
  // CRITICAL: These headers bypass the "Hold it right there" firewall
  const headers = {
    "Content-Type": "application/json",
    "api-key": NOOKAL_API_KEY,
    "Accept": "application/json",
    "Accept-Language": "en-US,en;q=0.9",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Origin": "https://api.nookal.com",
    "Referer": "https://api.nookal.com/"
  };

  const results = {};

  // Test 1: Get Locations
  try {
    const r = await axios.post(GRAPHQL_ENDPOINT, {
      query: `query { locations { id name status } }`
    }, { headers, timeout: 20000 }); // Increased timeout for international hop
    results.locations = { status: r.status, data: r.data };
  } catch (err) {
    results.locations = {
      status: err.response?.status || "No Status",
      error: err.message,
      // If the firewall hits again, this captures the first part of the error page
      detail: typeof err.response?.data === "string" 
        ? "Firewall Blocked Request (Hold it right there)" 
        : err.response?.data
    };
  }

  // Test 2: Get Appointments
  try {
    const today = toMelbDateStr(new Date());
    const r = await axios.post(GRAPHQL_ENDPOINT, {
      query: `query {
        appointments(start: "${today}", end: "${today}") {
          id
          start
          end
          locationID
        }
      }`
    }, { headers, timeout: 20000 });
    results.appointments_today = { status: r.status, data: r.data };
  } catch (err) {
    results.appointments_today = {
      status: err.response?.status,
      error: err.message
    };
  }

  res.json({
    message: "Nookal Connection Test with Firewall Bypass",
    results
  });
});

app.get("/", (req, res) => res.send("Backend is up. Go to /test-nookal"));

app.listen(PORT, () => console.log(`Listening on ${PORT}`));

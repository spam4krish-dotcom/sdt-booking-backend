const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());

const NOOKAL_API_KEY = process.env.NOOKAL_API_KEY;

// We will try both the global and the regional Australian gateway
const ENDPOINTS = [
  "https://api.nookal.com/v3/graphql",
  "https://auapi.nookal.com/v3/graphql" // Regional AU backup
];

const getNookalHeaders = () => ({
  "Content-Type": "application/json",
  "Accept": "application/json",
  // CHANGE: Trying "Authorization" header instead of "api-key"
  "Authorization": `Basic ${NOOKAL_API_KEY}`, 
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Accept-Encoding": "gzip, deflate, br",
  "Connection": "keep-alive"
});

app.get("/test-nookal", async (req, res) => {
  const results = {};
  const headers = getNookalHeaders();
  
  if (!NOOKAL_API_KEY) {
    return res.status(500).json({ success: false, message: "Missing NOOKAL_API_KEY" });
  }

  // Loop through potential endpoints to find one the firewall isn't guarding
  for (const url of ENDPOINTS) {
    try {
      const response = await axios.post(`${url}?api_key=${NOOKAL_API_KEY}`, {
        query: `query { locations { id name } }`
      }, { headers, timeout: 15000 });

      results[url] = { status: response.status, data: response.data };
    } catch (err) {
      results[url] = {
        status: err.response?.status || "Blocked",
        error: err.message,
        detail: "Still blocked by Firewall"
      };
    }
  }

  res.json({
    message: "Nookal Regional & Auth Test",
    results
  });
});

app.get("/", (req, res) => res.send("Backend Active. Check /test-nookal"));

app.listen(PORT, () => console.log(`Server on ${PORT}`));

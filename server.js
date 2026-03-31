const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Health check
app.get("/health", (req, res) => {
  res.json({ "status": "ok", "message": "SDT running" });
});

app.post("/analyse", async (req, res) => {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    
    if (!apiKey) {
      return res.status(500).json({ "error": "Missing ANTHROPIC_API_KEY in Railway Variables" });
    }

    const systemPrompt = "You are the SDT Booking Assistant. Analyze the provided client and instructor data to suggest the best match for Specialised Driver Training in Melbourne. Provide a routing rationale and a Nookal booking note.";

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      "method": "POST",
      "headers": {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
      },
      "body": JSON.stringify({
        "model": "claude-3-5-sonnet-20240620", // Use this known stable model ID
        "max_tokens": 1500,
        "system": systemPrompt,
        "messages": [
          {
            "role": "user",
            "content": "Analyze this booking data: " + JSON.stringify(req.body)
          }
        ]
      })
    });

    const data = await response.json();
    
    if (!response.ok) {
      // This part prevents the [object Object] error by sending back a clear string
      const errorMessage = data.error?.message || JSON.stringify(data.error) || "Unknown Anthropic Error";
      return res.status(response.status).json({ "error": errorMessage });
    }

    res.json(data);
  } catch (error) {
    console.error("Server Crash:", error);
    res.status(500).json({ "error": "Internal Server Error: " + error.message });
  }
});

// Root route to prevent the "Route not found" confusion
app.get("/", (req, res) => {
  res.send("SDT Backend is Live. Use /health or /analyse.");
});

app.use((req, res) => {
  res.status(404).json({ "error": "Route not found" });
});

app.listen(PORT, () => {
  console.log("SDT Server active on port " + PORT);
});

const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Health check for Railway
app.get("/health", (req, res) => {
  res.json({
    "status": "ok",
    "message": "SDT running"
  });
});

app.post("/analyse", async (req, res) => {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    
    if (!apiKey) {
      return res.status(500).json({
        "error": "Missing ANTHROPIC_API_KEY environment variable"
      });
    }

    // This is the "AI Brain" logic you requested
    const systemPrompt = "You are the SDT Booking Assistant for Specialised Driver Training in Melbourne. Your job is to analyze client needs (vehicle mods like hand controls/foot accelerators), instructor equipment, and Melbourne geography. Recommend the best instructor, provide a routing rationale based on drive times, suggest a time slot, and provide a professional booking note for the Nookal system.";

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      "method": "POST",
      "headers": {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
      },
      "body": JSON.stringify({
        "model": "claude-sonnet-4-20250514",
        "max_tokens": 1500,
        "system": systemPrompt,
        "messages": [
          {
            "role": "user",
            "content": JSON.stringify(req.body)
          }
        ]
      })
    });

    const data = await response.json();
    
    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    // Extract just the AI's text response for the frontend
    res.json(data);
  } catch (error) {
    console.error("Server Error:", error);
    res.status(500).json({
      "error": "Internal server error",
      "details": error.message
    });
  }
});

// Handle 404s
app.use((req, res) => {
  res.status(404).json({ "error": "Route not found" });
});

app.listen(PORT, () => {
  console.log("SDT Server active on port " + PORT);
});

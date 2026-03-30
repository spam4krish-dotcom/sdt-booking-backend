const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

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

    const anthropicPayload = Object.assign({}, req.body, {
      "model": "claude-sonnet-4-20250514",
      "max_tokens": 1500
    });

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      "method": "POST",
      "headers": {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
      },
      "body": JSON.stringify(anthropicPayload)
    });

    const data = await response.json();
    
    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    res.json(data);
  } catch (error) {
    console.error("Anthropic API Error:", error);
    res.status(500).json({
      "error": "Internal server error",
      "details": error.message
    });
  }
});

app.use((req, res) => {
  res.status(404).json({
    "error": "Not Found"
  });
});

app.listen(PORT, () => {
  console.log("Server is running on port " + PORT);
});

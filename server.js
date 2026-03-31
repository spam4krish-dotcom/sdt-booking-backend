const express = require("express");
const cors = require("cors");

const app = express();
// Railway uses 8080 by default, but we'll accept whatever they provide
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());

// 1. Root Route - Check if the server is alive
app.get("/", (req, res) => {
  res.send("SDT Backend is Live. If you see this, the server is running correctly.");
});

// 2. Health Check Route
app.get("/health", (req, res) => {
  res.json({ status: "ok", message: "SDT Server is healthy" });
});

// 3. The Main Analysis Route
app.post("/analyse", async (req, res) => {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    
    // Check if the API key is missing from Railway Variables
    if (!apiKey) {
      console.error("Error: ANTHROPIC_API_KEY is not set in Railway.");
      return res.status(500).json({ error: "Missing ANTHROPIC_API_KEY in server settings." });
    }

    const systemPrompt = "You are the SDT Booking Assistant. Analyze the provided client data to suggest the best match for Specialised Driver Training. Provide a routing rationale and a Nookal booking note.";

    // Call Anthropic API
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: "claude-3-5-sonnet-latest",
        max_tokens: 1024,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: "Analyze this booking data: " + JSON.stringify(req.body)
          }
        ]
      })
    });

    const data = await response.json();

    // If Anthropic sends an error (like credits or model issues)
    if (!response.ok) {
      console.error("Anthropic API Error:", data.error);
      const errorMsg = data.error?.message || "The AI service is currently unavailable.";
      return res.status(response.status).json({ error: errorMsg });
    }

    // Success: Send the AI response back to the website
    res.json(data);

  } catch (error) {
    console.error("Server Crash Error:", error);
    res.status(500).json({ error: "Internal Server Error: " + error.message });
  }
});

// 4. Handle 404 for any other routes
app.use((req, res) => {
  res.status(404).json({ error: "Route not found. Ensure you are posting to /analyse" });
});

app.listen(PORT, () => {
  console.log("SDT Server active on port " + PORT);
});

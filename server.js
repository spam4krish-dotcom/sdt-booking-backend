const express = require("express");
const cors = require("cors");

const app = express();
// Railway provides the PORT automatically, 8080 is a safe backup
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());

// 1. Root Route - Shows when you visit the Railway URL directly
app.get("/", (req, res) => {
  res.send("SDT Backend is Live. If you see this, the server is running correctly.");
});

// 2. Health Check
app.get("/health", (req, res) => {
  res.json({ status: "ok", message: "SDT running" });
});

// 3. The Main Analysis Route
app.post("/analyse", async (req, res) => {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    
    if (!apiKey) {
      return res.status(500).json({ error: "Missing ANTHROPIC_API_KEY in Railway Variables" });
    }

    const systemPrompt = "You are the SDT Booking Assistant. Analyze the provided client data to suggest the best match for Specialised Driver Training. Provide a routing rationale and a Nookal booking note.";

    // Using the 'Haiku' model which is faster and available immediately upon adding credits
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: "claude-3-haiku-20240307", 
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
    
    if (!response.ok) {
      const msg = data.error?.message || JSON.stringify(data.error) || "Anthropic API Error";
      return res.status(response.status).json({ error: msg });
    }

    // Send the successful AI response back to your website
    res.json(data);

  } catch (error) {
    console.error("Server Error:", error);
    res.status(500).json({ error: "Internal Server Error: " + error.message });
  }
});

// 4. Handle 404s for any other mistyped routes
app.use((req, res) => {
  res.status(404).send("Route not found. Make sure your website is hitting /analyse");
});

app.listen(PORT, () => {
  console.log("SDT Server active on port " + PORT);
});

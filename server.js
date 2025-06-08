const express = require("express");
const multer = require("multer");
const dotenv = require("dotenv");
const fs = require("fs");
const cors = require("cors");
const path = require("path");
const { GoogleGenerativeAI } = require("@google/generative-ai");

dotenv.config();
const app = express();
const port = process.env.PORT || 10000;

app.use(cors());
const upload = multer({ dest: "uploads/" });

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

app.post("/analyze", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No image uploaded" });

    const filePath = path.join(__dirname, req.file.path);
    const image = {
      inlineData: {
        data: fs.readFileSync(filePath).toString("base64"),
        mimeType: req.file.mimetype,
      },
    };

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `You are a satellite image analysis expert.
Analyze the uploaded image for key risk factors such as:
fire, flood, cyclone, drought, landslide, structural damage, terrain instability, vegetation loss, snow accumulation, water logging, desertification, sea level encroachment, pollution, erosion, and accessibility limitations.

Return **only valid JSON** in this format:
{
  "factors": ["flood risk", "terrain instability"],
  "severity_percent": 30, 
  "urgency": "HIGH", 
  "verdict": "WORTH_RESEARCH", 
  "summary": "..."
}

Rules:
1. If >2 severe risks found, severity > 70
2. If 1 critical risk (e.g., fire, cyclone, flood), urgency is HIGH
3. If only structural/terrain/access issues: severity < 40, urgency = LOW
4. If severity > 50 AND urgency = HIGH => verdict: WORTH_RESEARCH
5. If severity < 20 AND no critical risks => verdict: NOT_WORTH
6. If snow + pollution: severity 50, urgency = MEDIUM
7. If erosion/desertification in isolated zones: verdict = LOW_PRIORITY_RESEARCH
8. If multiple vegetation-related issues: flag as "environmental degradation"
9. If urban structural damage detected: urgency = HIGH
10. If sea-level encroachment in coastal zone: urgency = HIGH
11. If drought + accessibility issues: severity = 60, urgency = MEDIUM
12. If fire + flood = severity = 90
13. If snow + terrain instability + remote = severity = 80, urgency = HIGH
14. If only pollution and vegetation: severity < 30, urgency = LOW
15. If ANY sign of human displacement or collapsed roads = WORTH_RESEARCH

Always obey the JSON structure. No extra explanations.`;

    const result = await model.generateContent([prompt, image]);
    const response = await result.response;
    const text = response.text();

    fs.unlinkSync(filePath);

    res.json({ analysis: text });
  } catch (error) {
    console.error("❌ Gemini Vision Error:", error);
    res.status(500).json({ error: "Failed to analyze image" });
  }
});

app.listen(port, () => {
  console.log(`🚀 Server running on http://localhost:${port}`);
});

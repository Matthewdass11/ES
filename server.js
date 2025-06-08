const express = require('express');
const multer = require('multer');
const dotenv = require('dotenv');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');

dotenv.config();

const app = express();
const port = process.env.PORT || 10000;

app.use(cors());

const upload = multer({ dest: 'uploads/' });
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

app.post('/analyze', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Image upload failed.' });

    const filePath = path.join(__dirname, req.file.path);
    const image = {
      inlineData: {
        data: fs.readFileSync(filePath).toString('base64'),
        mimeType: req.file.mimetype
      }
    };

    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const prompt = `
You are a satellite image expert.

Analyze the uploaded satellite image and return ONLY a valid JSON object using the following fixed keywords for "factors":

[
  "flood risk",
  "fire damage",
  "cyclone activity",
  "drought",
  "erosion",
  "urban damage",
  "terrain instability",
  "pollution",
  "forest loss",
  "accessibility issues"
]

Do NOT create your own labels. Only use these words **verbatim** if evidence is clearly visible.

Here is the format:

{
  "factors": [array of above terms],
  "severity_percent": 0-100,
  "verdict": "WORTH_RESEARCH" | "NOT_WORTH_RESEARCH",
  "summary": "Explain clearly what was found and how you know."
}

Do NOT return any other text. Just valid JSON.
`;
console.log("🧠 Gemini raw response:\n", rawText);


    const result = await model.generateContent([prompt, image]);
    const response = await result.response;
    const rawText = response.text().trim();

    // Remove code block markdown if present
    const cleanJson = rawText.replace(/```json|```/g, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(cleanJson);
    } catch (err) {
      throw new Error("Failed to parse Gemini response as JSON");
    }

    // Rule-based system
    const rules = {
  flood: parsed.factors.some(f => /flood/i.test(f)),
  fire: parsed.factors.some(f => /fire/i.test(f)),
  cyclone: parsed.factors.some(f => /cyclone/i.test(f)),
  terrain: parsed.factors.some(f => /terrain/i.test(f)),
  erosion: parsed.factors.some(f => /erosion/i.test(f)),
  comms: parsed.factors.some(f => /communication/i.test(f)),
  infrastructure: parsed.factors.some(f => /infrastructure/i.test(f))
};


    let eventType = "unknown";
    if (rules.flood) eventType = "flood";
    else if (rules.fire) eventType = "fire";
    else if (rules.cyclone) eventType = "cyclone";
    else if (rules.terrain) eventType = "terrain instability";
    else if (rules.erosion) eventType = "erosion";
    else if (rules.comms) eventType = "communication failure";
    else if (rules.infrastructure) eventType = "infrastructure collapse";

    const urgency =
      parsed.severity_percent >= 70 ? "CRITICAL" :
      parsed.severity_percent >= 40 ? "HIGH" :
      parsed.severity_percent >= 20 ? "MEDIUM" : "LOW";

    const final_decision =
      parsed.severity_percent > 35 ? "WORTH_RESEARCH" : "NOT_WORTH_RESEARCH";

    fs.unlinkSync(filePath);

    res.json({
      analysis: {
        eventType,
        urgency,
        final_decision,
        severity_percent: parsed.severity_percent,
        summary: parsed.summary,
        factors: parsed.factors
      }
    });

  } catch (error) {
    console.error("❌ Gemini Vision Error:", error);
    res.status(500).json({ error: 'Failed to analyze image' });
  }
});

app.listen(port, () => {
  console.log(`🚀 Server is running on port ${port}`);
});

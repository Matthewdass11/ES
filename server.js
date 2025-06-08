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
You are a highly experienced satellite image analyst.

Your task is to examine the provided satellite image and return ONLY a raw JSON object. Do NOT include any extra text, explanations, or markdown formatting (like \`\`\`json).

The JSON must follow THIS exact structure:

{
  "factors": [
    // Include ONLY observed risks from the following list.
    // DO NOT guess. Only include a factor if it is clearly visible in the image.

    "flood risk",              // water overflow, submerged areas, breached riverbanks
    "fire damage",             // burn scars, smoke plumes, charred vegetation
    "cyclone activity",        // spiral cloud patterns, hurricane eye, rotating structure
    "drought",                 // dry cracked soil, visibly dead crops, dried-up rivers
    "erosion",                 // degraded land, collapsed slopes, soil loss patterns
    "urban damage",           // visible infrastructure collapse, debris fields
    "terrain instability",     // landslide scars, uneven ground, structural tilt
    "pollution",              // oil spills, discolored water bodies, hazy air layers
    "forest loss",            // large patches of cleared trees or deforestation
    "accessibility issues"     // blocked roads, isolated areas, impassable terrain
  ],
  "severity_percent": 0-100,
  "verdict": "WORTH_RESEARCH" | "NOT_WORTH_RESEARCH",
  "summary": "One paragraph explaining what was found, the indicators seen, and how it impacted your decision."
}

⚠️ Rules:
- Do NOT include any other text outside the JSON.
- Do NOT guess or include unclear risks.
- If no clear factors are detected, return an empty array like "factors": []
- You MUST return a valid, parseable JSON object.

Your output will be consumed by an automated rule-based expert system. Precision is critical.
`;

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
      flood: parsed.factors.some(f => f.includes("flood")),
      fire: parsed.factors.some(f => f.includes("fire")),
      cyclone: parsed.factors.some(f => f.includes("cyclone")),
      terrain: parsed.factors.some(f => f.includes("terrain")),
      erosion: parsed.factors.some(f => f.includes("erosion")),
      comms: parsed.factors.some(f => f.includes("communication")),
      infrastructure: parsed.factors.some(f => f.includes("infrastructure")),
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

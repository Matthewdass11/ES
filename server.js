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

const prompt = `
You are a scientific satellite image analyst. From this image, analyze and return only a JSON object:
{
  "event_type": "fire" | "flood" | "cyclone" | "drought" | "unknown",
  "area_affected_percent": 0-100, // estimated from image
  "intensity_rating": 1-5, // 5 means severe, 1 means mild
  "summary": "Describe key visible signs justifying your analysis."
}

Base "event_type" only on visible signs:
- fire: smoke plumes, scorched land, red-hot zones
- flood: water overflow, submerged zones, muddy water
- cyclone: spiral clouds, eye pattern, ocean turbulence
- drought: cracked earth, dry vegetation, shrinking lakes

If not clearly any of the above, return "unknown". Only return valid JSON.
`;

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
    const result = await model.generateContent([prompt, image]);
    const response = await result.response;
    const rawText = response.text().trim();
    const cleanJson = rawText.replace(/```json|```/g, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(cleanJson);
    } catch (err) {
      throw new Error("Failed to parse Gemini response as JSON");
    }

    // --- RULE BASED SYSTEM (≥ 15 rules) ---
    const rules = {
      highSeverity: parsed.intensity_rating >= 4,
      veryHighArea: parsed.area_affected_percent >= 70,
      moderateArea: parsed.area_affected_percent >= 40,
      lowArea: parsed.area_affected_percent <= 20,
      fireDetected: parsed.event_type === "fire",
      floodDetected: parsed.event_type === "flood",
      cycloneDetected: parsed.event_type === "cyclone",
      droughtDetected: parsed.event_type === "drought",
      unknownDetected: parsed.event_type === "unknown",
      extremeRisk: parsed.intensity_rating === 5 && parsed.area_affected_percent >= 60,
      borderlineCase: parsed.intensity_rating === 3 && parsed.area_affected_percent < 50,
      minorIssue: parsed.intensity_rating <= 2 && parsed.area_affected_percent < 30,
      droughtWide: parsed.event_type === "drought" && parsed.area_affected_percent > 50,
      fireSevere: parsed.event_type === "fire" && parsed.intensity_rating >= 4,
      cycloneEmergency: parsed.event_type === "cyclone" && parsed.area_affected_percent >= 70,
    };

    // Inference
    const urgency =
      rules.extremeRisk || rules.highSeverity ? "CRITICAL" :
      rules.veryHighArea || rules.fireSevere || rules.droughtWide ? "HIGH" :
      rules.moderateArea ? "MEDIUM" :
      "LOW";

    const final_decision =
      rules.unknownDetected || rules.minorIssue ? "NOT_WORTH_RESEARCH" :
      rules.extremeRisk || rules.highSeverity || rules.droughtWide ? "WORTH_RESEARCH" :
      rules.borderlineCase ? "WORTH_RESEARCH_WITH_CAUTION" :
      "WORTH_RESEARCH";

    // Delete temp image
    fs.unlinkSync(filePath);

    // Final response
    res.json({
      analysis: {
        eventType: parsed.event_type,
        severity_percent: parsed.area_affected_percent,
        urgency,
        final_decision,
        summary: parsed.summary,
        factors: [parsed.event_type, `${parsed.area_affected_percent}% area`, `Intensity: ${parsed.intensity_rating}`]
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

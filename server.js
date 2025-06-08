// server.js
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

    const prompt = `You are an expert satellite image analyst.
Evaluate the uploaded satellite image and return only a JSON object:
{
  "event_type": "flood" | "fire" | "cyclone" | "drought" | "unknown",
  "area_affected_percent": number (0-100),
  "intensity_rating": number (0-10),
  "summary": "Explanation of your findings"
}
Base your classification ONLY on visible features.
Avoid guessing. If unclear, return "unknown".`;

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

    const rules = {
      isFlood: parsed.event_type === "flood",
      isFire: parsed.event_type === "fire",
      isCyclone: parsed.event_type === "cyclone",
      isDrought: parsed.event_type === "drought",

      isWidespread: parsed.area_affected_percent >= 60,
      isModerateSpread: parsed.area_affected_percent >= 30 && parsed.area_affected_percent < 60,
      isLocalized: parsed.area_affected_percent < 30,

      isExtremeIntensity: parsed.intensity_rating >= 9,
      isHighIntensity: parsed.intensity_rating >= 7 && parsed.intensity_rating < 9,
      isModerateIntensity: parsed.intensity_rating >= 4 && parsed.intensity_rating < 7,
      isLowIntensity: parsed.intensity_rating < 4,

      isCritical: parsed.intensity_rating >= 9 || parsed.area_affected_percent >= 70,
      isHighPriority: parsed.intensity_rating >= 7 || parsed.area_affected_percent >= 50,
      isResearchWorthy: parsed.intensity_rating >= 6 || parsed.area_affected_percent >= 40,
      isNotResearchWorthy: parsed.intensity_rating < 6 && parsed.area_affected_percent < 40
    };

    let eventType = "unknown";
    if (rules.isFlood) eventType = "flood";
    else if (rules.isFire) eventType = "fire";
    else if (rules.isCyclone) eventType = "cyclone";
    else if (rules.isDrought) eventType = "drought";

    let urgency = "LOW";
    if (rules.isCritical) urgency = "CRITICAL";
    else if (rules.isHighPriority) urgency = "HIGH";
    else if (rules.isModerateIntensity || rules.isModerateSpread) urgency = "MEDIUM";

    const final_decision = rules.isResearchWorthy ? "WORTH_RESEARCH" : "NOT_WORTH_RESEARCH";

    fs.unlinkSync(filePath);

    res.json({
      analysis: {
        eventType,
        urgency,
        final_decision,
        severity_percent: parsed.area_affected_percent,
        intensity_rating: parsed.intensity_rating,
        summary: parsed.summary
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

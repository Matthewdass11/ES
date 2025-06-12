const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const app = express();
const port = 10000;

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
}));

const upload = multer({ dest: 'uploads/' });

app.post('/analyze', upload.single('image'), async (req, res) => {
  let filePath;

  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded.' });
    }

    filePath = path.join(__dirname, req.file.path);

    const image = {
      inlineData: {
        data: fs.readFileSync(filePath).toString('base64'),
        mimeType: req.file.mimetype
      }
    };

    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const prompt = `
You are a rule-based expert system specialized in analyzing satellite images for natural or man-made events.

🧠 RULE BASE (You must strictly follow all 15 rules below):

1. If image contains cloud patterns, classify it as weather-related satellite image.
2. If wildfires or smoke are visible, mark the event as "fire outbreak".
3. If water bodies overflow boundaries, identify as "flood".
4. If deforestation or land clearing is observed, mark it as "deforestation".
5. If vegetation appears yellow or brown where green is expected, mark as "drought or stress".
6. If terrain shows deformation or cracks, mark as "earthquake aftermath".
7. If roads or buildings are submerged, mark as "urban flooding".
8. If coastal regions show changes or waves inland, mark as "tsunami impact".
9. If unusual heat signatures are observed (e.g. industrial zones), mark as "thermal anomaly".
10. If snow or ice recedes drastically, label the event as "glacial melt".
11. If night-time lights suddenly disappear in populated areas, mark as "power outage or conflict zone".
12. If agricultural land changes in shape/health, mark as "crop stress or failure".
13. If oil spills or water discoloration are observed in oceans, mark as "marine pollution".
14. If image contains human faces, cars, buildings from street view, documents, or memes — classify as "non-satellite image".
15. If unsure about classification, respond as "non-satellite image" with verdict "NOT_WORTH_RESEARCH".

🧾 Response Format (JSON only):
{
  "event": "short description",
  "event_area_percent": 0-100,
  "severity_rating": 1-5,
  "verdict": "WORTH_RESEARCH" | "NOT_WORTH_RESEARCH",
  "summary": "explanation of reasoning"
}

⚠️ If the input is not a satellite image, respond with:
{
  "event": "non-satellite image",
  "event_area_percent": 0,
  "severity_rating": 1,
  "verdict": "NOT_WORTH_RESEARCH",
  "summary": "This expert system only analyzes satellite imagery. The uploaded image is not recognized as satellite data."
}

Now analyze the uploaded image using the rules above.
`;


    const result = await model.generateContent([prompt, image]);
    const response = await result.response;
    const rawText = response.text().trim();

    console.log("📦 Gemini raw response:");
    console.log(rawText);

    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Gemini response did not contain a valid JSON object.");
    }

    const cleanJson = jsonMatch[0];

    let parsed;
    try {
      parsed = JSON.parse(cleanJson);
    } catch (err) {
      console.error("❌ Failed to parse Gemini JSON:", cleanJson);
      throw new Error("Invalid JSON returned from Gemini.");
    }

    return res.json({ analysis: parsed });

  } catch (error) {
    console.error("❌ Error in /analyze:", error);
    return res.status(500).json({ error: 'Analysis failed: ' + error.message });
  } finally {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log("🗑️ Temp image deleted");
    }
  }
});

app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});

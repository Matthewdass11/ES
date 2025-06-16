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

🧠 RULE BASE (Strictly follow all 25 rules below):

🌍 ENVIRONMENTAL & NATURAL DISASTER DETECTION
1. If cloud formations are observed → classify as "weather pattern".
2. If smoke or active fire hotspots are visible → classify as "fire outbreak".
3. If terrain shows flooding (water encroaching land) → classify as "flood".
4. If brown or missing forest cover is observed → classify as "deforestation".
5. If vegetation appears yellow or brown in expected green zones → classify as "drought".
6. If sudden land cracks or deformation are observed → classify as "earthquake impact".
7. If infrastructure (roads/buildings) is submerged → classify as "urban flood".
8. If coastal water pushes inland or shows wave disturbance → classify as "tsunami aftermath".
9. If thermal anomalies (heat islands or heat plumes) are present → classify as "thermal hazard".
10. If glaciers or ice sheets shrink over time → classify as "glacial melt".

🛰️ URBAN & INFRASTRUCTURE ANALYSIS
11. If night-time lights disappear suddenly in urban zones → classify as "power outage or conflict".
12. If road networks are newly carved or disappear → classify as "urban development or destruction".
13. If dense traffic or mass movement is seen on highways → classify as "mass migration or evacuation".
14. If land has artificial cuts/patterns (e.g. mining pits) → classify as "mining activity".
15. If large shadow patterns or symmetrical structures appear → classify as "man-made construction".

🌾 AGRICULTURE & CLIMATE MONITORING
16. If agricultural plots show irregular patches → classify as "crop failure".
17. If snow unexpectedly covers fertile zones → classify as "cold snap or climate anomaly".
18. If multiple images show change in seasonal crop reflectance → classify as "seasonal change".

🌊 MARINE & POLLUTION EVENTS
19. If ocean color appears patchy or dark → classify as "oil spill or marine pollution".
20. If river deltas appear blurred or redirected → classify as "sedimentation or blockage".

🚫 NON-SATELLITE REJECTION CRITERIA
21. If human faces are visible → reject as "non-satellite image".
22. If documents, memes, selfies, or screenshots are detected → reject as "non-satellite image".
23. If objects are seen from ground-level (cars, houses) with perspective → reject as "non-satellite image".
24. If indoor items or furniture are visible → reject as "non-satellite image".

❓ UNCERTAINTY RULE
25. If the image does not clearly fit any of the above categories, or lacks top-down satellite view → reject with reason: "non-satellite image or insufficient data".

📦 Output JSON format (strictly):
{
  "event": "short description",
  "event_area_percent": 0-100,
  "severity_rating": 1-5,
  "verdict": "WORTH_RESEARCH" | "NOT_WORTH_RESEARCH",
  "summary": "brief explanation of how the rules led to this conclusion"
}

⚠️ If the input is not satellite-based, always respond with:
{
  "event": "non-satellite image",
  "event_area_percent": 0,
  "severity_rating": 1,
  "verdict": "NOT_WORTH_RESEARCH",
  "summary": "This expert system only analyzes satellite imagery. The uploaded image is not recognized as satellite data."
}

Now analyze the uploaded image using the 25 rules above.
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

    // ✅ Append to CSV log
    const csvLine = [
      req.file.originalname,
      parsed.event,
      parsed.event_area_percent,
      parsed.severity_rating,
      parsed.verdict,
      parsed.summary.replace(/[\r\n]+/g, ' ').slice(0, 200)
    ].join(',') + '\n';

    fs.appendFile('analysisDB.csv', csvLine, (err) => {
      if (err) {
        console.error("❌ Failed to write to CSV:", err);
      } else {
        console.log("✅ Analysis saved to analysisDB.csv");
      }
    });

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

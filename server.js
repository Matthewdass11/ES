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
You are a satellite imagery expert. Analyze the uploaded image and return only the following JSON:

{
  "event": "short description",
  "event_area_percent": 0-100,
  "severity_rating": 1-5,
  "verdict": "WORTH_RESEARCH" | "NOT_WORTH_RESEARCH",
  "summary": "reason"
}

If unsure, return "unclear event", 0%, 1, "NOT_WORTH_RESEARCH", and summary explaining why.
`;

    const result = await model.generateContent([prompt, image]);
    const response = await result.response;
    const rawText = response.text().trim();

    console.log("📦 Gemini raw response:");
    console.log(rawText);

    // Extract clean JSON object from Gemini's markdown response
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

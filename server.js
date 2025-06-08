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
You are a satellite image analysis expert.
Based only on the satellite image provided, analyze and return a clean JSON object with the following structure:

{
  "event": "A short phrase describing the main visible phenomenon (e.g., large flood in coastal city, wildfire in forest area, cyclone over ocean, drought in agricultural zone, etc.)",
  "event_area_percent": 0-100, // How much of the image is affected by this event
  "severity_rating": 1-5, // 1 being minimal, 5 being catastrophic
  "summary": "Explain your reasoning using visible signs from the image."
}

Your answer must be based only on visual observation of the satellite image. If unsure, describe what is seen as best you can. Always return valid JSON only.`;

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

    fs.unlinkSync(filePath);

    res.json({ analysis: parsed });

  } catch (error) {
    console.error("❌ Gemini Vision Error:", error);
    res.status(500).json({ error: 'Failed to analyze image' });
  }
});

app.listen(port, () => {
  console.log(`🚀 Server is running on port ${port}`);
});

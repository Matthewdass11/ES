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

    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const prompt = `
You are a satellite imagery expert. Analyze the uploaded image and return only a JSON object in the format below. 
You are allowed to describe *any visible event* (not limited to flood, fire, cyclone, etc.), and determine its severity 
based on how much of the image is affected.

Return ONLY the following JSON (no commentary, no markdown):

{
  "event": "short description of what the event appears to be",
  "event_area_percent": integer between 0-100 indicating how much of the image is affected by the event,
  "severity_rating": integer from 1 to 5, where 1 = very minor and 5 = catastrophic,
  "verdict": "WORTH_RESEARCH" | "NOT_WORTH_RESEARCH",
  "summary": "short paragraph explaining what was detected and why the severity and verdict was given"
}

If you are unsure about an event, say "unclear event" and leave percentage as 0 and severity as 1.
`;

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

    // Optional rule-based override (only if needed):
    const final_decision =
      parsed.event_area_percent > 25 || parsed.severity_rating >= 3
        ? "WORTH_RESEARCH"
        : "NOT_WORTH_RESEARCH";

    parsed.verdict = final_decision;

    // Delete image after processing
    fs.unlinkSync(filePath);

    res.json({ analysis: parsed });

  } catch (error) {
    console.error("❌ Gemini Analysis Error:", error);
    res.status(500).json({ error: 'Failed to analyze image' });
  }
});

app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});

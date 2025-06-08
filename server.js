// server.js
const express = require('express');
const multer = require('multer');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');

dotenv.config();

const app = express();
const port = process.env.PORT || 10000;

app.use(cors()); // ✅ Fix CORS error
const upload = multer({ dest: 'uploads/' });

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

// Rule-based decision-making (example logic)
function evaluateDisasterSeverity(text) {
  const lower = text.toLowerCase();
  const factors = {
    flooding: /flood|inundation/.test(lower),
    fire: /fire|burn/.test(lower),
    cyclone: /cyclone|hurricane|typhoon/.test(lower),
    drought: /drought|arid/.test(lower),
    damage: /damage|destruction|ruin/.test(lower)
  };

  const score = Object.values(factors).filter(v => v).length / Object.keys(factors).length;
  const severityPercent = Math.round(score * 100);
  const verdict = severityPercent >= 50 ? '✅ Worth further scientific investigation' : '❌ Not a priority zone';

  return {
    factors,
    severityPercent,
    verdict
  };
}

app.post('/analyze', upload.single('image'), async (req, res) => {
  console.log("📸 Received file:", req.file);  // <--- ADD THIS LINE

  try {
    if (!req.file) return res.status(400).json({ error: 'No image uploaded' });

    const filePath = path.join(__dirname, req.file.path);
    const image = {
      inlineData: {
        data: fs.readFileSync(filePath).toString('base64'),
        mimeType: req.file.mimetype,
      },
    };

    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const prompt = `Imagine you're an expert disaster scientist analyzing this satellite image.
What critical factors are visible? Assess:
- signs of fire, flood, cyclone, drought, or structural damage
- terrain stability
- accessibility for ground research
Then provide a summary that can be used for a rule-based system.`;

    const result = await model.generateContent([prompt, image]);
    const response = await result.response;
    const text = response.text();

    const { factors, severityPercent, verdict } = evaluateDisasterSeverity(text);

    fs.unlinkSync(filePath); // cleanup file

    res.json({
      analysis: text,
      factors,
      severityPercent,
      verdict
    });
  } catch (error) {
    console.error('❌ Gemini Vision Error:', error);
    res.status(500).json({ error: 'Failed to analyze image' });
  }
});

app.listen(port, () => {
  console.log(`🚀 Server is running at http://localhost:${port}`);
});

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

    const result = await model.generateContent([
      `Imagine you're a scientific researcher evaluating this satellite image for:
- flood risk
- fire damage
- terrain instability
- cyclone/hurricane formation
- structural changes
- accessibility for ground teams

Based on visible evidence, return a JSON with:
{
  "factors": [...],
  "severity_percent": 0-100,
  "verdict": "WORTH_RESEARCH" | "NOT_WORTH_RESEARCH",
  "summary": "..."
}`, image
    ]);

    const response = await result.response;
    const text = response.text();
    fs.unlinkSync(filePath);

    res.json({ analysis: text });
  } catch (error) {
    console.error("❌ Gemini Vision Error:", error);
    res.status(500).json({ error: 'Failed to analyze image' });
  }
});

app.listen(port, () => {
  console.log(`🚀 Server is running on port ${port}`);
});

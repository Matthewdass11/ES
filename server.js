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
    console.log("📂 Temp image path:", filePath);
    console.log("📂 Temp image exists:", fs.existsSync(filePath));

    if (!fs.existsSync(filePath)) {
      throw new Error(`Uploaded file not found at: ${filePath}`);
    }

    const image = {
      inlineData: {
        data: fs.readFileSync(filePath).toString('base64'),
        mimeType: req.file.mimetype
      }
    };

    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const prompt = `... your 25-rule prompt as before ...`;

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

    // ✅ Write CSV safely to project folder
    const csvPath = path.join(__dirname, 'analysisDB.csv');
    const csvLine = [
      req.file.originalname,
      parsed.event,
      parsed.event_area_percent,
      parsed.severity_rating,
      parsed.verdict,
      parsed.summary.replace(/[\r\n]+/g, ' ').slice(0, 200)
    ].join(',') + '\n';

    try {
      if (!fs.existsSync(csvPath)) {
        console.log("🔹 CSV not found — creating new with header.");
        const header = 'filename,event,event_area_percent,severity_rating,verdict,summary\n';
        fs.writeFileSync(csvPath, header + csvLine);
      } else {
        fs.appendFileSync(csvPath, csvLine);
      }
      console.log(`✅ Analysis saved to ${csvPath}`);
    } catch (csvErr) {
      console.error("❌ CSV write error:", csvErr.message, csvErr);
    }

    return res.json({ analysis: parsed });

  } catch (error) {
    console.error("❌ Error in /analyze:", error.message, error);
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

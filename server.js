const express = require('express');
const multer = require('multer');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');

dotenv.config();

const app = express();
const port = 10000;

const upload = multer({ dest: 'uploads/' });

// Init Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

app.post('/analyze', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No image uploaded' });

    const filePath = path.join(__dirname, req.file.path);
    const image = {
      inlineData: {
        data: fs.readFileSync(filePath).toString('base64'),
        mimeType: req.file.mimetype,
      },
    };

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });


    const result = await model.generateContent([
      'Analyze this satellite image for natural disaster signs.',
      image,
    ]);

    const response = await result.response;
    const text = response.text();

    // Delete the file after processing
    fs.unlinkSync(filePath);

    res.json({ analysis: text });
  } catch (error) {
    console.error('❌ Gemini Vision Error:', error);
    res.status(500).json({ error: 'Failed to analyze image' });
  }
});

app.listen(port, () => {
  console.log(`🚀 Server is running at http://localhost:${port}`);
});

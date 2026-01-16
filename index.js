const express = require('express');
const path = require('path');
const axios = require('axios');
const fs = require('fs');
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });

const app = express();
const PORT = process.env.PORT || 3000;

const GEMINI_API_KEY = 'AIzaSyD4nCP2G-FeyKUirIYSajK6-IfmkuyBLQ8';
const convoFile = 'convo.json';
const model = 'gemini-1.5-flash';

// Ensure conversation file exists
if (!fs.existsSync(convoFile)) {
  fs.writeFileSync(convoFile, JSON.stringify({}), 'utf-8');
}

function loadConversation(uid) {
  const convos = JSON.parse(fs.readFileSync(convoFile, 'utf-8'));
  return convos[uid] || [];
}

function saveConversation(uid, messages) {
  const convos = JSON.parse(fs.readFileSync(convoFile, 'utf-8'));
  convos[uid] = messages;
  fs.writeFileSync(convoFile, JSON.stringify(convos, null, 2), 'utf-8');
}

function clearConversation(uid) {
  const convos = JSON.parse(fs.readFileSync(convoFile, 'utf-8'));
  delete convos[uid];
  fs.writeFileSync(convoFile, JSON.stringify(convos, null, 2), 'utf-8');
}

// Serve static files
app.use(express.static(path.join(__dirname)));
app.use(express.json());

// Serve the main HTML file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Gemini API endpoint
app.get('/gemini-chat', async (req, res) => {
  const { prompt, uid, imgUrl, clear } = req.query;

  if (clear === 'true') {
    clearConversation(uid);
    return res.json({ status: true, message: 'Conversation cleared' });
  }

  if (!prompt || !uid) {
    return res.status(400).json({
      error: 'Both "prompt" and "uid" parameters are required',
      example: '/gemini-chat?prompt=hello&uid=123'
    });
  }

  try {
    // Load conversation
    let conversation = loadConversation(uid);

    // Prepare image
    let imageData = null;
    if (imgUrl) {
      try {
        const imageResp = await axios.get(imgUrl, { responseType: 'arraybuffer' });
        imageData = Buffer.from(imageResp.data, 'binary').toString('base64');
      } catch (error) {
        console.error('Error loading image:', error.message);
      }
    }

    // User message
    const parts = [{ text: prompt }];
    if (imageData) {
      parts.push({
        inline_data: {
          mime_type: 'image/jpeg',
          data: imageData
        }
      });
    }

    conversation.push({ role: 'user', parts });

    const payload = {
      contents: conversation.map(msg => ({
        role: msg.role,
        parts: msg.parts
      }))
    };

    // Gemini API request
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
      payload,
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );

    const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || 'No response from Gemini.';

    conversation.push({ role: 'model', parts: [{ text }] });
    saveConversation(uid, conversation);

    res.json({
      status: true,
      response: text,
      conversation: conversation.slice(-10) // Return last 10 messages
    });

  } catch (error) {
    console.error('Gemini Error:', error.message);
    res.status(500).json({
      status: false,
      error: 'Failed to get response from Gemini API'
    });
  }
});

// Upload endpoint for images
app.post('/upload-image', upload.single('image'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ status: false, error: 'No file uploaded' });
    }
    
    // In production, you'd upload to cloud storage
    // For demo, we'll just return the local path
    const imageUrl = `/uploads/${req.file.filename}`;
    res.json({ 
      status: true, 
      url: imageUrl,
      message: 'Image uploaded successfully' 
    });
  } catch (error) {
    res.status(500).json({ status: false, error: error.message });
  }
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`Gemini Chat available at http://localhost:${PORT}/gemini-chat`);
});
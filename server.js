const express = require('express');
const multer = require('multer');
const Anthropic = require('@anthropic-ai/sdk');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const ffmpegPath = require('ffmpeg-static');

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.ANTHROPIC_API_KEY;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    const dir = '/tmp/uploads';
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: function(req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ storage: storage, limits: { fileSize: 500 * 1024 * 1024 } });

const V = [
  { name: 'zoom1', filter: 'scale=iw*1.08:ih*1.08,crop=iw/1.08:ih/1.08' },
  { name: 'miroir', filter: 'hflip' },
  { name: 'zoom2', filter: 'scale=iw*1.12:ih*1.12,crop=iw/1.12:ih/1.12' },
  { name: 'miroir2', filter: 'hflip,scale=iw*1.06:ih*1.06,crop=iw/1.06:ih/1.06' },
  { name: 'zoom3', filter: 'scale=iw*1.15:ih*1.15,crop=iw/1.15:ih/1.15' },
  { name: 'miroir3', filter: 'hflip' },
  { name: 'zoom4', filter: 'scale=iw*1.1:ih*1.1,crop=iw/1.1:ih/1.1' },
  { name: 'miroir4', filter: 'hflip,scale=iw*1.08:ih*1.08,crop=iw/1.08:ih/1.08' },
  { name: 'zoom5', filter: 'scale=iw*1.09:ih*1.09,crop=iw/1.09:ih/1.09' },
  { name: 'miroir5', filter: 'hflip,scale=iw*1.1:ih*1.1,crop=iw/1.1:ih/1.1' }
];

async function generateMetadata(filename, platform, language, count) {
  const client = new Anthropic({ apiKey: API_KEY });
  const msg = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 8000,
    messages: [{
      role: 'user',
      content: 'Expert marketing. Video: "' + filename + '" Platform: ' + platform + ' Language: ' + language + ' Generate ' + count + ' variants JSON only no markdown: {"variantes":[{"titre":"...","description":"...","tags":["t1","t2","t3","t4","t5"],"angle":"...","emoji":"..."}]}'
    }]
  });
  const raw = msg.content[0].text.replace(/```json|```/g, '').trim();
  return JSON.parse(raw).variantes;
}

function applyVariation(input, output, variation) {
  return new Promise(function(resolve, reject) {
    const args = ['-i', input, '-vf', variation.filter, '-c:v', 'libx264', '-c:a', 'aac', '-movflags', '+faststart', output, '-y'];
    execFile(ffmpegPath, args, function(err, stdout, stderr) {
      if (err) reject(new Error(stderr || err.message));
      else resolve();
    });
  });
}

app.get('/health', function(req, res) { res.json({ ok: true }); });

app.post('/api/generate', upload.single('video'), async function(req, res) {
  if (!req.file) return res.status(400).json({ error: 'No video' });
  const platform = req.body.platform || 'Instagram';
  const language = req.body.language || 'francais';
  const n = Math.min(50, Math.max(2, parseInt(req.body.count || 3)));
  const inputPath = req.file.path;
  const baseName = path.basename(req.file.originalname, path.extname(req.file.originalname));
  const outputDir = '/tmp/outputs';
  let captionsList = [];
  try { captionsList = JSON.parse(req.body.captions || '[]'); } catch(e) { captionsList = []; }
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  try {
    const variantes = await generateMetadata(req.file.originalname, platform, language, n);
    const results = [];
    for (let i = 0; i < n; i++) {
      const variation = V[i % V.length];
      const caption = captionsList.length > 0 ? captionsList[i % captionsList.length] : '';
      const outputName = baseName + '_v' + (i + 1) + '_' + variation.name + '.mp4';
      const outputPath = path.join(outputDir, outputName);
      await applyVariation(inputPath, outputPath, variation);
      results.push({ index: i, filename: outputName, variation: variation.name, caption: caption, metadata: variantes[i] });
    }
    fs.unlinkSync(inputPath);
    res.json({ success: true, results: results });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/download/:filename', function(req, res) {
  const filePath = path.join('/tmp/outputs', req.params.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Not found' });
  res.download(filePath);
});

app.listen(PORT, function() { console.log('MetaGen Pro port ' + PORT); });

const express = require('express');
const multer = require('multer');
const Anthropic = require('@anthropic-ai/sdk');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { execSync, exec } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.ANTHROPIC_API_KEY;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = '/tmp/uploads';
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage, limits: { fileSize: 500 * 1024 * 1024 } });

const VARIATIONS = [
  { name: 'zoom_leger', filter: 'scale=iw*1.08:ih*1.08,crop=iw/1.08:ih/1.08' },
  { name: 'miroir', filter: 'hflip' },
  { name: 'zoom_lumineux', filter: 'scale=iw*1.12:ih*1.12,crop=iw/1.12:ih/1.12,eq=brightness=0.15' },
  { name: 'miroir_zoom', filter: 'hflip,scale=iw*1.06:ih*1.06,crop=iw/1.06:ih/1.06' },
];

async function generateMetadata(filename, platform, language, count) {
  const client = new Anthropic({ apiKey: API_KEY });
  const prompt = `Expert marketing vidéo. Vidéo : "${filename}" | Plateforme : ${platform} | Langue : ${language}. Génère exactement ${count} variantes JSON : {"variantes":[{"titre":"...","description":"...","tags":["t1","t2","t3","t4","t5"],"angle":"...","emoji":"..."}]}`;
  const message = await client.messages.create({ model: 'claude-haiku-4-5-20251001', max_tokens: 2000, messages: [{ role: 'user', content: prompt }] });
  const raw = message.content[0].text.replace(/```json|```/g, '').trim();
  return JSON.parse(raw).variantes;
}

function applyVariation(inputPath, outputPath, variation) {
  return new Promise((resolve, reject) => {
    const cmd = `ffmpeg -i "${inputPath}" -vf "${variation.filter}" -c:v libx264 -c:a aac -movflags +faststart "${outputPath}" -y`;
    exec(cmd, (err) => { if (err) reject(err); else resolve(); });
  });
}

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.post('/api/generate', upload.single('video'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Pas de vidéo' });
  const { platform = 'Instagram', language = 'français', count = 3 } = req.body;
  const n = Math.min(4, Math.max(2, parseInt(count)));
  const inputPath = req.file.path;
  const baseName = path.basename(req.file.originalname, path.extname(req.file.originalname));
  const outputDir = '/tmp/outputs';
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  try {
    const variantes = await generateMetadata(req.file.originalname, platform, language, n);
    const results = [];
    for (let i = 0; i < n; i++) {
      const variation = VARIATIONS[i % VARIATIONS.length];
      const outputName = `${baseName}_v${i+1}_${variation.name}.mp4`;
      const outputPath = path.join(outputDir, outputName);
      await applyVariation(inputPath, outputPath, variation);
      results.push({ index: i, filename: outputName, variation: variation.name, metadata: variantes[i] });
    }
    fs.unlinkSync(inputPath);
    res.json({ success: true, results });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/download/:filename', (req, res) => {
  const filePath = path.join('/tmp/outputs', req.params.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Fichier introuvable' });
  res.download(filePath);
});

app.listen(PORT, () => console.log(`MetaGen Pro running on port ${PORT}`));

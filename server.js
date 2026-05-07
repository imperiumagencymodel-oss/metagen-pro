const express = require('express');
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const Anthropic = require('@anthropic-ai/sdk');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

ffmpeg.setFfmpegPath(ffmpegPath);

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
  { name: 'zoom_leger',    zoom: 1.08, mirror: false, brightness: 1.05, trim: 0 },
  { name: 'miroir',        zoom: 1.00, mirror: true,  brightness: 1.00, trim: 0 },
  { name: 'zoom_lumineux', zoom: 1.12, mirror: false, brightness: 1.15, trim: 1 },
  { name: 'miroir_zoom',   zoom: 1.06, mirror: true,  brightness: 1.08, trim: 0 },
];

async function generateMetadata(filename, platform, tone, language, count) {
  const client = new Anthropic({ apiKey: API_KEY });
  const prompt = `Expert marketing vidéo et SEO. Vidéo : "${filename}" | Plateforme : ${platform} | Ton : ${tone} | Langue : ${language}. Génère exactement ${count} variantes. JSON uniquement : {"variantes":[{"titre":"...","description":"...","tags":["t1","t2","t3","t4","t5"],"angle":"...","emoji":"..."}]}`;
  const message = await client.messages.create({ model: 'claude-haiku-4-5-20251001', max_tokens: 2000, messages: [{ role: 'user', content: prompt }] });
  const raw = message.content[0].text.replace(/```json|```/g, '').trim();
  return JSON.parse(raw).variantes;
}

function applyVariation(inputPath, outputPath, variation) {
  return new Promise((resolve, reject) => {
    let filters = [];
    if (variation.mirror) filters.push('hflip');
    if (variation.zoom !== 1.0) { filters.push(`scale=iw*${variation.zoom}:ih*${variation.zoom}`); filters.push(`crop=iw/${variation.zoom}:ih/${variation.zoom}`); }
    if (variation.brightness !== 1.0) { const b = variation.brightness - 1.0; filters.push(`eq=brightness=${b.toFixed(2)}`); }
    let cmd = ffmpeg(inputPath);
    if (filters.length > 0) cmd = cmd.videoFilters(filters);
    cmd.outputOptions(['-c:v libx264', '-c:a aac', '-movflags +faststart']).output(outputPath).on('end', resolve).on('error', reject).run();
  });
}

app.post('/api/generate', upload.single('video'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Pas de vidéo' });
  const { platform = 'Instagram', tone = 'dynamique', language = 'français', count = 3 } = req.body;
  const n = Math.min(4, Math.max(2, parseInt(count)));
  const inputPath = req.file.path;
  const baseName = path.basename(req.file.originalname, path.extname(req.file.originalname));
  const outputDir = '/tmp/outputs';
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  try {
    const variantes = await generateMetadata(req.file.originalname, platform, tone, language, n);
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
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/download/:filename', (req, res) => {
  const filePath = path.join('/tmp/outputs', req.params.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Fichier introuvable' });
  res.download(filePath);
});

app.listen(PORT, () => console.log(`MetaGen Pro running on port ${PORT}`));

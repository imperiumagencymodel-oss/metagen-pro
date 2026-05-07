const express = require('express');
const multer = require('multer');
const Anthropic = require('@anthropic-ai/sdk');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const ffmpegPath = require('ffmpeg-static');

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
  { name: 'zoom_lumineux', filter: 'scale=iw*1.12:ih*1.12,crop=iw/1.12:ih/1.12,eq=brightne

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

const VARIATIONS = [
  { name: 'zoom_leger', filter: 'scale=iw*1.08:ih*1.08,crop=iw/1.08:ih/1.

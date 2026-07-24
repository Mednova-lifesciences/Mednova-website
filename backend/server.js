// server.js
// MedNova Lifesciences — backend for the site-wide reasoning preview demos.
// Holds the Anthropic API key server-side; the browser never sees it.

import './src/config/env.js';
import express from 'express';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';
import { handleAssistantRequest } from './src/routes/assistant.routes.js';
import formsRoutes from './src/routes/forms.routes.js';
import { RATE_LIMIT_CONFIG } from './src/config/api.config.js';

const FRONTEND_URL = process.env.FRONTEND_URL?.replace(/\/$/, '');
const FRONTEND_ALLOWED_ORIGINS = [
  FRONTEND_URL,
  'https://mednovalife.com',
  'https://www.mednovalife.com'
].filter(Boolean);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (origin && FRONTEND_ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  }

  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }

  next();
});

if (!process.env.ANTHROPIC_API_KEY) {
  console.warn(
    '⚠️  ANTHROPIC_API_KEY is not set. The /api/assistant endpoint will fail until it is configured (see .env.example).'
  );
}

app.use(express.json({ limit: '10kb' }));
// Serve static files from frontend directory
app.use(express.static(path.join(__dirname, '../frontend')));
app.use(express.static(path.join(__dirname, '../frontend/src/pages')));
app.use('/downloads', express.static(path.join(__dirname, '../frontend/public/downloads')));
app.use('/css', express.static(path.join(__dirname, '../frontend/src/css')));
app.use('/js', express.static(path.join(__dirname, '../frontend/src/js')));

// Serve llms.txt at the website root when the backend is used directly.
app.get('/llms.txt', (_req, res) => {
  res.type('text/plain');
  res.sendFile(path.join(__dirname, '../llms.txt'));
});

// Rate limit the AI endpoint — a public text/button feature hitting a paid
// API is a real cost risk if left unprotected.
const assistantLimiter = rateLimit(RATE_LIMIT_CONFIG);

// Rate limit form submissions to reduce spam and abuse.
const formLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many form submissions. Please try again in a few minutes.' }
});

app.use('/api/forms', formLimiter, formsRoutes);
app.post('/api/assistant', assistantLimiter, handleAssistantRequest);
app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`MedNova site running on port ${PORT}`);
});

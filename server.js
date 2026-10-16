
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '.env');

dotenv.config({ path: envPath, override: true });

const clean = v => String(v || '').trim().replace(/^["']+|["']+$/g, '').trim();
const getKey = () =>
  clean(process.env.OPENROUTER_API_KEY) ||
  clean(process.env.VITE_OPENROUTER_API_KEY);
const keyMissing = k => !k || /your_openrouter_api_key/i.test(k);

const MISSING_MSG =
  'OpenRouter API key is missing. Set OPENROUTER_API_KEY in your local .env file or Render Environment Variables.';

const app = express();

app.use(cors());
app.use(express.json({ limit: '7mb' }));

// Health check
app.get('/api/health', (_, res) => {
  res.json({
    ok: true,
    keyConfigured: !keyMissing(getKey()),
    envFileFound: fs.existsSync(envPath)
  });
});

// AI travel chatbot
app.post('/api/chat', async (req, res) => {
  const apiKey = getKey();
  if (keyMissing(apiKey)) {
    return res.status(503).json({ error: MISSING_MSG });
  }

  const messages = Array.isArray(req.body?.messages)
    ? req.body.messages
    : [];

  if (!messages.length) {
    return res.status(400).json({
      error: 'Send a travel question to start the chat.'
    });
  }

  const model =
    clean(req.body?.model || process.env.VITE_OPENROUTER_MODEL) ||
    'openai/gpt-4o-mini';

  try {
    const upstream = await fetch(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer':
            process.env.APP_URL || 'https://roamly-ai-0czd.onrender.com',
          'X-Title': 'Roamly Travel'
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.6
        }),
        signal: AbortSignal.timeout(45000)
      }
    );

    const data = await upstream.json().catch(() => ({}));

    if (!upstream.ok) {
      const status = upstream.status;
      const providerMessage =
        data?.error?.message || `OpenRouter returned HTTP ${status}.`;

      return res
        .status([401, 402, 404].includes(status) ? status : 502)
        .json({
          error:
            status === 401
              ? 'OpenRouter rejected the API key. Check that it is correct and active.'
              : status === 402
                ? 'Insufficient OpenRouter credits or balance.'
                : status === 404
                  ? 'The selected model is unavailable. Check VITE_OPENROUTER_MODEL.'
                  : providerMessage
        });
    }

    const answer = data?.choices?.[0]?.message?.content;

    if (!answer) {
      return res.status(502).json({
        error: 'The AI provider returned no answer. Try again.'
      });
    }

    return res.json({ answer });
  } catch (err) {
    return res.status(504).json({
      error:
        err.name === 'TimeoutError'
          ? 'The AI request timed out. Please try again.'
          : 'Could not contact OpenRouter. Check your internet connection.'
    });
  }
});

// Travel photo / landmark identification
app.post('/api/identify', async (req, res) => {
  const apiKey = getKey();

  if (keyMissing(apiKey)) {
    return res.status(503).json({ error: MISSING_MSG });
  }

  const image = String(req.body?.image || '');
  const fileName = String(req.body?.fileName || 'uploaded image');

  if (!/^data:image\/(jpeg|png|webp);base64,/.test(image)) {
    return res.status(400).json({
      error: 'Upload a JPG, PNG or WebP image.'
    });
  }

  if (image.length > 6_800_000) {
    return res.status(413).json({
      error: 'Image is too large. Choose a photo under 5 MB.'
    });
  }

  try {
    const model =
      clean(process.env.VITE_OPENROUTER_MODEL) ||
      'openai/gpt-4o-mini';

    const upstream = await fetch(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer':
            process.env.APP_URL || 'https://roamly-ai-0czd.onrender.com',
          'X-Title': 'Roamly Travel Companion Camera'
        },
        body: JSON.stringify({
          model,
          temperature: 0.3,
          max_tokens: 900,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: `You are Roamly's visual travel companion. Analyse the uploaded travel image (${fileName}). Destination if known: ${String(req.body?.destination || 'unknown')}. Describe only what is visible first. If it appears to show a landmark, give the likely identity and confidence (high, medium or low), explain its historical or cultural significance only when supported, and list clues. If uncertain, offer up to three possibilities and explain how to verify. Transcribe only legible text from signs or menus. Never invent a precise location, opening hours, prices or safety status. If unrelated to travel, say so politely.`
                },
                {
                  type: 'image_url',
                  image_url: { url: image }
                }
              ]
            }
          ]
        }),
        signal: AbortSignal.timeout(60000)
      }
    );

    const data = await upstream.json().catch(() => ({}));

    if (!upstream.ok) {
      const status = upstream.status;

      return res
        .status(status === 401 ? 401 : status === 402 ? 402 : 502)
        .json({
          error:
            status === 401
              ? 'OpenRouter rejected the API key. Check your key.'
              : status === 402
                ? 'Insufficient OpenRouter credits or balance.'
                : 'Image analysis provider error: ' +
                  (data?.error?.message || `HTTP ${status}`)
        });
    }

    const answer = data?.choices?.[0]?.message?.content;

    if (!answer) {
      return res.status(502).json({
        error: 'The AI provider returned no image analysis.'
      });
    }

    return res.json({ answer });
  } catch (err) {
    return res.status(504).json({
      error:
        err.name === 'TimeoutError'
          ? 'Image analysis timed out. Try a smaller image.'
          : 'Could not contact the AI provider. Check internet access.'
    });
  }
});

// Hotel search
app.get('/api/hotels', async (req, res) => {
  const destination = String(req.query.destination || '').trim();

  if (!destination) {
    return res.status(400).json({
      error: 'Destination is required.'
    });
  }

  const serpKey = clean(process.env.SERPAPI_API_KEY);

  if (!serpKey) {
    return res.status(503).json({
      live: false,
      message:
        'Live hotel data is not configured. Use a booking partner to check current prices and availability.'
    });
  }

  try {
    const checkin =
      req.query.checkin ||
      new Date(Date.now() + 86400000).toISOString().slice(0, 10);

    const checkout =
      req.query.checkout ||
      new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);

    const url = new URL('https://serpapi.com/search.json');

    url.searchParams.set('engine', 'google_hotels');
    url.searchParams.set('q', destination);
    url.searchParams.set('check_in_date', String(checkin));
    url.searchParams.set('check_out_date', String(checkout));
    url.searchParams.set('adults', String(req.query.adults || 2));
    url.searchParams.set('currency', 'INR');
    url.searchParams.set('gl', 'in');
    url.searchParams.set('hl', 'en');
    url.searchParams.set('api_key', serpKey);

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error('Hotel provider unavailable');
    }

    const data = await response.json();

    return res.json({
      live: true,
      hotels: (data.properties || []).slice(0, 12).map(h => ({
        name: h.name || 'Hotel',
        image: h.images?.[0]?.thumbnail || h.thumbnail || '',
        rating: h.overall_rating || null,
        reviews: h.reviews || null,
        price:
          h.rate_per_night?.lowest ||
          h.rate_per_night?.extracted_lowest ||
          '',
        totalPrice: h.total_rate?.lowest || '',
        link: h.link || h.serpapi_property_details_link || '',
        location: h.neighborhood || h.description || ''
      }))
    });
  } catch {
    return res.status(502).json({
      error: 'Hotel results are unavailable right now. Try again later.'
    });
  }
});

// Serve the built React/Vite website
const distPath = path.join(__dirname, 'dist');
const indexPath = path.join(distPath, 'index.html');

if (fs.existsSync(indexPath)) {
  app.use(express.static(distPath));

  // Frontend fallback must come AFTER all API routes.
  // This syntax works with Express 4 and Express 5.
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api/')) {
      return next();
    }

    return res.sendFile(indexPath);
  });
} else {
  console.warn(`Frontend build not found: ${indexPath}`);

  app.get('/', (_, res) => {
    res.status(503).send(
      'Roamly frontend build not found. Run npm run build and redeploy.'
    );
  });
}

// Start server on Render's assigned port
const PORT = Number(process.env.PORT || 5000);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Roamly API running on port ${PORT}`);

  console.log(
    keyMissing(getKey())
      ? 'WARNING: OpenRouter key not configured.'
      : 'OpenRouter key configured.'
  );
});

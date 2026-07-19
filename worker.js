/**
 * BEU Hub — GenZ AI Tutor backend
 * -------------------------------
 * A tiny proxy so the AI Doubt Solver can actually talk to an AI model.
 * Browsers block direct calls from a website to api.anthropic.com (CORS +
 * it would expose your API key to every visitor), so this Worker sits in
 * between: BEU Hub → this Worker → Claude API → back to BEU Hub.
 *
 * This version also includes basic abuse protection: origin-locking (only
 * your deployed site can call it), per-device + site-wide daily rate limits,
 * and an optional shared-secret header. See "Security" in AI-SETUP.md for
 * what each of these actually protects against (and what it doesn't).
 *
 * Deploy (free, ~10 minutes, no command line needed):
 *   1. Go to https://dash.cloudflare.com → sign up/log in (free).
 *   2. Workers & Pages → Create → "Create Worker".
 *   3. Delete the sample code it gives you, paste this whole file in, click "Deploy".
 *   4. Go to Settings → Variables and Secrets → add:
 *        Secret  ANTHROPIC_API_KEY   = your key from https://console.anthropic.com/settings/keys
 *        Plain   ALLOWED_ORIGIN      = https://your-deployed-site.com  (see AI-SETUP.md)
 *        Secret  APP_SHARED_SECRET   = any random string you make up (optional but recommended)
 *   5. Workers & Pages → your Worker → Settings → Bindings → add a KV namespace
 *      bound as RATE_LIMIT_KV (create a new one, name doesn't matter — free tier is plenty).
 *   6. Copy the worker's URL (looks like https://beu-hub-ai.YOURNAME.workers.dev)
 *   7. In BEU Hub, open the AI Tutor → tap ⚙️ → paste that URL → Save.
 *
 * Full walkthrough: see AI-SETUP.md next to this file.
 */

const SYSTEM_PROMPT = `You are GenZ AI Tutor, the AI doubt-solver built into BEU Hub, an app for
Bihar Engineering University (BEU) students. You help with: explaining engineering/science topics,
writing notes and summaries, generating MCQs and assignments, debugging code, interview prep, and
career/coding roadmaps. Students may write in English or Hinglish (mixed Hindi-English) — reply
naturally in whichever the student used. Keep answers clear, exam-relevant, and not overly long
unless asked for detail. Use simple formatting (short paragraphs, bullet points, code blocks) — this
renders in a small mobile chat window, so avoid huge markdown tables.`;

const MODEL = 'claude-haiku-4-5-20251001'; // fast + cheap, good default for a student Q&A bot
// Swap to 'claude-sonnet-5' below if you want stronger reasoning and don't mind higher cost.

// --- Abuse protection knobs ---
const PER_IP_LIMIT_PER_DAY = 40;     // generous for a real student, painful for a scraper
const GLOBAL_LIMIT_PER_DAY = 2000;   // hard ceiling on your whole site's daily spend
const MAX_PROMPT_LENGTH = 6000;

function corsHeaders(origin, allowedOrigin) {
  // Only the site you actually deployed BEU Hub to should get a CORS-allowed
  // response. Anyone else (a copy-pasted script on a random page) gets blocked
  // by the browser itself, even though our server logic still ran.
  const allow = allowedOrigin === '*' || origin === allowedOrigin ? (origin || '*') : 'null';
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-App-Secret',
    'Vary': 'Origin',
  };
}

function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

async function checkRateLimit(env, key, limit) {
  // Uses a Workers KV namespace bound as RATE_LIMIT_KV (see AI-SETUP.md to add one —
  // it's free and takes one click). Without it, rate limiting is skipped rather than
  // erroring, so the Worker still works during initial setup — but you should add the
  // KV binding before sharing the site widely.
  if (!env.RATE_LIMIT_KV) return { ok: true, skipped: true };
  const day = new Date().toISOString().slice(0, 10);
  const fullKey = `${key}:${day}`;
  const current = parseInt((await env.RATE_LIMIT_KV.get(fullKey)) || '0', 10);
  if (current >= limit) return { ok: false };
  await env.RATE_LIMIT_KV.put(fullKey, String(current + 1), { expirationTtl: 172800 }); // 2 days
  return { ok: true };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowedOrigin = env.ALLOWED_ORIGIN || '*'; // set this in Cloudflare env vars — see AI-SETUP.md
    const cors = corsHeaders(origin, allowedOrigin);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: cors });
    }
    if (request.method !== 'POST') {
      return json({ reply: 'This endpoint only accepts POST requests.' }, 405, cors);
    }
    if (allowedOrigin !== '*' && origin !== allowedOrigin) {
      return json({ reply: 'Requests from this origin are not allowed.' }, 403, cors);
    }
    if (!env.ANTHROPIC_API_KEY) {
      return json({ reply: 'Server is missing ANTHROPIC_API_KEY. Add it under Settings → Variables and Secrets in the Cloudflare dashboard.' }, 500, cors);
    }
    // Optional extra gate: if you set APP_SHARED_SECRET in the Worker's env vars,
    // only requests carrying the matching X-App-Secret header are served. This is
    // NOT a strong secret (it ships inside app.js, which anyone can read via "view
    // source") — its job is to stop casual copy-paste abuse and dumb bots, not a
    // determined attacker. Real protection is the origin check + rate limits above.
    if (env.APP_SHARED_SECRET && request.headers.get('X-App-Secret') !== env.APP_SHARED_SECRET) {
      return json({ reply: 'Unauthorized.' }, 401, cors);
    }

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return json({ reply: 'Bad request — expected JSON with a "prompt" field.' }, 400, cors);
    }

    const prompt = (body.prompt || '').toString().trim();
    if (!prompt) {
      return json({ reply: 'Please send a question.' }, 400, cors);
    }
    if (prompt.length > MAX_PROMPT_LENGTH) {
      return json({ reply: 'That message is too long — please shorten it.' }, 400, cors);
    }

    // Optional image (Doubt Solver's "upload a photo of the question" feature).
    // Expected shape: { mediaType: 'image/jpeg'|'image/png'|'image/webp', data: '<base64, no data: prefix>' }
    const image = body.image && typeof body.image.data === 'string' ? body.image : null;
    const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    const MAX_IMAGE_BASE64_CHARS = 5_000_000; // ~3.7MB decoded, well under Claude's per-image limit
    if (image) {
      if (!ALLOWED_IMAGE_TYPES.includes(image.mediaType)) {
        return json({ reply: 'Unsupported image type — please upload a JPEG, PNG, WEBP or GIF.' }, 400, cors);
      }
      if (image.data.length > MAX_IMAGE_BASE64_CHARS) {
        return json({ reply: 'That image is too large — please upload a smaller photo.' }, 400, cors);
      }
    }

    // Optional reply-language hint from the Hindi/English toggle in the UI.
    const lang = body.lang === 'hi' ? 'hi' : (body.lang === 'en' ? 'en' : null);

    // Rate limit by IP and globally, so one bad actor can't drain your API budget.
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const ipCheck = await checkRateLimit(env, `ip:${ip}`, PER_IP_LIMIT_PER_DAY);
    if (!ipCheck.ok) {
      return json({ reply: "You've hit today's question limit for this device. Try again tomorrow!" }, 429, cors);
    }
    const globalCheck = await checkRateLimit(env, 'global', GLOBAL_LIMIT_PER_DAY);
    if (!globalCheck.ok) {
      return json({ reply: 'GenZ AI Tutor is very busy today and has hit its daily limit. Please try again tomorrow.' }, 429, cors);
    }

    // Recent conversation history for context (client already trims to last 10 turns)
    const history = Array.isArray(body.history) ? body.history : [];
    const messages = history
      .filter(m => m && typeof m.text === 'string')
      .slice(-10)
      .map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text.slice(0, MAX_PROMPT_LENGTH) }));

    if (image) {
      messages.push({
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.data } },
          { type: 'text', text: prompt },
        ],
      });
    } else {
      messages.push({ role: 'user', content: prompt });
    }

    const system = lang
      ? `${SYSTEM_PROMPT}\n\nIMPORTANT: Reply only in ${lang === 'hi' ? 'Hindi (Devanagari script)' : 'English'} for this message, regardless of what language the student wrote in.`
      : SYSTEM_PROMPT;

    try {
      const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 1024,
          system,
          messages,
        }),
      });

      if (!apiRes.ok) {
        const errText = await apiRes.text();
        console.log('Anthropic API error:', apiRes.status, errText);
        return json({ reply: `AI service returned an error (${apiRes.status}). Check the Worker logs for details.` }, 502, cors);
      }

      const data = await apiRes.json();
      const reply = (data.content || [])
        .filter(block => block.type === 'text')
        .map(block => block.text)
        .join('\n')
        .trim();

      return json({ reply: reply || 'Sorry, I got an empty response — try asking again.' }, 200, cors);
    } catch (e) {
      return json({ reply: 'Could not reach the AI service: ' + e.message }, 500, cors);
    }
  },
};

# Making the AI Doubt Solver (GenZ AI Tutor) actually work

## Why it needs a "backend" at all

Browsers block websites from calling AI providers (Anthropic, OpenAI, etc.) directly —
partly for security (your API key would be visible to every visitor in the browser's
network tab and could be stolen and abused on your bill), and partly because those
providers block cross-origin browser requests entirely (CORS).

So BEU Hub talks to a small **proxy server** instead:

```
Student's phone → BEU Hub (GenZ AI Tutor) → your Worker → Claude API → back to the student
```

The Worker is the only piece that holds the real API key, and it's free to run for
normal traffic levels (Cloudflare's free tier: 100,000 requests/day).

---

## Step 1 — Get an Anthropic API key

1. Go to https://console.anthropic.com and sign up / log in.
2. Add a small amount of credit (a few dollars covers a lot of student Q&A — Haiku-tier
   pricing is roughly $1 per million input tokens).
3. Go to **Settings → API Keys → Create Key**. Copy it (starts with `sk-ant-...`) —
   you won't be able to see it again, so save it somewhere safe for now.

## Step 2 — Deploy the Worker (no coding, no command line)

1. Go to https://dash.cloudflare.com and sign up / log in (free account is fine).
2. In the sidebar: **Workers & Pages → Create → Create Worker**.
3. Give it any name (e.g. `beu-hub-ai`) → **Deploy** (it'll deploy a placeholder first).
4. Click **Edit code**. Delete everything in the editor, then paste in the entire
   contents of `worker.js` (in this same download).
5. Click **Deploy** (top right).
6. Go to the Worker's **Settings → Variables and Secrets → Add** and add these three:

   | Type | Name | Value |
   |---|---|---|
   | Secret | `ANTHROPIC_API_KEY` | your `sk-ant-...` key from Step 1 |
   | Plain text | `ALLOWED_ORIGIN` | the exact URL you'll host BEU Hub at, e.g. `https://beuhub.netlify.app` (no trailing slash) |
   | Secret | `APP_SHARED_SECRET` | any random string you make up, e.g. `beu-9x7q2k` (optional — skip if you just want it working quickly) |

   Save after each one.
7. Go to **Settings → Bindings → Add → KV Namespace**. Create a new namespace
   (any name, e.g. `beu-hub-ratelimit`) and bind it as **`RATE_LIMIT_KV`**. This is
   what powers the daily question limits so one person can't drain your API budget.
8. Back on the Worker's overview page, copy its URL — looks like:
   `https://beu-hub-ai.yourname.workers.dev`

   If you skipped `ALLOWED_ORIGIN` (left it unset), the Worker accepts requests from
   any site — fine for quick testing, but set it before sharing the link widely.
   If you set `APP_SHARED_SECRET`, also open `app.js`, find the line
   `const APP_SHARED_SECRET = '';` near the top, and put the same string in the quotes.

## Step 3 — Connect BEU Hub to it

1. Open BEU Hub, tap the 🤖 AI Tutor button, then the ⚙️ icon in its header.
2. Paste the Worker URL into **Backend URL**.
3. Tap **Test connection** — you should see "✅ Working! Reply: ...".
4. Tap **Save**. The dot next to "GenZ AI Tutor" turns green — you're live.

Every visitor to your deployed BEU Hub site will now get real AI answers automatically —
they don't need to do any of this themselves; you only set it up once as the admin
(the endpoint URL is baked into the app once you've saved it in your own browser... see
note below on making it permanent for *all* visitors).

## Making it permanent for every visitor (not just your own browser)

The Settings panel saves the endpoint to your own browser's local storage — great for
testing, but each new visitor would need to paste it in themselves otherwise. To make it
automatic for everyone, hardcode your Worker URL as the default:

Open `app.js`, find this line near the top:

```js
const LS = {
  theme:'beu_theme', attendance:'beu_attendance', cgpa:'beu_cgpa',
  timetable:'beu_timetable', reviews:'beu_reviews', chat:'beu_ai_chat',
  premium:'beu_premium', aiEndpoint:'beu_ai_endpoint'
};
```

Then find `AIChat.init()` a bit further down and add one line right at the top of it:

```js
init(){
  if(!store.get(LS.aiEndpoint,'')) store.set(LS.aiEndpoint, 'https://beu-hub-ai.yourname.workers.dev');
  // ...rest of init stays the same
```

Replace the URL with your real Worker URL. Now every new visitor gets a working AI Tutor
with zero setup, and the ⚙️ panel still lets anyone (including you) point it somewhere
else later if needed.

## Cost control tips

- The Worker defaults to **Claude Haiku** (`claude-haiku-4-5-20251001`) — fast and cheap,
  good enough for most student questions. To upgrade quality for harder questions, open
  `worker.js` and change the `MODEL` constant to `'claude-sonnet-5'` (higher cost per
  question, but stronger reasoning).
- Cloudflare's dashboard shows request counts; Anthropic's console shows token usage/cost.
- The built-in rate limits (`PER_IP_LIMIT_PER_DAY` / `GLOBAL_LIMIT_PER_DAY` near the top of
  `worker.js`) are your main defense against runaway cost — tune them if 40 questions/device/day
  is too generous or too strict for your situation.

## Security — what's protected and what isn't

- **Your API key never reaches the browser.** It lives only in the Worker's encrypted
  secrets store and is attached to requests server-side. This is the one that actually
  matters — nothing in the deployed site's HTML/JS ever contains it.
- **`ALLOWED_ORIGIN`** makes the browser itself refuse the response if some other website
  tries to call your Worker — stops someone from embedding your AI Tutor on their own
  page and burning your budget.
- **Rate limiting (KV)** caps how many questions one device or the whole site can ask per
  day, so a single abusive user (or a bug in a loop) can't run your bill up unbounded.
- **`APP_SHARED_SECRET`** is a soft deterrent, not real security — it ships inside
  `app.js`, which anyone can read via "View Page Source." It filters out casual
  bots/scrapers hitting your Worker URL directly without going through the app, nothing
  more. Don't treat it as a password.
- **What this setup does *not* protect against**: a determined person who reads your
  `app.js`, copies your Worker URL and shared secret, and writes their own script that
  mimics real requests. Origin-locking + rate limits still cap the damage they can do,
  but there's no way to make a fully client-side app's backend URL truly secret. If usage
  ever gets large enough to be a real cost concern, the next step up is adding a login
  system so requests are tied to real accounts — which is a bigger change than this app
  currently has (by design — you asked for no sign-up/login).
- **The rest of the site** (attendance, timetable, CGPA, reviews) only ever touches your
  own browser's local storage — there's no server for that data to leak from. The app
  also escapes anything you type before displaying it back, so typing HTML/script tags
  into a subject name or review can't run as real code.

## Troubleshooting

- **"Test connection" fails immediately** → double check you pasted the full Worker URL
  including `https://`.
- **"Requests from this origin are not allowed"** → your `ALLOWED_ORIGIN` value doesn't
  exactly match the URL you're testing from (check for `www.`, trailing slash, or http
  vs https mismatches).
- **"AI service returned an error (401)"** → your `ANTHROPIC_API_KEY` secret is missing or
  wrong — redo Step 2.6.
- **"You've hit today's question limit"** → expected behavior once `RATE_LIMIT_KV` is
  bound; raise `PER_IP_LIMIT_PER_DAY` in `worker.js` if it's too strict for testing.
- **"AI service returned an error (529)" or similar** → Anthropic's API is temporarily
  overloaded; the student just needs to try again in a moment.
- **Works for you but not for other people** → you only saved the endpoint in your own
  browser. Do the "Making it permanent" step above.

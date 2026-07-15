# BEU Hub — Security Summary

Quick reference for what's been secured and how, across the whole site (not just
the AI Tutor — see AI-SETUP.md for that part in detail).

## 1. API keys never touch the browser

The only API key this project uses is the Anthropic key for the AI Tutor, and it
lives exclusively in the Cloudflare Worker's encrypted secret store (`worker.js` +
Cloudflare dashboard). It is never written into `app.js`, `index.html`, or any file
that ships to a visitor's browser. Anyone can "View Page Source" on your deployed
site and will not find it there.

## 2. The AI backend is locked down, not just "connected"

- **Origin-locked** (`ALLOWED_ORIGIN`): the Worker only answers requests whose
  browser `Origin` header matches your real deployed site.
- **Rate-limited** (`RATE_LIMIT_KV`): capped per-device and site-wide daily question
  counts, so a bug or a bad actor can't run your Anthropic bill up unbounded.
- **Input-validated**: empty/oversized messages are rejected before they ever reach
  the AI provider.
- **Optional shared-secret header**: a soft extra filter against casual bots — see
  AI-SETUP.md for why this isn't "real" security on its own.

Full setup and the honest tradeoffs of each: **AI-SETUP.md**.

## 3. Stored XSS fixed

Several places take text you type — attendance subject names, timetable entries,
review name/feedback, CGPA semester labels, and both sides of the AI chat — and
previously inserted it into the page as raw HTML. That meant typing something like
`<img src=x onerror=alert(1)>` into any of those fields would have executed as real
code the next time it rendered.

All of these now go through an `escapeHtml()` step before display. Since none of
this data is shared between users (everything lives in your own browser's local
storage — see below), the practical risk was limited to a person attacking their
own browser session, but it's fixed regardless since it's cheap to do right.

## 4. No account data to leak, by design

Attendance, timetable, CGPA history, saved reviews, and AI chat history are stored
only in `localStorage`, on the visitor's own device. There is no database and no
server that holds any of this — so there's nothing for an attacker to breach to get
at other students' data. The tradeoff (already a deliberate choice in this project)
is that this data doesn't sync across devices and clearing browser data erases it.

## 5. Content-Security-Policy added

`index.html` now sends a CSP header restricting which origins can supply scripts,
styles, fonts, and frames. Two intentional exceptions, documented inline in the
`<meta>` tag itself:
- `'unsafe-inline'` is allowed for scripts because the app uses inline
  `onclick="..."` handlers throughout — removing that would mean rewriting most of
  `app.js` to use `addEventListener` instead. The CSP still blocks loading a script
  *file* from an untrusted origin, which is the more common real-world attack vector.
- `frame-src` allows any `https:` origin, since the "open inside app" feature needs
  to embed arbitrary government/education sites you can't hardcode a list of ahead
  of time.

## 6. Embedded iframes are sandboxed

The in-app browser used for BEU Results/Notice and educational websites now sets
`sandbox="allow-scripts allow-same-origin allow-forms allow-popups"` on the iframe,
which stops an embedded page from doing things like hijacking your top-level window
or triggering unexpected downloads, while still letting those sites actually work.

## 7. External links use `rel="noopener noreferrer"`

Every link that opens in a new tab now has both `noopener` (stops the new page from
getting a JS handle back to your site — protects against "reverse tab-nabbing") and
`noreferrer` (doesn't leak your site's URL in the destination's referrer logs).

## What's intentionally out of scope

- **HTTPS**: not something a static site's code can enforce itself — make sure
  wherever you host it (Netlify, Vercel, GitHub Pages, Cloudflare Pages all do this
  by default) actually serves over HTTPS. The service worker/PWA install won't work
  over plain HTTP anyway.
- **A "fully secret" client-side backend URL**: not achievable for a pure static
  site with no login system — see the honest caveat in AI-SETUP.md's Security
  section for what the current setup does and doesn't protect against, and what the
  next step up would look like if you ever need it.

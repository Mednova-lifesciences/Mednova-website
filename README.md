# MedNova Lifesciences

Five-page website: Home, Regulatory Affairs, Clinical Development,
Pharmacovigilance, Capability Statement. Organized with separated
frontend and backend for maintainability.

## Pages & interactive tools

| Page                        | Interactive feature                      | Type                                 |
| --------------------------- | ---------------------------------------- | ------------------------------------ |
| `index.html`                | General reasoning preview                | AI-powered (needs backend + API key) |
| `regulatory.html`           | Registration Readiness Checker           | Rule-based (zero dependencies)       |
| `cro.html`                  | Trial Site Feasibility Readiness Checker | Rule-based (zero dependencies)       |
| `pv.html`                   | QPPV Compliance Readiness Checker        | Rule-based (zero dependencies)       |
| `capability-statement.html` | General reasoning preview                | AI-powered (needs backend + API key) |

**Important distinction:** the three readiness checkers (Regulatory, Clinical Development, Pharmacovigilance) are pure JavaScript with real scoring logic — they work immediately on any static host, no backend or API key required. The two "reasoning preview" demos (on the homepage and capability statement) call the backend and need a real Anthropic API key to function.

## Project structure

```
mednova/
├── frontend/
│   ├── public/
│   │   └── downloads/
│   │       └── MedNova-NAFDAC-QPPV-Compliance-Checklist.pdf
│   ├── src/
│   │   ├── css/
│   │   │   └── demo-widget.css
│   │   ├── js/
│   │   │   └── demo-widget.js
│   │   └── pages/
│   │       ├── index.html
│   │       ├── regulatory.html
│   │       ├── cro.html
│   │       ├── pv.html
│   │       └── capability-statement.html
│   └── package.json
├── backend/
│   ├── src/
│   │   ├── config/
│   │   │   └── api.config.js
│   │   ├── routes/
│   │   │   └── assistant.routes.js
│   │   ├── middleware/
│   │   └── utils/
│   ├── server.js
│   ├── .env.example
│   └── package.json
├── package.json
├── .gitignore
└── README.md
```

## Folder descriptions

- **frontend/**: All client-side files
  - `public/`: Static assets (PDFs, images)
  - `src/css/`: Stylesheets
  - `src/js/`: JavaScript files
  - `src/pages/`: HTML pages

- **backend/**: Server-side code
  - `src/config/`: Configuration constants
  - `src/routes/`: API route handlers
  - `src/middleware/`: Express middleware
  - `src/utils/`: Utility functions
  - `server.js`: Main Express server

## Run it locally

```bash
# Install dependencies
npm run install:all

# Setup environment
cd backend
cp .env.example .env
# Edit .env and add your real ANTHROPIC_API_KEY

# Start the server
cd ..
npm start
```

Open the local frontend and backend entry points for development — all five pages and all five interactive tools will work (the three checkers work regardless of the API key; the two AI demos need it).

## Development

```bash
# Run in development mode with auto-reload
npm run dev
```

## Deploy it

**Render / Railway / Fly.io (simplest)**

1. Push this folder to a GitHub repo.
2. Create a Web Service, build command `npm install`, start command `npm start`.
3. Add environment variable `ANTHROPIC_API_KEY` in the host's dashboard.
4. Deploy, then point the real domain at it.

**Any VPS**

1. Copy the folder over, `npm install --production`.
2. Set `ANTHROPIC_API_KEY` as a real environment variable — not a `.env` file sitting in a web-readable directory.
3. Run behind nginx/Caddy for TLS.

**If you don't want the AI demos at all**, you can skip the backend entirely and host `frontend/src/pages/` as a plain static site (Netlify, GitHub Pages, S3) — the three readiness checkers will still work perfectly. The two AI demo sections would need to be removed or replaced with static content in that case.

## Security & cost notes

- The Anthropic API key is read from `process.env.ANTHROPIC_API_KEY` only and never sent to the browser.
- `/api/assistant` is rate-limited to 30 requests per IP per 15 minutes.
- Input is capped at 600 characters; system prompts keep each demo's topic scoped.
- No mentions of "Claude" or "Anthropic" appear anywhere in client-facing content — the AI provider is an implementation detail.
- Add a CAPTCHA (e.g. Cloudflare Turnstile) before the AI endpoints see real public traffic at scale.

## Known limitations

- The regulatory checker's NAFDAC-specific claims (e.g. QPPV guideline effective date) came from general web research during development and have NOT been verified against NAFDAC's primary published guidance. Confirm this wording with your regulatory team before this goes live — an inaccurate citation on a credibility-building tool works against you.
- The two AI demos are general-purpose reasoning previews, not connected to any real client site, case, sponsor, or regulatory data.
- No CMS — content updates mean editing the HTML files directly.
- The "Beyond Safety" regulatory cross-sell section on `pv.html` is a deliberate design choice, not a bug — see conversation history if this needs revisiting.

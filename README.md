## Super Webapp 1.1

Static frontend with Supabase auth (magic link) and an LLM proxy endpoint.

### Local setup
- Copy env.local.js.example to env.local.js and set:
  - `CHAT_URL` → your `llm-proxy-auth` edge function URL
  - `SUPABASE_URL` → your Supabase project URL
  - `SUPABASE_ANON` → your anon key
- Run a static server:
  - `npm run serve` (http-server on :8000) or `npm run dev`
- Open http://localhost:8000

### Auth
- Enter your email and press Sign in to receive a magic link.
- Once signed in, requests include the user JWT to `CHAT_URL`.

### Deploy to GitHub Pages
This repo includes a GitHub Actions workflow to deploy the static site.

Steps:
1) Push to `main` on GitHub.
2) In GitHub → Settings → Pages → set Source: GitHub Actions.
3) Add repository secrets if needed (optional, not required for static site).

### Files
- `index.html` — UI and config loader
- `script.js` — app logic, auth, and proxy calls
- `styles.css` — styling
- `env.local.js.example` — local config template (copy to `env.local.js`)



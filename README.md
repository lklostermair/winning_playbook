# winning_playbook
Playbook Engine for Legal Hackathon

## Repository Layout

- `docs/` - project specification and implementation plan
- `backend/` - FastAPI backend
- `data/examples/` - provided challenge, playbook, and NDA sample files
- `data/raw/` - uploaded raw files during local runs
- `data/processed/` - generated intermediate artifacts
- `vault/` - Markdown/JSON playbook source of truth
- `chroma/` - local disposable vector index

## Local Backend Startup

Start the full local app with one command:

```bash
bash scripts/dev.sh
```

This starts FastAPI on `http://127.0.0.1:8000` and Vite on
`http://localhost:5173`.

Install dependencies and start FastAPI with `uv`:

```bash
uv sync
uv run uvicorn app.main:app --app-dir backend --reload --host 0.0.0.0 --port 8000
```

Equivalent root-level helper:

```bash
uv run python scripts/dev.py backend
```

Health check:

```bash
curl http://localhost:8000/health
```

Expected response:

```json
{"status":"ok"}
```

Configuration is documented in `.env.example`. The backend creates the configured `vault`, `data`, and `chroma` directories on startup if they are missing.

## Seed The Demo Vault

Extract rules from a playbook source and write them to the Markdown/JSON vault:

```bash
uv run python scripts/seed_demo_data.py data/examples/Sample\ NDA\ Playbook.csv.xlsx
```

The extractor accepts `.docx`, `.pdf`, `.xlsx`, and `.csv` sources. By default it runs in `hybrid` mode: it uses Gemini through Vertex AI and ADC when `GOOGLE_CLOUD_PROJECT` is configured, otherwise it falls back to local heuristics so the demo remains runnable. `GEMINI_API_KEY` is still supported as a secondary fallback.

Recommended Vertex AI defaults:

```env
GOOGLE_CLOUD_PROJECT=winning-playbook-2026
GOOGLE_CLOUD_LOCATION=europe-west4
GEMINI_MODEL=gemini-2.5-flash
```

## Local Frontend Startup

The frontend lives in `frontend/` and uses npm. Keep `frontend/package.json` and
`frontend/package-lock.json` as the source of truth for Node dependencies.

```bash
uv run python scripts/dev.py frontend-install
uv run python scripts/dev.py frontend
```

Set the API base URL for the Vite app when needed:

```env
VITE_API_BASE_URL=http://localhost:8000
```

Build check:

```bash
uv run python scripts/dev.py frontend-build
```

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

Install dependencies and start FastAPI with `uv`:

```bash
uv sync
uv run uvicorn app.main:app --app-dir backend --reload --host 0.0.0.0 --port 8000
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

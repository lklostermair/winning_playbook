# dandelion

dandelion is a local legal playbook assistant. It turns playbooks or existing contracts into an auditable Markdown/JSON vault, answers questions from selected playbooks, cites the exact topics it used, and can draft and commit rule updates.

## What You Can Do

- Upload a structured playbook from DOCX, PDF, XLSX, or CSV.
- Upload existing contracts and let Gemini synthesize a coherent ruleset.
- Select one or more playbooks for answers.
- Ask questions in text or voice.
- Expand compact source pills to inspect referenced topics.
- Open a rule sidebar, draft an update with dandelion, confirm it, commit it, and rebuild retrieval.

## Requirements

- Python 3.12+
- `uv`
- Node.js and npm
- Google Cloud ADC for Gemini/Vertex AI, or `GEMINI_API_KEY`

The app uses:

- FastAPI backend on `http://127.0.0.1:8000`
- TanStack/Vite frontend on `http://localhost:5173`
- Chroma as a local disposable vector index
- Gemini for extraction, answer generation, rule-update drafting, and embeddings
- Faster Whisper and Kokoro ONNX for local voice input/output

## First-Time Setup

```bash
uv sync
uv run python scripts/dev.py frontend-install
```

Create `.env` from `.env.example`, or export the same variables in your shell.

Recommended ADC setup:

```bash
gcloud config set project winning-playbook-2026
gcloud services enable aiplatform.googleapis.com
gcloud auth application-default login
gcloud auth application-default set-quota-project winning-playbook-2026
```

Then validate the local setup:

```bash
uv run python scripts/dev.py validate-demo
```

## Run Locally

Reset the default NDA demo vault and rebuild retrieval:

```bash
uv run python scripts/dev.py reset-demo
```

Start backend and frontend:

```bash
bash scripts/dev.sh
```

Open:

```text
http://localhost:5173
```

With the backend running, smoke-test the API:

```bash
uv run python scripts/dev.py smoke-demo
```

## Basic Usage

### Ask dandelion

1. Start the app.
2. Select the playbooks that should be included in the answer.
3. Ask a question in the input or use voice mode.
4. Click the compact source pill, for example `3 sources`, to expand referenced topics.
5. Click a source or graph node to open the rule sidebar.

### Update a Rule

1. Open a rule from a source or graph node.
2. In the rule sidebar, describe what should change.
3. Click `Draft with dandelion`.
4. Review the drafted section, text, and reason.
5. Click `Update & Commit`.

The backend updates the Markdown/JSON rule files, creates a Git commit when Git is configured, and reindexes retrieval. The old proposed-update review tab is not part of the current UI.

### Upload a Playbook

1. Click `Upload`.
2. Choose `Existing playbook`.
3. Enter a playbook id and name.
4. Select DOCX, PDF, XLSX, or CSV files.
5. Create a draft.
6. Expand the draft and review extracted topics.
7. Publish when it should replace that playbook's official vault.

### Generate a Playbook From Contracts

1. Click `Upload`.
2. Choose `Existing contracts`.
3. Enter a playbook id and name.
4. Upload one or more contracts.
5. Create a draft.
6. Review the synthesized topics.
7. Publish when the generated ruleset should become searchable.

Contract synthesis requires Gemini. It reads the uploaded contracts together, finds recurring topics, merges overlapping clauses, captures meaningful variations, and writes a reviewable draft ruleset.

## Common Commands

| Command | Purpose |
|---|---|
| `bash scripts/dev.sh` | Start backend and frontend together. |
| `uv run python scripts/dev.py validate-demo` | Check local files, paths, frontend metadata, and AI credentials. |
| `uv run python scripts/dev.py reset-demo` | Reset default NDA vault and rebuild Chroma. |
| `uv run python scripts/reset_demo.py --mode heuristic --skip-index` | Offline extraction smoke test without embeddings. |
| `uv run python scripts/dev.py smoke-demo` | Check health, playbooks, rules, and ask endpoints. |
| `uv run python scripts/dev.py test` | Run backend service tests. |
| `uv run python scripts/dev.py frontend-lint` | Run frontend lint. |
| `uv run python scripts/dev.py frontend-build` | Build the frontend. |

## Important Paths

- `backend/` - FastAPI app
- `frontend/` - React/TanStack app
- `scripts/` - dev, reset, seed, smoke, and validation helpers
- `tests/` - backend service tests
- `data/examples/` - sample challenge/playbook/NDA files
- `vault/` - Markdown/JSON source of truth
- `chroma/` - generated vector index

`chroma/`, `data/raw/`, and `vault/**/draft_ingest/` are runtime artifacts. Keep `.gitkeep` files, but generated contents can be deleted and rebuilt.

## Troubleshooting

- **Frontend says API is down:** run `bash scripts/dev.sh`, then check `http://localhost:8000/health`.
- **ADC/Gemini issues:** run `uv run python scripts/dev.py validate-demo`, then rerun the `gcloud auth application-default ...` commands above.
- **Retrieval seems stale:** delete generated files in `chroma/` except `.gitkeep`, then run `uv run python scripts/dev.py reset-demo`.
- **Frontend points to wrong backend:** set `VITE_API_BASE_URL=http://localhost:8000`.
- **Voice model is slow on first use:** run the app once and let `/voice/warmup` finish; models are cached locally after download.

## More Docs

- `docs/DEMO_RUNBOOK.md` - concise live-demo script.
- `docs/IMPLEMENTATION_PLAN.md` - current implementation status and next work.
- `docs/PROJECT_SPEC.md` - product scope and architecture summary.

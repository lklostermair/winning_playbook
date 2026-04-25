# Living Playbook

Living Playbook is a local demo app that turns legal playbooks from Word, PDF, Excel, or CSV into an auditable Markdown/JSON vault. Users can ask questions, see source-grounded answers, propose updates, and let lawyers approve changes that are committed and reindexed.

## What You Can Do

- Upload or seed a playbook into `vault/`.
- Ask questions such as `Can we accept unlimited liability?`
- See cited sources, confidence, Git author, and change time.
- Propose a playbook update.
- Approve or reject updates as Lawyer/Admin.
- Rebuild the retrieval index from the vault at any time.

## Requirements

- Python 3.12+
- `uv`
- Node.js and npm
- Google Cloud ADC for Gemini/Vertex AI, or `GEMINI_API_KEY`

The project uses:

- FastAPI backend on `http://127.0.0.1:8000`
- TanStack/Vite frontend on `http://localhost:5173`
- Chroma as a local disposable vector index
- Gemini for extraction, answer generation, and embeddings

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

## Run The Demo

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

### Ask The Playbook

1. Start the app.
2. Select the `NDA Playbook`.
3. Ask one of:
   - `Can we accept unlimited liability?`
   - `Can we accept a unilateral NDA?`
   - `What is our red line on contract penalties?`
4. Inspect the highlighted cited branch, answer sources, confidence, and Git metadata.
5. Click a source card or graph node to open the rule panel.

### Propose And Approve An Update

1. Open a rule by clicking a source or graph node.
2. Switch role to `Lawyer` or `Admin`.
3. Add proposed text and a reason.
4. Create the proposal.
5. Approve or reject it in the rule panel.

Approval writes the Markdown/JSON rule, creates a Git commit when Git is configured, and reindexes retrieval.

### Upload A New Playbook

1. Click `Upload`.
2. Enter a playbook id and name.
3. Select DOCX, PDF, XLSX, or CSV files.
4. Create a draft.
5. Expand the draft and review extracted topics.
6. Publish when it should replace that playbook's official vault.

Publishing replaces the official rules for that playbook and rebuilds retrieval.

## Common Commands

| Command | Purpose |
|---|---|
| `bash scripts/dev.sh` | Start backend and frontend together. |
| `uv run python scripts/dev.py validate-demo` | Check local files, paths, frontend metadata, and AI credentials. |
| `uv run python scripts/dev.py reset-demo` | Reset default NDA vault and rebuild Chroma. |
| `uv run python scripts/reset_demo.py --mode heuristic --skip-index` | Offline extraction smoke test without embeddings. |
| `uv run python scripts/dev.py smoke-demo` | Check health, playbooks, rules, and ask endpoints. |
| `uv run python scripts/smoke_demo.py --write-review` | Also create and reject a temporary proposed update. |
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

`chroma/` is disposable. Keep `chroma/.gitkeep`, but the other files can be deleted and rebuilt with:

```bash
uv run python scripts/dev.py reset-demo
```

## Troubleshooting

- **Frontend says API is down:** run `bash scripts/dev.sh`, then check `http://localhost:8000/health`.
- **ADC/Gemini issues:** run `uv run python scripts/dev.py validate-demo`, then rerun the `gcloud auth application-default ...` commands above.
- **Retrieval seems stale:** delete generated files in `chroma/` except `.gitkeep`, then run `uv run python scripts/dev.py reset-demo`.
- **Frontend points to wrong backend:** set `VITE_API_BASE_URL=http://localhost:8000`.
- **Resetting a non-default playbook:** pass `--yes` only when you intend to replace that playbook's official rules.

## More Docs

- `docs/DEMO_RUNBOOK.md` - concise live-demo script.
- `docs/IMPLEMENTATION_PLAN.md` - current implementation status and next work.
- `docs/PROJECT_SPEC.md` - product scope and architecture summary.

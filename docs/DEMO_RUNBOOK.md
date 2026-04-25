# Demo Runbook

This is the repeatable local path for the Living Playbook demo.

## One-Time Setup

```bash
uv sync
uv run python scripts/dev.py frontend-install
```

Configure Gemini through Vertex AI ADC or an API key. The recommended local setup is ADC:

```bash
gcloud config set project winning-playbook-2026
gcloud services enable aiplatform.googleapis.com
gcloud auth application-default login
gcloud auth application-default set-quota-project winning-playbook-2026
```

Use `.env.example` as the reference for environment variables.

## Preflight

Run this before a judged demo:

```bash
uv run python scripts/dev.py validate-demo
```

This validates local files, frontend metadata, configured runtime paths, and Gemini credentials.
It does not call Google APIs.

## Reset The Demo

Reset the NDA vault from the sample DOCX source and rebuild the Chroma index:

```bash
uv run python scripts/dev.py reset-demo
```

For an offline extraction smoke test without embeddings:

```bash
uv run python scripts/reset_demo.py --mode heuristic --skip-index
```

The reset clears proposed updates and ingest drafts for the target playbook. To keep review state:

```bash
uv run python scripts/reset_demo.py --keep-review-state
```

For non-default playbooks, pass `--yes` or type the playbook id at the confirmation prompt.

`chroma/` is disposable generated state. If retrieval looks stale, keep `chroma/.gitkeep`, delete the other Chroma files, and run the reset or `/reindex` again.

## Start The App

```bash
bash scripts/dev.sh
```

Open `http://localhost:5173`.

## Smoke Test

With the backend running:

```bash
uv run python scripts/dev.py smoke-demo
```

To also create and reject a temporary proposed update:

```bash
uv run python scripts/smoke_demo.py --write-review
```

## Demo Questions

Use these questions because they exercise retrieval, red-line handling, confidence, and source display:

- Can we accept unlimited liability?
- Can we accept a unilateral NDA?
- What is our red line on contract penalties?

## Demo Flow

1. Reset the demo data.
2. Start the app.
3. Select the NDA playbook.
4. Ask: `Can we accept unlimited liability?`
5. Show the cited branch in the graph, source cards, confidence, and Git metadata.
6. Click a source or graph topic to open the lawyer-side detail panel.
7. Suggest a targeted update.
8. Switch to Lawyer or Admin and approve it.
9. Show that the vault Markdown changed, a Git commit was created, and the index was rebuilt.
10. Ask a related question again and show the changed answer.

# Demo Runbook

Use this before presenting the project.

## 1. Preflight

```bash
uv run python scripts/dev.py validate-demo
```

This checks local files, frontend metadata, runtime directories, and Gemini credential configuration. It does not call Google APIs.

## 2. Reset

```bash
uv run python scripts/dev.py reset-demo
```

This restores the default NDA vault from `data/examples/Sample NDA Playbook.docx`, clears proposed updates and ingest drafts for `nda`, and rebuilds Chroma.

Offline fallback check:

```bash
uv run python scripts/reset_demo.py --mode heuristic --skip-index
```

## 3. Start

```bash
bash scripts/dev.sh
```

Open `http://localhost:5173`.

## 4. Smoke Test

In another terminal:

```bash
uv run python scripts/dev.py smoke-demo
```

Optional review-flow smoke test:

```bash
uv run python scripts/smoke_demo.py --write-review
```

## 5. Demo Questions

- `Can we accept unlimited liability?`
- `Can we accept a unilateral NDA?`
- `What is our red line on contract penalties?`

## 6. Demo Flow

1. Show the vault graph centered at the top of the chat.
2. Ask `Can we accept unlimited liability?`
3. Point to the highlighted cited branch.
4. Open a source card or graph topic.
5. Show source text, confidence, Git author, and change time.
6. Switch role to `Lawyer` or `Admin`.
7. Propose a targeted update.
8. Approve the update.
9. Explain that approval commits Markdown/JSON and reindexes retrieval.
10. Ask a related question again and show the changed answer.

## 7. If Something Breaks

- API down: check `http://localhost:8000/health`.
- Retrieval stale: delete generated Chroma files except `chroma/.gitkeep`, then run `reset-demo`.
- Gemini credentials broken: rerun ADC login and quota-project setup.
- Frontend points to wrong API: set `VITE_API_BASE_URL=http://localhost:8000`.

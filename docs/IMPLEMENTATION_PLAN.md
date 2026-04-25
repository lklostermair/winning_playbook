# Implementation Status

This document records what is implemented and what remains useful to improve. For usage instructions, read `README.md`.

## Current State

The MVP is feature-complete for a local demo:

- FastAPI backend with health, playbook, ask, reindex, ingest, and update APIs.
- Markdown/JSON vault under `vault/`.
- Adaptive extraction from DOCX, PDF, XLSX, and CSV.
- Gemini/Vertex AI extraction, answer generation, and embeddings with heuristic extraction fallback.
- Chroma retrieval index rebuilt from vault content.
- Source-grounded ask flow with confidence and Git metadata.
- Proposed update lifecycle: create, approve, reject.
- Approved updates write vault files, commit through Git when configured, and reindex.
- TanStack/Vite frontend with chat, graph, upload, source inspection, update review, and role switching.
- Demo hardening scripts for validation, reset, smoke testing, and tests.

## Work Package Summary

| WP | Status | Result |
|---|---|---|
| WP0 | Done | Repo scaffold, `uv`, FastAPI shell, runtime dirs. |
| WP1 | Done | Domain schemas and stable API contracts. |
| WP2 | Done | Vault service for Markdown/JSON playbooks. |
| WP3 | Done | Adaptive playbook extraction. |
| WP4 | Done | Git metadata and commit helper. |
| WP5 | Done | Chroma indexing with cached Gemini embeddings. |
| WP6 | Done | Retrieval-grounded ask flow. |
| WP7 | Done | Lawyer-controlled proposed update workflow. |
| WP8 | Done | Frontend integrated with live APIs. |
| WP9 | Done | Upload/ingest draft workflow. |
| WP10 | Done | Demo reset, preflight, smoke test, docs, and UI polish. |

## Architecture

Source of truth:

- `vault/{playbook_id}/rules/*.md`
- `vault/{playbook_id}/metadata/rules/*.json`
- `vault/{playbook_id}/metadata/playbook.json`

Generated state:

- `chroma/` vector index and embedding cache
- `data/raw/uploads/` uploaded files
- `data/processed/` intermediate artifacts

Backend services:

- `VaultService` reads and writes playbook rules.
- `PlaybookExtractionService` extracts rules from source files.
- `RetrievalService` chunks and indexes rules.
- `AskService` coordinates retrieval and answer generation.
- `ProposedUpdateService` manages update lifecycle.
- `IngestService` creates reviewable ingest drafts.
- `GitService` exposes file history and commits approved changes.

Frontend:

- `frontend/src/routes/index.tsx` owns app state and API orchestration.
- `frontend/src/components/playbook/workspace-components.tsx` owns the main playbook UI components.
- `frontend/src/lib/api.ts` is the typed API client.

## Current Defaults

- Default playbook id: `nda`
- Default source: `data/examples/Sample NDA Playbook.docx`
- Generation model: `gemini-2.5-flash`
- Embedding model: `gemini-embedding-001`
- Embedding location: `global`
- Embedding dimensions: `768`
- Extraction mode: `hybrid`

## Remaining Useful Improvements

- Split `workspace-components.tsx` further into graph, chat, rule panel, and dialogs.
- Add browser-level UI smoke tests with Playwright.
- Add API integration tests that run against a temporary vault and mocked embeddings.
- Add optional Docker Compose once local direct startup is stable.
- Add a real draft diff/review page for ingest drafts before publish.
- Add provider-switching tests for non-Gemini model backends.

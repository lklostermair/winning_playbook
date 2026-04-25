# Implementation Plan

## Goal

Build a local hackathon MVP for **The Living Playbook: Turn Static Legal Guidance into an Intelligent, Self-Evolving Resource**.

The product turns static Word/Excel legal playbooks into structured, AI-ready, auditable guidance that can talk to business users, explain itself to lawyers, grow from approved negotiation insight, and scale to other playbook types through repeatable templates.

The first demo target is not full contract review. It is the playbook lifecycle:

1. Seed the NDA playbook from the provided source material.
2. Ask a playbook question.
3. Return answer, sources, confidence, and Git metadata.
4. Suggest a rule update.
5. Approve it.
6. Change Markdown, commit to Git, reindex, and show that future answers changed.

## Challenge Framing

Legal playbooks are negotiation guidance: standard positions, fallbacks, red lines, decision logic, suggested language, explanations, and negotiation tips. Today they are often trapped in Word/Excel, not AI-friendly, and frozen in time because negotiation insights do not feed back into the official guidance.

The mission is to make the playbook itself come alive. Contracts can provide evidence and update signals, but the main product is the playbook engine: a repeatable workflow that transforms an existing playbook into a structured format, lets lawyers verify the AI interpretation, and keeps lawyers in control of approved changes.

## Product Pillars

- **Talk:** Business users ask plain-language questions and get grounded answers with sources.
- **Think:** The system interprets playbook rules into structured positions, fallbacks, red lines, decision logic, and suggested language.
- **Grow:** Negotiation lessons and user feedback become proposed updates, never automatic policy changes.
- **Scale:** The same template workflow should work beyond the sample NDA, even though the demo starts with `nda`.
- **No black box:** Every answer and every update must expose source text, confidence, rule metadata, and Git history.

## Current Repo Reality

- The repo started from specs and sample data: `README.md`, `docs/PROJECT_SPEC.md`, `docs/IMPLEMENTATION_PLAN.md`, and `data/examples/`.
- The challenge description is `data/examples/Siemens Munich_Hacking_Legal_2026_Challenge-1.pdf` and frames this as a living playbook engine, not a contract-review tool.
- WP0 now provides the initial FastAPI backend shell and scaffold directories. There is still no frontend, populated vault, Chroma index, ingestion script, or Docker setup yet.
- The strongest deterministic seed source is `data/examples/Sample NDA Playbook.csv.xlsx`.
- The richer narrative source is `data/examples/Sample NDA Playbook.docx`.
- The sample Standard NDA and negotiated/customer NDA docx/pdf pairs are supplementary material for testing and discovering update signals. They are not the main input and should not turn the MVP into bulk comparison.
- The actual sample NDA playbook has 14 clauses. Ignore older/spec examples that mention 8 generated rules.
- Some sample filenames contain non-breaking spaces. Any parser or copy script must use path-safe handling and avoid manual string assumptions.
- The worktree is already dirty/untracked. Do not revert or overwrite unrelated edits.

## Decision Defaults

- **Source of truth:** Markdown vault plus structured JSON. Chroma is disposable.
- **Seed strategy:** Generate the first vault from XLSX deterministically. Use DOCX narrative only to enrich rule text where easy.
- **Rule count:** Treat the NDA seed as 14 clauses.
- **Playbook scope:** Demo with `nda`, but design schemas and vault layout as reusable playbook templates.
- **Ingestion scope:** Seeded XLSX ingestion first; broad DOCX/PDF ingestion after the core loop works.
- **Contract corpus scope:** Negotiated contracts are optional learning/update-signal inputs, not the authoritative playbook source.
- **Provider portability:** Keep generation and embedding behind service interfaces. Gemini/OpenAI choices must be swappable and must not leak into domain schemas or vault format.
- **Confidence:** Heuristic only: retrieval score, source count, direct-answer check, and LLM self-check. It is not legal certainty.
- **Git:** Approved playbook changes create commits. In development, allow a clear fallback/error if Git author or Docker-mounted `.git` is missing.
- **Dual UX:** Business users get plain-language answers. Lawyers get source traceability, verification views, diffs, metadata, and approval controls.
- **Frontend:** Lovable React calls FastAPI REST APIs. Backend contracts should stabilize before UI polish.
- **Local only:** Docker Compose is useful, but direct local startup is acceptable during the first 48 hours.

## Dependency Graph

WP0 repo scaffold blocks all implementation.

WP1 schemas and API contracts unblock backend/frontend parallel work.

WP2 vault service and WP3 seed data unblock WP4 Git metadata and WP5 RAG.

WP4 Git metadata and WP5 RAG unblock WP6 Ask Playbook.

WP6 Ask Playbook unblocks WP7 update workflow.

WP7 update workflow unblocks the final demo loop.

WP8 frontend integration can start after WP1 with mocked data, then bind to WP6/WP7.

WP9 ingestion MVP and WP10 demo hardening should happen after the core ask/update loop is stable.

## Work Packages

### WP0: Repo Scaffold

**Owner lane:** Backend/RAG

**Scope**

- Add `backend/`, `scripts/`, `vault/`, `data/`, and `chroma/` structure.
- Add FastAPI app shell, config, `uv` project metadata, `.env.example`, and local startup instructions.
- Add Docker Compose only if it does not slow local iteration.

**Acceptance Criteria**

- `GET /health` returns `{ "status": "ok" }`.
- Backend starts locally with documented env vars.
- Empty vault/index directories do not crash startup.

### WP1: Domain Schemas And API Contracts

**Owner lane:** Backend/RAG, Frontend Core

**Scope**

- Define Pydantic schemas for playbooks, reusable rule templates, sources, chat answers, Git metadata, confidence, and proposed updates.
- Model rule fields around the challenge vocabulary: standard position, fallback, red line, decision logic, suggested language, explanation/rationale, and negotiation tips.
- Implement stubbed endpoints:
  - `GET /playbooks`
  - `GET /playbooks/{playbook_id}/rules`
  - `POST /ask`
  - `POST /updates`
  - `GET /updates?playbook_id=nda`
  - `POST /updates/{update_id}/approve`
  - `POST /updates/{update_id}/reject`
  - `POST /reindex`

**Acceptance Criteria**

- Frontend can develop against stable JSON shapes before RAG is complete.
- Stub responses include source, confidence, and Git metadata fields.
- Schemas are playbook-agnostic even when seeded with the NDA.
- API names match `docs/PROJECT_SPEC.md` unless implementation discovers a concrete blocker.

### WP2: Vault Service

**Owner lane:** Backend/RAG

**Scope**

- Create and read Obsidian-compatible Markdown rule files under `vault/nda/rules/`.
- Store structured rule JSON under `vault/nda/metadata/`.
- Use stable rule IDs generated from clause topics.
- Keep the vault format provider-neutral and readable without any AI service.
- Render sections consistently:
  - Standard Position
  - Fallback Position
  - Red Line
  - Decision Logic
  - Escalation Logic
  - Rationale
  - Negotiation Tips
  - Suggested Language
  - Metadata

**Acceptance Criteria**

- Service can list, read, write, and update one rule without corrupting unrelated rules.
- JSON and Markdown represent the same rule data.
- Markdown remains human-readable and Git-trackable.
- A lawyer can inspect the generated Markdown and verify how the system interpreted the original playbook.

### WP3: Adaptive Playbook Extraction

**Owner lane:** Backend/RAG

**Scope**

- Implement `scripts/seed_demo_data.py`.
- Accept Word, PDF, Excel, or CSV playbook sources.
- Extract the rule count adaptively from source content instead of assuming a fixed number of clauses.
- Use hybrid extraction: model-assisted extraction through Gemini on Vertex AI with ADC when Google Cloud is configured, with local heuristics as a runnable fallback.
- Preserve source references so the generated playbook can be audited back to the input files.
- Create `vault/nda/rules/*.md` and `vault/nda/metadata/playbook.json`.

**Acceptance Criteria**

- Running the seed script creates one vault rule per extracted playbook topic.
- The extractor handles `.docx`, `.pdf`, `.xlsx`, and `.csv` inputs.
- Source document metadata points back to the input file and location.
- Re-running the seed script refreshes generated rules for demo reset without hand-editing vault files.

### WP4: Git Metadata Service

**Owner lane:** Backend/RAG

**Scope**

- Implement `GitService.get_last_change_metadata(file_path)`.
- Implement approved-change commit creation.
- Use commit format: `[playbook:{playbook_id}] Update {rule_id}: {short_description}`.
- Expose audit metadata wherever a rule or answer is shown.

**Acceptance Criteria**

- Rule API and ask API can return last changed by, timestamp, commit hash, and commit message.
- Approved updates create a commit when Git is configured.
- Git failures produce explicit API errors, not silent success.

### WP5: Retrieval And Indexing

**Owner lane:** Backend/RAG

**Scope**

- Chunk Markdown by rule section.
- Embed chunks with OpenAI embeddings.
- Persist vectors in local Chroma.
- Filter retrieval by `playbook_id`.
- Add `POST /reindex`.

**Acceptance Criteria**

- Reindexing `nda` rebuilds Chroma from vault Markdown.
- Asking about unlimited liability retrieves the liability red-line chunk in top results.
- Deleting Chroma and reindexing restores search behavior.

### WP6: Ask Playbook

**Owner lane:** Backend/RAG, Frontend Core

**Scope**

- Implement grounded answer generation behind an LLM service abstraction.
- Return concise answer, confidence, source snippets, retrieval scores, and Git metadata.
- Refuse to invent answers when retrieved context is insufficient.
- Separate the business-user answer from lawyer-facing audit details in the response shape.

**Acceptance Criteria**

- `POST /ask` with `Can we accept unlimited liability?` answers from the liability rule.
- Response includes source file, section, snippet, confidence label/score/reason, and Git metadata.
- Low-evidence questions produce a clear insufficient-source answer.
- Plain-language guidance is visible without hiding the audit trail.

### WP7: Proposed Update Workflow

**Owner lane:** Backend/RAG, Frontend Demo UX

**Scope**

- Create pending proposed-update Markdown/JSON under `vault/nda/proposed_updates/`.
- List pending updates.
- Approve or reject updates.
- On approval, update the target Markdown rule, update structured JSON, create Git commit, and reindex.
- Treat negotiated contract patterns and user feedback as proposed update signals requiring lawyer review.

**Acceptance Criteria**

- User can propose a liability fallback change.
- Lawyer can approve it.
- Target rule Markdown changes.
- Git commit is created.
- Future ask responses reflect the approved text.
- No negotiation insight changes the official playbook without explicit approval.

### WP8: Frontend Integration

**Owner lane:** Frontend Core, Frontend Demo UX

**Scope**

- Build Lovable React app against FastAPI.
- Required views:
  - Dashboard with playbook status and latest Git update
  - Ask Playbook chat
  - Business answer view with plain-language guidance
  - Lawyer rule viewer with source traceability
  - Pending updates approval screen with diff/audit details
  - Lightweight ingest/reset controls if time allows

**Acceptance Criteria**

- UI can run the core demo without using curl.
- Source citations, confidence, and Git metadata are visible.
- Approve/reject actions show clear pending/approved/rejected state.
- Frontend uses `VITE_API_BASE_URL`.
- Business and lawyer workflows are visibly distinct without requiring separate auth for MVP.

### WP9: Ingestion MVP

**Owner lane:** Backend/RAG

**Scope**

- Keep XLSX ingestion production-like enough for the provided NDA playbook.
- Add basic DOCX/PDF parsers only after seeded vault and update loop work.
- Use negotiated/customer NDAs only as supplementary learning/update-signal corpus.
- Keep the ingestion workflow template-driven so another Word/Excel playbook can be mapped into the same structured rule schema.

**Acceptance Criteria**

- XLSX ingestion can recreate the seeded 14-rule vault.
- DOCX/PDF parser failures do not block the core demo.
- Any unsupported input returns a useful error.
- The importer produces reviewable draft rules before they become approved guidance.

### WP10: Demo Hardening

**Owner lane:** All lanes

**Scope**

- Add a demo reset path that restores seeded vault and index.
- Add clear env validation.
- Add predictable sample questions.
- Polish UI states for loading, empty data, low confidence, and update approval.

**Acceptance Criteria**

- Fresh clone can be brought to demo state with documented commands.
- Demo can be repeated without manually cleaning generated state.
- The core script works under time pressure.

## First 48-Hour Path

### Hours 0-6

- Create backend scaffold and health endpoint.
- Define schemas and stub API responses.
- Frontend starts against mocked API contracts.

### Hours 6-14

- Implement vault service.
- Implement XLSX seed script.
- Generate 14 NDA rule Markdown files and structured metadata.
- Add rule listing and rule detail API.

### Hours 14-24

- Implement section chunking, embeddings, Chroma indexing, and reindex endpoint.
- Verify liability query retrieves the right source chunk.
- Add Git metadata reads.

### Hours 24-36

- Implement LLM answer flow and confidence heuristic.
- Make `POST /ask` work end to end for the unlimited-liability demo question.
- Frontend binds ask page to live backend.

### Hours 36-48

- Implement proposed update create/list/approve/reject.
- Approval updates Markdown, commits, reindexes.
- Frontend binds pending updates page.
- Add demo reset command and rehearse the full script.

## Practical Demo Script

1. Start backend and frontend locally.
2. Reset demo data from the sample XLSX.
3. Select `NDA` playbook.
4. Open rule viewer and show the 14 seeded clauses.
5. Show the lawyer verification view: original source reference, structured fields, Markdown output, and Git metadata.
6. Ask: `Can we accept unlimited liability?`
7. Show answer grounded in the liability rule.
8. Point out:
   - Source file and section
   - Confidence score and reason
   - Last changed by/date/commit
9. Mention that negotiated contracts can surface patterns as update signals, but not automatic policy.
10. Click suggest update and propose a controlled fallback, for example a special escalation path for a defined customer segment.
11. Open pending updates as lawyer.
12. Approve the update.
13. Show that the liability Markdown changed and a Git commit was created.
14. Ask the same or related question again.
15. Show that the answer now reflects the approved playbook change.

## Risks And Mitigations

- **Ingestion scope risk:** Start with deterministic XLSX seeding. Defer broad DOCX/PDF extraction.
- **Rule-count mismatch:** Use the actual 14-clause sample playbook as the acceptance target.
- **Docker/Git risk:** Support direct local dev first. Treat Docker as packaging, not the first milestone.
- **Filename risk:** Use `pathlib` and discovered file paths; do not hand-type paths with special spaces.
- **Confidence risk:** Label it as source-support confidence, not legal certainty.
- **Frontend/backend drift:** Freeze API schemas early and keep stub endpoints until live services are ready.
- **LLM hallucination risk:** Prompt to answer only from retrieved context and return insufficient-source responses.
- **Stale index risk:** Reindex after every approved update; Chroma must be rebuildable from vault.
- **Vendor lock-in risk:** Keep provider-specific code in service adapters only; keep vault, schemas, and APIs provider-neutral.
- **Black-box risk:** Require source references, structured interpretation, confidence reason, update diffs, and Git metadata in lawyer-facing views.
- **One-off demo risk:** Build seed/import as a repeatable template workflow, not hand-written demo files.
- **Contract-review drift:** Use negotiated contracts only as evidence for possible playbook updates, not as the primary user flow.

## Non-Goals For MVP

- Full contract review.
- Multi-playbook production management.
- User authentication and role permissions.
- Cloud deployment.
- Advanced PDF table extraction.
- Automated negotiation strategy or automatic policy changes from customer NDAs.
- Obsidian runtime integration.

## Definition Of Done

The MVP is done when the team can demonstrate, from the local UI, that a Word/Excel NDA playbook has been transformed into a reviewable structured vault; the seeded playbook answers an unlimited-liability question with plain-language guidance plus source/confidence/Git metadata; a proposed update is applied only after lawyer approval; the Markdown change is committed and reindexed; and a future answer uses the updated rule. The design must be visibly repeatable for other playbooks and provider-portable beyond the specific demo models.

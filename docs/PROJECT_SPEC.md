# Living Playbook — Technical Project Specification

## 1. Project Goal

Build a hackathon MVP for a **Living Legal Playbook Engine**.

The system converts static legal playbooks and example documents into a structured, searchable, human-auditable knowledge base. Users can interact with the playbook through a web interface, ask task-specific questions, receive source-grounded answers, and propose playbook updates. Lawyers remain in control through an approval workflow before changes become part of the official playbook.

The MVP should focus on the playbook itself, not full contract review. Sample documents are given in `data/examples/`; please read through these carefully.

---

## 2. Core Product Concept

The system has five main capabilities:

1. **Ingest legal documents**
   - Word `.docx`
   - Excel `.xlsx`
   - PDF `.pdf`

2. **Generate and maintain playbooks**
   - Convert playbook knowledge into structured JSON.
   - Render the same knowledge as human-readable Markdown files.

3. **Answer questions using RAG**
   - Retrieve relevant playbook sections from the vault.
   - Generate answers using an LLM.
   - Always show sources, confidence, and Git history metadata.

4. **Suggest and approve updates**
   - Users can suggest improvements.
   - Proposed changes are stored separately.
   - Lawyers approve/reject changes.
   - Approved changes update the Markdown vault and create a Git commit.

5. **Support multiple playbooks**
   - Example: NDA, MSA, Employment Contract.
   - Each playbook is treated as a separate branch/workspace inside the vault.

---

## 3. Technology Stack

### Backend

- **Framework:** FastAPI
- **Language:** Python
- **Package manager:** uv
- **Schemas:** Pydantic
- **Style:** Type hints required
- **API style:** Clean REST API
- **Async:** Use async where useful, but avoid unnecessary complexity

### RAG / Retrieval

- **Vector database:** Chroma
- **Embeddings:** OpenAI embeddings
- **Retrieval source of truth:** Markdown vault + structured JSON
- **Vector DB role:** Disposable search index, not source of truth

### LLM

- **Primary option:** Gemini via Google Cloud Platform
- **Provider abstraction:** Keep LLM calls behind a small service layer so provider can be swapped later
- **Optional fallback:** OpenAI-compatible interface if needed

### Frontend

- **Frontend builder:** Lovable
- **Generated app:** React
- **Backend connection:** REST API calls to FastAPI
- **Deployment for hackathon:** Local only

### Storage

- **Main legal knowledge store:** Obsidian-style Markdown vault
- **Machine-readable store:** JSON files
- **Versioning:** Git commits on approved changes
- **Index:** Chroma local persistent directory

### Deployment

- **Mode:** Local only
- **Containerization:** Docker + Docker Compose
- **GPU:** Available locally, but not required for MVP if using OpenAI embeddings and Gemini

---

## 4. Obsidian-Style Vault Decision

We do **not** need to implement Obsidian itself.

Obsidian is a Markdown editor and graph visualization tool. The product should create a vault that is compatible with Obsidian, meaning:

- Plain Markdown files
- Folder-based organization
- Wiki-style links where useful, e.g. `[[Liability]]`
- Human-readable legal rules
- Git-trackable changes

This gives us the advantages of Obsidian without depending on Obsidian as a runtime dependency.

Obsidian can be used optionally to visually inspect the vault and graph, but the backend should work without Obsidian installed.

---

## 5. Repository Structure

```text
living-playbook/
  README.md
  docs/
    PROJECT_SPEC.md
    IMPLEMENTATION_PLAN.md
  docker-compose.yml
  .env.example
  .gitignore

  pyproject.toml
  uv.lock

  backend/
    Dockerfile
    app/
      main.py

      api/
        routes_health.py
        routes_ingestion.py
        routes_playbooks.py
        routes_chat.py
        routes_updates.py
        routes_reindex.py

      core/
        config.py
        logging.py

      schemas/
        playbook.py
        chat.py
        ingestion.py
        update.py
        source.py

      services/
        ingestion_service.py
        playbook_service.py
        vault_service.py
        git_service.py
        embedding_service.py
        retrieval_service.py
        llm_service.py
        task_router.py
        update_service.py
        confidence_service.py

      rag/
        chunking.py
        chroma_store.py
        prompts.py

      parsers/
        docx_parser.py
        xlsx_parser.py
        pdf_parser.py

      utils/
        file_utils.py
        datetime_utils.py

  frontend/
    # Lovable-generated React application

  vault/
    nda/
      rules/
      proposed_updates/
      metadata/
    msa/
      rules/
      proposed_updates/
      metadata/
    employment/
      rules/
      proposed_updates/
      metadata/

  data/
    raw/
    processed/
    examples/

  chroma/
    # Local Chroma persistence directory

  scripts/
    init_vault.py
    reindex.py
    seed_demo_data.py
```

---

## 6. MVP User Flow

### Flow A — Generate Playbook

1. User selects:
   - Document type: `NDA`
   - Task: `Generate Playbook`
   - Input files: `.docx`, `.xlsx`, `.pdf`

2. Backend parses the files.

3. Backend extracts structured playbook rules.

4. Rules are saved as:
   - JSON for machine processing
   - Markdown for the vault

5. Backend creates a Git commit.

6. Backend indexes the Markdown into Chroma.

7. Frontend displays generated rule cards.

---

### Flow B — Ask Playbook

1. User selects:
   - Document type: `NDA`
   - Task: `Ask Playbook`

2. User asks a question.

3. Backend retrieves relevant chunks from Chroma.

4. Backend sends retrieved context to LLM.

5. Backend returns:
   - Answer
   - Sources
   - Confidence
   - Last Git change metadata

---

### Flow C — Suggest Update

1. User asks a question or provides feedback.

2. User clicks `Suggest Update`.

3. Backend creates a proposed update file.

4. Proposed update is stored in:

```text
vault/{playbook_id}/proposed_updates/
```

5. Frontend shows the update in the lawyer approval dashboard.

---

### Flow D — Approve Update

1. Lawyer reviews proposed update.

2. Lawyer clicks `Approve`.

3. Backend applies change to the relevant Markdown rule file.

4. Backend creates a Git commit.

5. Backend reindexes the affected playbook.

6. Future answers use the updated rule.

---

## 7. Playbook Vault Structure

Each playbook gets its own folder.

```text
vault/
  nda/
    rules/
      liability.md
      confidentiality.md
      governing-law.md
    proposed_updates/
      update_001.md
    metadata/
      playbook.json
      index_manifest.json
```

### Example Rule Markdown File

```md
# Liability

## Standard Position

Liability should be capped at the contract value.

## Fallback Position

If the counterparty pushes back, liability may be capped at 2x the contract value.

## Red Line

Unlimited liability must not be accepted.

## Escalation Logic

If the deal value exceeds EUR 1,000,000, escalate to senior legal.

## Rationale

This protects the company from disproportionate contractual exposure.

## Suggested Language

"Each party's aggregate liability shall not exceed the total fees paid or payable under this agreement."

## Metadata

- Playbook: NDA
- Topic: Liability
- Status: Approved
- Last reviewed by: Lukas
- Last reviewed at: 2026-04-25 11:45
- Last commit: abc1234
```

---

## 8. Structured Rule Schema

The backend should keep a structured version of every rule.

```json
{
  "playbook_id": "nda",
  "rule_id": "liability",
  "topic": "Liability",
  "standard_position": "Liability should be capped at the contract value.",
  "fallback_position": "Liability may be capped at 2x the contract value.",
  "red_line": "Unlimited liability must not be accepted.",
  "escalation_logic": "If deal value exceeds EUR 1,000,000, escalate to senior legal.",
  "rationale": "This protects the company from disproportionate contractual exposure.",
  "suggested_language": "Each party's aggregate liability shall not exceed...",
  "status": "approved",
  "source_documents": [
    {
      "filename": "NDA_Playbook.xlsx",
      "location": "Sheet 1, Row 12"
    }
  ],
  "git_metadata": {
    "last_changed_by": "Lukas",
    "last_changed_at": "2026-04-25T11:45:00+02:00",
    "last_commit_hash": "abc1234",
    "last_commit_message": "Update liability fallback position"
  }
}
```

---

## 9. Proposed Update Schema

```json
{
  "update_id": "update_001",
  "playbook_id": "nda",
  "target_rule_id": "liability",
  "status": "pending",
  "suggested_by": "business_user",
  "suggested_at": "2026-04-25T12:10:00+02:00",
  "reason": "Customer frequently pushes back on liability cap.",
  "proposed_change": {
    "section": "Fallback Position",
    "old_text": "Liability may be capped at 2x the contract value.",
    "new_text": "For public sector customers, liability may be capped at 3x the contract value after legal approval."
  },
  "source_interaction": {
    "question": "Can we accept 3x liability for public sector customers?",
    "answer": "The current playbook allows up to 2x only."
  }
}
```

---

## 10. API Design

### Health

```http
GET /health
```

Returns:

```json
{
  "status": "ok"
}
```

---

### Upload Files

```http
POST /upload
```

Purpose:

Upload raw source documents.

Input:

- Multipart files
- `playbook_id`
- `document_type`

Output:

```json
{
  "uploaded_files": [
    "NDA_Playbook.xlsx",
    "Sample_NDA.docx"
  ]
}
```

---

### Ingest / Generate Playbook

```http
POST /ingest
```

Input:

```json
{
  "playbook_id": "nda",
  "document_type": "NDA",
  "file_paths": [
    "data/raw/NDA_Playbook.xlsx"
  ]
}
```

Output:

```json
{
  "playbook_id": "nda",
  "rules_created": 8,
  "vault_path": "vault/nda",
  "commit_hash": "abc1234"
}
```

---

### List Playbooks

```http
GET /playbooks
```

Output:

```json
{
  "playbooks": [
    {
      "playbook_id": "nda",
      "name": "NDA Playbook"
    },
    {
      "playbook_id": "msa",
      "name": "MSA Playbook"
    }
  ]
}
```

---

### Get Rules

```http
GET /playbooks/{playbook_id}/rules
```

Output:

```json
{
  "playbook_id": "nda",
  "rules": [
    {
      "rule_id": "liability",
      "topic": "Liability",
      "status": "approved"
    }
  ]
}
```

---

### Ask Question

```http
POST /ask
```

Input:

```json
{
  "playbook_id": "nda",
  "task_type": "ask_playbook",
  "question": "Can we accept unlimited liability?"
}
```

Output:

```json
{
  "answer": "No. Unlimited liability is marked as a red line in the NDA playbook.",
  "confidence": {
    "score": 0.91,
    "label": "high",
    "reason": "The retrieved source directly states that unlimited liability must not be accepted."
  },
  "sources": [
    {
      "file": "vault/nda/rules/liability.md",
      "section": "Red Line",
      "snippet": "Unlimited liability must not be accepted.",
      "retrieval_score": 0.87,
      "git_metadata": {
        "last_changed_by": "Lukas",
        "last_changed_at": "2026-04-25T11:45:00+02:00",
        "last_commit_hash": "abc1234",
        "last_commit_message": "Update liability rule"
      }
    }
  ]
}
```

---

### Create Proposed Update

```http
POST /updates
```

Input:

```json
{
  "playbook_id": "nda",
  "target_rule_id": "liability",
  "reason": "Public sector customers often require higher liability caps.",
  "proposed_change": {
    "section": "Fallback Position",
    "new_text": "For public sector customers, liability may be capped at 3x the contract value after legal approval."
  }
}
```

Output:

```json
{
  "update_id": "update_001",
  "status": "pending"
}
```

---

### List Proposed Updates

```http
GET /updates?playbook_id=nda
```

Output:

```json
{
  "updates": [
    {
      "update_id": "update_001",
      "target_rule_id": "liability",
      "status": "pending"
    }
  ]
}
```

---

### Approve Update

```http
POST /updates/{update_id}/approve
```

Input:

```json
{
  "approved_by": "Lukas"
}
```

Output:

```json
{
  "update_id": "update_001",
  "status": "approved",
  "commit_hash": "def5678",
  "reindexed": true
}
```

---

### Reject Update

```http
POST /updates/{update_id}/reject
```

Input:

```json
{
  "rejected_by": "Lukas",
  "reason": "Not aligned with current risk policy."
}
```

Output:

```json
{
  "update_id": "update_001",
  "status": "rejected"
}
```

---

### Reindex Playbook

```http
POST /reindex
```

Input:

```json
{
  "playbook_id": "nda"
}
```

Output:

```json
{
  "playbook_id": "nda",
  "chunks_indexed": 42,
  "status": "complete"
}
```

---

## 11. Task Router

The frontend should let users choose a task.

Initial task types:

```text
generate_playbook
ask_playbook
suggest_update
approve_update
```

Later task types:

```text
summarize_document
extract_key_terms
compare_against_playbook
find_risks
draft_negotiation_position
```

The backend routes requests using a task router.

```python
def route_task(task_type: str):
    if task_type == "generate_playbook":
        return run_playbook_generation
    if task_type == "ask_playbook":
        return run_rag_question_answering
    if task_type == "suggest_update":
        return run_update_proposal_workflow
    raise ValueError(f"Unsupported task type: {task_type}")
```

---

## 12. RAG Design

### Source of Truth

The vault is the source of truth.

```text
vault/{playbook_id}/rules/*.md
```

Chroma is only an index.

If Chroma is deleted, it can be rebuilt from the vault.

---

### Chunking

For MVP, chunk by Markdown section:

```text
# Topic
## Standard Position
## Fallback Position
## Red Line
## Escalation Logic
## Rationale
## Suggested Language
```

Each chunk should include metadata:

```json
{
  "playbook_id": "nda",
  "rule_id": "liability",
  "topic": "Liability",
  "section": "Red Line",
  "source_file": "vault/nda/rules/liability.md",
  "git_commit": "abc1234",
  "last_changed_by": "Lukas",
  "last_changed_at": "2026-04-25T11:45:00+02:00"
}
```

---

### Retrieval

For each question:

1. Embed question using OpenAI embeddings.
2. Retrieve top-k chunks from Chroma.
3. Filter by selected `playbook_id`.
4. Pass relevant chunks to LLM.
5. Generate grounded answer.
6. Return sources and confidence.

Recommended MVP values:

```text
top_k = 5
minimum_retrieval_score = 0.65
```

---

## 13. Confidence Measurement

Confidence should be heuristic for MVP.

Use:

1. Retrieval score
2. Number of relevant sources
3. Whether source directly answers question
4. LLM self-check against retrieved context

Example output:

```json
{
  "score": 0.91,
  "label": "high",
  "reason": "The retrieved Red Line section directly answers the question."
}
```

Suggested labels:

```text
0.80 - 1.00: high
0.55 - 0.79: medium
0.00 - 0.54: low
```

Important: Confidence is not legal certainty. It only reflects how well the retrieved playbook sources support the answer.

---

## 14. Git History Metadata

Every approved playbook change should create a Git commit.

Commit message format:

```text
[playbook:{playbook_id}] Update {rule_id}: {short_description}
```

Example:

```text
[playbook:nda] Update liability: add public sector fallback
```

For every source returned in an answer, include:

```text
last_changed_by
last_changed_at
last_commit_hash
last_commit_message
```

Implementation approach:

```bash
git log -1 --format="%an|%aI|%H|%s" -- vault/nda/rules/liability.md
```

Backend service:

```python
class GitService:
    def get_last_change_metadata(self, file_path: str) -> GitMetadata:
        ...

    def commit_file(self, file_path: str, message: str, author: str) -> str:
        ...
```

---

## 15. Document Ingestion

Supported formats:

```text
.docx
.xlsx
.pdf
```

### DOCX Parser

Use:

```text
python-docx
```

Extract:

- Paragraphs
- Tables
- Headings
- Clause-like sections

### XLSX Parser

Use:

```text
openpyxl
```

Extract:

- Sheet names
- Rows
- Columns
- Cell values
- Table-like rule structures

### PDF Parser

Use:

```text
pypdf or pymupdf
```

Extract text.

For MVP, PDF parsing can be basic. If extraction is poor, manually seed demo data from processed JSON.

---

## 16. LLM Prompting

### Ask Playbook Prompt

The LLM must only answer from retrieved context.

Required behavior:

- Use plain language.
- State the standard position.
- State fallback if available.
- State red line if available.
- State escalation logic if available.
- Mention uncertainty if the source is insufficient.
- Do not invent legal guidance.
- Include source references.

Prompt template:

```text
You are a legal playbook assistant.

You answer questions based only on the provided playbook context.

Rules:
- Do not invent legal positions.
- If the answer is not in the context, say that the playbook does not contain enough information.
- Explain the answer in plain language.
- Highlight standard position, fallback position, red lines, and escalation logic if present.
- Return a concise answer.

User question:
{question}

Retrieved playbook context:
{context}
```

---

## 17. Lovable Frontend Requirements

Lovable should generate the frontend only.

Backend remains FastAPI.

### Required Pages

1. **Dashboard**
   - Select playbook
   - Select task
   - Show playbook status
   - Show latest Git update

2. **Upload / Ingest**
   - Upload `.docx`, `.xlsx`, `.pdf`
   - Select target playbook
   - Run ingestion
   - Show generated rules

3. **Ask Playbook**
   - Chat interface
   - Selected playbook visible
   - Answer panel
   - Source citations
   - Confidence badge
   - Last-changed metadata

4. **Rule Viewer**
   - List rules
   - Show Markdown-rendered rule
   - Show Git history metadata
   - Show source documents

5. **Pending Updates**
   - List proposed updates
   - Approve button
   - Reject button
   - Show diff-like preview

6. **Optional Voice Add-on**
   - Browser speech-to-text
   - Browser text-to-speech
   - Not part of core MVP

---

## 18. Frontend API Base URL

During local development:

```text
http://localhost:8000
```

Use environment variable:

```text
VITE_API_BASE_URL=http://localhost:8000
```

Frontend fetch example:

```ts
const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/ask`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    playbook_id: selectedPlaybook,
    task_type: "ask_playbook",
    question: userQuestion
  })
});
```

---

## 19. Docker Setup

### Services

```text
backend
frontend
```

Optional:

```text
chroma
```

For MVP, Chroma can run embedded inside the backend using local persistence.

### docker-compose.yml Concept

```yaml
services:
  backend:
    build: ./backend
    ports:
      - "8000:8000"
    volumes:
      - ./vault:/app/vault
      - ./data:/app/data
      - ./chroma:/app/chroma
      - ./.git:/app/.git
    env_file:
      - .env

  frontend:
    build: ./frontend
    ports:
      - "3000:3000"
    environment:
      - VITE_API_BASE_URL=http://localhost:8000
    depends_on:
      - backend
```

---

## 20. Environment Variables

Create `.env.example`:

```env
OPENAI_API_KEY=
GOOGLE_APPLICATION_CREDENTIALS=
GEMINI_MODEL=gemini-1.5-pro
OPENAI_EMBEDDING_MODEL=text-embedding-3-small

VAULT_DIR=./vault
DATA_DIR=./data
CHROMA_DIR=./chroma

DEFAULT_PLAYBOOK_ID=nda
```

---

## 21. Team Work Split

Team size: 3 developers.

### Developer 1 — Backend / RAG / Deployment

Owner: Lukas

Responsibilities:

- FastAPI backend
- Document ingestion
- Vault writing
- Chroma indexing
- OpenAI embeddings
- Gemini service layer
- Git metadata
- Docker Compose
- API integration support

### Developer 2 — Frontend Core

Responsibilities:

- Lovable UI
- Dashboard
- Task selector
- Upload page
- Ask Playbook chat page
- API connection

### Developer 3 — Frontend / Demo UX

Responsibilities:

- Rule viewer
- Pending updates page
- Source citation UI
- Confidence badge
- Demo polish
- Optional voice add-on

---

## 22. Development Order

### Phase 1 — Backend Skeleton

Must work first:

```text
GET /health
POST /ask with mocked answer
GET /playbooks
GET /playbooks/{playbook_id}/rules
```

### Phase 2 — Vault + Seed Data

Create demo vault manually or through script:

```text
vault/nda/rules/liability.md
vault/nda/rules/confidentiality.md
```

Add seed script:

```bash
python scripts/seed_demo_data.py
```

### Phase 3 — RAG

Implement:

```text
Markdown chunking
OpenAI embeddings
Chroma indexing
Question retrieval
Gemini answer generation
Sources
Confidence
```

### Phase 4 — Update Workflow

Implement:

```text
Create proposed update
List proposed updates
Approve update
Git commit
Reindex
```

### Phase 5 — Ingestion

Implement simple ingestion:

```text
xlsx parser
docx parser
pdf parser
structured rule extraction
```

If time is short, semi-manual extraction is acceptable for demo.

### Phase 6 — Frontend Integration

Connect Lovable frontend to backend.

### Phase 7 — Polish

Add:

```text
Voice add-on
Better error states
Demo data reset script
Improved visual styling
```

---

## 23. MVP Definition of Done

The MVP is complete when this demo works:

1. Select `NDA` playbook.
2. Ask: "Can we accept unlimited liability?"
3. System answers from the playbook.
4. System shows:
   - Source file
   - Rule section
   - Confidence
   - Last changed by
   - Last commit
5. User proposes an update.
6. Lawyer approves update.
7. Markdown file changes.
8. Git commit is created.
9. Playbook is reindexed.
10. Asking again reflects the approved update.

---

## 24. Stretch Goals

Only implement after MVP works.

```text
Voice input/output
Obsidian graph visualization
Cloud Run deployment
Multi-user auth
Role-based lawyer/business permissions
Contract comparison
Clause drafting
Risk detection
Advanced PDF table extraction
Automatic diff viewer
```

---

## 25. Key Risks and Mitigations

### Risk: Ingestion takes too long

Mitigation:

Use seed JSON and manually prepared Markdown for the demo.

### Risk: LLM gives unsupported legal answers

Mitigation:

Force answer generation from retrieved context only. If no source supports the answer, say so.

### Risk: Chroma index becomes stale

Mitigation:

Reindex after every approved update.

### Risk: Git operations fail in Docker

Mitigation:

Mount repo `.git` folder and configure Git author in container.

### Risk: Frontend/backend integration breaks

Mitigation:

Define stable API contracts early and provide mocked backend responses first.

### Risk: Scope explosion

Mitigation:

Focus only on the playbook engine:

```text
Generate playbook
Ask playbook
Suggest update
Approve update
```

Do not build full contract review for MVP.

---

## 26. Demo Pitch

Suggested one-liner:

> We turned a static legal playbook into a transparent, source-grounded, self-improving knowledge engine where lawyers stay in control.

Suggested demo story:

1. A legal team has an NDA playbook stuck in Excel/Word.
2. The system converts it into an AI-ready Markdown vault.
3. A business user asks a natural-language question.
4. The assistant answers with source citations and confidence.
5. The user suggests an improvement based on negotiation experience.
6. A lawyer approves the change.
7. The vault updates, Git records the change, and the playbook immediately becomes searchable again.

---

## 27. Important Architectural Principle

The Markdown vault is the source of truth.

The vector database is only a search index.

The LLM is only an assistant.

The lawyer is the final authority.

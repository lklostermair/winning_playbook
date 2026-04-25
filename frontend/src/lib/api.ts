const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

export type GitMetadata = {
  last_changed_by: string;
  last_changed_at: string;
  last_commit_hash: string;
  last_commit_message: string;
};

export type PlaybookSummary = {
  playbook_id: string;
  name: string;
  description?: string | null;
};

export type GitIdentity = {
  name?: string | null;
  email?: string | null;
  github_username?: string | null;
  avatar_url?: string | null;
};

export type RuleSummary = {
  rule_id: string;
  topic: string;
  status: "draft" | "approved" | "pending_update" | "archived";
  git_metadata?: GitMetadata | null;
};

export type RuleTemplate = {
  playbook_id: string;
  rule_id: string;
  topic: string;
  standard_position?: string | null;
  fallback_positions: string[];
  red_line?: string | null;
  decision_logic?: string | null;
  escalation_logic?: string | null;
  rationale?: string | null;
  negotiation_tips: string[];
  suggested_language?: string | null;
  status: "draft" | "approved" | "pending_update" | "archived";
};

export type RuleDetail = {
  playbook_id: string;
  rule: RuleTemplate;
  markdown: string;
  git_metadata: GitMetadata;
};

export type Confidence = {
  score: number;
  label: "low" | "medium" | "high";
  reason: string;
};

export type SourceReference = {
  playbook_id: string;
  rule_id: string;
  file: string;
  section: string;
  snippet: string;
  retrieval_score: number;
  git_metadata: GitMetadata;
};

export type AskResponse = {
  answer: string;
  confidence: Confidence;
  sources: SourceReference[];
};

export type ConversationMessage = {
  role: "user" | "assistant";
  text: string;
};

export type ProposedChange = {
  section: string;
  old_text?: string | null;
  new_text: string;
};

export type RuleUpdateDraft = {
  section: string;
  reason: string;
  new_text: string;
};

export type UpdateDecision = {
  update_id: string;
  status: "pending" | "approved" | "rejected";
  commit_hash?: string | null;
  reindexed: boolean;
};

export type IngestDraftSummary = {
  ingest_id: string;
  playbook_id: string;
  status: "draft" | "published";
  source_filenames: string[];
  rule_count: number;
  created_at: string;
  source_kind: "playbook_source" | "contract_set";
};

export type IngestDraftDetail = IngestDraftSummary & {
  rules: RuleTemplate[];
};

export type PublishIngestResponse = {
  ingest_id: string;
  playbook_id: string;
  rules_published: number;
  reindexed: boolean;
};

export type VoiceTranscriptionResponse = {
  text: string;
};

export async function getHealth() {
  return request<{ status: string }>("/health");
}

export async function getIdentity() {
  return request<GitIdentity>("/identity");
}

export async function getPlaybooks() {
  const response = await request<{ playbooks: PlaybookSummary[] }>("/playbooks");
  return response.playbooks;
}

export async function getRules(playbookId: string) {
  const response = await request<{ playbook_id: string; rules: RuleSummary[] }>(
    `/playbooks/${encodeURIComponent(playbookId)}/rules`,
  );
  return response.rules;
}

export async function getRule(playbookId: string, ruleId: string) {
  return request<RuleDetail>(
    `/playbooks/${encodeURIComponent(playbookId)}/rules/${encodeURIComponent(ruleId)}`,
  );
}

export async function askPlaybook(
  playbookIds: string[],
  question: string,
  conversation: ConversationMessage[] = [],
) {
  const selectedPlaybookIds = playbookIds.length > 0 ? playbookIds : ["nda"];
  return request<AskResponse>("/ask", {
    method: "POST",
    body: JSON.stringify({
      playbook_id: selectedPlaybookIds[0],
      playbook_ids: selectedPlaybookIds,
      task_type: "ask_playbook",
      question,
      conversation,
    }),
  });
}

export async function generateChatTitle(question: string) {
  return request<{ title: string }>("/chat/title", {
    method: "POST",
    body: JSON.stringify({ question }),
  });
}

export async function draftRuleUpdate(payload: {
  playbook_id: string;
  target_rule_id: string;
  instruction: string;
}) {
  return request<RuleUpdateDraft>("/updates/draft", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function applyRuleUpdate(payload: {
  playbook_id: string;
  target_rule_id: string;
  reason: string;
  proposed_change: ProposedChange;
  approved_by: string;
}) {
  return request<UpdateDecision>("/updates/apply", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function uploadIngest(payload: {
  playbookId: string;
  playbookName: string;
  mode: "hybrid" | "llm" | "heuristic";
  sourceKind: "playbook_source" | "contract_set";
  files: File[];
}) {
  const form = new FormData();
  form.append("playbook_id", payload.playbookId);
  form.append("playbook_name", payload.playbookName);
  form.append("mode", payload.mode);
  form.append("source_kind", payload.sourceKind);
  for (const file of payload.files) {
    form.append("files", file);
  }
  return requestForm<IngestDraftDetail>("/ingest", form);
}

export async function getIngests(playbookId: string) {
  const response = await request<{ drafts: IngestDraftSummary[] }>(
    `/ingest?playbook_id=${encodeURIComponent(playbookId)}`,
  );
  return response.drafts;
}

export async function getIngest(playbookId: string, ingestId: string) {
  return request<IngestDraftDetail>(
    `/ingest/${encodeURIComponent(playbookId)}/${encodeURIComponent(ingestId)}`,
  );
}

export async function publishIngest(playbookId: string, ingestId: string) {
  return request<PublishIngestResponse>(
    `/ingest/${encodeURIComponent(playbookId)}/${encodeURIComponent(ingestId)}/publish`,
    { method: "POST" },
  );
}

export async function transcribeVoice(audio: Blob) {
  const form = new FormData();
  form.append("audio", audio, `recording.${audioExtension(audio.type)}`);
  return requestForm<VoiceTranscriptionResponse>("/voice/transcribe", form);
}

export async function speakVoice(text: string) {
  return requestBlob("/voice/speak", {
    method: "POST",
    body: JSON.stringify({ text }),
  });
}

export async function warmupVoiceModel() {
  return request<{ status: string }>("/voice/warmup", { method: "POST" });
}

function audioExtension(contentType: string) {
  if (contentType.includes("wav")) return "wav";
  if (contentType.includes("mpeg") || contentType.includes("mp3")) return "mp3";
  if (contentType.includes("mp4") || contentType.includes("m4a")) return "m4a";
  if (contentType.includes("ogg")) return "ogg";
  return "webm";
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init.headers,
    },
  });

  if (!response.ok) {
    const detail = await readError(response);
    throw new Error(detail || `${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

async function requestForm<T>(path: string, body: FormData): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    body,
  });

  if (!response.ok) {
    const detail = await readError(response);
    throw new Error(detail || `${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

async function requestBlob(path: string, init: RequestInit = {}): Promise<Blob> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init.headers,
    },
  });

  if (!response.ok) {
    const detail = await readError(response);
    throw new Error(detail || `${response.status} ${response.statusText}`);
  }
  return response.blob();
}

async function readError(response: Response) {
  try {
    const payload = await response.json();
    return typeof payload.detail === "string" ? payload.detail : JSON.stringify(payload);
  } catch {
    return response.statusText;
  }
}

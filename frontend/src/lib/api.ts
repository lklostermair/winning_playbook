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

export type ProposedChange = {
  section: string;
  old_text?: string | null;
  new_text: string;
};

export type ProposedUpdate = {
  update_id: string;
  playbook_id: string;
  target_rule_id: string;
  status: "pending" | "approved" | "rejected";
  reason: string;
  proposed_change: ProposedChange;
  suggested_by: string;
  suggested_at: string;
};

export type UpdateDecision = {
  update_id: string;
  status: "pending" | "approved" | "rejected";
  commit_hash?: string | null;
  reindexed: boolean;
};

export async function getHealth() {
  return request<{ status: string }>("/health");
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

export async function askPlaybook(playbookId: string, question: string) {
  return request<AskResponse>("/ask", {
    method: "POST",
    body: JSON.stringify({
      playbook_id: playbookId,
      task_type: "ask_playbook",
      question,
    }),
  });
}

export async function getUpdates(playbookId: string) {
  const response = await request<{ updates: ProposedUpdate[] }>(
    `/updates?playbook_id=${encodeURIComponent(playbookId)}`,
  );
  return response.updates;
}

export async function createUpdate(payload: {
  playbook_id: string;
  target_rule_id: string;
  reason: string;
  proposed_change: ProposedChange;
  suggested_by: string;
}) {
  return request<{ update_id: string; status: ProposedUpdate["status"] }>("/updates", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function approveUpdate(updateId: string, approvedBy: string) {
  return request<UpdateDecision>(`/updates/${encodeURIComponent(updateId)}/approve`, {
    method: "POST",
    body: JSON.stringify({ approved_by: approvedBy }),
  });
}

export async function rejectUpdate(updateId: string, rejectedBy: string, reason: string) {
  return request<UpdateDecision>(`/updates/${encodeURIComponent(updateId)}/reject`, {
    method: "POST",
    body: JSON.stringify({ rejected_by: rejectedBy, reason }),
  });
}

export async function reindexPlaybook(playbookId: string) {
  return request<{ playbook_id: string; chunks_indexed: number; status: string }>("/reindex", {
    method: "POST",
    body: JSON.stringify({ playbook_id: playbookId }),
  });
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

async function readError(response: Response) {
  try {
    const payload = await response.json();
    return typeof payload.detail === "string" ? payload.detail : JSON.stringify(payload);
  } catch {
    return response.statusText;
  }
}

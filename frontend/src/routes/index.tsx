import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Bot, MessageCircle, Moon, Send, ShieldCheck, Sun, UploadCloud } from "lucide-react";
import { toast } from "sonner";

import {
  askPlaybook,
  approveUpdate,
  createUpdate,
  getHealth,
  getIngests,
  getPlaybooks,
  getRule,
  getRules,
  getUpdates,
  reindexPlaybook,
  rejectUpdate,
  publishIngest,
  type IngestDraftSummary,
  type PlaybookSummary,
  type ProposedUpdate,
  type RuleDetail,
  type RuleSummary,
} from "@/lib/api";
import {
  AnswerMessage,
  FeedbackDialog,
  RulePanel,
  StatusRow,
  UploadDialog,
  VaultGraph,
  latestCitedRuleIds,
  latestGitMetadata,
  shortHash,
  shouldUseDarkModeByTime,
  type ChatMessage,
  type Role,
} from "@/components/playbook/workspace-components";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const suggestedQuestions = [
  "Can we accept unlimited liability?",
  "Can we accept a unilateral NDA?",
  "What is our red line on contract penalties?",
];

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Living Playbook" },
      {
        name: "description",
        content: "Source-grounded legal playbook assistant with lawyer approval workflow.",
      },
    ],
  }),
  component: LivingPlaybookApp,
});

function LivingPlaybookApp() {
  const [role, setRole] = useState<Role>("Business User");
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window === "undefined") return shouldUseDarkModeByTime(new Date());
    const savedTheme = window.localStorage.getItem("living-playbook-theme");
    if (savedTheme === "dark") return true;
    if (savedTheme === "light") return false;
    return shouldUseDarkModeByTime(new Date());
  });
  const [apiStatus, setApiStatus] = useState<"checking" | "ok" | "down">("checking");
  const [playbooks, setPlaybooks] = useState<PlaybookSummary[]>([]);
  const [selectedPlaybookId, setSelectedPlaybookId] = useState("nda");
  const [rules, setRules] = useState<RuleSummary[]>([]);
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(null);
  const [selectedRule, setSelectedRule] = useState<RuleDetail | null>(null);
  const [updates, setUpdates] = useState<ProposedUpdate[]>([]);
  const [ingests, setIngests] = useState<IngestDraftSummary[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [updateDraft, setUpdateDraft] = useState({
    section: "Fallback Position",
    newText: "",
    reason: "",
  });

  const refreshAll = useCallback(
    async (playbookId = selectedPlaybookId) => {
      try {
        setApiStatus("checking");
        await getHealth();
        setApiStatus("ok");
        const [playbookList, ruleList, updateList, ingestList] = await Promise.all([
          getPlaybooks(),
          getRules(playbookId),
          getUpdates(playbookId),
          getIngests(playbookId),
        ]);
        setPlaybooks(playbookList);
        setRules(ruleList);
        setUpdates(updateList);
        setIngests(ingestList);
      } catch (error) {
        setApiStatus("down");
        toast.error(error instanceof Error ? error.message : "Backend is not reachable.");
      }
    },
    [selectedPlaybookId],
  );

  useEffect(() => {
    void refreshAll(selectedPlaybookId);
  }, [refreshAll, selectedPlaybookId]);

  useEffect(() => {
    window.localStorage.setItem("living-playbook-theme", isDarkMode ? "dark" : "light");
  }, [isDarkMode]);

  useEffect(() => {
    if (!selectedRuleId) {
      setSelectedRule(null);
      return;
    }
    let active = true;
    setSelectedRule(null);
    getRule(selectedPlaybookId, selectedRuleId)
      .then((rule) => {
        if (active) setSelectedRule(rule);
      })
      .catch((error) => {
        if (active) toast.error(error.message);
      });

    return () => {
      active = false;
    };
  }, [selectedPlaybookId, selectedRuleId]);

  const selectedPlaybook = playbooks.find(
    (playbook) => playbook.playbook_id === selectedPlaybookId,
  );
  const latestGit = useMemo(() => latestGitMetadata(rules), [rules]);
  const pendingUpdates = updates.filter((update) => update.status === "pending");
  const citedRuleIds = useMemo(() => latestCitedRuleIds(messages), [messages]);

  async function submitQuestion(question = input) {
    const trimmed = question.trim();
    if (!trimmed || loading) return;

    const userMessage: ChatMessage = { id: Date.now(), role: "user", text: trimmed };
    setMessages((current) => [...current, userMessage]);
    setInput("");
    setLoading(true);
    try {
      const answer = await askPlaybook(selectedPlaybookId, trimmed);
      setMessages((current) => [
        ...current,
        { id: Date.now() + 1, role: "ai", text: answer.answer, answer },
      ]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ask failed.");
    } finally {
      setLoading(false);
    }
  }

  async function submitProposedUpdate() {
    const newText = updateDraft.newText.trim();
    const reason = updateDraft.reason.trim();
    if (!selectedRule || !newText || !reason) {
      toast.error("Choose a rule and provide proposed text plus a reason.");
      return false;
    }
    try {
      await createUpdate({
        playbook_id: selectedPlaybookId,
        target_rule_id: selectedRule.rule.rule_id,
        reason,
        proposed_change: {
          section: updateDraft.section,
          new_text: newText,
        },
        suggested_by: role,
      });
      setUpdateDraft({ section: "Fallback Position", newText: "", reason: "" });
      await refreshAll();
      toast.success("Proposed update created.");
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create update.");
      return false;
    }
  }

  async function approve(update: ProposedUpdate) {
    try {
      const result = await approveUpdate(update.update_id, role);
      await refreshAll(update.playbook_id);
      if (selectedRuleId) {
        setSelectedRule(await getRule(update.playbook_id, selectedRuleId));
      }
      toast.success(`Approved and committed ${shortHash(result.commit_hash)}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Approval failed.");
    }
  }

  async function reject(update: ProposedUpdate) {
    try {
      await rejectUpdate(update.update_id, role, "Rejected from frontend review.");
      await refreshAll(update.playbook_id);
      toast.success("Update rejected.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Rejection failed.");
    }
  }

  async function reindex() {
    try {
      const result = await reindexPlaybook(selectedPlaybookId);
      toast.success(`Reindexed ${result.chunks_indexed} chunks.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Reindex failed.");
    }
  }

  async function publishDraft(ingest: IngestDraftSummary) {
    try {
      const result = await publishIngest(ingest.playbook_id, ingest.ingest_id);
      await refreshAll(ingest.playbook_id);
      toast.success(`Published ${result.rules_published} rules and reindexed.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Publish failed.");
    }
  }

  return (
    <main className={`${isDarkMode ? "dark" : ""} min-h-screen bg-background text-foreground`}>
      <div className="flex h-screen overflow-hidden">
        <aside className="hidden w-[284px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar px-5 py-5 text-[13px] text-sidebar-foreground md:flex">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary text-primary-foreground">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <div className="text-[20px] font-medium tracking-tight text-sidebar-primary">
                Living Playbook
              </div>
              <div className="text-xs text-sidebar-label">NDA workspace</div>
            </div>
          </div>

          <div className="mt-7 space-y-3">
            <Select value={role} onValueChange={(value) => setRole(value as Role)}>
              <SelectTrigger className="h-10 rounded-lg border-sidebar-border bg-sidebar-panel text-sidebar-primary">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Business User">Business User</SelectItem>
                <SelectItem value="Lawyer">Lawyer</SelectItem>
                <SelectItem value="Admin">Admin</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={selectedPlaybookId}
              onValueChange={(playbookId) => {
                setSelectedPlaybookId(playbookId);
                setSelectedRuleId(null);
              }}
            >
              <SelectTrigger className="h-10 rounded-lg border-sidebar-border bg-sidebar-panel text-sidebar-primary">
                <SelectValue placeholder="Select playbook" />
              </SelectTrigger>
              <SelectContent>
                {playbooks.map((playbook) => (
                  <SelectItem key={playbook.playbook_id} value={playbook.playbook_id}>
                    {playbook.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="mt-7 border-t border-sidebar-border pt-5">
            <div className="mb-3 text-[11px] uppercase tracking-[0.08em] text-sidebar-label">
              Status
            </div>
            <div className="space-y-2 rounded-lg border border-sidebar-border bg-sidebar-panel p-3">
              <StatusRow
                label="API"
                value={apiStatus === "ok" ? "Connected" : apiStatus}
                good={apiStatus === "ok"}
              />
              <StatusRow label="Rules" value={`${rules.length}`} good={rules.length > 0} />
              <StatusRow
                label="Pending"
                value={`${pendingUpdates.length}`}
                good={pendingUpdates.length === 0}
              />
            </div>
          </div>

          <div className="mt-7 min-h-0 flex-1">
            <div className="mb-3 flex items-center justify-between text-[11px] uppercase tracking-[0.08em] text-sidebar-label">
              <span>Referenced Topics</span>
              <MessageCircle className="h-4 w-4" />
            </div>
            <div className="rounded-lg border border-sidebar-border bg-sidebar-panel p-3 text-sm leading-6 text-sidebar-foreground">
              Ask a question and the assistant will pull the relevant playbook topic into the
              answer.
              {selectedRule && (
                <div className="mt-3 rounded-md bg-active-item px-3 py-2 text-sidebar-primary">
                  <div className="text-xs text-sidebar-label">Current source</div>
                  <div className="truncate">{selectedRule.rule.topic}</div>
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              onClick={() => void refreshAll()}
              className="rounded-lg border border-input px-3 py-2 text-sidebar-primary hover:bg-sidebar-panel"
            >
              Refresh
            </button>
            <button
              onClick={() => void reindex()}
              className="rounded-lg bg-primary px-3 py-2 text-primary-foreground hover:bg-primary/90"
            >
              Reindex
            </button>
          </div>
        </aside>

        <section className="relative flex min-w-0 flex-1 flex-col bg-background">
          <header className="flex h-16 shrink-0 items-center justify-between border-b px-6">
            <div>
              <div className="text-lg font-medium">{selectedPlaybook?.name ?? "NDA Playbook"}</div>
              <div className="text-xs text-muted-foreground">
                Latest change:{" "}
                {latestGit
                  ? `${shortHash(latestGit.last_commit_hash)} · ${latestGit.last_commit_message}`
                  : "No committed rule history"}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setUploadOpen(true)}
                className="inline-flex items-center gap-2 rounded-lg border border-input px-3 py-2 text-sm hover:bg-muted"
              >
                <UploadCloud className="h-4 w-4" />
                Upload
              </button>
              <button
                onClick={() => setIsDarkMode((current) => !current)}
                aria-label={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
                className="grid h-9 w-9 place-items-center rounded-full border border-input hover:bg-muted"
              >
                {isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-48 pt-5 text-[14px] leading-[1.6] text-body-text">
            <VaultGraph
              playbooks={playbooks}
              selectedPlaybookId={selectedPlaybookId}
              rules={rules}
              selectedRuleId={selectedRuleId}
              citedRuleIds={citedRuleIds}
              onSelectPlaybook={(playbookId) => {
                setSelectedPlaybookId(playbookId);
                setSelectedRuleId(null);
              }}
              onSelectRule={setSelectedRuleId}
            />

            {messages.length === 0 ? (
              <div className="mx-auto mt-8 max-w-4xl text-center">
                <h1 className="text-[22px] font-medium leading-[1.45] text-foreground">
                  Ask the playbook, then verify the answer from its sources.
                </h1>
                <div className="mt-7 flex flex-wrap justify-center gap-3">
                  {suggestedQuestions.map((question) => (
                    <button
                      key={question}
                      onClick={() => void submitQuestion(question)}
                      className="rounded-lg border border-input bg-suggested-chip px-4 py-2.5 text-[14px] text-body-text transition hover:border-sidebar-label hover:text-foreground"
                    >
                      {question}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mx-auto mt-8 max-w-5xl space-y-8 pb-6">
                {messages.map((message) =>
                  message.role === "user" ? (
                    <div key={message.id} className="flex justify-end">
                      <div className="max-w-[70%] whitespace-pre-wrap rounded-lg bg-chat-bubble px-4 py-3 text-body-text">
                        {message.text}
                      </div>
                    </div>
                  ) : (
                    <AnswerMessage
                      key={message.id}
                      message={message}
                      onSelectRule={setSelectedRuleId}
                      onFeedback={() => setFeedbackOpen(true)}
                    />
                  ),
                )}
                {loading && (
                  <div className="mx-auto flex max-w-3xl items-center gap-2 text-sm text-muted-foreground">
                    <Bot className="h-4 w-4" />
                    Reading playbook sources...
                  </div>
                )}
              </div>
            )}
          </div>

          <footer className="pointer-events-none absolute bottom-0 left-0 right-0 px-6 pb-6 pt-4">
            <div className="pointer-events-auto mx-auto max-w-[860px]">
              <div className="rounded-lg border border-input bg-background px-4 py-3 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
                <div className="flex items-end gap-3">
                  <textarea
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        void submitQuestion();
                      }
                    }}
                    placeholder="Ask the playbook..."
                    rows={1}
                    className="max-h-32 min-h-12 flex-1 resize-none bg-transparent py-3 text-[14px] leading-[1.6] text-body-text outline-none placeholder:text-muted-foreground"
                  />
                  <button
                    onClick={() => void submitQuestion()}
                    disabled={loading}
                    aria-label="Send message"
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50"
                  >
                    <Send className="h-5 w-5" />
                  </button>
                </div>
                <div className="mt-2 flex items-center gap-4 text-[12px] text-sidebar-label">
                  <button
                    onClick={() => setFeedbackOpen(true)}
                    className="inline-flex items-center gap-2 hover:text-muted-foreground"
                  >
                    <MessageCircle className="h-4 w-4" /> Suggest Update
                  </button>
                  <span className="h-5 w-px bg-border" />
                  <span>Shift+Enter for a line break</span>
                </div>
              </div>
              <p className="mt-2 text-center text-xs text-muted-foreground">
                Answers are source-grounded playbook guidance, not legal certainty.
              </p>
            </div>
          </footer>
        </section>

        <RulePanel
          role={role}
          ruleDetail={selectedRule}
          updates={updates.filter((update) => update.target_rule_id === selectedRule?.rule.rule_id)}
          updateDraft={updateDraft}
          onUpdateDraftChange={setUpdateDraft}
          onSubmitUpdate={() => void submitProposedUpdate()}
          onApprove={(update) => void approve(update)}
          onReject={(update) => void reject(update)}
          onClose={() => setSelectedRuleId(null)}
        />
      </div>

      <FeedbackDialog
        open={feedbackOpen}
        onOpenChange={setFeedbackOpen}
        selectedRule={selectedRule}
        updateDraft={updateDraft}
        onUpdateDraftChange={setUpdateDraft}
        onSubmit={submitProposedUpdate}
      />
      <UploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        playbookId={selectedPlaybookId}
        playbookName={selectedPlaybook?.name ?? "NDA Playbook"}
        drafts={ingests}
        onUploaded={(draft) => {
          setSelectedPlaybookId(draft.playbook_id);
          setSelectedRuleId(null);
          void refreshAll(draft.playbook_id);
        }}
        onPublish={(draft) => void publishDraft(draft)}
      />
    </main>
  );
}

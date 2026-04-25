import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bot,
  CheckCircle2,
  ChevronDown,
  FileText,
  Folder,
  GitCommit,
  MessageCircle,
  Moon,
  RefreshCw,
  Send,
  ShieldCheck,
  Sun,
  UploadCloud,
  X,
} from "lucide-react";
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
  uploadIngest,
  type AskResponse,
  type IngestDraftSummary,
  type PlaybookSummary,
  type ProposedUpdate,
  type RuleDetail,
  type RuleSummary,
  type SourceReference,
} from "@/lib/api";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Role = "Business User" | "Lawyer" | "Admin";

type ChatMessage = {
  id: number;
  role: "user" | "ai";
  text: string;
  answer?: AskResponse;
};

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
  const [isDarkMode, setIsDarkMode] = useState(false);
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
    if (!selectedRuleId) {
      setSelectedRule(null);
      return;
    }
    getRule(selectedPlaybookId, selectedRuleId)
      .then(setSelectedRule)
      .catch((error) => toast.error(error.message));
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
    if (!selectedRule || !updateDraft.newText.trim() || !updateDraft.reason.trim()) {
      toast.error("Choose a rule and provide proposed text plus a reason.");
      return;
    }
    try {
      await createUpdate({
        playbook_id: selectedPlaybookId,
        target_rule_id: selectedRule.rule.rule_id,
        reason: updateDraft.reason,
        proposed_change: {
          section: updateDraft.section,
          new_text: updateDraft.newText,
        },
        suggested_by: role,
      });
      setUpdateDraft({ section: "Fallback Position", newText: "", reason: "" });
      await refreshAll();
      toast.success("Proposed update created.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create update.");
    }
  }

  async function approve(update: ProposedUpdate) {
    try {
      const result = await approveUpdate(update.update_id, role);
      await refreshAll(update.playbook_id);
      if (selectedRuleId) {
        setSelectedRule(await getRule(selectedPlaybookId, selectedRuleId));
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
        onSubmit={() => {
          setFeedbackOpen(false);
          void submitProposedUpdate();
        }}
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

function StatusRow({ label, value, good }: { label: string; value: string; good: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sidebar-label">{label}</span>
      <span
        className={`inline-flex items-center gap-1.5 ${good ? "text-position-green" : "text-position-yellow"}`}
      >
        <CheckCircle2 className="h-3.5 w-3.5" />
        {value}
      </span>
    </div>
  );
}

function VaultGraph({
  playbooks,
  selectedPlaybookId,
  rules,
  selectedRuleId,
  citedRuleIds,
  onSelectPlaybook,
  onSelectRule,
}: {
  playbooks: PlaybookSummary[];
  selectedPlaybookId: string;
  rules: RuleSummary[];
  selectedRuleId: string | null;
  citedRuleIds: Set<string>;
  onSelectPlaybook: (playbookId: string) => void;
  onSelectRule: (ruleId: string) => void;
}) {
  const [hoveredGraphNode, setHoveredGraphNode] = useState<{
    label: string;
    x: number;
    y: number;
  } | null>(null);
  const [graphReady, setGraphReady] = useState(false);
  const [graphSettled, setGraphSettled] = useState(false);
  const vault = { x: 380, y: 125 };
  const playbookRadius = 120;
  const playbookNodes = playbooks.map((playbook, index) => ({
    playbook,
    x: vault.x + Math.cos((Math.PI * 2 * index) / Math.max(playbooks.length, 1)) * playbookRadius,
    y: vault.y + Math.sin((Math.PI * 2 * index) / Math.max(playbooks.length, 1)) * 62,
  }));
  const selectedPlaybookNode = playbookNodes.find(
    (node) => node.playbook.playbook_id === selectedPlaybookId,
  ) ??
    playbookNodes[0] ?? {
      playbook: { playbook_id: selectedPlaybookId, name: selectedPlaybookId },
      x: vault.x + playbookRadius,
      y: vault.y,
    };
  const highlightedRuleIds = new Set(citedRuleIds);
  if (selectedRuleId) highlightedRuleIds.add(selectedRuleId);
  const visibleRules = [
    ...rules.filter((rule) => highlightedRuleIds.has(rule.rule_id)),
    ...rules.filter((rule) => !highlightedRuleIds.has(rule.rule_id)),
  ].slice(0, 8);
  const topicCenter = {
    x: selectedPlaybookNode.x + (selectedPlaybookNode.x >= vault.x ? 112 : -112),
    y: selectedPlaybookNode.y,
  };
  const topicNodes = visibleRules.map((rule, index) => {
    const angle = (Math.PI * 2 * index) / Math.max(visibleRules.length, 1) - Math.PI / 2;
    return {
      rule,
      x: topicCenter.x + Math.cos(angle) * 96,
      y: topicCenter.y + Math.sin(angle) * 58,
    };
  });
  const hasCitedTopic = topicNodes.some((node) => citedRuleIds.has(node.rule.rule_id));
  const hasHighlightedTopic = topicNodes.some((node) => highlightedRuleIds.has(node.rule.rule_id));
  const graphSignature = `${selectedPlaybookId}:${playbookNodes.map((node) => node.playbook.playbook_id).join(",")}:${visibleRules.map((rule) => rule.rule_id).join(",")}`;

  useEffect(() => {
    setGraphReady(false);
    setGraphSettled(false);
    let nextFrame = 0;
    const frame = requestAnimationFrame(() => {
      nextFrame = requestAnimationFrame(() => setGraphReady(true));
    });
    const settledTimer = window.setTimeout(() => setGraphSettled(true), 1200);

    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(nextFrame);
      window.clearTimeout(settledTimer);
    };
  }, [graphSignature]);

  return (
    <section className="mx-auto h-[30vh] min-h-[220px] w-full max-w-5xl border-b border-border pb-4">
      <div className="relative h-full overflow-hidden rounded-lg bg-panel-card">
        <svg
          viewBox="0 0 760 250"
          role="img"
          aria-label="Playbook vault graph"
          className="h-full w-full"
        >
          {playbookNodes.map((node, index) => {
            const selectedBranch =
              selectedPlaybookId === node.playbook.playbook_id && hasHighlightedTopic;
            const lineLength = Math.hypot(node.x - vault.x, node.y - vault.y);

            return (
              <line
                key={`playbook-link-${node.playbook.playbook_id}`}
                x1={vault.x}
                y1={vault.y}
                x2={node.x}
                y2={node.y}
                className={`${selectedBranch ? "stroke-graph-selected" : "stroke-graph-link"} transition-[opacity,stroke-dashoffset,stroke-width] duration-700 ease-out`}
                opacity={graphReady ? (selectedBranch ? 1 : 0.62) : 0}
                strokeWidth={
                  selectedBranch ? 5 : selectedPlaybookId === node.playbook.playbook_id ? 1.8 : 1.1
                }
                strokeLinecap="round"
                strokeDasharray={lineLength}
                strokeDashoffset={graphReady ? 0 : lineLength}
                style={{ transitionDelay: graphSettled ? "0ms" : `${120 + index * 70}ms` }}
              />
            );
          })}
          {topicNodes.map((node, index) => {
            const highlighted = highlightedRuleIds.has(node.rule.rule_id);
            const lineLength = Math.hypot(
              node.x - selectedPlaybookNode.x,
              node.y - selectedPlaybookNode.y,
            );

            return (
              <line
                key={`topic-link-${node.rule.rule_id}`}
                x1={selectedPlaybookNode.x}
                y1={selectedPlaybookNode.y}
                x2={node.x}
                y2={node.y}
                className={`${highlighted ? "stroke-graph-selected" : "stroke-graph-link"} transition-[opacity,stroke-dashoffset,stroke-width] duration-700 ease-out`}
                opacity={graphReady ? (highlighted ? 1 : 0.62) : 0}
                strokeWidth={highlighted ? 5 : selectedRuleId === node.rule.rule_id ? 1.8 : 1.1}
                strokeLinecap="round"
                strokeDasharray={lineLength}
                strokeDashoffset={graphReady ? 0 : lineLength}
                style={{ transitionDelay: graphSettled ? "0ms" : `${260 + index * 55}ms` }}
              />
            );
          })}
          <g
            className={`transition-all duration-500 ease-out [transform-box:fill-box] [transform-origin:center] ${
              graphReady ? "scale-100 opacity-100" : "scale-50 opacity-0"
            }`}
          >
            <title>Vault</title>
            <circle
              cx={vault.x}
              cy={vault.y}
              r={hasHighlightedTopic ? 25 : 20}
              className="fill-graph-selected/10"
            />
            <circle cx={vault.x} cy={vault.y} r={15} className="fill-graph-root" />
          </g>
          {playbookNodes.map((node, index) => {
            const selected = selectedPlaybookId === node.playbook.playbook_id;
            return (
              <g
                key={node.playbook.playbook_id}
                role="button"
                tabIndex={0}
                onClick={() => onSelectPlaybook(node.playbook.playbook_id)}
                onMouseEnter={() =>
                  setHoveredGraphNode({ label: node.playbook.name, x: node.x, y: node.y })
                }
                onMouseLeave={() => setHoveredGraphNode(null)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    onSelectPlaybook(node.playbook.playbook_id);
                  }
                }}
                className={`cursor-pointer outline-none transition-all duration-500 ease-out [transform-box:fill-box] [transform-origin:center] hover:scale-125 ${
                  graphReady ? "scale-100 opacity-100" : "scale-50 opacity-0"
                }`}
                style={{ transitionDelay: graphSettled ? "0ms" : `${180 + index * 70}ms` }}
              >
                <title>{node.playbook.name}</title>
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={selected ? 24 : 20}
                  className="fill-graph-selected/0 transition-colors duration-200 hover:fill-graph-selected/10"
                />
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={selected ? 18 : 14}
                  className={selected ? "fill-graph-selected/10" : "fill-transparent"}
                />
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={selected ? 10 : 8}
                  className={selected ? "fill-graph-selected" : "fill-graph-folder"}
                />
              </g>
            );
          })}
          {topicNodes.map((node, index) => {
            const selected = selectedRuleId === node.rule.rule_id;
            const cited = citedRuleIds.has(node.rule.rule_id);
            return (
              <g
                key={node.rule.rule_id}
                role="button"
                tabIndex={0}
                onClick={() => onSelectRule(node.rule.rule_id)}
                onMouseEnter={() =>
                  setHoveredGraphNode({ label: node.rule.topic, x: node.x, y: node.y })
                }
                onMouseLeave={() => setHoveredGraphNode(null)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") onSelectRule(node.rule.rule_id);
                }}
                className={`cursor-pointer outline-none transition-all duration-500 ease-out [transform-box:fill-box] [transform-origin:center] hover:scale-125 ${
                  graphReady ? "scale-100 opacity-100" : "scale-50 opacity-0"
                }`}
                style={{ transitionDelay: graphSettled ? "0ms" : `${360 + index * 55}ms` }}
              >
                <title>{node.rule.topic}</title>
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={cited ? 22 : selected ? 20 : 16}
                  className="fill-graph-selected/0 transition-colors duration-200 hover:fill-graph-selected/10"
                />
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={cited ? 18 : selected ? 16 : 12}
                  className={cited || selected ? "fill-graph-selected/10" : "fill-transparent"}
                />
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={cited ? 9 : selected ? 8 : 6}
                  className={cited || selected ? "fill-graph-selected" : "fill-graph-file"}
                />
              </g>
            );
          })}
        </svg>
        <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full border border-input bg-background/80 px-3 py-1.5 text-[12px] text-muted-foreground backdrop-blur">
          <Folder className="h-3.5 w-3.5" />
          <span>
            {playbooks.length || 1} playbook{playbooks.length === 1 ? "" : "s"} · {rules.length}{" "}
            topics
          </span>
        </div>
        {hasCitedTopic && (
          <div className="absolute right-4 top-4 rounded-full border border-graph-selected/30 bg-background/80 px-3 py-1.5 text-[12px] text-graph-selected backdrop-blur">
            Cited branch
          </div>
        )}
        {hoveredGraphNode && (
          <div
            className="pointer-events-none absolute z-10 max-w-52 -translate-x-1/2 -translate-y-full rounded-md border border-input bg-background px-2.5 py-1.5 text-xs text-foreground shadow-sm"
            style={{
              left: `${(hoveredGraphNode.x / 760) * 100}%`,
              top: `${(hoveredGraphNode.y / 250) * 100}%`,
            }}
          >
            {hoveredGraphNode.label}
          </div>
        )}
      </div>
    </section>
  );
}

function AnswerMessage({
  message,
  onSelectRule,
  onFeedback,
}: {
  message: ChatMessage;
  onSelectRule: (ruleId: string) => void;
  onFeedback: () => void;
}) {
  const answer = message.answer;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="whitespace-pre-wrap text-[14px] leading-7 text-body-text">{message.text}</div>
      {answer && (
        <>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span
              className={`rounded-full px-2.5 py-1 ${confidenceClass(answer.confidence.label)}`}
            >
              {answer.confidence.label} · {Math.round(answer.confidence.score * 100)}%
            </span>
            <span className="text-muted-foreground">{answer.confidence.reason}</span>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {answer.sources.map((source) => (
              <button
                key={`${source.file}-${source.section}`}
                onClick={() => {
                  const ruleId = ruleIdFromPath(source.file);
                  if (ruleId) onSelectRule(ruleId);
                }}
                className="rounded-lg border bg-panel-card p-3 text-left hover:bg-muted"
              >
                <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                  <span>{source.section}</span>
                  <span>{Math.round(source.retrieval_score * 100)}%</span>
                </div>
                <p className="mt-2 line-clamp-3 text-sm text-body-text">{source.snippet}</p>
                <GitLine source={source} />
              </button>
            ))}
          </div>
        </>
      )}
      <button
        onClick={onFeedback}
        className="inline-flex items-center gap-2 rounded-md px-2 py-1 text-[13px] text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <MessageCircle className="h-4 w-4" /> Suggest update
      </button>
    </div>
  );
}

function RulePanel({
  role,
  ruleDetail,
  updates,
  updateDraft,
  onUpdateDraftChange,
  onSubmitUpdate,
  onApprove,
  onReject,
  onClose,
}: {
  role: Role;
  ruleDetail: RuleDetail | null;
  updates: ProposedUpdate[];
  updateDraft: { section: string; newText: string; reason: string };
  onUpdateDraftChange: (draft: { section: string; newText: string; reason: string }) => void;
  onSubmitUpdate: () => void;
  onApprove: (update: ProposedUpdate) => void;
  onReject: (update: ProposedUpdate) => void;
  onClose: () => void;
}) {
  if (!ruleDetail) return null;
  const rule = ruleDetail.rule;
  const lawyerView = role !== "Business User";

  return (
    <aside className="hidden w-[390px] shrink-0 overflow-y-auto border-l bg-background p-4 text-[14px] leading-[1.6] text-body-text xl:block">
      <div className="flex items-start justify-between gap-4 border-b pb-4">
        <div>
          <h2 className="text-base font-medium leading-6 text-foreground">{rule.topic}</h2>
          <span className="mt-2 inline-flex rounded-full bg-suggested-chip px-2.5 py-1 text-xs text-body-text">
            {lawyerView ? "Lawyer audit view" : "Plain language view"}
          </span>
        </div>
        <button
          onClick={onClose}
          aria-label="Close rule panel"
          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-4 space-y-3">
        <InfoCard title="Standard Position">{rule.standard_position || "Not specified."}</InfoCard>
        <InfoCard title="Fallback Position">{formatList(rule.fallback_positions)}</InfoCard>
        <InfoCard title="Red Line">{rule.red_line || "Not specified."}</InfoCard>
        <InfoCard title="Escalation Logic">{rule.escalation_logic || "Not specified."}</InfoCard>

        {lawyerView && (
          <>
            <InfoCard title="Git Metadata">
              <span className="block">
                Commit: {shortHash(ruleDetail.git_metadata.last_commit_hash)}
              </span>
              <span className="block">By: {ruleDetail.git_metadata.last_changed_by}</span>
              <span className="block">Message: {ruleDetail.git_metadata.last_commit_message}</span>
            </InfoCard>
            <section className="rounded-lg border bg-panel-card p-4">
              <h3 className="text-sm font-medium text-foreground">Propose Update</h3>
              <div className="mt-3 space-y-2">
                <Select
                  value={updateDraft.section}
                  onValueChange={(section) => onUpdateDraftChange({ ...updateDraft, section })}
                >
                  <SelectTrigger className="h-9 rounded-lg">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Standard Position">Standard Position</SelectItem>
                    <SelectItem value="Fallback Position">Fallback Position</SelectItem>
                    <SelectItem value="Red Line">Red Line</SelectItem>
                    <SelectItem value="Escalation Logic">Escalation Logic</SelectItem>
                    <SelectItem value="Suggested Language">Suggested Language</SelectItem>
                  </SelectContent>
                </Select>
                <textarea
                  value={updateDraft.newText}
                  onChange={(event) =>
                    onUpdateDraftChange({ ...updateDraft, newText: event.target.value })
                  }
                  placeholder="New section text..."
                  className="min-h-24 w-full resize-none rounded-lg border bg-background p-3 text-sm outline-none focus:border-sidebar-label"
                />
                <input
                  value={updateDraft.reason}
                  onChange={(event) =>
                    onUpdateDraftChange({ ...updateDraft, reason: event.target.value })
                  }
                  placeholder="Reason for legal review"
                  className="h-10 w-full rounded-lg border bg-background px-3 text-sm outline-none focus:border-sidebar-label"
                />
                <button
                  onClick={onSubmitUpdate}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  Create Proposal
                </button>
              </div>
            </section>
            <section className="rounded-lg border bg-panel-card p-4">
              <h3 className="text-sm font-medium text-foreground">Updates</h3>
              <div className="mt-3 space-y-3">
                {updates.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No proposed updates for this rule.
                  </p>
                )}
                {updates.map((update) => (
                  <div key={update.update_id} className="rounded-lg border bg-background p-3">
                    <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                      <span>{update.status}</span>
                      <span>{update.proposed_change.section}</span>
                    </div>
                    <p className="mt-2 text-sm text-body-text">{update.reason}</p>
                    <DiffBlock
                      oldText={update.proposed_change.old_text || ""}
                      newText={update.proposed_change.new_text}
                    />
                    {update.status === "pending" && (
                      <div className="mt-3 flex gap-2">
                        <button
                          onClick={() => onApprove(update)}
                          className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => onReject(update)}
                          className="rounded-md border px-3 py-1.5 text-xs"
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </aside>
  );
}

function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border bg-panel-card p-4">
      <h3 className="text-sm font-medium text-foreground">{title}</h3>
      <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
        {children}
      </div>
    </section>
  );
}

function FeedbackDialog({
  open,
  onOpenChange,
  selectedRule,
  updateDraft,
  onUpdateDraftChange,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedRule: RuleDetail | null;
  updateDraft: { section: string; newText: string; reason: string };
  onUpdateDraftChange: (draft: { section: string; newText: string; reason: string }) => void;
  onSubmit: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-lg border bg-background shadow-sm sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Suggest Update</DialogTitle>
          <DialogDescription>
            {selectedRule
              ? `Create a lawyer-reviewed proposal for ${selectedRule.rule.topic}.`
              : "Select a rule first."}
          </DialogDescription>
        </DialogHeader>
        <textarea
          value={updateDraft.newText}
          onChange={(event) => onUpdateDraftChange({ ...updateDraft, newText: event.target.value })}
          placeholder="Proposed playbook text..."
          className="min-h-28 w-full resize-none rounded-lg border bg-background p-3 text-sm outline-none focus:border-sidebar-label"
        />
        <input
          value={updateDraft.reason}
          onChange={(event) => onUpdateDraftChange({ ...updateDraft, reason: event.target.value })}
          placeholder="Why should legal review this?"
          className="h-10 w-full rounded-lg border bg-background px-3 text-sm outline-none focus:border-sidebar-label"
        />
        <label className="flex items-center gap-2 text-sm text-foreground">
          <Checkbox />
          Flag as outdated
        </label>
        <DialogFooter>
          <button
            onClick={onSubmit}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Submit
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UploadDialog({
  open,
  onOpenChange,
  playbookId,
  playbookName,
  drafts,
  onUploaded,
  onPublish,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  playbookId: string;
  playbookName: string;
  drafts: IngestDraftSummary[];
  onUploaded: (draft: IngestDraftSummary) => void;
  onPublish: (draft: IngestDraftSummary) => void;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [mode, setMode] = useState<"hybrid" | "llm" | "heuristic">("hybrid");
  const [targetPlaybookId, setTargetPlaybookId] = useState(playbookId);
  const [targetPlaybookName, setTargetPlaybookName] = useState(playbookName);
  const [uploading, setUploading] = useState(false);

  async function upload() {
    if (!targetPlaybookId.trim() || !targetPlaybookName.trim()) {
      toast.error("Provide a playbook id and name.");
      return;
    }
    if (files.length === 0) {
      toast.error("Select at least one playbook file.");
      return;
    }
    setUploading(true);
    try {
      const draft = await uploadIngest({
        playbookId: targetPlaybookId.trim(),
        playbookName: targetPlaybookName.trim(),
        mode,
        files,
      });
      setFiles([]);
      onUploaded(draft);
      toast.success(`Created draft with ${draft.rule_count} rules.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-lg border bg-background shadow-sm sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Upload Playbook</DialogTitle>
          <DialogDescription>
            Extract DOCX, PDF, XLSX, or CSV sources into a reviewable draft before publishing.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-lg border border-dashed bg-panel-card p-6 text-center">
          <UploadCloud className="h-10 w-10 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium text-foreground">DOCX, PDF, XLSX, or CSV</p>
          <div className="mt-4 grid gap-3 text-left sm:grid-cols-2">
            <label className="text-xs text-muted-foreground">
              Playbook ID
              <input
                value={targetPlaybookId}
                onChange={(event) => setTargetPlaybookId(slugInput(event.target.value))}
                className="mt-1 h-9 w-full rounded-lg border bg-background px-3 text-sm text-foreground outline-none focus:border-sidebar-label"
                placeholder="nda"
              />
            </label>
            <label className="text-xs text-muted-foreground">
              Playbook Name
              <input
                value={targetPlaybookName}
                onChange={(event) => setTargetPlaybookName(event.target.value)}
                className="mt-1 h-9 w-full rounded-lg border bg-background px-3 text-sm text-foreground outline-none focus:border-sidebar-label"
                placeholder="NDA Playbook"
              />
            </label>
          </div>
          <input
            type="file"
            multiple
            accept=".docx,.pdf,.xlsx,.csv"
            onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
            className="mt-4 w-full rounded-lg border bg-background px-3 py-2 text-sm"
          />
          <div className="mt-3 flex items-center justify-center gap-3">
            <Select value={mode} onValueChange={(value) => setMode(value as typeof mode)}>
              <SelectTrigger className="h-9 w-36 rounded-lg bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="hybrid">Hybrid</SelectItem>
                <SelectItem value="llm">LLM</SelectItem>
                <SelectItem value="heuristic">Heuristic</SelectItem>
              </SelectContent>
            </Select>
            <button
              onClick={() => void upload()}
              disabled={uploading}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {uploading ? "Extracting..." : "Create Draft"}
            </button>
          </div>
        </div>
        <section className="rounded-lg border bg-panel-card p-4">
          <h3 className="text-sm font-medium text-foreground">Drafts</h3>
          <div className="mt-3 space-y-2">
            {drafts.length === 0 && (
              <p className="text-sm text-muted-foreground">No ingest drafts yet.</p>
            )}
            {drafts
              .filter((draft) => draft.playbook_id === playbookId)
              .map((draft) => (
                <div
                  key={draft.ingest_id}
                  className="flex items-center justify-between gap-3 rounded-lg border bg-background p-3"
                >
                  <div className="min-w-0 text-left">
                    <div className="truncate text-sm text-foreground">{draft.ingest_id}</div>
                    <div className="text-xs text-muted-foreground">
                      {draft.rule_count} rules · {draft.status} ·{" "}
                      {draft.source_filenames.join(", ")}
                    </div>
                  </div>
                  {draft.status === "draft" && (
                    <button
                      onClick={() => onPublish(draft)}
                      className="shrink-0 rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground"
                    >
                      Publish
                    </button>
                  )}
                </div>
              ))}
          </div>
        </section>
      </DialogContent>
    </Dialog>
  );
}

function GitLine({ source }: { source: SourceReference }) {
  return (
    <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
      <GitCommit className="h-3.5 w-3.5" />
      <span>{shortHash(source.git_metadata.last_commit_hash)}</span>
      <span className="truncate">{source.git_metadata.last_commit_message}</span>
    </div>
  );
}

function DiffBlock({ oldText, newText }: { oldText: string; newText: string }) {
  const lines = diffLines(oldText, newText);
  const added = lines.filter((line) => line.type === "added").length;
  const removed = lines.filter((line) => line.type === "removed").length;

  return (
    <div className="mt-3 overflow-hidden rounded-md border bg-background text-xs">
      <div className="flex items-center justify-between border-b bg-muted px-2 py-1.5 text-muted-foreground">
        <span>Diff</span>
        <span>
          +{added} / -{removed}
        </span>
      </div>
      <div className="max-h-40 overflow-auto font-mono">
        {lines.length === 0 ? (
          <div className="px-2 py-1.5 text-muted-foreground">No difference detected.</div>
        ) : (
          lines.map((line, index) => (
            <div
              key={`${line.type}-${index}-${line.text}`}
              className={`grid grid-cols-[24px_1fr] gap-2 px-2 py-1 ${
                line.type === "added"
                  ? "bg-position-green/10 text-position-green"
                  : line.type === "removed"
                    ? "bg-red-line/10 text-red-line"
                    : "text-muted-foreground"
              }`}
            >
              <span>{line.type === "added" ? "+" : line.type === "removed" ? "-" : " "}</span>
              <span className="whitespace-pre-wrap">{line.text || " "}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

type DiffLine = {
  type: "added" | "removed" | "unchanged";
  text: string;
};

function diffLines(oldText: string, newText: string): DiffLine[] {
  const oldLines = normalizeDiffText(oldText);
  const newLines = normalizeDiffText(newText);
  const rows = oldLines.length + 1;
  const columns = newLines.length + 1;
  const table = Array.from({ length: rows }, () => Array<number>(columns).fill(0));

  for (let oldIndex = oldLines.length - 1; oldIndex >= 0; oldIndex -= 1) {
    for (let newIndex = newLines.length - 1; newIndex >= 0; newIndex -= 1) {
      table[oldIndex][newIndex] =
        oldLines[oldIndex] === newLines[newIndex]
          ? table[oldIndex + 1][newIndex + 1] + 1
          : Math.max(table[oldIndex + 1][newIndex], table[oldIndex][newIndex + 1]);
    }
  }

  const diff: DiffLine[] = [];
  let oldIndex = 0;
  let newIndex = 0;
  while (oldIndex < oldLines.length && newIndex < newLines.length) {
    if (oldLines[oldIndex] === newLines[newIndex]) {
      diff.push({ type: "unchanged", text: oldLines[oldIndex] });
      oldIndex += 1;
      newIndex += 1;
    } else if (table[oldIndex + 1][newIndex] >= table[oldIndex][newIndex + 1]) {
      diff.push({ type: "removed", text: oldLines[oldIndex] });
      oldIndex += 1;
    } else {
      diff.push({ type: "added", text: newLines[newIndex] });
      newIndex += 1;
    }
  }
  while (oldIndex < oldLines.length) {
    diff.push({ type: "removed", text: oldLines[oldIndex] });
    oldIndex += 1;
  }
  while (newIndex < newLines.length) {
    diff.push({ type: "added", text: newLines[newIndex] });
    newIndex += 1;
  }
  return diff;
}

function normalizeDiffText(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0);
}

function latestGitMetadata(rules: RuleSummary[]) {
  return rules.find((rule) => rule.git_metadata?.last_commit_hash)?.git_metadata ?? null;
}

function latestCitedRuleIds(messages: ChatMessage[]) {
  const latestAnswer = [...messages].reverse().find((message) => message.answer)?.answer;
  return new Set(
    latestAnswer?.sources
      .map((source) => ruleIdFromPath(source.file))
      .filter((ruleId): ruleId is string => Boolean(ruleId)) ?? [],
  );
}

function ruleIdFromPath(path: string) {
  const filename = path.split("/").pop();
  return filename?.replace(/\.md$/, "") || null;
}

function shortHash(hash?: string | null) {
  if (!hash) return "none";
  return hash === "uncommitted" ? hash : hash.slice(0, 8);
}

function formatList(values: string[]) {
  return values.length ? values.map((value) => `- ${value}`).join("\n") : "Not specified.";
}

function truncate(value: string, max: number) {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function slugInput(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function confidenceClass(label: AskResponse["confidence"]["label"]) {
  if (label === "high") return "bg-position-green/10 text-position-green";
  if (label === "medium") return "bg-position-yellow/10 text-position-yellow";
  return "bg-red-line/10 text-red-line";
}

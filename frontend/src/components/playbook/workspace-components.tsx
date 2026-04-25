import { useEffect, useState } from "react";
import { CheckCircle2, Folder, GitCommit, MessageCircle, UploadCloud, X } from "lucide-react";
import { toast } from "sonner";

import {
  getIngest,
  uploadIngest,
  type AskResponse,
  type IngestDraftDetail,
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

export type Role = "Business User" | "Lawyer" | "Admin";

export type ChatMessage = {
  id: number;
  role: "user" | "ai";
  text: string;
  answer?: AskResponse;
};

export function StatusRow({ label, value, good }: { label: string; value: string; good: boolean }) {
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

export function VaultGraph({
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
  const playbookRadius = 96;
  const playbookNodes = playbooks.map((playbook, index) => ({
    playbook,
    x: vault.x + Math.cos((Math.PI * 2 * index) / Math.max(playbooks.length, 1)) * playbookRadius,
    y: vault.y + Math.sin((Math.PI * 2 * index) / Math.max(playbooks.length, 1)) * playbookRadius,
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
  const visibleRules = rules.slice(0, 8);
  const topicRadius = 92;
  const topicBaseAngle = selectedPlaybookNode.x >= vault.x ? 0 : Math.PI;
  const topicArc = Math.PI * 0.78;
  const topicNodes = visibleRules.map((rule, index) => {
    const offset =
      visibleRules.length <= 1
        ? 0
        : -topicArc / 2 + (topicArc * index) / Math.max(visibleRules.length - 1, 1);
    const angle = topicBaseAngle + offset;
    return {
      rule,
      x: selectedPlaybookNode.x + Math.cos(angle) * topicRadius,
      y: selectedPlaybookNode.y + Math.sin(angle) * topicRadius,
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
    <section className="mx-auto h-[24vh] min-h-[180px] w-full max-w-5xl border-b border-border pb-3">
      <div className="relative h-full overflow-hidden rounded-lg bg-background">
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
                  selectedBranch
                    ? 2.4
                    : selectedPlaybookId === node.playbook.playbook_id
                      ? 1.3
                      : 0.8
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
                strokeWidth={highlighted ? 2.4 : selectedRuleId === node.rule.rule_id ? 1.3 : 0.8}
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
              r={hasHighlightedTopic ? 36 : 30}
              className="fill-graph-selected/10"
            />
            <circle cx={vault.x} cy={vault.y} r={21} className="fill-graph-root" />
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
        <div className="absolute right-4 top-4 rounded-md border border-input bg-background/80 px-3 py-2 text-[12px] text-muted-foreground backdrop-blur">
          <div className="grid grid-cols-[16px_auto] items-center gap-x-2 gap-y-1.5">
            <Folder className="h-3.5 w-3.5" />
            <span>
              {playbooks.length || 1} playbook{playbooks.length === 1 ? "" : "s"}
            </span>
            <span className="h-2.5 w-2.5 rounded-full bg-graph-file" />
            <span>
              {rules.length} topic{rules.length === 1 ? "" : "s"}
            </span>
            {hasCitedTopic && (
              <>
                <span className="h-2.5 w-2.5 rounded-full bg-graph-selected" />
                <span className="text-graph-selected">Cited branch</span>
              </>
            )}
          </div>
        </div>
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

export function AnswerMessage({
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

export function RulePanel({
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
              <span className="block">By: {ruleDetail.git_metadata.last_changed_by}</span>
              <span className="block">
                At: {formatDateTime(ruleDetail.git_metadata.last_changed_at)}
              </span>
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

export function FeedbackDialog({
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
  onSubmit: () => Promise<boolean>;
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
            onClick={async () => {
              const submitted = await onSubmit();
              if (submitted) onOpenChange(false);
            }}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Submit
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function UploadDialog({
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
  const [expandedDraftId, setExpandedDraftId] = useState<string | null>(null);
  const filteredDrafts = drafts.filter((draft) => draft.playbook_id === playbookId);

  useEffect(() => {
    if (!open) return;
    setTargetPlaybookId(playbookId);
    setTargetPlaybookName(playbookName);
  }, [open, playbookId, playbookName]);

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
      setExpandedDraftId(draft.ingest_id);
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
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-lg border bg-background shadow-sm sm:max-w-2xl">
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
            {filteredDrafts.length === 0 && (
              <p className="text-sm text-muted-foreground">No ingest drafts yet.</p>
            )}
            {filteredDrafts.map((draft) => (
              <div key={draft.ingest_id} className="rounded-lg border bg-background p-3">
                <div className="flex items-center justify-between gap-3">
                  <button
                    onClick={() =>
                      setExpandedDraftId((current) =>
                        current === draft.ingest_id ? null : draft.ingest_id,
                      )
                    }
                    className="min-w-0 text-left"
                  >
                    <div className="truncate text-sm text-foreground">{draft.ingest_id}</div>
                    <div className="text-xs text-muted-foreground">
                      {draft.rule_count} rules · {draft.status} ·{" "}
                      {draft.source_filenames.join(", ")}
                    </div>
                  </button>
                  {draft.status === "draft" && (
                    <button
                      onClick={() => onPublish(draft)}
                      className="shrink-0 rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground"
                    >
                      Publish
                    </button>
                  )}
                </div>
                {expandedDraftId === draft.ingest_id && (
                  <div className="mt-3 border-t pt-3">
                    <DraftPreview draft={draft} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      </DialogContent>
    </Dialog>
  );
}

function DraftPreview({ draft }: { draft: IngestDraftSummary }) {
  const [detail, setDetail] = useState<IngestDraftDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    getIngest(draft.playbook_id, draft.ingest_id)
      .then((draftDetail) => {
        if (active) setDetail(draftDetail);
      })
      .catch((error) => {
        if (active) toast.error(error instanceof Error ? error.message : "Could not load draft.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [draft.ingest_id, draft.playbook_id]);

  return (
    <div className="space-y-3 text-xs text-muted-foreground">
      <div>Review extracted topics before publishing:</div>
      {loading && <div>Loading draft rules...</div>}
      {detail && (
        <div className="max-h-36 space-y-1 overflow-y-auto rounded-md border bg-panel-card p-2">
          {detail.rules.map((rule) => (
            <div key={rule.rule_id} className="flex items-center justify-between gap-3">
              <span className="truncate text-foreground">{rule.topic}</span>
              <span className="shrink-0">{rule.status}</span>
            </div>
          ))}
        </div>
      )}
      <div>Full draft files are available at:</div>
      <code className="block rounded-md bg-muted px-2 py-1 text-foreground">
        vault/{draft.playbook_id}/draft_ingest/{draft.ingest_id}/rules
      </code>
      <div>
        Publishing replaces the official rules for this playbook and immediately rebuilds retrieval.
      </div>
    </div>
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

function GitLine({ source }: { source: SourceReference }) {
  return (
    <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
      <GitCommit className="h-3.5 w-3.5" />
      <span className="truncate">{source.git_metadata.last_changed_by}</span>
      <span>{formatDateTime(source.git_metadata.last_changed_at)}</span>
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

export function latestGitMetadata(rules: RuleSummary[]) {
  return rules.find((rule) => rule.git_metadata?.last_commit_hash)?.git_metadata ?? null;
}

export function latestCitedRuleIds(messages: ChatMessage[]) {
  const latestAnswer = [...messages].reverse().find((message) => message.answer)?.answer;
  return new Set(
    latestAnswer?.sources
      .map((source) => ruleIdFromPath(source.file))
      .filter((ruleId): ruleId is string => Boolean(ruleId)) ?? [],
  );
}

export function shortHash(hash?: string | null) {
  if (!hash) return "none";
  return hash === "uncommitted" ? hash : hash.slice(0, 8);
}

export function shouldUseDarkModeByTime(date: Date) {
  const hour = date.getHours();
  return hour >= 18 || hour < 7;
}

function ruleIdFromPath(path: string) {
  const filename = path.split("/").pop();
  return filename?.replace(/\.md$/, "") || null;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "unknown time";
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatList(values: string[]) {
  return values.length ? values.map((value) => `- ${value}`).join("\n") : "Not specified.";
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

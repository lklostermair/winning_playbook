import { useEffect, useState } from "react";
import { ChevronDown, Folder, GitCommit, UploadCloud, X } from "lucide-react";
import { toast } from "sonner";

import {
  getIngest,
  uploadIngest,
  type AskResponse,
  type IngestDraftDetail,
  type IngestDraftSummary,
  type PlaybookSummary,
  type RuleDetail,
  type RuleSummary,
  type SourceReference,
} from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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

export function VaultGraph({
  playbooks,
  selectedPlaybookId,
  selectedPlaybookIds,
  allRules,
  selectedRuleId,
  citedRuleIds,
  onSelectPlaybook,
  onSelectRule,
}: {
  playbooks: PlaybookSummary[];
  selectedPlaybookId: string;
  selectedPlaybookIds: string[];
  allRules: Record<string, RuleSummary[]>;
  selectedRuleId: string | null;
  citedRuleIds: Set<string>;
  onSelectPlaybook: (playbookId: string) => void;
  onSelectRule: (ruleId: string, playbookId: string) => void;
}) {
  const [hoveredGraphNode, setHoveredGraphNode] = useState<{
    label: string;
    x: number;
    y: number;
  } | null>(null);
  const [graphReady, setGraphReady] = useState(false);
  const [graphSettled, setGraphSettled] = useState(false);
  const vault = { x: 380, y: 125 };
  const baseViewBox = { width: 760, height: 250 };
  const baseAspectRatio = baseViewBox.width / baseViewBox.height;
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
  const selectedPlaybookIdSet = new Set(selectedPlaybookIds);
  const topicRadius = 92;
  const topicArc = Math.PI * 0.78;
  const maxRulesPerPlaybook = 6;
  const allTopicNodes = playbookNodes.flatMap((playbookNode) => {
    const playbookRules = (allRules[playbookNode.playbook.playbook_id] ?? []).slice(
      0,
      maxRulesPerPlaybook,
    );
    const angleFromVault = Math.atan2(playbookNode.y - vault.y, playbookNode.x - vault.x);
    return playbookRules.map((rule, index) => {
      const offset =
        playbookRules.length <= 1
          ? 0
          : -topicArc / 2 + (topicArc * index) / Math.max(playbookRules.length - 1, 1);
      const angle = angleFromVault + offset;
      return {
        rule,
        playbookId: playbookNode.playbook.playbook_id,
        playbookNode,
        x: playbookNode.x + Math.cos(angle) * topicRadius,
        y: playbookNode.y + Math.sin(angle) * topicRadius,
      };
    });
  });
  const totalRuleCount = Object.values(allRules).reduce((sum, r) => sum + r.length, 0);
  const hasCitedTopic = allTopicNodes.some((node) => citedRuleIds.has(node.rule.rule_id));
  const hasHighlightedTopic = allTopicNodes.some((node) =>
    highlightedRuleIds.has(node.rule.rule_id),
  );
  const graphPoints = [
    ...playbookNodes.map((node) => ({ x: node.x, y: node.y, padding: 30 })),
    ...allTopicNodes.map((node) => ({ x: node.x, y: node.y, padding: 28 })),
  ];
  const requiredHalfWidth = Math.max(
    baseViewBox.width / 2,
    ...graphPoints.map((point) => Math.abs(point.x - vault.x) + point.padding),
  );
  const requiredHalfHeight = Math.max(
    baseViewBox.height / 2,
    ...graphPoints.map((point) => Math.abs(point.y - vault.y) + point.padding),
  );
  const viewBoxHalfWidth = Math.max(requiredHalfWidth, requiredHalfHeight * baseAspectRatio);
  const viewBoxHalfHeight = viewBoxHalfWidth / baseAspectRatio;
  const graphViewBox = {
    minX: vault.x - viewBoxHalfWidth,
    minY: vault.y - viewBoxHalfHeight,
    width: viewBoxHalfWidth * 2,
    height: viewBoxHalfHeight * 2,
  };
  const vaultNodeScale = Math.max(0.72, Math.min(1, baseViewBox.width / graphViewBox.width));
  const graphSignature = `${selectedPlaybookId}:${selectedPlaybookIds.join(",")}:${playbookNodes.map((node) => node.playbook.playbook_id).join(",")}:${Object.keys(
    allRules,
  )
    .sort()
    .map((id) => (allRules[id] ?? []).map((r) => r.rule_id).join(","))
    .join("|")}`;

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
          viewBox={`${graphViewBox.minX} ${graphViewBox.minY} ${graphViewBox.width} ${graphViewBox.height}`}
          role="img"
          aria-label="Playbook vault graph"
          className="h-full w-full"
          overflow="visible"
        >
          {playbookNodes.map((node, index) => {
            const activePlaybook = selectedPlaybookIdSet.has(node.playbook.playbook_id);
            const selectedBranch = activePlaybook;
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
                strokeWidth={selectedBranch ? 2.4 : activePlaybook ? 1.3 : 0.8}
                vectorEffect="non-scaling-stroke"
                strokeLinecap="round"
                strokeDasharray={lineLength}
                strokeDashoffset={graphReady ? 0 : lineLength}
                style={{ transitionDelay: graphSettled ? "0ms" : `${120 + index * 70}ms` }}
              />
            );
          })}
          {allTopicNodes.map((node, index) => {
            const highlighted = highlightedRuleIds.has(node.rule.rule_id);
            const lineLength = Math.hypot(
              node.x - node.playbookNode.x,
              node.y - node.playbookNode.y,
            );

            return (
              <line
                key={`topic-link-${node.rule.rule_id}`}
                x1={node.playbookNode.x}
                y1={node.playbookNode.y}
                x2={node.x}
                y2={node.y}
                className={`${highlighted ? "stroke-graph-selected" : "stroke-graph-link"} transition-[opacity,stroke-dashoffset,stroke-width] duration-700 ease-out`}
                opacity={graphReady ? (highlighted ? 1 : 0.62) : 0}
                strokeWidth={highlighted ? 2.4 : selectedRuleId === node.rule.rule_id ? 1.3 : 0.8}
                vectorEffect="non-scaling-stroke"
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
              r={(hasHighlightedTopic ? 36 : 30) * vaultNodeScale}
              className="fill-graph-selected/10"
            />
            <circle cx={vault.x} cy={vault.y} r={21 * vaultNodeScale} className="fill-graph-root" />
          </g>
          {playbookNodes.map((node, index) => {
            const selected = selectedPlaybookId === node.playbook.playbook_id;
            const activePlaybook = selectedPlaybookIdSet.has(node.playbook.playbook_id);
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
                  r={selected ? 24 : activePlaybook ? 22 : 20}
                  className="fill-graph-selected/0 transition-colors duration-200 hover:fill-graph-selected/10"
                />
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={selected ? 18 : activePlaybook ? 16 : 14}
                  className={activePlaybook ? "fill-graph-selected/10" : "fill-transparent"}
                />
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={selected ? 10 : activePlaybook ? 9 : 8}
                  className={activePlaybook ? "fill-graph-selected" : "fill-graph-folder"}
                />
              </g>
            );
          })}
          {allTopicNodes.map((node, index) => {
            const selected = selectedRuleId === node.rule.rule_id;
            const cited = citedRuleIds.has(node.rule.rule_id);
            return (
              <g
                key={node.rule.rule_id}
                role="button"
                tabIndex={0}
                onClick={() => onSelectRule(node.rule.rule_id, node.playbookId)}
                onMouseEnter={() =>
                  setHoveredGraphNode({ label: node.rule.topic, x: node.x, y: node.y })
                }
                onMouseLeave={() => setHoveredGraphNode(null)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ")
                    onSelectRule(node.rule.rule_id, node.playbookId);
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
              {totalRuleCount} topic{totalRuleCount === 1 ? "" : "s"}
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
              left: `${((hoveredGraphNode.x - graphViewBox.minX) / graphViewBox.width) * 100}%`,
              top: `${((hoveredGraphNode.y - graphViewBox.minY) / graphViewBox.height) * 100}%`,
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
}: {
  message: ChatMessage;
  onSelectRule: (ruleId: string, playbookId?: string) => void;
}) {
  const answer = message.answer;
  const [sourcesOpen, setSourcesOpen] = useState(false);

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
          {answer.sources.length > 0 && (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setSourcesOpen((current) => !current)}
                className="inline-flex items-center gap-2 rounded-full border border-graph-selected/20 bg-graph-selected/10 px-3 py-1.5 text-xs font-medium text-graph-selected transition hover:bg-graph-selected/15"
                aria-expanded={sourcesOpen}
              >
                {answer.sources.length} {answer.sources.length === 1 ? "source" : "sources"}
                <ChevronDown
                  className={`h-3.5 w-3.5 transition-transform ${sourcesOpen ? "rotate-180" : ""}`}
                />
              </button>
              {sourcesOpen && (
                <div className="grid gap-2 md:grid-cols-2">
                  {answer.sources.map((source) => (
                    <button
                      key={`${source.file}-${source.section}`}
                      onClick={() => {
                        onSelectRule(source.rule_id, source.playbook_id);
                      }}
                      className="rounded-lg border bg-panel-card p-3 text-left transition hover:bg-muted"
                    >
                      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                        <span className="truncate">{source.section}</span>
                        <span>{Math.round(source.retrieval_score * 100)}%</span>
                      </div>
                      <p className="mt-2 line-clamp-2 text-sm text-body-text">{source.snippet}</p>
                      <GitLine source={source} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function RulePanel({
  role,
  ruleDetail,
  updateDraft,
  onUpdateDraftChange,
  updateInstruction,
  onUpdateInstructionChange,
  draftingUpdate,
  committingUpdate,
  onDraftUpdate,
  onSubmitUpdate,
  onClose,
}: {
  role: Role;
  ruleDetail: RuleDetail | null;
  updateDraft: { section: string; newText: string; reason: string };
  onUpdateDraftChange: (draft: { section: string; newText: string; reason: string }) => void;
  updateInstruction: string;
  onUpdateInstructionChange: (instruction: string) => void;
  draftingUpdate: boolean;
  committingUpdate: boolean;
  onDraftUpdate: () => void;
  onSubmitUpdate: () => void;
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
            <section className="rounded-lg border border-graph-selected/30 bg-graph-selected/5 p-4 shadow-[0_1px_0_rgba(0,153,153,0.12)]">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-medium text-foreground">Update Rule</h3>
                <span className="rounded-full bg-graph-selected/10 px-2.5 py-1 text-[11px] font-medium text-graph-selected">
                  dandelion draft
                </span>
              </div>
              <div className="mt-3 space-y-2.5">
                <textarea
                  value={updateInstruction}
                  onChange={(event) => onUpdateInstructionChange(event.target.value)}
                  placeholder="Tell the assistant what should change..."
                  className="min-h-20 w-full resize-none rounded-lg border border-graph-selected/20 bg-background/80 p-3 text-sm outline-none transition focus:border-graph-selected focus:ring-2 focus:ring-graph-selected/15"
                />
                <button
                  onClick={onDraftUpdate}
                  disabled={draftingUpdate || !updateInstruction.trim()}
                  className="rounded-lg border border-graph-selected/30 bg-graph-selected/10 px-3 py-2 text-sm font-medium text-graph-selected transition hover:bg-graph-selected/15 disabled:opacity-50"
                >
                  {draftingUpdate ? "Drafting..." : "Draft with dandelion"}
                </button>
                <Select
                  value={updateDraft.section}
                  onValueChange={(section) => onUpdateDraftChange({ ...updateDraft, section })}
                >
                  <SelectTrigger className="h-9 rounded-lg border-graph-selected/20 focus:ring-graph-selected/20">
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
                  className="min-h-24 w-full resize-none rounded-lg border border-graph-selected/20 bg-background/80 p-3 text-sm outline-none transition focus:border-graph-selected focus:ring-2 focus:ring-graph-selected/15"
                />
                <input
                  value={updateDraft.reason}
                  onChange={(event) =>
                    onUpdateDraftChange({ ...updateDraft, reason: event.target.value })
                  }
                  placeholder="Reason for legal review"
                  className="h-10 w-full rounded-lg border border-graph-selected/20 bg-background/80 px-3 text-sm outline-none transition focus:border-graph-selected focus:ring-2 focus:ring-graph-selected/15"
                />
                <button
                  onClick={onSubmitUpdate}
                  disabled={
                    committingUpdate || !updateDraft.newText.trim() || !updateDraft.reason.trim()
                  }
                  className="rounded-lg bg-graph-selected px-4 py-2 text-sm font-medium text-white transition hover:brightness-95 disabled:opacity-50"
                >
                  {committingUpdate ? "Updating..." : "Update & Commit"}
                </button>
              </div>
            </section>
          </>
        )}
      </div>
      {lawyerView && (
        <p className="mt-6 border-t pt-3 text-[11px] leading-5 text-muted-foreground">
          Last changed by {ruleDetail.git_metadata.last_changed_by} on{" "}
          {formatDateTime(ruleDetail.git_metadata.last_changed_at)}.
        </p>
      )}
    </aside>
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
  const [sourceKind, setSourceKind] = useState<"playbook_source" | "contract_set">(
    "playbook_source",
  );
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
      toast.error(
        sourceKind === "contract_set"
          ? "Select at least one contract file."
          : "Select at least one playbook file.",
      );
      return;
    }
    setUploading(true);
    try {
      const draft = await uploadIngest({
        playbookId: targetPlaybookId.trim(),
        playbookName: targetPlaybookName.trim(),
        mode,
        sourceKind,
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
            Upload an existing playbook or contracts and turn them into a reviewable draft.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-lg border border-dashed bg-panel-card p-6 text-center">
          <UploadCloud className="h-10 w-10 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium text-foreground">DOCX, PDF, XLSX, or CSV</p>
          <div className="mt-4 grid gap-2 rounded-lg border bg-background p-1 text-left text-sm sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setSourceKind("playbook_source")}
              className={`rounded-md px-3 py-2 transition ${
                sourceKind === "playbook_source"
                  ? "bg-active-item text-foreground"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              Existing playbook
            </button>
            <button
              type="button"
              onClick={() => {
                setSourceKind("contract_set");
                if (mode === "heuristic") setMode("hybrid");
              }}
              className={`rounded-md px-3 py-2 transition ${
                sourceKind === "contract_set"
                  ? "bg-graph-selected/10 text-graph-selected"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              Existing contracts
            </button>
          </div>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            {sourceKind === "contract_set"
              ? "dandelion will compare contracts, merge overlapping topics, and synthesize one ruleset."
              : "dandelion will extract rules from a structured playbook source."}
          </p>
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
                {sourceKind === "playbook_source" && (
                  <SelectItem value="heuristic">Heuristic</SelectItem>
                )}
              </SelectContent>
            </Select>
            <button
              onClick={() => void upload()}
              disabled={uploading}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {uploading
                ? sourceKind === "contract_set"
                  ? "Synthesizing..."
                  : "Extracting..."
                : "Create Draft"}
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
                      {draft.source_kind === "contract_set" ? "contracts" : "playbook"} ·{" "}
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
      <div>
        Review {draft.source_kind === "contract_set" ? "synthesized" : "extracted"} topics before
        publishing:
      </div>
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

export function latestCitedRuleIds(messages: ChatMessage[]) {
  const latestAnswer = [...messages].reverse().find((message) => message.answer)?.answer;
  return new Set(latestAnswer?.sources.map((source) => source.rule_id) ?? []);
}

export function shortHash(hash?: string | null) {
  if (!hash) return "none";
  return hash === "uncommitted" ? hash : hash.slice(0, 8);
}

export function shouldUseDarkModeByTime(date: Date) {
  const hour = date.getHours();
  return hour >= 18 || hour < 7;
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

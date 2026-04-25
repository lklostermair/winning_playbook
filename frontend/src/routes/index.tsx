import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  ChevronDown,
  Copy,
  FileText,
  Folder,
  MessageCircle,
  Moon,
  Paperclip,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Sun,
  UploadCloud,
  X,
} from "lucide-react";

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

type Clause = {
  number: number;
  title: string;
  why: string;
  watch: string;
  preferred: string;
  fallback1: string;
  fallback2: string;
  redLine: string;
  escalation: string;
};

type ChatMessage = {
  id: number;
  role: "user" | "ai";
  text: string;
  clauses?: number[];
};

type GraphNode = {
  id: string;
  label: string;
  type: "root" | "folder" | "file";
  x: number;
  y: number;
};

type GraphLink = {
  from: string;
  to: string;
};

const clauses: Clause[] = [
  {
    number: 1,
    title: "Type of NDA (Unilateral vs Bilateral)",
    why: "The NDA structure determines whether confidentiality duties apply to one party or both parties.",
    watch: "Avoid accepting a unilateral NDA when SIEMENSCH will also share sensitive information.",
    preferred: "Use a bilateral NDA whenever both sides exchange confidential information.",
    fallback1: "Accept unilateral protection only when SIEMENSCH receives information but discloses none.",
    fallback2: "Add reciprocal obligations for any SIEMENSCH disclosures made during discussions.",
    redLine: "Do not disclose SIEMENSCH confidential information under a one-way NDA protecting only the counterparty.",
    escalation: "Escalate if the counterparty refuses bilateral protection while requesting SIEMENSCH information.",
  },
  {
    number: 2,
    title: "Marking of Confidential Information",
    why: "Marking requirements affect whether oral, visual, or accidentally unmarked information remains protected.",
    watch: "Strict marking-only definitions can exclude important business discussions and technical demonstrations.",
    preferred: "Protect information that is marked, identified orally, or reasonably understood to be confidential.",
    fallback1: "Allow oral disclosures if summarized in writing within a reasonable period.",
    fallback2: "Accept marking requirements only for written materials, not meetings or demonstrations.",
    redLine: "Do not accept loss of protection solely because information was not stamped confidential.",
    escalation: "Escalate if the NDA excludes orally disclosed or obviously confidential information.",
  },
  {
    number: 3,
    title: "Exceptions to Confidential Information",
    why: "Exceptions define what information can be used freely and prevent overbroad confidentiality claims.",
    watch: "Ensure common exceptions cover prior knowledge, public information, independent development, and lawful third-party receipt.",
    preferred: "Include standard exceptions with clear evidence requirements for the receiving party.",
    fallback1: "Accept narrower wording if public domain and prior possession remain covered.",
    fallback2: "Use written records to prove independent development or prior knowledge.",
    redLine: "Do not accept an NDA with no practical exceptions to confidentiality.",
    escalation: "Escalate if exceptions are removed or the burden of proof is commercially unreasonable.",
  },
  {
    number: 4,
    title: "Permitted Recipients",
    why: "The business may need advisors, affiliates, employees, and contractors to review confidential information.",
    watch: "Overly narrow recipient lists can block normal diligence, legal review, or technical evaluation.",
    preferred: "Allow disclosure to employees, affiliates, advisors, and contractors with a need to know and confidentiality duties.",
    fallback1: "Accept named categories with prior written notice where sensitive disclosures are involved.",
    fallback2: "Limit disclosure to representatives directly involved in the project.",
    redLine: "Do not accept terms that prevent SIEMENSCH legal counsel or core advisors from reviewing materials.",
    escalation: "Escalate if affiliates or external counsel are excluded from permitted recipients.",
  },
  {
    number: 5,
    title: "Return or Destruction of Routine Backup Copies",
    why: "Routine IT backups may retain copies even after project materials are deleted or returned.",
    watch: "Absolute deletion obligations may be impossible across automated backup systems.",
    preferred: "Permit routine backup copies to remain subject to confidentiality until overwritten or deleted in ordinary course.",
    fallback1: "Certify deletion of active files while excluding inaccessible archival backups.",
    fallback2: "Allow retained copies required by law, compliance, or internal recordkeeping policies.",
    redLine: "Do not promise immediate deletion of every backup or disaster recovery copy.",
    escalation: "Escalate if deletion certification covers systems SIEMENSCH cannot practically purge.",
  },
  {
    number: 6,
    title: "Liability for Correctness of Confidential Information",
    why: "Disclosing parties usually do not guarantee that shared preliminary information is accurate or complete.",
    watch: "Accuracy warranties can create unintended liability for early-stage estimates, forecasts, or draft data.",
    preferred: "State that confidential information is provided as-is without warranty as to accuracy or completeness.",
    fallback1: "Limit reliance to information expressly confirmed in a later definitive agreement.",
    fallback2: "Accept responsibility only for intentional misrepresentation or fraud.",
    redLine: "Do not provide broad warranties for correctness of confidential or preliminary information.",
    escalation: "Escalate if the counterparty requires reliance warranties inside the NDA.",
  },
  {
    number: 7,
    title: "Contractual Penalty for Breach of Confidentiality",
    why: "Pre-agreed penalties can create disproportionate exposure unrelated to actual harm.",
    watch: "Penalty clauses may be uncapped, automatic, or cumulative with damages.",
    preferred: "Reject contractual penalties and rely on proven damages plus equitable remedies where appropriate.",
    fallback1: "If unavoidable, require a reasonable cap and proportionality to actual harm.",
    fallback2: "Clarify that any amount is not automatic and remains subject to legal review.",
    redLine: "Do not accept uncapped automatic penalties for confidentiality breaches.",
    escalation: "Escalate any contractual penalty demand before signature.",
  },
  {
    number: 8,
    title: "Other Liabilities (Indemnification, Limitation of Liability)",
    why: "Indemnities and liability caps shape the financial consequences of breach.",
    watch: "Broad indemnities can override normal liability limits and cover indirect losses.",
    preferred: "Keep liability limited to direct damages with balanced exclusions for intentional misconduct.",
    fallback1: "Accept a mutual, capped indemnity limited to third-party claims caused by breach.",
    fallback2: "Exclude consequential, punitive, and lost-profit damages wherever possible.",
    redLine: "Do not accept unlimited liability for ordinary confidentiality breaches.",
    escalation: "Escalate if liability is uncapped, one-sided, or includes broad indemnification.",
  },
  {
    number: 9,
    title: "Intellectual Property Rights (Including Know-How)",
    why: "NDA discussions should not transfer ownership of SIEMENSCH IP, know-how, or improvements.",
    watch: "Beware clauses assigning feedback, ideas, residual knowledge, or improvements to the counterparty.",
    preferred: "Each party retains its pre-existing IP and no license is granted except for evaluation under the NDA.",
    fallback1: "Allow use of confidential information solely for the defined purpose.",
    fallback2: "Clarify that general skills and unaided memory are not transferred as owned IP.",
    redLine: "Do not assign SIEMENSCH IP, know-how, or improvements through an NDA.",
    escalation: "Escalate any ownership, license, feedback, or residuals language that affects SIEMENSCH technology.",
  },
  {
    number: 10,
    title: "Non-Solicitation of Employees",
    why: "Non-solicitation restrictions can limit hiring flexibility and may raise enforceability concerns.",
    watch: "Broad restrictions may cover general recruiting, unrelated employees, or long durations.",
    preferred: "Avoid non-solicitation clauses in NDAs unless directly tied to sensitive discussions.",
    fallback1: "Limit the restriction to employees directly involved in the project.",
    fallback2: "Carve out general advertisements, recruiters, and unsolicited applications.",
    redLine: "Do not accept broad company-wide hiring restrictions or excessive durations.",
    escalation: "Escalate if the clause lasts beyond 12 months or covers employees with no project involvement.",
  },
  {
    number: 11,
    title: "Contract Term and Confidentiality Period",
    why: "The term controls how long the NDA applies and how long confidentiality obligations survive.",
    watch: "Indefinite obligations may be appropriate for trade secrets but not ordinary business information.",
    preferred: "Use a fixed NDA term with confidentiality obligations surviving for a reasonable period, typically three to five years.",
    fallback1: "Accept longer protection for trade secrets while ordinary confidential information expires.",
    fallback2: "Use two years for low-risk business discussions if commercially necessary.",
    redLine: "Do not accept perpetual confidentiality for all information regardless of sensitivity.",
    escalation: "Escalate if the counterparty demands indefinite protection for routine commercial information.",
  },
  {
    number: 12,
    title: "Choice of Law (Governing Law)",
    why: "Governing law affects interpretation, remedies, and enforcement risk.",
    watch: "Unfamiliar or unfavorable jurisdictions can increase legal uncertainty and costs.",
    preferred: "Use a familiar, commercially reasonable governing law aligned with the transaction context.",
    fallback1: "Accept neutral law if reviewed by legal and compatible with enforcement needs.",
    fallback2: "Separate governing law from venue if a compromise is needed.",
    redLine: "Do not accept sanctions-sensitive, unstable, or legally impractical governing law.",
    escalation: "Escalate unfamiliar, high-risk, or non-standard governing law proposals.",
  },
  {
    number: 13,
    title: "Dispute Resolution and Language of the Contract",
    why: "Forum, dispute process, and contract language determine how conflicts are handled.",
    watch: "One-sided venues, mandatory local courts, or non-English controlling versions may create risk.",
    preferred: "Use a neutral forum and English as the controlling contract language unless legal approves otherwise.",
    fallback1: "Accept arbitration for cross-border matters if seat, language, and rules are balanced.",
    fallback2: "Use local courts only where commercially justified and legally reviewed.",
    redLine: "Do not accept a non-English controlling version without legal approval.",
    escalation: "Escalate if dispute terms are one-sided, unfamiliar, or not in English.",
  },
  {
    number: 14,
    title: "Signatures and Authority to Sign",
    why: "The NDA must be signed by people with authority to bind each party.",
    watch: "Unauthorized signatures can create enforceability issues and delay business discussions.",
    preferred: "Confirm authorized signatories and allow electronic signatures where valid.",
    fallback1: "Use written confirmation of authority where formal evidence is not immediately available.",
    fallback2: "Permit counterpart signatures and recognized e-signature tools.",
    redLine: "Do not proceed on an NDA signed by someone without apparent authority.",
    escalation: "Escalate if authority is uncertain or the counterparty rejects acceptable e-signature methods.",
  },
];

const suggestedQuestions = [
  "What is our red line on liability?",
  "Can we accept a unilateral NDA?",
  "What is the preferred confidentiality period?",
];

const recentChats = [
  "What is our position on IP...",
  "Confidentiality period que...",
  "Can we share with advisors?...",
];

const vaultNodes: GraphNode[] = [
  { id: "vault", label: "NDA Vault", type: "root", x: 380, y: 115 },
  { id: "contracts", label: "Contracts", type: "folder", x: 210, y: 85 },
  { id: "research", label: "Research", type: "folder", x: 550, y: 145 },
  { id: "mutual", label: "Mutual NDA.md", type: "file", x: 70, y: 38 },
  { id: "unilateral", label: "Unilateral.md", type: "file", x: 82, y: 118 },
  { id: "liability", label: "Liability.md", type: "file", x: 205, y: 28 },
  { id: "signatures", label: "Signatures.md", type: "file", x: 222, y: 168 },
  { id: "terms", label: "Terms.md", type: "file", x: 655, y: 58 },
  { id: "recipients", label: "Recipients.md", type: "file", x: 705, y: 128 },
  { id: "ip", label: "IP Rights.md", type: "file", x: 620, y: 205 },
  { id: "law", label: "Governing Law.md", type: "file", x: 500, y: 218 },
];

const vaultLinks: GraphLink[] = [
  { from: "vault", to: "contracts" },
  { from: "vault", to: "research" },
  { from: "contracts", to: "mutual" },
  { from: "contracts", to: "unilateral" },
  { from: "contracts", to: "liability" },
  { from: "contracts", to: "signatures" },
  { from: "research", to: "terms" },
  { from: "research", to: "recipients" },
  { from: "research", to: "ip" },
  { from: "research", to: "law" },
];

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SIEMENSCH Legal AI" },
      {
        name: "description",
        content: "A minimal legal AI assistant for navigating the SIEMENSCH NDA Playbook.",
      },
      { property: "og:title", content: "SIEMENSCH Legal AI" },
      {
        property: "og:description",
        content: "Ask questions, review NDA playbook clauses, and capture legal feedback.",
      },
    ],
  }),
  component: SiemenschApp,
});

function SiemenschApp() {
  const [role, setRole] = useState<Role>("Business User");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [selectedClauseNumber, setSelectedClauseNumber] = useState<number | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [selectedGraphNode, setSelectedGraphNode] = useState("vault");
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [isEditingClause, setIsEditingClause] = useState(false);
  const [editedClause, setEditedClause] = useState("");

  const selectedClause = useMemo(
    () => clauses.find((clause) => clause.number === selectedClauseNumber) ?? null,
    [selectedClauseNumber],
  );

  const selectClause = (number: number) => {
    const clause = clauses.find((item) => item.number === number);
    setSelectedClauseNumber(number);
    setIsEditingClause(false);
    setEditedClause(clause ? `${clause.why}\n\n${clause.watch}` : "");
  };

  const createAnswer = (question: string): ChatMessage => {
    const lowerQuestion = question.toLowerCase();
    let referencedClauses = [3, 11];
    let answer =
      "The NDA Playbook position is to keep the clause balanced, practical, and tied to the defined purpose. Clause 3 · Exceptions to Confidential Information should preserve standard carve-outs, while Clause 11 · Contract Term and Confidentiality Period should avoid perpetual protection for routine commercial information.";

    if (lowerQuestion.includes("liability") || lowerQuestion.includes("indemn")) {
      referencedClauses = [8, 7];
      answer =
        "Our liability position is conservative. Clause 8 · Other Liabilities prefers direct damages with balanced limits, and Clause 7 · Contractual Penalty for Breach of Confidentiality rejects uncapped automatic penalties. The red line is unlimited liability for ordinary confidentiality breaches.";
    } else if (lowerQuestion.includes("unilateral") || lowerQuestion.includes("bilateral")) {
      referencedClauses = [1, 4];
      answer =
        "A unilateral NDA is acceptable only when SIEMENSCH receives information and does not disclose its own. Clause 1 · Type of NDA calls for bilateral protection when both sides exchange confidential information, and Clause 4 · Permitted Recipients should still allow core advisors and counsel to review materials.";
    } else if (lowerQuestion.includes("period") || lowerQuestion.includes("term")) {
      referencedClauses = [11, 5];
      answer =
        "The preferred confidentiality period is a reasonable fixed survival period, typically three to five years. Clause 11 · Contract Term and Confidentiality Period allows longer protection for trade secrets, while Clause 5 · Return or Destruction of Routine Backup Copies prevents impossible deletion obligations.";
    } else if (lowerQuestion.includes("ip") || lowerQuestion.includes("know-how")) {
      referencedClauses = [9, 6];
      answer =
        "SIEMENSCH should retain all pre-existing IP, know-how, and improvements. Clause 9 · Intellectual Property Rights states that no license or assignment is granted through the NDA, and Clause 6 · Liability for Correctness avoids warranty exposure for preliminary information.";
    }

    return {
      id: Date.now() + 1,
      role: "ai",
      text: answer,
      clauses: referencedClauses,
    };
  };

  const submitQuestion = (question = input) => {
    const trimmedQuestion = question.trim();
    if (!trimmedQuestion) return;

    const userMessage: ChatMessage = {
      id: Date.now(),
      role: "user",
      text: trimmedQuestion,
    };

    setMessages((current) => [...current, userMessage, createAnswer(trimmedQuestion)]);
    setInput("");
  };

  const submitFeedback = () => {
    setFeedbackOpen(false);
    toast.success("Feedback submitted. Thank you!");
  };

  return (
    <main className={`${isDarkMode ? "dark" : ""} min-h-screen bg-background text-foreground`}>
      <div className="flex h-screen overflow-hidden">
        <aside className="hidden w-[280px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar px-5 py-5 text-[13px] font-normal text-sidebar-foreground md:flex">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-primary-foreground">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div className="text-[22px] font-medium tracking-tight text-sidebar-primary">SIEMENSCH</div>
            </div>
            <ChevronDown className="h-5 w-5 text-sidebar-foreground" />
          </div>

          <div className="mt-8">
            <Select value={role} onValueChange={(value) => setRole(value as Role)}>
              <SelectTrigger className="h-11 rounded-2xl border-sidebar-border bg-sidebar-panel px-4 text-[13px] font-normal text-sidebar-primary shadow-none">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Business User">Business User</SelectItem>
                <SelectItem value="Lawyer">Lawyer</SelectItem>
                <SelectItem value="Admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="mt-7 border-t border-sidebar-border pt-5">
            <div className="mb-3 text-[11px] font-normal uppercase tracking-[0.08em] text-sidebar-label">Contracts</div>
            <div className="flex items-center justify-between rounded-2xl border border-sidebar-border bg-sidebar-panel px-3.5 py-3 text-[13px] font-normal text-sidebar-primary shadow-none">
              <span className="flex min-w-0 items-center gap-3">
                <FileText className="h-5 w-5 shrink-0 text-sidebar-foreground" />
                <span className="truncate">NDA Playbook</span>
              </span>
              <button aria-label="Deselect NDA Playbook" className="rounded-xl bg-suggested-chip p-2 text-sidebar-foreground hover:text-sidebar-primary">
                <X className="h-4 w-4" />
              </button>
            </div>
            {role === "Admin" && (
              <button className="mt-3 text-[13px] font-normal text-sidebar-primary hover:underline">
                + Upload New Playbook
              </button>
            )}
            <button
              onClick={() => setUploadOpen(true)}
              className="mt-4 flex w-full items-center justify-between rounded-xl bg-primary px-4 py-3.5 text-[13px] font-medium text-primary-foreground transition hover:bg-primary/90"
            >
              <span>+ New Contract</span>
              <ChevronDown className="h-5 w-5" />
            </button>
          </div>

          <div className="mt-7 space-y-3">
            <div className="text-[11px] font-normal uppercase tracking-[0.08em] text-sidebar-label">Documents</div>
            <button className="flex items-center gap-3 text-[13px] font-normal text-sidebar-foreground hover:text-sidebar-primary">
              <FileText className="h-5 w-5" />
              Documents
            </button>
            <label className="flex h-12 items-center gap-3 rounded-2xl border border-sidebar-border bg-sidebar-panel px-4 text-[13px] font-normal text-sidebar-foreground shadow-none">
              <Search className="h-5 w-5" />
              <input
                className="w-full bg-transparent outline-none placeholder:text-sidebar-foreground"
                placeholder="Search conversations..."
              />
            </label>
            <div className="space-y-1.5">
              {recentChats.map((chat, index) => (
                <button
                  key={chat}
                  className={`flex h-12 w-full items-center gap-3 rounded-xl px-3.5 text-left text-[13px] font-normal ${
                    index === 0 ? "bg-active-item text-sidebar-primary" : "text-sidebar-foreground hover:bg-sidebar-panel"
                  }`}
                >
                  <MessageCircle className="h-5 w-5 shrink-0" />
                  <span className="truncate">{chat}</span>
                </button>
              ))}
            </div>
          </div>
        </aside>

        <section className="relative flex min-w-0 flex-1 flex-col bg-background">
          <header className="relative flex h-20 shrink-0 items-center justify-center px-10">
            <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center text-center">
              <div className="text-[20px] font-medium tracking-tight text-foreground">NDA Playbook</div>
            </div>
            <button
              onClick={() => setIsDarkMode((current) => !current)}
              aria-label={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
              className="absolute right-8 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full border border-input bg-background text-muted-foreground shadow-[0_1px_3px_rgba(0,0,0,0.06)] transition hover:bg-muted hover:text-foreground"
            >
              {isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-10 pb-56 pt-2 text-[14px] leading-[1.6] text-body-text">
            <VaultGraph selectedNode={selectedGraphNode} onSelectNode={setSelectedGraphNode} />
            {messages.length === 0 ? (
              <div className="mx-auto flex max-w-4xl flex-col items-center pt-12 text-center">
                <h1 className="max-w-3xl text-[22px] font-medium leading-[1.45] tracking-normal text-foreground">
                  Good morning! How can I help you with the NDA Playbook today?
                </h1>
                <div className="mt-8 flex flex-wrap justify-center gap-3">
                  {suggestedQuestions.map((question) => (
                    <button
                      key={question}
                      onClick={() => {
                        setInput(question);
                        submitQuestion(question);
                      }}
                      className="rounded-[20px] border border-input bg-suggested-chip px-5 py-3 text-[14px] font-normal text-body-text shadow-none transition hover:border-sidebar-label hover:text-foreground"
                    >
                      {question}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mx-auto mt-12 max-w-5xl space-y-12 pb-6">
                {messages.map((message) =>
                  message.role === "user" ? (
                    <div key={message.id} className="flex justify-end">
                      <div className="max-w-[58%] whitespace-pre-wrap rounded-2xl bg-chat-bubble px-5 py-3.5 text-[14px] leading-[1.6] text-body-text">
                        {message.text}
                      </div>
                    </div>
                  ) : (
                    <div key={message.id} className="mx-auto max-w-3xl space-y-5 text-center">
                      <p className="text-[14px] font-normal leading-[1.6] text-body-text">{message.text}</p>
                      <div className="flex flex-wrap justify-center gap-2.5">
                        {message.clauses?.map((clauseNumber) => {
                          const clause = clauses.find((item) => item.number === clauseNumber);
                          if (!clause) return null;
                          return (
                            <button
                              key={clause.number}
                              onClick={() => selectClause(clause.number)}
                              className="inline-flex items-center gap-2 rounded-full bg-chip-blue px-3.5 py-2 text-xs font-medium text-accent-blue transition hover:bg-active-item"
                            >
                              <FileText className="h-3.5 w-3.5" />
                              Clause {clause.number} · {shortClauseTitle(clause.title)}
                              <ArrowRight className="h-3.5 w-3.5" />
                            </button>
                          );
                        })}
                      </div>
                      <div className="flex flex-wrap justify-center gap-8 text-[13px] font-normal text-muted-foreground">
                        <button className="inline-flex items-center gap-2 rounded-md px-2 py-1 hover:bg-muted hover:text-foreground">
                          <Copy className="h-4 w-4" /> Copy
                        </button>
                        <button
                          onClick={() => submitQuestion(messages.find((item) => item.id === message.id - 1)?.text ?? "")}
                          className="inline-flex items-center gap-2 rounded-md px-2 py-1 hover:bg-muted hover:text-foreground"
                        >
                          <RefreshCw className="h-4 w-4" /> Regenerate
                        </button>
                        <button
                          onClick={() => setFeedbackOpen(true)}
                          className="inline-flex items-center gap-2 rounded-md px-2 py-1 hover:bg-muted hover:text-foreground"
                        >
                          <MessageCircle className="h-4 w-4" /> Feedback
                        </button>
                      </div>
                    </div>
                  ),
                )}
              </div>
            )}
          </div>

          <footer className="pointer-events-none absolute bottom-0 left-0 right-0 px-6 pb-7 pt-4">
            <div className="pointer-events-auto mx-auto max-w-[860px]">
              <div className="rounded-2xl border border-input bg-background px-[18px] py-4 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
                <div className="flex items-center gap-3">
                  <textarea
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        submitQuestion();
                      }
                    }}
                    placeholder="Ask the playbook..."
                    rows={1}
                    className="max-h-32 min-h-12 flex-1 resize-none bg-transparent px-0 py-3 text-[14px] leading-[1.6] text-body-text outline-none placeholder:text-muted-foreground"
                  />
                  <button
                    onClick={() => submitQuestion()}
                    aria-label="Send message"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
                  >
                    <Send className="h-5 w-5" />
                  </button>
                </div>
                <div className="mt-3 flex items-center gap-4 text-[12px] font-normal text-sidebar-label">
                  <button className="inline-flex items-center gap-2 rounded-md px-0 py-1 hover:text-muted-foreground">
                    <Paperclip className="h-4 w-4" /> Attach
                  </button>
                  <span className="h-6 w-px bg-border" />
                  <button
                    onClick={() => setFeedbackOpen(true)}
                    className="inline-flex items-center gap-2 rounded-md px-0 py-1 hover:text-muted-foreground"
                  >
                    <MessageCircle className="h-4 w-4" /> Leave Feedback
                  </button>
                </div>
              </div>
              <p className="mt-3 text-center text-xs font-normal text-muted-foreground">
                AI-generated answers are based on the NDA Playbook. Always verify with your legal team.
              </p>
            </div>
          </footer>
        </section>

        {selectedClause && (
          <ClausePanel
            role={role}
            clause={selectedClause}
            editedClause={editedClause}
            isEditingClause={isEditingClause}
            onClose={() => setSelectedClauseNumber(null)}
            onFeedback={() => setFeedbackOpen(true)}
            onEdit={() => setIsEditingClause(true)}
            onEditedClauseChange={setEditedClause}
          />
        )}
      </div>

      <FeedbackDialog open={feedbackOpen} onOpenChange={setFeedbackOpen} onSubmit={submitFeedback} />
      <UploadDialog open={uploadOpen} onOpenChange={setUploadOpen} />
    </main>
  );
}

function VaultGraph({
  selectedNode,
  onSelectNode,
}: {
  selectedNode: string;
  onSelectNode: (nodeId: string) => void;
}) {
  const nodeById = useMemo(() => new Map(vaultNodes.map((node) => [node.id, node])), []);
  const selected = nodeById.get(selectedNode) ?? vaultNodes[0];

  return (
    <section className="mx-auto h-[32vh] min-h-[220px] w-full max-w-5xl border-b border-border pb-4">
      <div className="relative h-full overflow-hidden rounded-2xl bg-panel-card">
        <svg viewBox="0 0 760 250" role="img" aria-label="Obsidian-style vault graph" className="h-full w-full">
          {vaultLinks.map((link) => {
            const from = nodeById.get(link.from);
            const to = nodeById.get(link.to);
            if (!from || !to) return null;

            return (
              <line
                key={`${link.from}-${link.to}`}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                className="stroke-graph-link"
                strokeWidth={selectedNode === link.from || selectedNode === link.to ? 1.8 : 1.1}
              />
            );
          })}
          {vaultNodes.map((node) => {
            const isSelected = selectedNode === node.id;
            const radius = node.type === "root" ? 13 : node.type === "folder" ? 10 : 6;
            const fillClass = isSelected
              ? "fill-graph-selected"
              : node.type === "root"
                ? "fill-graph-root"
                : node.type === "folder"
                  ? "fill-graph-folder"
                  : "fill-graph-file";

            return (
              <g
                key={node.id}
                role="button"
                tabIndex={0}
                onClick={() => onSelectNode(node.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") onSelectNode(node.id);
                }}
                className="cursor-pointer outline-none"
              >
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={radius + 9}
                  className={`${isSelected ? "fill-graph-selected/10" : "fill-transparent"} transition-colors`}
                />
                <circle cx={node.x} cy={node.y} r={radius} className={`${fillClass} transition-colors`} />
                <text
                  x={node.x}
                  y={node.y + radius + 16}
                  textAnchor="middle"
                  className="select-none fill-muted-foreground text-[10px] transition-colors"
                >
                  {node.label}
                </text>
              </g>
            );
          })}
        </svg>
        <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full border border-input bg-background/80 px-3 py-1.5 text-[12px] text-muted-foreground shadow-[0_1px_3px_rgba(0,0,0,0.06)] backdrop-blur">
          {selected.type === "folder" ? <Folder className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
          <span>{selected.label}</span>
        </div>
      </div>
    </section>
  );
}

function ClausePanel({
  role,
  clause,
  editedClause,
  isEditingClause,
  onClose,
  onFeedback,
  onEdit,
  onEditedClauseChange,
}: {
  role: Role;
  clause: Clause;
  editedClause: string;
  isEditingClause: boolean;
  onClose: () => void;
  onFeedback: () => void;
  onEdit: () => void;
  onEditedClauseChange: (value: string) => void;
}) {
  const isBusinessUser = role === "Business User";

  return (
    <aside className="hidden w-[340px] shrink-0 overflow-y-auto border-l bg-background p-4 text-[14px] leading-[1.6] text-body-text lg:block">
      <div className="flex items-start justify-between gap-4 border-b pb-4">
        <div>
          <h2 className="text-base font-medium leading-6 text-foreground">
            Clause {clause.number} · {clause.title}
          </h2>
          {isBusinessUser && (
            <span className="mt-2 inline-flex rounded-full bg-suggested-chip px-2.5 py-1 text-xs font-normal text-body-text">
              Plain Language View
            </span>
          )}
        </div>
        <button onClick={onClose} aria-label="Close clause panel" className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-4 space-y-3">
        <InfoCard title="Why it matters">
          {isBusinessUser ? simplifyText(clause.why) : clause.why}
        </InfoCard>
        <InfoCard title="What to watch for">
          {isBusinessUser ? simplifyText(clause.watch) : clause.watch}
        </InfoCard>
        <div className="rounded-xl border bg-panel-card p-4">
          <h3 className="text-sm font-medium text-foreground">Positions</h3>
          <div className="mt-3 space-y-3 text-sm">
            <PositionRow tone="green" label="Preferred" text={clause.preferred} />
            <PositionRow tone="yellow" label="Fallback 1" text={clause.fallback1} />
            <PositionRow tone="yellow" label="Fallback 2" text={clause.fallback2} />
            <PositionRow tone="red" label="Red Line" text={clause.redLine} />
          </div>
        </div>
        <InfoCard title="Escalation Trigger">
          <span className="italic text-muted-foreground">{clause.escalation}</span>
        </InfoCard>

        {role === "Admin" && (
          <div className="space-y-3 rounded-xl border bg-panel-card p-4">
            <button
              onClick={onEdit}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Edit Clause
            </button>
            {isEditingClause && (
              <textarea
                value={editedClause}
                onChange={(event) => onEditedClauseChange(event.target.value)}
                className="min-h-36 w-full resize-none rounded-lg border bg-background p-3 text-sm leading-6 outline-none focus:border-sidebar-label"
              />
            )}
          </div>
        )}

        {role !== "Business User" && (
          <button
            onClick={onFeedback}
            className="w-full rounded-lg border border-input px-4 py-2.5 text-sm font-normal text-foreground hover:bg-muted"
          >
            Leave Feedback
          </button>
        )}
      </div>
    </aside>
  );
}

function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-panel-card p-4">
      <h3 className="text-sm font-medium text-foreground">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{children}</p>
    </section>
  );
}

function PositionRow({ tone, label, text }: { tone: "green" | "yellow" | "red"; label: string; text: string }) {
  const toneClass = {
    green: "text-position-green",
    yellow: "text-position-yellow",
    red: "text-red-line",
  }[tone];
  const dot = { green: "bg-position-green", yellow: "bg-position-yellow", red: "bg-red-line" }[tone];

  return (
    <div className="flex gap-2.5">
      <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${dot}`} />
      <p className="leading-6 text-muted-foreground">
        <span className={`font-medium ${toneClass}`}>{label}</span> — {text}
      </p>
    </div>
  );
}

function FeedbackDialog({
  open,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-xl border bg-background shadow-sm sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Leave Feedback</DialogTitle>
          <DialogDescription>Tell the legal team what should be reviewed.</DialogDescription>
        </DialogHeader>
        <textarea
          placeholder="Describe your feedback..."
          className="min-h-32 w-full resize-none rounded-lg border bg-background p-3 text-sm outline-none focus:border-sidebar-label"
        />
        <label className="flex items-center gap-2 text-sm text-foreground">
          <Checkbox />
          Flag as Outdated
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

function UploadDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-xl border bg-background shadow-sm sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Upload Playbook</DialogTitle>
          <DialogDescription>Add a playbook file to start a new contract workspace.</DialogDescription>
        </DialogHeader>
        <div className="flex min-h-52 flex-col items-center justify-center rounded-xl border border-dashed bg-panel-card p-8 text-center">
          <UploadCloud className="h-10 w-10 text-muted-foreground" />
          <p className="mt-4 text-sm font-medium text-foreground">Drop your playbook here</p>
          <p className="mt-1 text-xs text-muted-foreground">PDF, DOCX, or TXT · UI preview only</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function shortClauseTitle(title: string) {
  return title.replace(/ \(.+\)/, "");
}

function simplifyText(text: string) {
  return text
    .replace("SIEMENSCH", "the company")
    .replace("commercially unreasonable", "too burdensome")
    .replace("confidentiality duties", "confidentiality obligations");
}

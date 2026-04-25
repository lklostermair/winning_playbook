import { createFileRoute } from "@tanstack/react-router";
import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Moon, Plus, Send, Sun, UploadCloud } from "lucide-react";
import { toast } from "sonner";

import {
  applyRuleUpdate,
  askPlaybook,
  draftRuleUpdate,
  generateChatTitle,
  getHealth,
  getIdentity,
  getIngests,
  getPlaybooks,
  getRule,
  getRules,
  publishIngest,
  speakVoice,
  transcribeVoice,
  warmupVoiceModel,
  type GitIdentity,
  type IngestDraftSummary,
  type PlaybookSummary,
  type RuleDetail,
  type RuleSummary,
  type ConversationMessage,
} from "@/lib/api";
import {
  AnswerMessage,
  RulePanel,
  UploadDialog,
  VaultGraph,
  latestCitedRuleIds,
  shortHash,
  shouldUseDarkModeByTime,
  type ChatMessage,
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

const VOICE_SILENCE_THRESHOLD = 0.018;
const VOICE_SILENCE_DURATION_MS = 1200;
const VOICE_MIN_RECORDING_MS = 900;
const DEFAULT_AUDIO_INPUT_ID = "default";

type WorkWindow = {
  id: string;
  title: string | null;
  messages: ChatMessage[];
  input: string;
  updatedAt: number;
};

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "dandelion" },
      {
        name: "description",
        content: "Source-grounded legal playbook assistant with lawyer approval workflow.",
      },
    ],
  }),
  component: LivingPlaybookApp,
});

const dandelionThinkingPixels = [
  [2, 0],
  [1, 1],
  [2, 1],
  [3, 1],
  [0, 2],
  [1, 2],
  [2, 2],
  [3, 2],
  [4, 2],
  [1, 3],
  [2, 3],
  [3, 3],
  [2, 4],
] as const;

function DandelionThinkingMark() {
  return (
    <div className="dandelion-thinking" aria-label="dandelion is answering">
      <div className="dandelion-thinking-mark" aria-hidden="true">
        {dandelionThinkingPixels.map(([x, y], index) => (
          <span
            key={`${x}-${y}`}
            style={
              {
                "--x": x,
                "--y": y,
              } as CSSProperties
            }
          />
        ))}
      </div>
      <span>dandelion is answering</span>
    </div>
  );
}

function createWorkWindow(): WorkWindow {
  return {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `window-${Date.now()}`,
    messages: [],
    input: "",
    title: null,
    updatedAt: Date.now(),
  };
}

function windowTitle(workWindow: WorkWindow) {
  return workWindow.title ?? "New chat";
}

function LivingPlaybookApp() {
  const [gitIdentity, setGitIdentity] = useState<GitIdentity | null>(null);
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
  const [selectedPlaybookIds, setSelectedPlaybookIds] = useState<string[]>(["nda"]);
  const [allRules, setAllRules] = useState<Record<string, RuleSummary[]>>({});
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(null);
  const [selectedRule, setSelectedRule] = useState<RuleDetail | null>(null);
  const [ingests, setIngests] = useState<IngestDraftSummary[]>([]);
  const [workWindows, setWorkWindows] = useState<WorkWindow[]>(() => [
    {
      id: "window-initial",
      title: null,
      messages: [],
      input: "",
      updatedAt: 0,
    },
  ]);
  const [activeWindowId, setActiveWindowId] = useState("window-initial");
  const [loadingWindowIds, setLoadingWindowIds] = useState<string[]>([]);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [isTranscribingVoice, setIsTranscribingVoice] = useState(false);
  const [voiceActivityLevel, setVoiceActivityLevel] = useState(0.25);
  const [audioInputDevices, setAudioInputDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedAudioInputId, setSelectedAudioInputId] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_AUDIO_INPUT_ID;
    return window.localStorage.getItem("dandelion-audio-input-id") ?? DEFAULT_AUDIO_INPUT_ID;
  });
  const [uploadOpen, setUploadOpen] = useState(false);
  const [updateInstruction, setUpdateInstruction] = useState("");
  const [draftingUpdate, setDraftingUpdate] = useState(false);
  const [committingUpdate, setCommittingUpdate] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const voiceStreamRef = useRef<MediaStream | null>(null);
  const voiceChunksRef = useRef<Blob[]>([]);
  const voiceWindowIdRef = useRef<string>("window-initial");
  const voiceAudioContextRef = useRef<AudioContext | null>(null);
  const voiceAnalyserFrameRef = useRef<number | null>(null);
  const voiceRecordingStartedAtRef = useRef(0);
  const voiceSilentSinceRef = useRef<number | null>(null);
  const answerAudioRef = useRef<HTMLAudioElement | null>(null);
  const answerAudioUrlRef = useRef<string | null>(null);
  const [updateDraft, setUpdateDraft] = useState({
    section: "Fallback Position",
    newText: "",
    reason: "",
  });

  const refreshGitIdentity = useCallback(async () => {
    try {
      setGitIdentity(await getIdentity());
    } catch {
      setGitIdentity(null);
    }
  }, []);

  const refreshAll = useCallback(
    async (playbookId = selectedPlaybookId) => {
      try {
        setApiStatus("checking");
        await getHealth();
        setApiStatus("ok");
        void refreshGitIdentity();
        const [playbookList, ingestList] = await Promise.all([
          getPlaybooks(),
          getIngests(playbookId),
        ]);
        setPlaybooks(playbookList);
        setSelectedPlaybookIds((current) => {
          const availableIds = new Set(playbookList.map((playbook) => playbook.playbook_id));
          const retained = current.filter((playbookId) => availableIds.has(playbookId));
          if (retained.length > 0) return retained;
          if (availableIds.has(playbookId)) return [playbookId];
          return playbookList[0] ? [playbookList[0].playbook_id] : [playbookId];
        });
        setIngests(ingestList);
        const ruleEntries = await Promise.all(
          playbookList.map(async (playbook) => {
            const ruleList = await getRules(playbook.playbook_id);
            return [playbook.playbook_id, ruleList] as [string, RuleSummary[]];
          }),
        );
        setAllRules(Object.fromEntries(ruleEntries));
      } catch (error) {
        setApiStatus("down");
        toast.error(error instanceof Error ? error.message : "Backend is not reachable.");
      }
    },
    [refreshGitIdentity, selectedPlaybookId],
  );

  useEffect(() => {
    void refreshAll(selectedPlaybookId);
  }, [refreshAll, selectedPlaybookId]);

  useEffect(() => {
    void refreshGitIdentity();
  }, [refreshGitIdentity]);

  useEffect(() => {
    void warmupVoiceModel().catch(() => undefined);
  }, []);

  useEffect(() => {
    void refreshAudioInputDevices();
    const mediaDevices = navigator.mediaDevices;
    if (!mediaDevices?.addEventListener) return;
    const handleDeviceChange = () => void refreshAudioInputDevices();
    mediaDevices.addEventListener("devicechange", handleDeviceChange);
    return () => mediaDevices.removeEventListener("devicechange", handleDeviceChange);
  }, []);

  useEffect(() => {
    window.localStorage.setItem("dandelion-audio-input-id", selectedAudioInputId);
  }, [selectedAudioInputId]);

  useEffect(() => {
    window.localStorage.setItem("living-playbook-theme", isDarkMode ? "dark" : "light");
  }, [isDarkMode]);

  useEffect(() => {
    return () => {
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        recorder.stop();
      }
      stopAnswerAudio();
      voiceStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

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
  const activeWindow =
    workWindows.find((workWindow) => workWindow.id === activeWindowId) ?? workWindows[0]!;
  const messages = activeWindow.messages;
  const input = activeWindow.input;
  const activeWindowTitle = windowTitle(activeWindow);
  const loading = loadingWindowIds.includes(activeWindowId);
  const citedRuleIds = useMemo(() => latestCitedRuleIds(messages), [messages]);

  function updateActiveWindowInput(nextInput: string) {
    const now = Date.now();
    setWorkWindows((current) =>
      current.map((workWindow) =>
        workWindow.id === activeWindowId
          ? { ...workWindow, input: nextInput, updatedAt: now }
          : workWindow,
      ),
    );
  }

  function createAndOpenWindow() {
    const nextWindow = createWorkWindow();
    setWorkWindows((current) => [nextWindow, ...current]);
    setActiveWindowId(nextWindow.id);
    setSelectedRuleId(null);
  }

  function togglePlaybookScope(playbookId: string) {
    setSelectedPlaybookIds((current) => {
      if (current.includes(playbookId)) {
        if (current.length === 1) return current;
        const next = current.filter((id) => id !== playbookId);
        if (selectedPlaybookId === playbookId) {
          setSelectedPlaybookId(next[0]);
          setSelectedRuleId(null);
        }
        return next;
      }
      setSelectedPlaybookId(playbookId);
      setSelectedRuleId(null);
      return [...current, playbookId];
    });
  }

  function openPlaybook(playbookId: string) {
    setSelectedPlaybookId(playbookId);
    setSelectedPlaybookIds((current) =>
      current.includes(playbookId) ? current : [...current, playbookId],
    );
    setSelectedRuleId(null);
  }

  function openRule(ruleId: string, playbookId = selectedPlaybookId) {
    if (playbookId !== selectedPlaybookId) {
      setSelectedPlaybookId(playbookId);
      setSelectedPlaybookIds((current) =>
        current.includes(playbookId) ? current : [...current, playbookId],
      );
    }
    setSelectedRuleId(ruleId);
  }

  async function refreshAudioInputDevices() {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const devices = await navigator.mediaDevices.enumerateDevices();
    setAudioInputDevices(
      devices.filter(
        (device) =>
          device.kind === "audioinput" &&
          device.deviceId &&
          device.deviceId !== DEFAULT_AUDIO_INPUT_ID,
      ),
    );
  }

  async function submitQuestion(
    question = input,
    targetWindowId = activeWindowId,
    speakResponse = false,
  ) {
    const trimmed = question.trim();
    if (!trimmed || loadingWindowIds.includes(targetWindowId)) return;

    const targetWindow = workWindows.find((workWindow) => workWindow.id === targetWindowId);
    const shouldGenerateTitle =
      targetWindow !== undefined &&
      targetWindow.title === null &&
      !targetWindow.messages.some((message) => message.role === "user");
    const userMessage: ChatMessage = { id: Date.now(), role: "user", text: trimmed };
    const now = Date.now();
    setWorkWindows((current) =>
      current.map((workWindow) =>
        workWindow.id === targetWindowId
          ? {
              ...workWindow,
              input: "",
              messages: [...workWindow.messages, userMessage],
              updatedAt: now,
            }
          : workWindow,
      ),
    );
    setLoadingWindowIds((current) => [...current, targetWindowId]);
    stopAnswerAudio();
    try {
      if (shouldGenerateTitle) {
        generateChatTitle(trimmed)
          .then(({ title }) => {
            const cleanTitle = title.trim();
            if (!cleanTitle) return;
            setWorkWindows((current) =>
              current.map((workWindow) =>
                workWindow.id === targetWindowId
                  ? { ...workWindow, title: cleanTitle, updatedAt: Date.now() }
                  : workWindow,
              ),
            );
          })
          .catch(() => {
            setWorkWindows((current) =>
              current.map((workWindow) =>
                workWindow.id === targetWindowId
                  ? { ...workWindow, title: trimmed.slice(0, 64), updatedAt: Date.now() }
                  : workWindow,
              ),
            );
          });
      }
      const conversation: ConversationMessage[] = (targetWindow?.messages ?? [])
        .slice(-12)
        .map((message) => ({
          role: message.role === "user" ? "user" : "assistant",
          text: message.text,
        }));
      const answer = await askPlaybook(selectedPlaybookIds, trimmed, conversation);
      setWorkWindows((current) =>
        current.map((workWindow) =>
          workWindow.id === targetWindowId
            ? {
                ...workWindow,
                messages: [
                  ...workWindow.messages,
                  { id: Date.now() + 1, role: "ai", text: answer.answer, answer },
                ],
                updatedAt: Date.now(),
              }
            : workWindow,
        ),
      );
      if (speakResponse) {
        void speakAnswer(answer.answer);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ask failed.");
    } finally {
      setLoadingWindowIds((current) => current.filter((id) => id !== targetWindowId));
    }
  }

  async function draftSelectedRuleUpdate() {
    if (!selectedRule || !updateInstruction.trim()) return;
    setDraftingUpdate(true);
    try {
      const draft = await draftRuleUpdate({
        playbook_id: selectedRule.playbook_id,
        target_rule_id: selectedRule.rule.rule_id,
        instruction: updateInstruction.trim(),
      });
      setUpdateDraft({
        section: draft.section,
        reason: draft.reason,
        newText: draft.new_text,
      });
      toast.success("Drafted rule update.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not draft update.");
    } finally {
      setDraftingUpdate(false);
    }
  }

  async function updateAndCommitRule() {
    const newText = updateDraft.newText.trim();
    const reason = updateDraft.reason.trim();
    if (!selectedRule || !newText || !reason) {
      toast.error("Draft an update before committing.");
      return;
    }
    setCommittingUpdate(true);
    try {
      const result = await applyRuleUpdate({
        playbook_id: selectedRule.playbook_id,
        target_rule_id: selectedRule.rule.rule_id,
        reason,
        proposed_change: {
          section: updateDraft.section,
          new_text: newText,
        },
        approved_by: gitIdentity?.github_username || gitIdentity?.name || "user",
      });
      await refreshAll(selectedRule.playbook_id);
      setSelectedRule(await getRule(selectedRule.playbook_id, selectedRule.rule.rule_id));
      setUpdateDraft({ section: "Fallback Position", newText: "", reason: "" });
      setUpdateInstruction("");
      toast.success(`Updated and committed ${shortHash(result.commit_hash)}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update rule.");
    } finally {
      setCommittingUpdate(false);
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

  async function toggleVoiceRecording() {
    if (isRecordingVoice) {
      stopVoiceRecording(true);
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      toast.error("Voice recording is not supported in this browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio:
          selectedAudioInputId === DEFAULT_AUDIO_INPUT_ID
            ? true
            : { deviceId: { exact: selectedAudioInputId } },
      });
      void refreshAudioInputDevices();
      const recorder = new MediaRecorder(stream);
      voiceChunksRef.current = [];
      voiceStreamRef.current = stream;
      voiceWindowIdRef.current = activeWindowId;
      voiceRecordingStartedAtRef.current = performance.now();
      voiceSilentSinceRef.current = null;
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) voiceChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const audioBlob = new Blob(voiceChunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        voiceChunksRef.current = [];
        if (audioBlob.size > 0) {
          void transcribeVoiceRecording(audioBlob, voiceWindowIdRef.current);
        }
      };
      recorder.start();
      startSilenceDetection(stream);
      setIsRecordingVoice(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not start microphone.");
      stopVoiceRecording(false);
    }
  }

  function stopVoiceRecording(showEmptyWarning: boolean) {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    } else if (showEmptyWarning) {
      toast.error("No voice recording was active.");
    }
    mediaRecorderRef.current = null;
    stopSilenceDetection();
    voiceStreamRef.current?.getTracks().forEach((track) => track.stop());
    voiceStreamRef.current = null;
    setIsRecordingVoice(false);
  }

  function startSilenceDetection(stream: MediaStream) {
    stopSilenceDetection();
    const AudioContextClass = window.AudioContext;
    if (!AudioContextClass) return;

    const audioContext = new AudioContextClass();
    const analyser = audioContext.createAnalyser();
    const source = audioContext.createMediaStreamSource(stream);
    const samples = new Uint8Array(analyser.fftSize);
    analyser.fftSize = 2048;
    source.connect(analyser);
    voiceAudioContextRef.current = audioContext;

    const detectSilence = () => {
      analyser.getByteTimeDomainData(samples);
      let sum = 0;
      for (const sample of samples) {
        const centered = (sample - 128) / 128;
        sum += centered * centered;
      }
      const volume = Math.sqrt(sum / samples.length);
      setVoiceActivityLevel(Math.min(1, Math.max(0.16, volume * 5.5)));
      const now = performance.now();
      const pastMinimumDuration = now - voiceRecordingStartedAtRef.current > VOICE_MIN_RECORDING_MS;

      if (volume < VOICE_SILENCE_THRESHOLD && pastMinimumDuration) {
        voiceSilentSinceRef.current ??= now;
        if (now - voiceSilentSinceRef.current > VOICE_SILENCE_DURATION_MS) {
          stopVoiceRecording(false);
          return;
        }
      } else {
        voiceSilentSinceRef.current = null;
      }

      voiceAnalyserFrameRef.current = requestAnimationFrame(detectSilence);
    };

    voiceAnalyserFrameRef.current = requestAnimationFrame(detectSilence);
  }

  function stopSilenceDetection() {
    if (voiceAnalyserFrameRef.current !== null) {
      cancelAnimationFrame(voiceAnalyserFrameRef.current);
      voiceAnalyserFrameRef.current = null;
    }
    void voiceAudioContextRef.current?.close();
    voiceAudioContextRef.current = null;
    voiceSilentSinceRef.current = null;
    setVoiceActivityLevel(0.25);
  }

  async function speakAnswer(answerText: string) {
    try {
      stopAnswerAudio();
      const audioBlob = await speakVoice(answerText);
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      audio.preload = "auto";
      answerAudioRef.current = audio;
      answerAudioUrlRef.current = audioUrl;
      audio.addEventListener(
        "ended",
        () => {
          if (answerAudioRef.current === audio) {
            stopAnswerAudio();
          }
        },
        { once: true },
      );
      await new Promise<void>((resolve, reject) => {
        if (audio.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) {
          resolve();
          return;
        }
        audio.addEventListener("canplaythrough", () => resolve(), { once: true });
        audio.addEventListener("error", () => reject(new Error("Could not load voice answer.")), {
          once: true,
        });
        audio.load();
      });
      await audio.play();
    } catch (error) {
      console.warn(error instanceof Error ? error.message : "Voice answer failed.");
    }
  }

  function stopAnswerAudio() {
    answerAudioRef.current?.pause();
    answerAudioRef.current = null;
    if (answerAudioUrlRef.current) {
      URL.revokeObjectURL(answerAudioUrlRef.current);
      answerAudioUrlRef.current = null;
    }
  }

  async function transcribeVoiceRecording(audioBlob: Blob, targetWindowId: string) {
    setIsTranscribingVoice(true);
    try {
      const { text } = await transcribeVoice(audioBlob);
      const transcript = text.trim();
      if (!transcript) {
        toast.error("No speech was detected.");
        return;
      }
      toast.success("Voice transcribed.");
      await submitQuestion(transcript, targetWindowId, true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Voice transcription failed.");
    } finally {
      setIsTranscribingVoice(false);
    }
  }

  return (
    <main className={`${isDarkMode ? "dark" : ""} min-h-screen bg-background text-foreground`}>
      <div className="flex h-screen overflow-hidden">
        <aside className="hidden w-[284px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar px-5 py-5 text-[13px] text-sidebar-foreground md:flex">
          <div className="flex h-12 items-center">
            <img
              src="/dandelion_logo.png"
              alt=""
              className="relative z-10 -mr-5 h-14 w-14 -translate-y-2 object-contain dark:invert"
            />
            <div className="relative z-0 translate-y-0.5">
              <img
                src="/Siemens-logo.png"
                alt="Siemens"
                className="absolute -top-0.5 left-0 h-2.5 w-auto"
              />
              <div className="text-[20px] font-medium tracking-tight text-sidebar-primary">
                dandelion
              </div>
            </div>
          </div>

          <div className="mt-7 space-y-3">
            <div className="flex items-center gap-3 rounded-lg border border-sidebar-border bg-sidebar-panel px-3 py-2">
              {gitIdentity?.avatar_url ? (
                <img
                  src={gitIdentity.avatar_url}
                  alt=""
                  className="h-8 w-8 rounded-full bg-sidebar"
                />
              ) : (
                <div className="grid h-8 w-8 place-items-center rounded-full bg-active-item text-xs text-sidebar-primary">
                  {(gitIdentity?.github_username || gitIdentity?.name || "?").slice(0, 1)}
                </div>
              )}
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-sidebar-primary">
                  {gitIdentity?.github_username ||
                    gitIdentity?.name ||
                    (apiStatus === "down" ? "Identity unavailable" : "Loading identity")}
                </div>
                <div className="truncate text-[11px] text-sidebar-label">
                  {gitIdentity?.email ||
                    (apiStatus === "down" ? "Backend disconnected" : "Reading local Git config")}
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-sidebar-border bg-sidebar-panel p-2">
              <div className="mb-2 px-1 text-[11px] uppercase tracking-[0.08em] text-sidebar-label">
                Playbooks
              </div>
              <div className="space-y-1">
                {playbooks.map((playbook) => {
                  const selected = selectedPlaybookIds.includes(playbook.playbook_id);
                  const active = selectedPlaybookId === playbook.playbook_id;
                  return (
                    <button
                      key={playbook.playbook_id}
                      type="button"
                      onClick={() => togglePlaybookScope(playbook.playbook_id)}
                      className={`flex w-full items-center justify-between gap-3 rounded-md px-2 py-2 text-left transition ${
                        selected
                          ? "bg-active-item text-sidebar-primary"
                          : "text-sidebar-foreground hover:bg-sidebar"
                      }`}
                    >
                      <span className="truncate">{playbook.name}</span>
                      <span
                        className={`h-3 w-3 rounded-sm border ${
                          selected
                            ? "border-primary bg-primary"
                            : "border-sidebar-border bg-transparent"
                        } ${active ? "ring-2 ring-primary/25" : ""}`}
                      />
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="mt-7 border-t border-sidebar-border pt-5">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[11px] uppercase tracking-[0.08em] text-sidebar-label">
                Status
              </span>
              <span
                className={`inline-flex rounded-md px-3 py-1.5 text-xs font-medium ${
                  apiStatus === "ok"
                    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {apiStatus === "ok" ? "Connected" : apiStatus}
              </span>
            </div>
          </div>

          <div className="mt-7 border-t border-sidebar-border pt-5">
            <div className="mb-3 flex items-center justify-between text-[11px] uppercase tracking-[0.08em] text-sidebar-label">
              <span>Window Memory</span>
              <button
                onClick={createAndOpenWindow}
                aria-label="Open new window"
                className="grid h-7 w-7 place-items-center rounded-full border border-sidebar-border text-sidebar-primary transition hover:bg-sidebar-panel"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="max-h-48 space-y-2 overflow-y-auto pr-1">
              {workWindows.map((workWindow) => {
                const active = workWindow.id === activeWindowId;
                const waiting = loadingWindowIds.includes(workWindow.id);
                return (
                  <button
                    key={workWindow.id}
                    onClick={() => {
                      setActiveWindowId(workWindow.id);
                      setSelectedRuleId(null);
                    }}
                    className={`w-full rounded-lg border px-3 py-2 text-left text-sm leading-5 transition ${
                      active
                        ? "border-primary bg-active-item text-sidebar-primary"
                        : "border-sidebar-border bg-sidebar-panel text-sidebar-foreground hover:border-sidebar-label"
                    }`}
                  >
                    <span className="block truncate">{windowTitle(workWindow)}</span>
                    <span className="mt-1 block text-[11px] text-sidebar-label">
                      {waiting
                        ? "Reading sources"
                        : `${workWindow.messages.length} message${
                            workWindow.messages.length === 1 ? "" : "s"
                          }`}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </aside>

        <section className="relative flex min-w-0 flex-1 flex-col bg-background">
          <header className="flex h-16 shrink-0 items-center justify-between border-b px-6">
            <div>
              <div className="max-w-[52vw] truncate text-lg font-medium">{activeWindowTitle}</div>
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

          <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-48 text-[14px] leading-[1.6] text-body-text">
            <div className="sticky top-0 z-20 -mx-6 bg-background/95 px-6 pb-3 pt-5 backdrop-blur">
              <VaultGraph
                playbooks={playbooks}
                selectedPlaybookId={selectedPlaybookId}
                selectedPlaybookIds={selectedPlaybookIds}
                allRules={allRules}
                selectedRuleId={selectedRuleId}
                citedRuleIds={citedRuleIds}
                onSelectPlaybook={(playbookId) => {
                  openPlaybook(playbookId);
                }}
                onSelectRule={(ruleId, playbookId) => openRule(ruleId, playbookId)}
              />
            </div>

            {messages.length === 0 ? (
              <div className="mx-auto mt-8 flex max-w-4xl flex-wrap justify-center gap-3">
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
                    <AnswerMessage key={message.id} message={message} onSelectRule={openRule} />
                  ),
                )}
                {loading && (
                  <div className="mx-auto flex max-w-3xl">
                    <DandelionThinkingMark />
                  </div>
                )}
              </div>
            )}
          </div>

          <footer className="pointer-events-none absolute bottom-0 left-0 right-0 px-6 pb-6 pt-4">
            <div className="pointer-events-auto mx-auto max-w-[860px]">
              <div
                className={`relative rounded-lg border bg-background px-4 py-3 transition-all duration-500 ${
                  isRecordingVoice
                    ? "min-h-32 overflow-visible border-transparent bg-transparent shadow-none"
                    : "min-h-0 overflow-hidden border-input shadow-[0_1px_3px_rgba(0,0,0,0.06)]"
                }`}
              >
                <div
                  className={`flex items-end gap-3 transition-all duration-500 ${
                    isRecordingVoice ? "opacity-0 pointer-events-none" : "translate-y-0 opacity-100"
                  }`}
                >
                  <textarea
                    value={input}
                    onChange={(event) => updateActiveWindowInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        void submitQuestion();
                      }
                    }}
                    placeholder="Ask dandelion..."
                    rows={1}
                    className="max-h-32 min-h-12 flex-1 resize-none bg-transparent py-3 text-[14px] leading-[1.6] text-body-text outline-none placeholder:text-muted-foreground"
                  />
                  <button
                    onClick={() => void toggleVoiceRecording()}
                    disabled={loading || isTranscribingVoice}
                    aria-label="Start voice input"
                    className={`voice-mic-button grid h-10 w-10 shrink-0 translate-x-4 place-items-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50 ${
                      isRecordingVoice ? "voice-mic-button-hidden" : ""
                    }`}
                  >
                    <span className="voice-idle-mic-glow" aria-hidden="true" />
                    <img src="/microphone-cropped.png" alt="" className="voice-idle-mic-image" />
                  </button>
                  <button
                    onClick={() => void submitQuestion()}
                    disabled={loading || isTranscribingVoice}
                    aria-label="Send message"
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50"
                  >
                    <Send className="h-5 w-5" />
                  </button>
                </div>
                <button
                  onClick={() => void toggleVoiceRecording()}
                  aria-label="Stop voice input"
                  className={`voice-recorder-stage absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 outline-none transition-all duration-700 ${
                    isRecordingVoice
                      ? "scale-100 opacity-100"
                      : "pointer-events-none scale-95 opacity-0"
                  }`}
                  style={
                    {
                      "--voice-level": voiceActivityLevel.toFixed(3),
                    } as CSSProperties
                  }
                >
                  <span className="voice-orb" aria-hidden="true" />
                  <span className="voice-orb-shield" aria-hidden="true" />
                  <img src="/microphone-cropped.png" alt="" className="voice-microphone-image" />
                </button>
                <div
                  className={`mt-2 flex items-center gap-4 text-[12px] text-sidebar-label transition-opacity duration-500 ${
                    isRecordingVoice ? "opacity-0 pointer-events-none" : "opacity-100"
                  }`}
                >
                  <Select
                    value={selectedAudioInputId}
                    onValueChange={setSelectedAudioInputId}
                    disabled={isRecordingVoice || isTranscribingVoice}
                  >
                    <SelectTrigger
                      aria-label="Microphone input"
                      className="h-7 w-[210px] rounded-md border-border bg-transparent px-2 text-xs"
                    >
                      <SelectValue placeholder="Microphone" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={DEFAULT_AUDIO_INPUT_ID}>Default microphone</SelectItem>
                      {audioInputDevices.map((device, index) => (
                        <SelectItem key={device.deviceId} value={device.deviceId}>
                          {device.label || `Microphone ${index + 1}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="h-5 w-px bg-border" />
                  <span>
                    {isTranscribingVoice ? "Transcribing voice..." : "Shift+Enter for a line break"}
                  </span>
                </div>
              </div>
              <p className="mt-2 text-center text-xs text-muted-foreground">
                Answers are source-grounded playbook guidance, not legal certainty.
              </p>
            </div>
          </footer>
        </section>

        <RulePanel
          role="Lawyer"
          ruleDetail={selectedRule}
          updateDraft={updateDraft}
          onUpdateDraftChange={setUpdateDraft}
          updateInstruction={updateInstruction}
          onUpdateInstructionChange={setUpdateInstruction}
          draftingUpdate={draftingUpdate}
          committingUpdate={committingUpdate}
          onDraftUpdate={() => void draftSelectedRuleUpdate()}
          onSubmitUpdate={() => void updateAndCommitRule()}
          onClose={() => setSelectedRuleId(null)}
        />
      </div>
      <UploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        playbookId={selectedPlaybookId}
        playbookName={selectedPlaybook?.name ?? "NDA Playbook"}
        drafts={ingests}
        onUploaded={(draft) => {
          setSelectedPlaybookId(draft.playbook_id);
          setSelectedPlaybookIds((current) =>
            current.includes(draft.playbook_id) ? current : [...current, draft.playbook_id],
          );
          setSelectedRuleId(null);
          void refreshAll(draft.playbook_id);
        }}
        onPublish={(draft) => void publishDraft(draft)}
      />
    </main>
  );
}

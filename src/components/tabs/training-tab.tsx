"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import * as Workspace from "@/components/workspace-context";
import type { AiPermissionState } from "@/components/assistant/assistant-types";
import { AiDefenseFeedbackDetails, QuestionRevisionForm } from "@/components/training/ai-defense-results";

type TrainingJudgeFeedback = {
  score: number;
  dimensions: {
    questionResponse: number;
    keyPointCoverage: number;
    logicalStructure: number;
    evidenceQuality: number;
    expressionAccuracy: number;
  };
  summary: string;
  hitPoints: string[];
  missingPoints: string[];
  expressionRisks: string[];
  improvedAnswer: string;
  followUpQuestion: string;
};

type TrainingJudgeTurn = {
  prompt: string;
  transcript: string;
  summary?: string;
};

type TrainingJudgeStage = "idle" | "recording" | "transcribing" | "editing" | "judging" | "feedback";

type BrowserSpeechRecognitionEvent = {
  results: ArrayLike<{
    0?: {
      transcript?: string;
    };
  }>;
};

type BrowserSpeechRecognitionErrorEvent = {
  error?: string;
};

type BrowserSpeechRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onend: (() => void) | null;
  onerror: ((event: BrowserSpeechRecognitionErrorEvent) => void) | null;
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null;
  start: () => void;
  stop: () => void;
};

type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition;
type BrowserSpeechRecognitionMode = "fallback" | "preview";

const getBrowserSpeechRecognition = () => {
  if (typeof window === "undefined") {
    return null;
  }

  const windowWithSpeechRecognition = window as Window & {
    SpeechRecognition?: BrowserSpeechRecognitionConstructor;
    webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
  };

  return windowWithSpeechRecognition.SpeechRecognition ?? windowWithSpeechRecognition.webkitSpeechRecognition ?? null;
};

export default function TrainingTab() {
  const {
    trainingQuestions,
    trainingSessions,
    trainingStats,
    trainingPanel,
    setTrainingPanel,
    isSaving,
    trainingQuestionDraft,
    setTrainingQuestionDraft,
    editingTrainingQuestionId,
    selectedTrainingQuestionIds,
    setActiveDrillQuestionId,
    selectedDrillCategory,
    setSelectedDrillCategory,
    qaDrillStats,
    trainingTimerDuration,
    trainingTimerCustomMinutes,
    setTrainingTimerCustomMinutes,
    trainingTimerElapsed,
    trainingTimerRunning,
    setTrainingTimerRunning,
    trainingSessionTitle,
    setTrainingSessionTitle,
    trainingSessionNotes,
    setTrainingSessionNotes,
    canManageTrainingQuestion,
    activeDrillQuestion,
    resetTrainingQuestionDraft,
    saveTrainingQuestion,
    editTrainingQuestion,
    openQuestionImportModal,
    deleteTrainingQuestion,
    toggleTrainingQuestionSelection,
    selectAllManageableTrainingQuestions,
    deleteSelectedTrainingQuestions,
    drawRandomTrainingQuestion,
    recordDrillAnswer,
    applyTrainingTimerPreset,
    applyCustomTrainingTimer,
    resetTrainingTimer,
    saveTrainingSession,
  } = Workspace.useWorkspaceContext();

  const {
    HelpCircle,
    Download,
    Pause,
    Play,
    RotateCcw,
    Search,
    Shuffle,
    Timer,
    Upload,
    allTrainingQuestionCategoriesLabel,
    trainingQuestionCategories,
    trainingTimerPresets,
    surfaceCardClassName,
    fieldClassName,
    textareaClassName,
    formatSeconds,
    SectionHeader,
    DemoResetNote,
    EmptyState,
    ActionButton,
  } = Workspace;

  const [trainingQuestionSearch, setTrainingQuestionSearch] = useState("");
  const drillAllCategoryLabel = allTrainingQuestionCategoriesLabel || "全部分类";
  const [trainingQuestionCategoryFilter, setTrainingQuestionCategoryFilter] = useState(drillAllCategoryLabel);
  const normalizedTrainingQuestionSearch = trainingQuestionSearch.trim().toLowerCase();
  const filteredTrainingQuestions = useMemo(() => {
    return trainingQuestions.filter((item) =>
      (trainingQuestionCategoryFilter === drillAllCategoryLabel || item.category === trainingQuestionCategoryFilter) &&
      (!normalizedTrainingQuestionSearch ||
        [item.question, item.answerPoints, item.category, item.createdByName]
          .filter(Boolean)
          .some((value) => `${value}`.toLowerCase().includes(normalizedTrainingQuestionSearch))),
    );
  }, [drillAllCategoryLabel, normalizedTrainingQuestionSearch, trainingQuestionCategoryFilter, trainingQuestions]);
  const drillCategoryOptions = useMemo(() => {
    const categoryCounts = new Map<string, number>();
    const knownCategories = trainingQuestionCategories as readonly string[];

    for (const question of trainingQuestions) {
      categoryCounts.set(question.category, (categoryCounts.get(question.category) ?? 0) + 1);
    }

    const knownOptions = trainingQuestionCategories
      .map((category) => ({
        category,
        count: categoryCounts.get(category) ?? 0,
      }))
      .filter((item) => item.count > 0);
    const customOptions = Array.from(categoryCounts.entries())
      .filter(([category]) => !knownCategories.includes(category))
      .map(([category, count]) => ({ category, count }));

    return [
      { category: drillAllCategoryLabel, count: trainingQuestions.length },
      ...knownOptions,
      ...customOptions,
    ];
  }, [drillAllCategoryLabel, trainingQuestionCategories, trainingQuestions]);
  useEffect(() => {
    if (drillCategoryOptions.some((item) => item.category === trainingQuestionCategoryFilter)) {
      return;
    }

    setTrainingQuestionCategoryFilter(drillAllCategoryLabel);
  }, [drillAllCategoryLabel, drillCategoryOptions, trainingQuestionCategoryFilter]);

  const exportTrainingQuestionQueryParts = [
    trainingQuestionSearch.trim() ? `q=${encodeURIComponent(trainingQuestionSearch.trim())}` : "",
    trainingQuestionCategoryFilter !== drillAllCategoryLabel
      ? `category=${encodeURIComponent(trainingQuestionCategoryFilter)}`
      : "",
  ].filter(Boolean);
  const exportTrainingQuestionsUrl = `/api/training/questions/export${
    exportTrainingQuestionQueryParts.length > 0 ? `?${exportTrainingQuestionQueryParts.join("&")}` : ""
  }`;
  const [aiJudgeStage, setAiJudgeStage] = useState<TrainingJudgeStage>("idle");
  const [aiJudgeViewOpen, setAiJudgeViewOpen] = useState(false);
  const [aiJudgeQuestionId, setAiJudgeQuestionId] = useState<string | null>(null);
  const [aiJudgePrompt, setAiJudgePrompt] = useState("");
  const [aiJudgeTranscript, setAiJudgeTranscript] = useState("");
  const [aiJudgeTranscriptDraft, setAiJudgeTranscriptDraft] = useState("");
  const [aiJudgeLiveTranscript, setAiJudgeLiveTranscript] = useState("");
  const [aiJudgeFeedback, setAiJudgeFeedback] = useState<TrainingJudgeFeedback | null>(null);
  const [aiJudgeTurns, setAiJudgeTurns] = useState<TrainingJudgeTurn[]>([]);
  const [aiJudgeSessionId, setAiJudgeSessionId] = useState("");
  const [aiJudgeAttemptId, setAiJudgeAttemptId] = useState("");
  const [aiJudgeSummary, setAiJudgeSummary] = useState<{ averageScore: number; strongestDimension: string; weakestDimension: string } | null>(null);
  const [aiJudgeRevisionOpen, setAiJudgeRevisionOpen] = useState(false);
  const [aiJudgeRevisionPoints, setAiJudgeRevisionPoints] = useState("");
  const [aiJudgeRevisionReason, setAiJudgeRevisionReason] = useState("");
  const [aiJudgeRevisionPending, setAiJudgeRevisionPending] = useState(false);
  const [aiJudgeRevisionSubmitted, setAiJudgeRevisionSubmitted] = useState(false);
  const [aiJudgeError, setAiJudgeError] = useState("");
  const [aiJudgePermission, setAiJudgePermission] = useState<AiPermissionState | null>(null);
  const [aiJudgePermissionLoading, setAiJudgePermissionLoading] = useState(true);
  const [aiJudgePermissionError, setAiJudgePermissionError] = useState("");
  const [aiJudgeRecordingSeconds, setAiJudgeRecordingSeconds] = useState(0);
  const aiJudgeSpeechRecognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const aiJudgeSpeechTranscriptRef = useRef("");
  const aiJudgeSpeechModeRef = useRef<BrowserSpeechRecognitionMode | null>(null);
  const aiJudgeSpeechStopRequestedRef = useRef(false);
  const aiJudgeSpeechErrorHandledRef = useRef(false);
  const aiJudgeMediaRecorderRef = useRef<MediaRecorder | null>(null);
  const aiJudgeAudioChunksRef = useRef<Blob[]>([]);
  const aiJudgeStreamRef = useRef<MediaStream | null>(null);

  const currentAiJudgeQuestion =
    trainingQuestions.find((question) => question.id === aiJudgeQuestionId) ?? trainingQuestions[0] ?? null;
  const currentAiJudgePrompt = aiJudgePrompt || currentAiJudgeQuestion?.question || "";
  const aiJudgeAccessMessage = aiJudgePermissionLoading
    ? "正在读取 AI 点评权限，请稍候。"
    : aiJudgePermissionError
      ? aiJudgePermissionError
      : !aiJudgePermission?.isEnabled
        ? "暂无 AI 点评权限，请联系管理员在团队管理中开启 AI 权限。"
        : aiJudgePermission.remainingCount != null && aiJudgePermission.remainingCount <= 0
          ? "AI 点评次数已用完，请联系管理员调整额度。"
          : "";
  const aiJudgeAccessBlocked = Boolean(aiJudgeAccessMessage);

  useEffect(() => {
    setAiJudgePrompt(currentAiJudgeQuestion?.question ?? "");
    setAiJudgeTranscript("");
    setAiJudgeTranscriptDraft("");
    setAiJudgeLiveTranscript("");
    setAiJudgeFeedback(null);
    setAiJudgeTurns([]);
    setAiJudgeError("");
    setAiJudgeStage("idle");
  }, [currentAiJudgeQuestion?.id, currentAiJudgeQuestion?.question]);

  useEffect(() => {
    let active = true;

    const loadAiJudgePermission = async () => {
      setAiJudgePermissionLoading(true);
      setAiJudgePermissionError("");

      try {
        const response = await fetch("/api/ai/permission", {
          credentials: "same-origin",
          cache: "no-store",
        });
        const payload = (await response.json().catch(() => null)) as
          | { permission?: AiPermissionState; message?: string }
          | null;

        if (!response.ok || !payload?.permission) {
          throw new Error(payload?.message || "AI 权限状态加载失败，请刷新后重试。");
        }

        if (active) {
          setAiJudgePermission(payload.permission);
        }
      } catch (error) {
        if (active) {
          setAiJudgePermissionError(error instanceof Error ? error.message : "AI 权限状态加载失败，请刷新后重试。");
        }
      } finally {
        if (active) {
          setAiJudgePermissionLoading(false);
        }
      }
    };

    void loadAiJudgePermission();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (aiJudgeStage !== "recording") {
      return;
    }

    const intervalId = window.setInterval(() => {
      setAiJudgeRecordingSeconds((current) => current + 1);
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [aiJudgeStage]);

  useEffect(
    () => () => {
      aiJudgeSpeechStopRequestedRef.current = true;
      aiJudgeSpeechRecognitionRef.current?.stop();
      const recorder = aiJudgeMediaRecorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        recorder.stop();
      }
      aiJudgeStreamRef.current?.getTracks().forEach((track) => track.stop());
    },
    [],
  );

  const resetAiJudgeAnswer = () => {
    setAiJudgeTranscript("");
    setAiJudgeTranscriptDraft("");
    setAiJudgeLiveTranscript("");
    aiJudgeSpeechTranscriptRef.current = "";
    setAiJudgeFeedback(null);
    setAiJudgeError("");
    setAiJudgeRecordingSeconds(0);
    setAiJudgeStage("idle");
  };

  const enterManualAiJudgeAnswer = (message: string, transcript = "") => {
    const nextTranscript = transcript.trim();
    setAiJudgeTranscript(nextTranscript);
    setAiJudgeTranscriptDraft(nextTranscript);
    setAiJudgeLiveTranscript(nextTranscript);
    setAiJudgeError(message);
    setAiJudgeStage("editing");
  };

  const requestAiJudgeMicrophonePermission = async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      throw new Error("当前浏览器不支持网页录音，可直接输入回答后提交点评。");
    }

    return navigator.mediaDevices.getUserMedia({ audio: true });
  };

  const getAiJudgeMicrophoneErrorMessage = (error: unknown) => {
    const errorName = typeof (error as { name?: unknown })?.name === "string" ? (error as { name: string }).name : "";
    if (errorName === "NotAllowedError" || errorName === "SecurityError") {
      return "麦克风未授权，请在浏览器地址栏允许麦克风权限后重试；也可直接输入回答后提交点评。";
    }

    return error instanceof Error ? `${error.message}，可直接输入回答后提交点评。` : "无法启动麦克风，可直接输入回答后提交点评。";
  };

  const drawRandomAiJudgeQuestion = () => {
    if (trainingQuestions.length === 0) {
      setAiJudgeError("题库里还没有可训练的问题，请先录入题库。");
      return;
    }

    const currentQuestionId = currentAiJudgeQuestion?.id ?? null;
    const candidates =
      trainingQuestions.length === 1
        ? trainingQuestions
        : trainingQuestions.filter((question) => question.id !== currentQuestionId);
    const nextQuestion = candidates[Math.floor(Math.random() * candidates.length)];
    if (!nextQuestion) {
      return;
    }

    setAiJudgeQuestionId(nextQuestion.id);
    setAiJudgePrompt(nextQuestion.question);
    resetAiJudgeAnswer();
  };

  const uploadAiJudgeAudio = async (blob: Blob) => {
    const file = new File([blob], `ai-judge-answer-${Date.now()}.webm`, {
      type: blob.type || "audio/webm",
    });
    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch("/api/training/voice-transcripts", {
      method: "POST",
      body: formData,
      credentials: "same-origin",
      cache: "no-store",
    });
    const payload = (await response.json().catch(() => null)) as { transcript?: string; message?: string } | null;
    if (!response.ok) {
      throw new Error(payload?.message || "语音转写失败");
    }

    return payload?.transcript?.trim() || "";
  };

  const finishAiJudgeBrowserSpeech = () => {
    const mode = aiJudgeSpeechModeRef.current;
    const transcript = aiJudgeSpeechTranscriptRef.current.trim();
    aiJudgeSpeechRecognitionRef.current = null;
    aiJudgeSpeechModeRef.current = null;
    if (mode === "preview") {
      aiJudgeSpeechErrorHandledRef.current = false;
      return;
    }

    if (aiJudgeSpeechErrorHandledRef.current) {
      aiJudgeSpeechErrorHandledRef.current = false;
      return;
    }

    if (transcript) {
      setAiJudgeTranscript(transcript);
      setAiJudgeTranscriptDraft(transcript);
      setAiJudgeStage("editing");
      return;
    }

    enterManualAiJudgeAnswer("没有识别到有效语音内容，可直接输入回答后提交点评。");
  };

  const startAiJudgeBrowserSpeech = (
    SpeechRecognitionConstructor: BrowserSpeechRecognitionConstructor,
    mode: BrowserSpeechRecognitionMode = "fallback",
  ) => {
    aiJudgeSpeechTranscriptRef.current = "";
    setAiJudgeLiveTranscript("");
    aiJudgeSpeechStopRequestedRef.current = false;
    aiJudgeSpeechErrorHandledRef.current = false;
    aiJudgeSpeechModeRef.current = mode;
    const recognition = new SpeechRecognitionConstructor();
    aiJudgeSpeechRecognitionRef.current = recognition;
    recognition.lang = "zh-CN";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      const transcriptParts: string[] = [];
      for (let index = 0; index < event.results.length; index += 1) {
        const transcript = event.results[index]?.[0]?.transcript?.trim();
        if (transcript) {
          transcriptParts.push(transcript);
        }
      }
      const liveTranscript = transcriptParts.join(" ").trim();
      aiJudgeSpeechTranscriptRef.current = liveTranscript;
      setAiJudgeLiveTranscript(liveTranscript);
    };
    recognition.onerror = (event) => {
      if (aiJudgeSpeechStopRequestedRef.current) {
        return;
      }

      if (mode === "preview") {
        aiJudgeSpeechRecognitionRef.current = null;
        aiJudgeSpeechModeRef.current = null;
        return;
      }

      const permissionError = event.error === "not-allowed";
      const currentTranscript = aiJudgeSpeechTranscriptRef.current.trim();
      aiJudgeSpeechErrorHandledRef.current = true;
      aiJudgeSpeechRecognitionRef.current = null;
      enterManualAiJudgeAnswer(
        permissionError
          ? "麦克风未授权，可直接输入回答后提交点评，或允许浏览器麦克风权限后重试。"
          : "浏览器语音识别暂时不可用，可直接输入回答后提交点评。",
        currentTranscript,
      );
    };
    recognition.onend = finishAiJudgeBrowserSpeech;
    recognition.start();
    setAiJudgeStage("recording");
  };

  const startAiJudgeRecording = async () => {
    if (!currentAiJudgeQuestion) {
      setAiJudgeError("题库里还没有可训练的问题，请先录入题库。");
      return;
    }

    if (aiJudgeAccessBlocked) {
      setAiJudgeError(aiJudgeAccessMessage);
      return;
    }

    setAiJudgeError("");
    setAiJudgeTranscript("");
    setAiJudgeTranscriptDraft("");
    setAiJudgeLiveTranscript("");
    aiJudgeSpeechTranscriptRef.current = "";
    setAiJudgeFeedback(null);
    setAiJudgeRecordingSeconds(0);

    if (typeof MediaRecorder === "undefined") {
      const SpeechRecognitionConstructor = getBrowserSpeechRecognition();
      if (SpeechRecognitionConstructor) {
        try {
          const permissionStream = await requestAiJudgeMicrophonePermission();
          permissionStream.getTracks().forEach((track) => track.stop());
          startAiJudgeBrowserSpeech(SpeechRecognitionConstructor);
        } catch (error) {
          aiJudgeSpeechRecognitionRef.current = null;
          enterManualAiJudgeAnswer(getAiJudgeMicrophoneErrorMessage(error));
        }
        return;
      }

      enterManualAiJudgeAnswer("当前浏览器不支持网页录音，也无法使用浏览器语音识别，可直接输入回答后提交点评。");
      return;
    }

    try {
      const stream = await requestAiJudgeMicrophonePermission();
      aiJudgeStreamRef.current = stream;
      aiJudgeAudioChunksRef.current = [];
      const recorderOptions =
        MediaRecorder.isTypeSupported("audio/webm")
            ? { mimeType: "audio/webm" }
            : MediaRecorder.isTypeSupported("audio/mp4")
              ? { mimeType: "audio/mp4" }
              : MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
                ? { mimeType: "audio/webm;codecs=opus" }
                : MediaRecorder.isTypeSupported("audio/mp4;codecs=mp4a.40.2")
                  ? { mimeType: "audio/mp4;codecs=mp4a.40.2" }
                  : undefined;
      const recorder = new MediaRecorder(stream, recorderOptions);
      aiJudgeMediaRecorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          aiJudgeAudioChunksRef.current.push(event.data);
        }
      };
      recorder.onstop = async () => {
        setAiJudgeStage("transcribing");
        aiJudgeSpeechStopRequestedRef.current = true;
        aiJudgeSpeechRecognitionRef.current?.stop();
        aiJudgeStreamRef.current?.getTracks().forEach((track) => track.stop());
        aiJudgeStreamRef.current = null;
        const blob = new Blob(aiJudgeAudioChunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        const liveFallbackTranscript = aiJudgeSpeechTranscriptRef.current.trim();

        try {
          const transcript = await uploadAiJudgeAudio(blob);
          const confirmedTranscript = transcript || liveFallbackTranscript;
          if (!confirmedTranscript) {
            throw new Error("没有识别到有效语音内容");
          }
          setAiJudgeTranscript(confirmedTranscript);
          setAiJudgeTranscriptDraft(confirmedTranscript);
          setAiJudgeLiveTranscript(confirmedTranscript);
          setAiJudgeStage("editing");
        } catch (error) {
          if (liveFallbackTranscript) {
            setAiJudgeTranscript(liveFallbackTranscript);
            setAiJudgeTranscriptDraft(liveFallbackTranscript);
            setAiJudgeLiveTranscript(liveFallbackTranscript);
            setAiJudgeError("服务端转写失败，已保留实时识别文本，可编辑后提交点评。");
            setAiJudgeStage("editing");
            return;
          }

          enterManualAiJudgeAnswer(
            error instanceof Error ? `${error.message}，可直接输入回答后提交点评。` : "语音转写失败，可直接输入回答后提交点评。",
          );
        }
      };

      recorder.start();
      setAiJudgeStage("recording");
      const SpeechRecognitionConstructor = getBrowserSpeechRecognition();
      if (SpeechRecognitionConstructor) {
        try {
          startAiJudgeBrowserSpeech(SpeechRecognitionConstructor, "preview");
        } catch {
          aiJudgeSpeechRecognitionRef.current = null;
          aiJudgeSpeechModeRef.current = null;
        }
      }
    } catch (error) {
      aiJudgeStreamRef.current?.getTracks().forEach((track) => track.stop());
      aiJudgeStreamRef.current = null;
      enterManualAiJudgeAnswer(getAiJudgeMicrophoneErrorMessage(error));
    }
  };

  const stopAiJudgeRecording = () => {
    const recorder = aiJudgeMediaRecorderRef.current;
    if (recorder?.state === "recording") {
      aiJudgeSpeechStopRequestedRef.current = true;
      aiJudgeSpeechRecognitionRef.current?.stop();
      recorder.stop();
      return;
    }

    if (aiJudgeSpeechRecognitionRef.current) {
      aiJudgeSpeechStopRequestedRef.current = true;
      aiJudgeSpeechRecognitionRef.current.stop();
    }
  };

  const submitAiJudgeFeedback = async () => {
    if (!currentAiJudgeQuestion) {
      setAiJudgeError("请先选择一道训练题。");
      return;
    }

    if (aiJudgeAccessBlocked) {
      setAiJudgeError(aiJudgeAccessMessage);
      return;
    }

    const transcript = aiJudgeTranscriptDraft.trim();
    if (!transcript) {
      setAiJudgeError("请先输入回答内容，或完成语音回答并确认转写内容。");
      return;
    }

    setAiJudgeStage("judging");
    setAiJudgeError("");

    try {
      let sessionId = aiJudgeSessionId;
      if (!sessionId) {
        const sessionResponse = await fetch("/api/training/ai-sessions", {
          method: "POST",
          credentials: "same-origin",
        });
        const sessionPayload = (await sessionResponse.json().catch(() => null)) as
          | { session?: { id?: string }; message?: string }
          | null;
        if (!sessionResponse.ok || !sessionPayload?.session?.id) {
          throw new Error(sessionPayload?.message || "训练会话创建失败");
        }
        sessionId = sessionPayload.session.id;
        setAiJudgeSessionId(sessionId);
      }
      const response = await fetch("/api/training/ai-judge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify({
          sessionId,
          questionId: currentAiJudgeQuestion.id,
          currentPrompt: currentAiJudgePrompt,
          transcript,
          turnNumber: aiJudgeTurns.length + 1,
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { feedback?: TrainingJudgeFeedback; attempt?: { id?: string }; message?: string; permission?: AiPermissionState }
        | null;
      if (!response.ok || !payload?.feedback) {
        throw new Error(payload?.message || "AI 模拟评委暂时不可用");
      }

      if (payload.permission) {
        setAiJudgePermission(payload.permission);
      }
      setAiJudgeTranscript(transcript);
      setAiJudgeAttemptId(payload.attempt?.id ?? "");
      setAiJudgeFeedback(payload.feedback);
      setAiJudgeTurns((current) => [
        ...current,
        {
          prompt: currentAiJudgePrompt,
          transcript,
          summary: payload.feedback?.summary,
        },
      ]);
      setAiJudgeStage("feedback");
    } catch (error) {
      setAiJudgeError(error instanceof Error ? error.message : "AI 模拟评委暂时不可用");
      setAiJudgeStage("editing");
    }
  };

  const continueAiJudgeFollowUp = () => {
    if (!aiJudgeFeedback?.followUpQuestion || aiJudgeTurns.length >= 3) {
      return;
    }

    setAiJudgePrompt(aiJudgeFeedback.followUpQuestion);
    resetAiJudgeAnswer();
  };

  const completeAiJudgeSession = async () => {
    if (!aiJudgeSessionId) return;
    setAiJudgeError("");
    try {
      const response = await fetch(`/api/training/ai-sessions/${aiJudgeSessionId}/complete`, {
        method: "POST",
        credentials: "same-origin",
      });
      const payload = (await response.json().catch(() => null)) as
        | { summary?: { averageScore: number; strongestDimension: string; weakestDimension: string }; message?: string }
        | null;
      if (!response.ok || !payload?.summary) throw new Error(payload?.message || "训练记录保存失败");
      setAiJudgeSummary(payload.summary);
    } catch (error) {
      setAiJudgeError(error instanceof Error ? error.message : "训练记录保存失败");
    }
  };

  const openAiJudgeRevision = () => {
    setAiJudgeRevisionPoints(currentAiJudgeQuestion?.answerPoints ?? "");
    setAiJudgeRevisionReason("");
    setAiJudgeRevisionOpen(true);
    setAiJudgeRevisionSubmitted(false);
  };

  const submitAiJudgeRevision = async () => {
    if (!currentAiJudgeQuestion || !aiJudgeAttemptId) return;
    setAiJudgeRevisionPending(true);
    setAiJudgeError("");
    try {
      const response = await fetch("/api/training/question-revisions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          questionId: currentAiJudgeQuestion.id,
          attemptId: aiJudgeAttemptId,
          proposedAnswerPoints: aiJudgeRevisionPoints,
          reason: aiJudgeRevisionReason,
        }),
      });
      const payload = (await response.json().catch(() => null)) as { request?: { id: string }; message?: string } | null;
      if (!response.ok || !payload?.request) throw new Error(payload?.message || "修订申请提交失败");
      setAiJudgeRevisionOpen(false);
      setAiJudgeRevisionSubmitted(true);
    } catch (error) {
      setAiJudgeError(error instanceof Error ? error.message : "修订申请提交失败");
    } finally {
      setAiJudgeRevisionPending(false);
    }
  };

  const renderTraining = () => {
    const remainingSeconds = Math.max(trainingTimerDuration - trainingTimerElapsed, 0);
    const overtimeSeconds = Math.max(trainingTimerElapsed - trainingTimerDuration, 0);
    const timerProgress =
      trainingTimerDuration > 0
        ? Math.min(100, Math.round((Math.min(trainingTimerElapsed, trainingTimerDuration) / trainingTimerDuration) * 100))
        : 0;

    return (
      <div className="space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <SectionHeader
            description="分成答辩训练和路演训练两块：前者沉淀 Q&A 题库，后者练陈述节奏和时间控制。"
            title="训练中心"
          />
          <DemoResetNote />
        </div>

        <section className="grid gap-4 lg:grid-cols-2">
          {[
            {
              key: "qa",
              icon: HelpCircle,
              title: "答辩训练",
              description: "管理评委追问、标准回答要点和随机抽查。",
              metric: `${trainingStats.questionCount} 题`,
              accent: "blue",
            },
            {
              key: "pitch",
              icon: Timer,
              title: "路演训练",
              description: "练习陈述节奏、超时控制和复盘记录。",
              metric: `${trainingStats.sessionCount} 次`,
              accent: "emerald",
            },
          ].map((item) => {
            const Icon = item.icon;
            const selected = trainingPanel === item.key;

            return (
              <button
                className={`group rounded-xl border bg-white p-5 text-left shadow-sm transition ${
                  selected
                    ? item.accent === "blue"
                      ? "border-blue-200 ring-2 ring-blue-500/10"
                      : "border-emerald-200 ring-2 ring-emerald-500/10"
                    : "border-slate-200 hover:border-slate-300"
                }`}
                key={item.key}
                onClick={() => setTrainingPanel(item.key as "qa" | "pitch")}
                type="button"
              >
                <div className="flex items-start justify-between gap-4">
                  <span
                    className={`inline-flex h-11 w-11 items-center justify-center rounded-xl ${
                      item.accent === "blue" ? "bg-blue-50 text-blue-600" : "bg-emerald-50 text-emerald-600"
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <span
                    className={`rounded-md px-2.5 py-1 text-xs font-semibold ${
                      selected
                        ? item.accent === "blue"
                          ? "bg-blue-50 text-blue-600"
                          : "bg-emerald-50 text-emerald-600"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {selected ? "当前板块" : item.metric}
                  </span>
                </div>
                <h3 className="mt-4 text-lg font-semibold text-slate-900">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-500">{item.description}</p>
              </button>
            );
          })}
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          {(trainingPanel === "qa"
            ? [
                { label: "题库数量", value: `${trainingStats.questionCount} 题`, hint: "覆盖商业、技术、财务等方向" },
                { label: "Q&A 命中率", value: `${trainingStats.qaHitRate}%`, hint: "抽查题回答到位比例" },
                { label: "本轮抽查", value: `${qaDrillStats.total} 题`, hint: `${qaDrillStats.hit} 题命中要点` },
              ]
            : [
                { label: "模拟训练", value: `${trainingStats.sessionCount} 次`, hint: "已保存的完整训练记录" },
                { label: "平均超时", value: formatSeconds(trainingStats.averageOvertimeSeconds), hint: "越接近 0 越稳" },
                { label: "当前计时", value: formatSeconds(trainingTimerDuration), hint: overtimeSeconds > 0 ? "已经超时" : "当前预设时长" },
              ]).map((item) => (
            <article className={surfaceCardClassName} key={item.label}>
              <p className="text-sm text-slate-500">{item.label}</p>
              <p className="mt-2 text-2xl font-bold tracking-[-0.02em] text-slate-900">{item.value}</p>
              <p className="mt-2 text-sm leading-6 text-slate-500">{item.hint}</p>
            </article>
          ))}
        </section>

        <section
          className={`grid gap-4 ${
            trainingPanel === "qa" && !aiJudgeViewOpen ? "xl:grid-cols-[minmax(0,1fr)_420px]" : "xl:grid-cols-1"
          }`}
        >
          <article className={`${surfaceCardClassName} ${trainingPanel === "qa" && !aiJudgeViewOpen ? "" : "hidden"}`}>
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0 flex-1">
                <span className="rounded-md bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-600">
                  答辩训练
                </span>
                <h3 className="mt-3 text-base font-semibold text-slate-900">模拟 Q&A 题库</h3>
                <p className="mt-1 text-sm leading-6 text-slate-500">
                  录入常见追问和标准回答要点，也可以先上传文档自动识别，再二次校对入库。
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <ActionButton onClick={() => setAiJudgeViewOpen(true)} variant="primary">
                  进入 AI 模拟答辩
                </ActionButton>
                <ActionButton onClick={openQuestionImportModal}>
                  <span className="inline-flex items-center gap-2">
                    <Upload className="h-4 w-4" />
                    导入题库
                  </span>
                </ActionButton>
                {editingTrainingQuestionId ? (
                  <ActionButton onClick={resetTrainingQuestionDraft}>取消编辑</ActionButton>
                ) : null}
              </div>
            </div>

            <div className="mt-4 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="grid gap-3 md:grid-cols-[180px_minmax(0,1fr)]">
                <label className="text-sm text-slate-500">
                  问题分类
                  <select
                    className={fieldClassName}
                    value={trainingQuestionDraft.category}
                    onChange={(event) =>
                      setTrainingQuestionDraft((current) => ({ ...current, category: event.target.value }))
                    }
                  >
                    {trainingQuestionCategories.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </label>
                {trainingQuestionDraft.category === "其他" ? (
                  <label className="text-sm text-slate-500">
                    自定义分类 <span className="text-red-500">*</span>
                    <input
                      className={fieldClassName}
                      placeholder="例如：政策合规、现场追问"
                      value={trainingQuestionDraft.customCategory}
                      onChange={(event) =>
                        setTrainingQuestionDraft((current) => ({
                          ...current,
                          customCategory: event.target.value,
                        }))
                      }
                    />
                  </label>
                ) : null}
                <label
                  className={`text-sm text-slate-500 ${
                    trainingQuestionDraft.category === "其他" ? "md:col-span-2" : ""
                  }`}
                >
                  评委可能提问 <span className="text-red-500">*</span>
                  <input
                    className={fieldClassName}
                    placeholder="例如：你们的商业模式如何形成可持续收入？"
                    value={trainingQuestionDraft.question}
                    onChange={(event) =>
                      setTrainingQuestionDraft((current) => ({ ...current, question: event.target.value }))
                    }
                  />
                </label>
              </div>
              <label className="text-sm text-slate-500">
                标准回答要点 <span className="text-red-500">*</span>
                <textarea
                  className={textareaClassName}
                  placeholder="写下 3-5 个回答关键词，便于抽查时快速复盘。"
                  value={trainingQuestionDraft.answerPoints}
                  onChange={(event) =>
                    setTrainingQuestionDraft((current) => ({ ...current, answerPoints: event.target.value }))
                  }
                />
              </label>
              <div className="flex justify-end">
                <ActionButton
                  disabled={isSaving}
                  loading={isSaving}
                  loadingLabel="保存中..."
                  onClick={() => void saveTrainingQuestion()}
                  variant="primary"
                >
                  {editingTrainingQuestionId ? "保存修改" : "加入题库"}
                </ActionButton>
              </div>
            </div>

            {trainingQuestions.length > 0 ? (
              <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-[180px] shrink-0">
                    <p className="whitespace-nowrap text-sm font-medium text-slate-900">题库管理</p>
                    <p className="mt-1 text-xs text-slate-500">
                      已选择 {selectedTrainingQuestionIds.length} / {trainingQuestions.length} 题；当前显示 {filteredTrainingQuestions.length} 题。
                    </p>
                  </div>
                  <div className="flex w-full flex-wrap items-end gap-3 xl:max-w-[820px] xl:justify-end">
                    <label className="flex min-w-[200px] shrink-0 flex-col gap-1">
                      <span className="whitespace-nowrap text-xs font-medium text-slate-500">题库分类</span>
                      <select
                        className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                        onChange={(event) => setTrainingQuestionCategoryFilter(event.target.value)}
                        value={trainingQuestionCategoryFilter}
                      >
                        {drillCategoryOptions.map((item) => (
                          <option key={item.category} value={item.category}>
                            {item.category}（{item.count}）
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="relative block min-w-[240px] flex-1">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        aria-label="搜索训练题库"
                        className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-300 focus:ring-4 focus:ring-blue-100"
                        onChange={(event) => setTrainingQuestionSearch(event.target.value)}
                        placeholder="搜索题目、回答要点或分类"
                        value={trainingQuestionSearch}
                      />
                    </label>
                    <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
                      <a
                        className="depth-button-secondary inline-flex h-10 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-4 text-sm text-slate-900 shadow-sm transition duration-200 hover:-translate-y-px hover:border-white/70 hover:bg-white/70 hover:text-[#1a6fd4] active:translate-y-0 active:scale-[0.98]"
                        href={exportTrainingQuestionsUrl}
                      >
                        <Download className="h-4 w-4" />
                        导出 Word
                      </a>
                      <ActionButton onClick={selectAllManageableTrainingQuestions}>
                        {selectedTrainingQuestionIds.length > 0 ? "取消选择" : "全选可删题目"}
                      </ActionButton>
                      <ActionButton
                        disabled={selectedTrainingQuestionIds.length === 0}
                        onClick={deleteSelectedTrainingQuestions}
                        variant="danger"
                      >
                        批量删除
                      </ActionButton>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="mt-5 max-h-[min(62vh,640px)] space-y-3 overflow-y-auto overscroll-contain pr-1 scroll-smooth">
              {filteredTrainingQuestions.length > 0 ? (
                filteredTrainingQuestions.map((item) => (
                  <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm" key={item.id}>
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div className="flex min-w-0 gap-3">
                        {canManageTrainingQuestion(item) ? (
                          <input
                            aria-label={`选择题目：${item.question}`}
                            checked={selectedTrainingQuestionIds.includes(item.id)}
                            className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600"
                            onChange={(event) => toggleTrainingQuestionSelection(item.id, event.target.checked)}
                            type="checkbox"
                          />
                        ) : null}
                        <div className="min-w-0">
                          <span className="rounded-md bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-600">
                            {item.category}
                          </span>
                          <h4 className="mt-3 text-base font-semibold leading-7 text-slate-900">{item.question}</h4>
                          <p className="mt-2 text-sm leading-7 text-slate-500">{item.answerPoints}</p>
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                            <span>
                              录入：{item.createdByName} · {item.createdAt}
                            </span>
                            {item.lastEditedByName && item.lastEditedAt ? (
                              <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-700">
                                最近修订：{item.lastEditedByName} · {item.lastEditedAt}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2 md:justify-end">
                        <ActionButton onClick={() => setActiveDrillQuestionId(item.id)}>
                          抽查这题
                        </ActionButton>
                        {canManageTrainingQuestion(item) ? (
                          <>
                            <ActionButton onClick={() => editTrainingQuestion(item)}>编辑</ActionButton>
                            <ActionButton onClick={() => deleteTrainingQuestion(item)} variant="danger">
                              删除
                            </ActionButton>
                          </>
                        ) : null}
                      </div>
                    </div>
                  </article>
                ))
              ) : trainingQuestions.length > 0 ? (
                <div className="rounded-lg border border-dashed border-slate-200">
                  <EmptyState
                    description="换一个关键词，或清空搜索后查看全部答辩训练题。"
                    icon={Search}
                    title="没有找到匹配的题目"
                  />
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-slate-200">
                  <EmptyState
                    description="先录入几条评委常问问题，比如商业模式、技术壁垒、财务数据。"
                    icon={HelpCircle}
                    title="题库还是空的"
                  />
                </div>
              )}
            </div>
          </article>

          <div className="space-y-4">
            <article className={`${surfaceCardClassName} ${trainingPanel === "qa" && aiJudgeViewOpen ? "" : "hidden"}`}>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <span className="rounded-md bg-slate-950 px-2.5 py-1 text-xs font-semibold text-white">
                    AI 模拟评委
                  </span>
                  <h3 className="mt-3 text-2xl font-semibold leading-8 text-slate-950">AI 模拟答辩工作台</h3>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
                    独立完成抽题、语音回答、转写确认、AI 点评和连续追问，不影响右侧抽查模式的题目。
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 lg:justify-end">
                  <ActionButton onClick={() => setAiJudgeViewOpen(false)}>返回题库</ActionButton>
                  <ActionButton
                    disabled={aiJudgeStage === "recording" || aiJudgeStage === "transcribing" || aiJudgeStage === "judging"}
                    onClick={drawRandomAiJudgeQuestion}
                  >
                    换一道题
                  </ActionButton>
                </div>
              </div>

              <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
                {currentAiJudgeQuestion ? (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                        {currentAiJudgeQuestion.category}
                      </span>
                      <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-600">
                        第 {aiJudgeTurns.length + 1} 轮
                      </span>
                    </div>
                    <p className="mt-3 text-lg font-semibold leading-8 text-slate-950">{currentAiJudgePrompt}</p>
                  </>
                ) : (
                  <p className="text-sm leading-7 text-slate-500">题库为空时无法开始 AI 模拟评委训练。</p>
                )}
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <div className="rounded-2xl border border-blue-100 bg-blue-50/60 px-4 py-3">
                  <p className="text-xs font-semibold text-blue-600">录音转写回答</p>
                  <p className="mt-1 text-sm text-slate-600">
                    {aiJudgeStage === "recording"
                      ? `正在录音 ${formatSeconds(aiJudgeRecordingSeconds)}，回答完请点“结束语音录入”。`
                      : aiJudgeStage === "transcribing"
                        ? "正在提交录音并进行服务端转写，请稍候。"
                        : aiJudgeStage === "judging"
                          ? "AI 正在对照题库要点点评，并准备下一轮追问。"
                          : "可以直接输入文字，也可以使用语音录入后检查并修正识别结果。"}
                  </p>
                </div>
                {aiJudgeStage === "recording" ? (
                  <ActionButton onClick={stopAiJudgeRecording} variant="danger">
                    结束语音录入
                  </ActionButton>
                ) : (
                  <ActionButton
                    disabled={
                      aiJudgeAccessBlocked ||
                      aiJudgeStage === "transcribing" ||
                      aiJudgeStage === "judging" ||
                      !currentAiJudgeQuestion
                    }
                    onClick={startAiJudgeRecording}
                    variant="primary"
                  >
                    开始语音录入
                  </ActionButton>
                )}
              </div>

              {aiJudgeStage === "recording" ? (
                <div className="mt-3 overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-sm transition-all">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-blue-50 px-4 py-3">
                    <p className="text-sm font-semibold text-slate-900">实时转写预览</p>
                    <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-600">
                      结束后可编辑确认
                    </span>
                  </div>
                  <p className="min-h-[88px] px-4 py-3 text-sm leading-7 text-slate-700">
                    {aiJudgeLiveTranscript || "正在听取回答，若当前浏览器不支持实时识别，结束后仍会进行服务端转写。"}
                  </p>
                </div>
              ) : null}

              {aiJudgeAccessMessage ? (
                <div className="mt-3 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-700">
                  {aiJudgeAccessMessage}
                </div>
              ) : null}

              {aiJudgeError ? (
                <div className="mt-3 rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-700">
                  {aiJudgeError}
                </div>
              ) : null}

              {aiJudgeStage === "judging" ? (
                <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50/70 px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-blue-700">AI 正在评估</p>
                    <span className="text-xs font-medium text-blue-500">对照题库要点生成点评</span>
                  </div>
                  <div
                    aria-label="AI 正在评估回答"
                    aria-valuetext="AI 正在评估"
                    className="mt-3 h-2 overflow-hidden rounded-full bg-white"
                    role="progressbar"
                  >
                    <div className="h-full w-2/3 animate-pulse rounded-full bg-blue-600 shadow-[0_0_16px_rgba(37,99,235,0.45)]" />
                  </div>
                </div>
              ) : null}

              {currentAiJudgeQuestion ? (
                <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-900">确认文字回答</p>
                    <span className="text-xs text-slate-400">评分以此处最终确认的文字为准，语音仅用于辅助录入。</span>
                  </div>
                  <textarea
                    className={`${textareaClassName} mt-3 min-h-[128px]`}
                    disabled={aiJudgeAccessBlocked || aiJudgeStage === "judging" || aiJudgeStage === "transcribing"}
                    onChange={(event) => setAiJudgeTranscriptDraft(event.target.value)}
                    placeholder="请输入完整回答；使用语音录入后，请检查并修正识别结果。"
                    value={aiJudgeTranscriptDraft}
                  />
                  <div className="mt-3 flex flex-wrap gap-2">
                    <ActionButton
                      disabled={aiJudgeAccessBlocked || aiJudgeStage === "judging" || !aiJudgeTranscriptDraft.trim()}
                      onClick={submitAiJudgeFeedback}
                      variant="primary"
                    >
                      确认回答并开始评分
                    </ActionButton>
                    <ActionButton disabled={aiJudgeStage === "judging"} onClick={resetAiJudgeAnswer}>
                      重新回答
                    </ActionButton>
                  </div>
                </div>
              ) : null}

              {aiJudgeFeedback ? (
                <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">AI 点评</p>
                      <p className="mt-1 text-sm leading-6 text-slate-600">{aiJudgeFeedback.summary}</p>
                    </div>
                    <div className="min-w-[112px] rounded-2xl bg-slate-950 px-5 py-4 text-center text-white">
                      <p className="text-xs text-white/60">回答完整度</p>
                      <p className="mt-1 text-2xl font-bold tabular-nums">{aiJudgeFeedback.score}</p>
                    </div>
                  </div>

                  <AiDefenseFeedbackDetails dimensions={aiJudgeFeedback.dimensions} expressionRisks={aiJudgeFeedback.expressionRisks} hitPoints={aiJudgeFeedback.hitPoints} improvedAnswer={aiJudgeFeedback.improvedAnswer} missingPoints={aiJudgeFeedback.missingPoints} />

                  {aiJudgeFeedback.followUpQuestion && aiJudgeTurns.length < 3 ? (
                    <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3">
                      <p className="text-xs font-semibold text-slate-500">下一轮追问</p>
                      <p className="mt-2 text-base font-semibold leading-7 text-slate-900">
                        {aiJudgeFeedback.followUpQuestion}
                      </p>
                      <div className="mt-3">
                        <ActionButton onClick={continueAiJudgeFollowUp} variant="primary">
                          继续追问
                        </ActionButton>
                      </div>
                    </div>
                  ) : null}

                  <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                    <ActionButton onClick={() => setAiJudgeStage("editing")}>修改回答并重新评分</ActionButton>
                    <ActionButton disabled={!aiJudgeAttemptId} onClick={openAiJudgeRevision}>提交题库要点修订</ActionButton>
                    <ActionButton disabled={!aiJudgeSessionId} onClick={() => void completeAiJudgeSession()}>结束本次训练</ActionButton>
                  </div>

                  {aiJudgeRevisionSubmitted ? (
                    <p className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">修订申请审核中，审核结果将在系统通知中反馈。</p>
                  ) : null}

                  {aiJudgeRevisionOpen ? (
                    <QuestionRevisionForm onCancel={() => setAiJudgeRevisionOpen(false)} onPointsChange={setAiJudgeRevisionPoints} onReasonChange={setAiJudgeRevisionReason} onSubmit={() => void submitAiJudgeRevision()} pending={aiJudgeRevisionPending} points={aiJudgeRevisionPoints} reason={aiJudgeRevisionReason} />
                  ) : null}

                  {aiJudgeSummary ? (
                    <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50 p-4">
                      <p className="text-sm font-semibold text-emerald-800">本次训练已结束</p>
                      <p className="mt-2 text-sm text-emerald-700">平均分 {aiJudgeSummary.averageScore} 分；表现较好：{aiJudgeSummary.strongestDimension}；后续重点：{aiJudgeSummary.weakestDimension}。</p>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </article>

            <article className={`${surfaceCardClassName} ${trainingPanel === "qa" && !aiJudgeViewOpen ? "" : "hidden"}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">抽查模式</h3>
                  <p className="mt-1 text-sm leading-6 text-slate-500">随机弹题，训练答辩人的临场反应。</p>
                </div>
                <ActionButton onClick={drawRandomTrainingQuestion} variant="primary">
                  <span className="inline-flex items-center gap-2">
                    <Shuffle className="h-4 w-4" />
                    抽一题
                  </span>
                </ActionButton>
              </div>

              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold text-slate-500">抽查范围</p>
                  <span className="text-xs text-slate-400">
                    {drillCategoryOptions.find((item) => item.category === selectedDrillCategory)?.count ?? 0} 题
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {drillCategoryOptions.map((item) => {
                    const selected = item.category === selectedDrillCategory;

                    return (
                      <button
                        className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                          selected
                            ? "bg-blue-600 text-white shadow-sm"
                            : "border border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:text-blue-600"
                        }`}
                        key={item.category}
                        onClick={() => {
                          setSelectedDrillCategory(item.category);
                          setActiveDrillQuestionId(null);
                        }}
                        type="button"
                      >
                        {item.category}
                        <span className={selected ? "ml-1 text-white/75" : "ml-1 text-slate-400"}>
                          {item.count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/60 p-4">
                {activeDrillQuestion ? (
                  <>
                    <span className="rounded-md bg-white px-2.5 py-1 text-xs font-medium text-blue-600">
                      {activeDrillQuestion.category}
                    </span>
                    <p className="mt-3 text-lg font-semibold leading-8 text-slate-900">
                      {activeDrillQuestion.question}
                    </p>
                    <p className="mt-3 text-sm leading-7 text-slate-600">
                      <span className="font-medium text-slate-900">回答要点：</span>
                      {activeDrillQuestion.answerPoints}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <ActionButton onClick={() => recordDrillAnswer(true)} variant="primary">
                        命中要点
                      </ActionButton>
                      <ActionButton onClick={() => recordDrillAnswer(false)}>
                        还需打磨
                      </ActionButton>
                    </div>
                  </>
                ) : (
                  <p className="text-sm leading-7 text-slate-500">
                    {selectedDrillCategory === drillAllCategoryLabel
                      ? "题库有内容后，点击“抽一题”开始训练。"
                      : "当前分类暂无题目，换一个分类或先补充题库。"}
                  </p>
                )}
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs text-slate-400">本轮抽查</p>
                  <p className="mt-1 text-xl font-bold text-slate-900">{qaDrillStats.total} 题</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs text-slate-400">命中率</p>
                  <p className="mt-1 text-xl font-bold text-slate-900">
                    {qaDrillStats.total > 0 ? Math.round((qaDrillStats.hit / qaDrillStats.total) * 100) : 0}%
                  </p>
                </div>
              </div>
            </article>

            <article className={`${surfaceCardClassName} ${trainingPanel === "pitch" ? "" : "hidden"}`}>
              <span className="rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-600">
                路演训练
              </span>
              <h3 className="mt-3 text-base font-semibold text-slate-900">模拟计时器</h3>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                可选常用路演时长，也可以自定义分钟数，适合陈述节奏和问答节奏训练。
              </p>

              <div className="mt-4 grid gap-2">
                {trainingTimerPresets.map((preset) => (
                  <button
                    className={`rounded-xl border px-4 py-3 text-left transition ${
                      trainingTimerDuration === preset.seconds
                        ? "border-blue-200 bg-blue-50 text-blue-700"
                        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                    }`}
                    key={preset.key}
                    onClick={() => applyTrainingTimerPreset(preset)}
                    type="button"
                  >
                    <span className="text-sm font-semibold">{preset.label}</span>
                    <span className="mt-1 block text-xs leading-5 opacity-80">{preset.description}</span>
                  </button>
                ))}
              </div>
              <div className="mt-3 rounded-xl border border-dashed border-slate-200 bg-white p-3">
                <label className="text-sm text-slate-500">
                  自定义计时（分钟）
                  <div className="mt-1.5 flex gap-2">
                    <input
                      className={fieldClassName}
                      inputMode="decimal"
                      min="1"
                      max="180"
                      placeholder="例如：6"
                      type="number"
                      value={trainingTimerCustomMinutes}
                      onChange={(event) => setTrainingTimerCustomMinutes(event.target.value)}
                    />
                    <ActionButton onClick={applyCustomTrainingTimer}>应用</ActionButton>
                  </div>
                </label>
              </div>

              <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-950 px-5 py-6 text-center text-white">
                <p className="text-xs tracking-[0.2em] text-white/50">
                  {overtimeSeconds > 0 ? "已超时" : "剩余时间"}
                </p>
                <p className={`mt-2 text-[48px] font-bold tabular-nums ${overtimeSeconds > 0 ? "text-red-300" : ""}`}>
                  {overtimeSeconds > 0 ? `+${formatSeconds(overtimeSeconds)}` : formatSeconds(remainingSeconds)}
                </p>
                <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
                  <span className="block h-full rounded-full bg-blue-400" style={{ width: `${timerProgress}%` }} />
                </div>
                <div className="mt-5 flex justify-center gap-2">
                  <ActionButton
                    onClick={() => setTrainingTimerRunning((current) => !current)}
                    variant="primary"
                  >
                    <span className="inline-flex items-center gap-2">
                      {trainingTimerRunning ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                      {trainingTimerRunning ? "暂停" : "开始"}
                    </span>
                  </ActionButton>
                  <ActionButton onClick={resetTrainingTimer}>
                    <span className="inline-flex items-center gap-2">
                      <RotateCcw className="h-4 w-4" />
                      重置
                    </span>
                  </ActionButton>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                <input
                  className={fieldClassName}
                  placeholder="训练标题，例如：校内终审彩排第 1 轮"
                  value={trainingSessionTitle}
                  onChange={(event) => setTrainingSessionTitle(event.target.value)}
                />
                <textarea
                  className={`${textareaClassName} min-h-24`}
                  placeholder="复盘备注：哪里超时、哪类问题没答好、下一轮要练什么。"
                  value={trainingSessionNotes}
                  onChange={(event) => setTrainingSessionNotes(event.target.value)}
                />
                <ActionButton
                  disabled={isSaving}
                  loading={isSaving}
                  loadingLabel="保存中..."
                  onClick={() => void saveTrainingSession()}
                  variant="primary"
                >
                  保存训练记录
                </ActionButton>
              </div>
            </article>

            <article className={`${surfaceCardClassName} ${trainingPanel === "pitch" ? "" : "hidden"}`}>
              <h3 className="text-base font-semibold text-slate-900">最近训练记录</h3>
              <div className="mt-4 space-y-3">
                {trainingSessions.slice(0, 5).map((session) => (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3" key={session.id}>
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-semibold text-slate-900">{session.title}</p>
                      <span className="text-xs text-slate-400">{session.createdAt}</span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-slate-500">
                      用时 {formatSeconds(session.durationSeconds)} · 超时 {formatSeconds(session.overtimeSeconds)} · Q&A 命中 {session.qaHitRate}%
                    </p>
                  </div>
                ))}
                {trainingSessions.length === 0 ? (
                  <p className="text-sm leading-7 text-slate-500">还没有训练记录，完成一次计时后可以保存复盘。</p>
                ) : null}
              </div>
            </article>
          </div>
        </section>
      </div>
    );
  };

  return renderTraining();
}

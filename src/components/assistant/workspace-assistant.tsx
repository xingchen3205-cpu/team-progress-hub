"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bot, Loader2, Menu, Plus, Sparkles, X } from "lucide-react";

import { AssistantHistoryList } from "./assistant-history-list";
import { AssistantInputBox } from "./assistant-input-box";
import { AssistantMessageBubble } from "./assistant-message-bubble";
import type { AiPermissionState, AssistantConversation, AssistantFeedbackState, AssistantMessage } from "./assistant-types";
import {
  buildAssistantConversationTitle,
  formatAssistantDateDivider,
  shouldShowAssistantDateDivider,
} from "./assistant-utils";
import { requestJson } from "@/lib/request-json";
import styles from "./workspace-assistant.module.css";

const QUICK_PROMPTS = [
  "比赛报名和材料提交流程？",
  "计划书、PPT、答辩材料怎么写？",
  "文档被驳回怎么处理？",
];

const TITLE_STORAGE_KEY = "workspace-assistant-title-overrides:v1";

type ConversationsResponse = {
  conversations: AssistantConversation[];
};

type ConversationMessagesResponse = {
  conversationId: string;
  messages: AssistantMessage[];
};

type AssistantChatResponse = {
  answer: string;
  conversationId: string;
  messageId: string | null;
  permission: AiPermissionState;
};

type AssistantSseEvent =
  | {
      type: "delta";
      payload: {
        delta: string;
        answer: string;
        conversationId: string | null;
        messageId: string | null;
      };
    }
  | {
      type: "done";
      payload: {
        answer: string;
        conversationId: string;
        messageId: string | null;
        permission: AiPermissionState;
      };
    }
  | {
      type: "error";
      payload: {
        message: string;
      };
    };

function loadTitleOverrides() {
  if (typeof window === "undefined") {
    return {} as Record<string, string>;
  }

  try {
    const raw = window.localStorage.getItem(TITLE_STORAGE_KEY);
    if (!raw) {
      return {} as Record<string, string>;
    }

    const parsed = JSON.parse(raw) as unknown;
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, string>) : {};
  } catch {
    return {} as Record<string, string>;
  }
}

function createUserMessage(content: string): AssistantMessage {
  return {
    id: `user-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    role: "user",
    content,
    createdAt: new Date().toISOString(),
    messageId: null,
    feedback: null,
    state: "ready",
  };
}

function createThinkingMessage(): AssistantMessage {
  return {
    id: `assistant-thinking-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    role: "assistant",
    content: "",
    createdAt: new Date().toISOString(),
    messageId: null,
    feedback: null,
    state: "thinking",
  };
}

function withConversationTitles(
  conversations: AssistantConversation[],
  overrides: Record<string, string>,
) {
  return conversations.map((conversation) => ({
    ...conversation,
    title: overrides[conversation.id] || buildAssistantConversationTitle(conversation.title),
  }));
}

async function* parseAssistantSseStream(stream: ReadableStream<Uint8Array>): AsyncGenerator<AssistantSseEvent> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let streamedAnswer = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      while (buffer.includes("\n\n")) {
        const boundaryIndex = buffer.indexOf("\n\n");
        const chunk = buffer.slice(0, boundaryIndex).trim();
        buffer = buffer.slice(boundaryIndex + 2);

        if (!chunk) {
          continue;
        }

        const eventLine = chunk
          .split("\n")
          .find((line) => line.trimStart().startsWith("event:"));
        const dataLine = chunk
          .split("\n")
          .find((line) => line.trimStart().startsWith("data:"));

        if (!dataLine) {
          continue;
        }

        const payloadRecord = JSON.parse(dataLine.replace(/^data:\s*/, "")) as Record<string, unknown>;
        const eventType = eventLine?.replace(/^event:\s*/, "").trim() ?? String(payloadRecord.event ?? "");

        if (eventType === "delta" || eventType === "done" || eventType === "error") {
          const payload = payloadRecord as AssistantSseEvent["payload"];

          if (eventType === "delta" && payload && typeof payload === "object" && "answer" in payload) {
            const answerValue = (payload as { answer?: unknown }).answer;
            streamedAnswer = typeof answerValue === "string" ? answerValue : streamedAnswer;
          }

          yield {
            type: eventType,
            payload: payload as never,
          };
          continue;
        }

        if (eventType === "message" || eventType === "agent_message") {
          const delta = typeof payloadRecord.answer === "string" ? payloadRecord.answer : "";
          streamedAnswer += delta;

          yield {
            type: "delta",
            payload: {
              delta,
              answer: streamedAnswer,
              conversationId:
                typeof payloadRecord.conversation_id === "string" ? payloadRecord.conversation_id : null,
              messageId: typeof payloadRecord.message_id === "string" ? payloadRecord.message_id : null,
            },
          };
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export function WorkspaceAssistant() {
  const [titleOverrides, setTitleOverrides] = useState<Record<string, string>>(() => loadTitleOverrides());
  const [permission, setPermission] = useState<AiPermissionState | null>(null);
  const [conversations, setConversations] = useState<AssistantConversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [initializing, setInitializing] = useState(true);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const bootSelectionHandled = useRef(false);
  const titleOverridesRef = useRef(titleOverrides);

  const limitedUsageLabel = useMemo(() => {
    if (!permission || permission.remainingCount == null) {
      return null;
    }

    return `剩余 ${permission.remainingCount} 次`;
  }, [permission]);

  const persistTitleOverrides = useCallback((next: Record<string, string>) => {
    setTitleOverrides(next);

    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(TITLE_STORAGE_KEY, JSON.stringify(next));
  }, []);

  useEffect(() => {
    titleOverridesRef.current = titleOverrides;
  }, [titleOverrides]);

  const focusInput = useCallback(() => {
    window.requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });
  }, []);

  const scrollToBottom = useCallback(() => {
    window.requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
    });
  }, []);

  const loadConversationMessages = useCallback(async (conversationId: string) => {
    setLoadingMessages(true);
    setError(null);

    try {
      const payload = await requestJson<ConversationMessagesResponse>(`/api/ai/conversations/${conversationId}`);
      setMessages(payload.messages.map((message) => ({ ...message, state: "ready" })));
      setActiveConversationId(conversationId);
      setSidebarOpen(false);
      scrollToBottom();
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "加载历史消息失败");
    } finally {
      setLoadingMessages(false);
      focusInput();
    }
  }, [focusInput, scrollToBottom]);

  const startNewConversation = useCallback(() => {
    setActiveConversationId(null);
    setMessages([]);
    setDraft("");
    setError(null);
    setSidebarOpen(false);
    focusInput();
  }, [focusInput]);

  const rememberConversationTitle = useCallback((conversationId: string, title: string) => {
    if (titleOverrides[conversationId]) {
      return;
    }

    const next = {
      ...titleOverrides,
      [conversationId]: buildAssistantConversationTitle(title),
    };
    persistTitleOverrides(next);
  }, [persistTitleOverrides, titleOverrides]);

  const upsertConversationPreview = useCallback((conversationId: string, title: string) => {
    const now = new Date().toISOString();
    const normalizedTitle = buildAssistantConversationTitle(title);

    setConversations((current) => {
      const existing = current.find((item) => item.id === conversationId);
      const nextItem: AssistantConversation = existing
        ? {
            ...existing,
            title: titleOverrides[conversationId] || existing.title || normalizedTitle,
            updatedAt: now,
          }
        : {
            id: conversationId,
            title: titleOverrides[conversationId] || normalizedTitle,
            createdAt: now,
            updatedAt: now,
          };

      return [nextItem, ...current.filter((item) => item.id !== conversationId)].sort(
        (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
      );
    });
  }, [titleOverrides]);

  const replaceThinkingMessage = (messageId: string, next: Partial<AssistantMessage>) => {
    setMessages((current) =>
      current.map((message) =>
        message.id === messageId
          ? {
              ...message,
              ...next,
            }
          : message,
      ),
    );
  };

  const removeThinkingMessage = (messageId: string) => {
    setMessages((current) => current.filter((message) => message.id !== messageId));
  };

  const sendMessage = async (prefilled?: string) => {
    const query = (prefilled ?? draft).trim();
    if (!query || sending) {
      return;
    }

    if (permission?.remainingCount != null && permission.remainingCount <= 0) {
      setError("次数已用完，请联系管理员调整额度");
      return;
    }

    setSending(true);
    setError(null);

    const userMessage = createUserMessage(query);
    const thinkingMessage = createThinkingMessage();

    setMessages((current) => [...current, userMessage, thinkingMessage]);
    setDraft("");
    focusInput();
    scrollToBottom();

    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query,
          conversationId: activeConversationId,
          stream: true,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(payload?.message || "发送失败，请稍后重试");
      }

      const contentType = response.headers.get("content-type") || "";

      if (!contentType.includes("text/event-stream") || !response.body) {
        const payload = (await response.json()) as AssistantChatResponse;
        rememberConversationTitle(payload.conversationId, query);
        upsertConversationPreview(payload.conversationId, query);
        setActiveConversationId(payload.conversationId);
        setPermission(payload.permission);
        replaceThinkingMessage(thinkingMessage.id, {
          content: payload.answer,
          createdAt: new Date().toISOString(),
          messageId: payload.messageId,
          state: "ready",
        });
        return;
      }

      let receivedDelta = false;

      for await (const event of parseAssistantSseStream(response.body)) {
        if (event.type === "delta") {
          receivedDelta = true;
          if (event.payload.conversationId) {
            setActiveConversationId(event.payload.conversationId);
            rememberConversationTitle(event.payload.conversationId, query);
            upsertConversationPreview(event.payload.conversationId, query);
          }

          replaceThinkingMessage(thinkingMessage.id, {
            content: event.payload.answer,
            messageId: event.payload.messageId,
            state: "streaming",
          });
          scrollToBottom();
        }

        if (event.type === "done") {
          setPermission(event.payload.permission);
          setActiveConversationId(event.payload.conversationId);
          rememberConversationTitle(event.payload.conversationId, query);
          upsertConversationPreview(event.payload.conversationId, query);
          replaceThinkingMessage(thinkingMessage.id, {
            content: event.payload.answer,
            messageId: event.payload.messageId,
            state: "ready",
          });
          scrollToBottom();
          break;
        }

        if (event.type === "error") {
          throw new Error(event.payload.message);
        }
      }

      if (!receivedDelta) {
        replaceThinkingMessage(thinkingMessage.id, {
          state: "ready",
        });
      }
    } catch (sendError) {
      removeThinkingMessage(thinkingMessage.id);
      setMessages((current) => current.filter((message) => message.id !== userMessage.id));
      setError(sendError instanceof Error ? sendError.message : "发送失败，请稍后重试");
    } finally {
      setSending(false);
      focusInput();
    }
  };

  const copyMessage = async (message: AssistantMessage) => {
    if (!navigator.clipboard) {
      return;
    }

    await navigator.clipboard.writeText(message.content);
    setCopiedMessageId(message.id);
    window.setTimeout(() => setCopiedMessageId((current) => (current === message.id ? null : current)), 2000);
  };

  const changeFeedback = (messageId: string, feedback: AssistantFeedbackState) => {
    setMessages((current) =>
      current.map((message) =>
        message.id === messageId
          ? {
              ...message,
              feedback,
            }
          : message,
      ),
    );
  };

  const deleteConversation = async (conversationId: string) => {
    const target = conversations.find((conversation) => conversation.id === conversationId);
    if (!target) {
      return;
    }

    const confirmed = window.confirm(`确认删除“${target.title}”这条历史对话吗？`);
    if (!confirmed) {
      return;
    }

    try {
      await requestJson<{ success: boolean }>(`/api/ai/conversations/${conversationId}`, {
        method: "DELETE",
      });

      setConversations((current) => current.filter((conversation) => conversation.id !== conversationId));

      if (activeConversationId === conversationId) {
        startNewConversation();
      }
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "删除历史对话失败");
    }
  };

  useEffect(() => {
    let active = true;

    const initialize = async () => {
      try {
        const permissionPayload = await requestJson<{ permission: AiPermissionState }>("/api/ai/permission");
        if (!active) {
          return;
        }

        const permissionState = permissionPayload.permission;
        setPermission(permissionState);

        if (permissionState.isEnabled) {
          setLoadingConversations(true);

          try {
            const conversationPayload = await requestJson<ConversationsResponse>("/api/ai/conversations");
            if (!active) {
              return;
            }

            const titled = withConversationTitles(conversationPayload.conversations, titleOverridesRef.current);
            setConversations(titled);

            const targetConversationId = titled[0]?.id ?? null;

            if (!bootSelectionHandled.current) {
              bootSelectionHandled.current = true;
            }

            if (targetConversationId) {
              setActiveConversationId(targetConversationId);
              await loadConversationMessages(targetConversationId);
            }
          } finally {
            if (active) {
              setLoadingConversations(false);
            }
          }
        }
      } catch (loadError) {
        if (!active) {
          return;
        }

        setError(loadError instanceof Error ? loadError.message : "AI 助手加载失败");
      } finally {
        if (active) {
          setInitializing(false);
          focusInput();
        }
      }
    };

    void initialize();

    return () => {
      active = false;
    };
  }, [focusInput, loadConversationMessages]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const conversationGroupsExist = conversations.length > 0;

  return (
    <div className={styles.assistantRoot}>
      <div className={styles.assistantShell}>
        {sidebarOpen ? <button className={styles.mobileBackdrop} onClick={() => setSidebarOpen(false)} type="button" /> : null}

        <aside
          className={`${styles.assistantPanel} ${styles.assistantSidebar} ${sidebarOpen ? styles.assistantSidebarOpen : ""}`}
        >
          <div className={styles.assistantSidebarHeader}>
            <div className={styles.assistantEyebrow}>
              <div className={styles.assistantLogo}>
                <Bot className="h-5 w-5" />
              </div>
              <div>
                <div className={styles.assistantTitle}>双创助手</div>
                <div className={styles.assistantSubtitle}>赛事流程与规范智能问答</div>
              </div>
            </div>
            {limitedUsageLabel ? <div className={styles.assistantUsageTag}>{limitedUsageLabel}</div> : null}
          </div>

          <div className={styles.newConversationSection}>
            <button className={styles.newConversationButton} onClick={startNewConversation} type="button">
              <Plus className="h-4 w-4" />
              新建对话
            </button>
          </div>

          <div className={styles.historyScroll}>
            <AssistantHistoryList
              activeConversationId={activeConversationId}
              conversations={conversations}
              loading={loadingConversations}
              onDelete={(conversationId) => void deleteConversation(conversationId)}
              onSelect={(conversationId) => void loadConversationMessages(conversationId)}
            />
          </div>

          <div className={styles.sidebarFootnote}>回答仅供参考，以平台实际数据为准</div>
        </aside>

        <section className={`${styles.assistantPanel} ${styles.assistantMain}`}>
          <div className={styles.assistantMainHeader}>
            <div>
              <div className={styles.assistantMainTitle}>AI 助手</div>
              <div className={styles.assistantMainHint}>直接通过平台后端调用 Dify，对话记录按会话维度管理。</div>
            </div>
            <button className={styles.mobileToggle} onClick={() => setSidebarOpen((current) => !current)} type="button">
              {sidebarOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          </div>

          {error ? <div className={styles.assistantStatusBanner}>{error}</div> : null}

          {initializing ? (
            <div className={styles.disabledState}>
              <div className={styles.disabledStateInner}>
                <Loader2 className={`${styles.loadingSpinner} mx-auto h-8 w-8 text-[#94a3b8]`} />
                <div className={styles.disabledStateTitle}>正在加载 AI 助手</div>
                <div className={styles.disabledStateText}>正在获取使用权限和历史对话。</div>
              </div>
            </div>
          ) : permission && !permission.isEnabled ? (
            <div className={styles.disabledState}>
              <div className={styles.disabledStateInner}>
                <div className={styles.emptyStateIcon}>
                  <Sparkles className="h-7 w-7" />
                </div>
                <div className={styles.disabledStateTitle}>暂无使用权限，请联系管理员</div>
                <div className={styles.disabledStateText}>
                  当前账号尚未开通 AI 助手权限。管理员可在团队管理中的 AI 权限管理里配置可用账号和可提问次数。
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className={styles.messagesWrap}>
                <div className={styles.messagesScroll}>
                  {loadingMessages ? (
                    <div className={styles.disabledState}>
                      <div className={styles.disabledStateInner}>
                        <Loader2 className={`${styles.loadingSpinner} mx-auto h-8 w-8 text-[#94a3b8]`} />
                        <div className={styles.disabledStateTitle}>正在加载历史对话</div>
                      </div>
                    </div>
                  ) : messages.length === 0 ? (
                    <div className={styles.emptyState}>
                      <div className={styles.emptyStateInner}>
                        <div className={styles.emptyStateIcon}>
                          <Sparkles className="h-8 w-8" />
                        </div>
                        <div className={styles.emptyStateTitle}>有什么可以帮你？</div>
                        <div className={styles.emptyStateSubtitle}>
                          {conversationGroupsExist ? "你可以继续历史对话，或直接发起一个新问题。" : "从一个具体问题开始会更高效。"}
                        </div>
                        <div className={styles.quickPromptGrid}>
                          {QUICK_PROMPTS.map((prompt) => (
                            <button
                              className={styles.quickPromptCard}
                              key={prompt}
                              onClick={() => void sendMessage(prompt)}
                              type="button"
                            >
                              {prompt}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      {messages.map((message, index) => {
                        const previousMessage = index > 0 ? messages[index - 1] : null;
                        const showDivider = shouldShowAssistantDateDivider(previousMessage?.createdAt, message.createdAt);

                        return (
                          <div key={message.id}>
                            {showDivider ? (
                              <div className={styles.dateDivider}>
                                <span className={styles.dateDividerText}>
                                  {formatAssistantDateDivider(message.createdAt)}
                                </span>
                              </div>
                            ) : null}
                            <AssistantMessageBubble
                              copied={copiedMessageId === message.id}
                              message={message}
                              onCopy={(target) => void copyMessage(target)}
                              onFeedbackChange={changeFeedback}
                            />
                          </div>
                        );
                      })}
                      <div ref={messagesEndRef} />
                    </>
                  )}
                </div>
              </div>

              <div className={styles.inputArea}>
                <AssistantInputBox
                  disabled={permission?.remainingCount != null && permission.remainingCount <= 0}
                  loading={sending}
                  onChange={setDraft}
                  onSubmit={() => void sendMessage()}
                  ref={textareaRef}
                  value={draft}
                />
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

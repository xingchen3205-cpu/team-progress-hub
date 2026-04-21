"use client";

import { Bot, Check, Copy, ThumbsDown, ThumbsUp } from "lucide-react";

import type { AssistantFeedbackState, AssistantMessage } from "./assistant-types";
import { formatAssistantMessageTime } from "./assistant-utils";
import { AssistantMarkdown } from "./assistant-markdown";
import styles from "./workspace-assistant.module.css";

type AssistantMessageBubbleProps = {
  copied: boolean;
  message: AssistantMessage;
  onCopy: (message: AssistantMessage) => void;
  onFeedbackChange: (messageId: string, feedback: AssistantFeedbackState) => void;
};

export function AssistantMessageBubble({
  copied,
  message,
  onCopy,
  onFeedbackChange,
}: AssistantMessageBubbleProps) {
  const isUser = message.role === "user";
  const isThinking = message.state === "thinking";
  const isStreaming = message.state === "streaming";

  return (
    <div className={`${styles.messageRow} ${isUser ? styles.messageRowUser : ""}`}>
      {!isUser ? (
        <div className={styles.assistantAvatar}>
          <Bot className="h-4 w-4" />
        </div>
      ) : null}

      <div className={styles.messageBubbleWrap}>
        <div
          className={[
            styles.messageBubble,
            isUser ? styles.messageBubbleUser : styles.messageBubbleAssistant,
            !isThinking && !isStreaming && !isUser ? styles.messageFadeIn : "",
          ].join(" ")}
        >
          {isThinking ? (
            <div className={styles.typingIndicator} aria-label="AI 思考中">
              <span className={styles.typingDot} />
              <span className={styles.typingDot} />
              <span className={styles.typingDot} />
            </div>
          ) : isUser ? (
            <p className="whitespace-pre-wrap break-words">{message.content}</p>
          ) : (
            <div className={isStreaming ? styles.typingCursor : undefined}>
              <AssistantMarkdown content={message.content} />
            </div>
          )}
        </div>

        {!isThinking && !isStreaming && !isUser ? (
          <div className={styles.messageActions}>
            <button className={styles.messageActionButton} onClick={() => onCopy(message)} type="button">
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "已复制" : "复制"}
            </button>
            <button
              className={`${styles.messageActionButton} ${
                message.feedback === "like" ? styles.messageActionButtonActive : ""
              }`}
              onClick={() => onFeedbackChange(message.id, message.feedback === "like" ? null : "like")}
              type="button"
            >
              <ThumbsUp className="h-3.5 w-3.5" />
            </button>
            <button
              className={`${styles.messageActionButton} ${
                message.feedback === "dislike" ? styles.messageActionButtonActive : ""
              }`}
              onClick={() => onFeedbackChange(message.id, message.feedback === "dislike" ? null : "dislike")}
              type="button"
            >
              <ThumbsDown className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : null}

        <div className={`${styles.messageMeta} ${isUser ? styles.messageMetaUser : ""}`}>
          {formatAssistantMessageTime(message.createdAt)}
        </div>
      </div>
    </div>
  );
}

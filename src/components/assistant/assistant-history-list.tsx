"use client";

import { Loader2, MessageSquareText, Trash2 } from "lucide-react";

import type { AssistantConversation } from "./assistant-types";
import { formatAssistantMessageTime, groupAssistantConversationsByDate } from "./assistant-utils";
import styles from "./workspace-assistant.module.css";

type AssistantHistoryListProps = {
  activeConversationId: string | null;
  conversations: AssistantConversation[];
  loading: boolean;
  onDelete: (conversationId: string) => void;
  onSelect: (conversationId: string) => void;
};

export function AssistantHistoryList({
  activeConversationId,
  conversations,
  loading,
  onDelete,
  onSelect,
}: AssistantHistoryListProps) {
  if (loading) {
    return (
      <div className={styles.historyEmpty}>
        <span className={styles.loadingInline}>
          <Loader2 className={`${styles.loadingSpinner} h-4 w-4`} />
          正在加载历史对话...
        </span>
      </div>
    );
  }

  if (conversations.length === 0) {
    return <div className={styles.historyEmpty}>暂无历史对话，点击“新建对话”开始第一轮交流。</div>;
  }

  const groups = groupAssistantConversationsByDate(conversations);

  return (
    <>
      {groups.map((group) => (
        <div className={styles.historyGroup} key={group.label}>
          <div className={styles.historyGroupLabel}>{group.label}</div>
          <div className="space-y-1.5">
            {group.items.map((conversation) => {
              const active = conversation.id === activeConversationId;

              return (
                <div
                  className={`${styles.historyItem} ${active ? styles.historyItemActive : ""}`}
                  key={conversation.id}
                >
                  <button className={styles.historyItemMain} onClick={() => onSelect(conversation.id)} type="button">
                    <MessageSquareText className="h-4 w-4 shrink-0 text-[#94a3b8]" />
                    <div className={styles.historyItemText}>
                      <div className={styles.historyItemTitle}>{conversation.title}</div>
                      <div className={styles.historyItemTime}>{formatAssistantMessageTime(conversation.updatedAt)}</div>
                    </div>
                  </button>
                  <button
                    aria-label={`删除 ${conversation.title}`}
                    className={styles.historyDeleteButton}
                    onClick={() => onDelete(conversation.id)}
                    type="button"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}

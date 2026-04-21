export type AiPermissionState = {
  isEnabled: boolean;
  maxCount: number | null;
  usedCount: number;
  remainingCount: number | null;
  resetAt: string | null;
};

export type AssistantConversation = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

export type AssistantFeedbackState = "like" | "dislike" | null;

export type AssistantMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  messageId: string | null;
  feedback: AssistantFeedbackState;
  state?: "thinking" | "streaming" | "ready";
};

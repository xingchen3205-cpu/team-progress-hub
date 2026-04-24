import type { Role } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { buildAiPermissionSnapshot, parseAiMaxCountInput, resolveAiAccessState } from "@/lib/ai-permissions";
import { ThinkTagFilter, removeThinkTags } from "@/hooks/use-think-filter";

type AiPermissionPayload = {
  isEnabled: boolean;
  maxCount: number | null;
  usedCount: number;
  remainingCount: number | null;
  resetAt: string | null;
};

type DifyErrorPayload = {
  code?: string;
  message?: string;
  status?: number;
};

type DifyBlockingChatResponse = {
  answer?: string;
  conversation_id?: string;
  message_id?: string;
  message?: string;
};

type DifyConversationListResponse = {
  data?: Array<{
    id: string;
    name?: string | null;
    created_at?: number;
    updated_at?: number;
  }>;
};

type DifyMessageListResponse = {
  data?: Array<{
    id: string;
    conversation_id: string;
    query?: string | null;
    answer?: string | null;
    created_at?: number;
    feedback?: {
      rating?: "like" | "dislike" | null;
    } | null;
  }>;
};

type DifyStreamingEvent = {
  event?: string;
  answer?: string;
  message?: string;
  message_id?: string;
  conversation_id?: string;
};

export type AiPermissionRow = {
  userId: string;
  name: string;
  username: string;
  role: Role;
  isEnabled: boolean;
  maxCount: number | null;
  usedCount: number;
  remainingCount: number | null;
  resetAt: string | null;
};

export type AiConversationSummary = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

export type AiConversationMessage = {
  id: string;
  messageId: string | null;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  feedback: "like" | "dislike" | null;
};

const DEFAULT_DIFY_BASE_URL = "https://api.dify.ai/v1";

const getDifyConfig = () => {
  const apiKey = process.env.DIFY_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("AI 助手尚未配置 Dify API Key");
  }

  return {
    apiKey,
    baseUrl: (process.env.DIFY_BASE_URL?.trim() || DEFAULT_DIFY_BASE_URL).replace(/\/$/, ""),
  };
};

const serializePermissionSnapshot = (snapshot: ReturnType<typeof buildAiPermissionSnapshot>): AiPermissionPayload => ({
  isEnabled: snapshot.isEnabled,
  maxCount: snapshot.maxCount,
  usedCount: snapshot.usedCount,
  remainingCount: snapshot.remainingCount,
  resetAt: snapshot.resetAt?.toISOString() ?? null,
});

function createAiError(message: string, status: number) {
  const error = new Error(message) as Error & { status?: number };
  error.status = status;
  return error;
}

function toIsoStringFromUnix(value?: number) {
  if (!value) {
    return new Date(0).toISOString();
  }

  return new Date(value * 1000).toISOString();
}

async function loadUserWithAiState(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true,
      aiPermission: {
        select: {
          isEnabled: true,
          maxCount: true,
          usedCount: true,
          resetAt: true,
        },
      },
      aiConversations: {
        orderBy: { updatedAt: "desc" },
        take: 1,
        select: {
          id: true,
          conversationId: true,
        },
      },
    },
  });
}

async function syncExpiredAiReset(userId: string, snapshot: ReturnType<typeof buildAiPermissionSnapshot>) {
  if (!snapshot.shouldReset) {
    return;
  }

  await prisma.aiPermission.updateMany({
    where: {
      userId,
      resetAt: {
        lte: new Date(),
      },
    },
    data: {
      usedCount: 0,
      resetAt: null,
    },
  });
}

async function loadAiAccessState(userId: string) {
  const user = await loadUserWithAiState(userId);
  if (!user) {
    throw new Error("用户不存在");
  }

  const snapshot = buildAiPermissionSnapshot(user.role, user.aiPermission);
  await syncExpiredAiReset(userId, snapshot);

  return {
    user,
    snapshot,
  };
}

function assertAiAccessAllowed(snapshot: ReturnType<typeof buildAiPermissionSnapshot>) {
  const accessState = resolveAiAccessState(snapshot);
  if (accessState === "disabled") {
    throw createAiError("暂无使用权限，请联系管理员", 403);
  }

  if (accessState === "limit_reached") {
    throw createAiError("次数已用完，请联系管理员调整额度", 403);
  }
}

async function finalizeAiUsage(input: {
  userId: string;
  conversationId: string;
  title: string;
}) {
  await prisma.$transaction(async (tx) => {
    const latest = await tx.user.findUnique({
      where: { id: input.userId },
      select: {
        role: true,
        aiPermission: {
          select: {
            isEnabled: true,
            maxCount: true,
            usedCount: true,
            resetAt: true,
          },
        },
      },
    });

    if (!latest) {
      throw new Error("用户不存在");
    }

    const latestSnapshot = buildAiPermissionSnapshot(latest.role, latest.aiPermission);
    if (resolveAiAccessState(latestSnapshot) !== "allowed") {
      throw createAiError("次数已用完，请联系管理员调整额度", 403);
    }

    await tx.aiPermission.upsert({
      where: { userId: input.userId },
      create: {
        userId: input.userId,
        isEnabled: latestSnapshot.isEnabled,
        maxCount: latestSnapshot.maxCount,
        usedCount: latestSnapshot.usedCount + 1,
        resetAt: latestSnapshot.resetAt,
      },
      update: {
        isEnabled: latestSnapshot.isEnabled,
        maxCount: latestSnapshot.maxCount,
        usedCount: latestSnapshot.usedCount + 1,
        resetAt: latestSnapshot.resetAt,
      },
    });

    await tx.aiConversation.upsert({
      where: { userId: input.userId },
      create: {
        userId: input.userId,
        conversationId: input.conversationId,
        title: input.title,
      },
      update: {
        conversationId: input.conversationId,
        title: input.title,
      },
    });
  });

  return getAiPermissionForUser(input.userId);
}

async function parseDifyError(response: Response) {
  const payload = (await response.json().catch(() => null)) as DifyErrorPayload | null;
  return payload?.message || "AI 助手暂时不可用，请稍后重试";
}

async function requestDifyJson<T>(path: string, init?: RequestInit) {
  const config = getDifyConfig();
  const response = await fetch(`${config.baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw new Error(await parseDifyError(response));
  }

  return (await response.json()) as T;
}

async function sendDifyChatMessageBlocking(input: {
  query: string;
  userId: string;
  conversationId?: string | null;
}) {
  const payload = await requestDifyJson<DifyBlockingChatResponse>("/chat-messages", {
    method: "POST",
    body: JSON.stringify({
      inputs: {},
      query: input.query,
      response_mode: "blocking",
      conversation_id: input.conversationId || undefined,
      user: input.userId,
    }),
  });

  if (!payload.answer || !payload.conversation_id) {
    throw new Error("AI 助手返回内容异常，请稍后重试");
  }

  return {
    answer: removeThinkTags(payload.answer),
    conversationId: payload.conversation_id,
    messageId: payload.message_id ?? null,
  };
}

function normalizeConversationTitle(title?: string | null) {
  const normalized = title?.trim();
  return normalized && normalized.length > 0 ? normalized : "未命名对话";
}

function normalizeConversationMessages(records: NonNullable<DifyMessageListResponse["data"]>) {
  const items: AiConversationMessage[] = [];

  [...records]
    .sort((left, right) => (left.created_at ?? 0) - (right.created_at ?? 0))
    .forEach((record) => {
      const createdAt = toIsoStringFromUnix(record.created_at);
      const feedback = record.feedback?.rating ?? null;
      const query = record.query?.trim();
      const answer = record.answer?.trim();

      if (query) {
        items.push({
          id: `${record.id}-user`,
          messageId: record.id,
          role: "user",
          content: query,
          createdAt,
          feedback: null,
        });
      }

      if (answer) {
        items.push({
          id: `${record.id}-assistant`,
          messageId: record.id,
          role: "assistant",
          content: answer,
          createdAt,
          feedback,
        });
      }
    });

  return items;
}

function buildSseEvent(event: string, data: Record<string, unknown>) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function getAiPermissionForUser(userId: string) {
  const { user, snapshot } = await loadAiAccessState(userId);
  if (!user) {
    throw new Error("用户不存在");
  }

  return serializePermissionSnapshot(snapshot);
}

export async function listAiPermissions() {
  const users = await prisma.user.findMany({
    where: {
      approvalStatus: "approved",
    },
    orderBy: [{ createdAt: "asc" }],
    select: {
      id: true,
      name: true,
      username: true,
      role: true,
      aiPermission: {
        select: {
          isEnabled: true,
          maxCount: true,
          usedCount: true,
          resetAt: true,
        },
      },
    },
  });

  return users.map((user) => {
    const snapshot = buildAiPermissionSnapshot(user.role, user.aiPermission);

    return {
      userId: user.id,
      name: user.name,
      username: user.username,
      role: user.role,
      ...serializePermissionSnapshot(snapshot),
    } satisfies AiPermissionRow;
  });
}

export async function updateAiPermissionForUser(
  userId: string,
  input: {
    isEnabled: boolean;
    maxCountInput?: string | null;
    resetUsage?: boolean;
  },
) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      aiPermission: {
        select: {
          usedCount: true,
        },
      },
    },
  });

  if (!user) {
    throw new Error("用户不存在");
  }

  const maxCount = parseAiMaxCountInput(input.maxCountInput);
  const usedCount = input.resetUsage ? 0 : user.aiPermission?.usedCount ?? 0;

  await prisma.aiPermission.upsert({
    where: { userId },
    create: {
      userId,
      isEnabled: input.isEnabled,
      maxCount,
      usedCount,
      resetAt: null,
    },
    update: {
      isEnabled: input.isEnabled,
      maxCount,
      usedCount,
      ...(input.resetUsage ? { resetAt: null } : {}),
    },
  });

  const snapshot = buildAiPermissionSnapshot(user.role, {
    isEnabled: input.isEnabled,
    maxCount,
    usedCount,
    resetAt: null,
  });

  return serializePermissionSnapshot(snapshot);
}

export async function listAiConversations(userId: string) {
  const payload = await requestDifyJson<DifyConversationListResponse>(
    `/conversations?user=${encodeURIComponent(userId)}&limit=100&sort_by=-updated_at`,
  );

  return (payload.data ?? []).map((conversation) => ({
    id: conversation.id,
    title: normalizeConversationTitle(conversation.name),
    createdAt: toIsoStringFromUnix(conversation.created_at),
    updatedAt: toIsoStringFromUnix(conversation.updated_at),
  })) satisfies AiConversationSummary[];
}

export async function getAiConversationMessages(input: {
  userId: string;
  conversationId: string;
}) {
  const payload = await requestDifyJson<DifyMessageListResponse>(
    `/messages?conversation_id=${encodeURIComponent(input.conversationId)}&user=${encodeURIComponent(input.userId)}&limit=100`,
  );

  return normalizeConversationMessages(payload.data ?? []);
}

export async function deleteAiConversation(input: {
  userId: string;
  conversationId: string;
}) {
  const config = getDifyConfig();
  const response = await fetch(`${config.baseUrl}/conversations/${encodeURIComponent(input.conversationId)}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      user: input.userId,
    }),
  });

  if (!response.ok) {
    throw new Error(await parseDifyError(response));
  }

  await prisma.aiConversation.deleteMany({
    where: {
      userId: input.userId,
      conversationId: input.conversationId,
    },
  });
}

export async function sendAiChatMessage(input: {
  userId: string;
  query: string;
  conversationId?: string | null;
}) {
  const trimmedQuery = input.query.trim();
  if (!trimmedQuery) {
    throw new Error("请输入问题后再发送");
  }

  const { snapshot } = await loadAiAccessState(input.userId);
  assertAiAccessAllowed(snapshot);

  const result = await sendDifyChatMessageBlocking({
    query: trimmedQuery,
    userId: input.userId,
    conversationId: input.conversationId,
  });

  const updatedPermission = await finalizeAiUsage({
    userId: input.userId,
    conversationId: result.conversationId,
    title: trimmedQuery.slice(0, 48),
  });

  return {
    answer: result.answer,
    conversationId: result.conversationId,
    messageId: result.messageId,
    permission: updatedPermission,
  };
}

export async function streamAiChatMessage(input: {
  userId: string;
  query: string;
  conversationId?: string | null;
}) {
  const trimmedQuery = input.query.trim();
  if (!trimmedQuery) {
    throw new Error("请输入问题后再发送");
  }

  const { snapshot } = await loadAiAccessState(input.userId);
  assertAiAccessAllowed(snapshot);

  const config = getDifyConfig();
  const difyResponse = await fetch(`${config.baseUrl}/chat-messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      inputs: {},
      query: trimmedQuery,
      response_mode: "streaming",
      conversation_id: input.conversationId || undefined,
      user: input.userId,
    }),
  });

  if (!difyResponse.ok) {
    throw new Error(await parseDifyError(difyResponse));
  }

  if (!difyResponse.body) {
    throw new Error("AI 助手流式通道不可用，请稍后重试");
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let buffer = "";
      let answer = "";
      let conversationId = input.conversationId ?? null;
      let messageId: string | null = null;
      let finalized = false;
      const thinkFilter = new ThinkTagFilter();

      const reader = difyResponse.body!.getReader();

      const emit = (event: string, data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(buildSseEvent(event, data)));
      };

      const finalizeSuccess = async () => {
        if (finalized || !conversationId) {
          return;
        }

        finalized = true;
        const permission = await finalizeAiUsage({
          userId: input.userId,
          conversationId,
          title: trimmedQuery.slice(0, 48),
        });

        emit("done", {
          answer,
          conversationId,
          messageId,
          permission,
        });
        controller.close();
      };

      const fail = (message: string) => {
        if (finalized) {
          return;
        }

        finalized = true;
        emit("error", { message });
        controller.close();
      };

      try {
        while (true) {
          const { value, done } = await reader.read();

          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });

          while (buffer.includes("\n\n")) {
            const boundaryIndex = buffer.indexOf("\n\n");
            const rawChunk = buffer.slice(0, boundaryIndex).trim();
            buffer = buffer.slice(boundaryIndex + 2);

            if (!rawChunk) {
              continue;
            }

            const dataLine = rawChunk
              .split("\n")
              .find((line) => line.trimStart().startsWith("data:"));

            if (!dataLine) {
              continue;
            }

            const payload = JSON.parse(dataLine.replace(/^data:\s*/, "")) as DifyStreamingEvent;

            if (payload.event === "message" || payload.event === "agent_message") {
              const result = thinkFilter.process(payload.answer ?? "");
              const delta = result.content;
              conversationId = payload.conversation_id ?? conversationId;
              messageId = payload.message_id ?? messageId;

              if (delta) {
                answer += delta;

                emit("delta", {
                  delta,
                  answer,
                  conversationId,
                  messageId,
                });
              }
            }

            if (payload.event === "message_end") {
              conversationId = payload.conversation_id ?? conversationId;
              messageId = payload.message_id ?? messageId;
              const flushed = thinkFilter.flush();

              if (flushed.content) {
                answer += flushed.content;
                emit("delta", {
                  delta: flushed.content,
                  answer,
                  conversationId,
                  messageId,
                });
              }

              await finalizeSuccess();
              return;
            }

            if (payload.event === "error") {
              throw new Error(payload.message || "AI 助手暂时不可用，请稍后重试");
            }
          }
        }

        buffer += decoder.decode();
        const flushed = thinkFilter.flush();

        if (flushed.content) {
          answer += flushed.content;
          emit("delta", {
            delta: flushed.content,
            answer,
            conversationId,
            messageId,
          });
        }

        if (!finalized && answer && conversationId) {
          await finalizeSuccess();
          return;
        }

        if (!finalized) {
          fail("AI 助手返回内容异常，请稍后重试");
        }
      } catch (error) {
        fail(error instanceof Error ? error.message : "AI 助手暂时不可用，请稍后重试");
      }
    },
  });
}

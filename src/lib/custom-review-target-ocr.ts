import { parseCustomReviewTargetNames } from "@/lib/custom-review-targets";

type DifyUploadResponse = {
  id?: string;
};

type DifyVisionResponse = {
  answer?: string;
  message?: string;
};

const DEFAULT_DIFY_BASE_URL = "https://api.dify.ai/v1";

const getDifyConfig = () => {
  const apiKey = process.env.DIFY_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("AI 识别服务尚未配置");
  }

  return {
    apiKey,
    baseUrl: (process.env.DIFY_BASE_URL?.trim() || DEFAULT_DIFY_BASE_URL).replace(/\/$/, ""),
  };
};

const parseDifyError = async (response: Response) => {
  const payload = (await response.json().catch(() => null)) as { message?: string } | null;
  return payload?.message || "截图识别服务暂时不可用";
};

const removeThinkTags = (value: string) => value.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

const extractProjectNamesFromAiAnswer = (answer: string) => {
  const cleanAnswer = removeThinkTags(answer);
  const jsonStart = cleanAnswer.indexOf("{");
  const jsonEnd = cleanAnswer.lastIndexOf("}");

  if (jsonStart >= 0 && jsonEnd > jsonStart) {
    const payload = JSON.parse(cleanAnswer.slice(jsonStart, jsonEnd + 1)) as {
      projectNames?: unknown;
    };
    if (Array.isArray(payload.projectNames)) {
      return parseCustomReviewTargetNames(payload.projectNames.filter((item): item is string => typeof item === "string"));
    }
  }

  return parseCustomReviewTargetNames(cleanAnswer);
};

const uploadScreenshotToDify = async (file: File, userId: string) => {
  const config = getDifyConfig();
  const formData = new FormData();
  formData.append("file", file, file.name || "project-names.png");
  formData.append("user", userId);

  const response = await fetch(`${config.baseUrl}/files/upload`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    throw new Error(await parseDifyError(response));
  }

  const payload = (await response.json()) as DifyUploadResponse;
  if (!payload.id) {
    throw new Error("截图上传成功但未返回文件 ID");
  }

  return payload.id;
};

export const recognizeCustomReviewTargetNamesFromImage = async (file: File, userId: string) => {
  const config = getDifyConfig();
  const uploadFileId = await uploadScreenshotToDify(file, userId);

  const response = await fetch(`${config.baseUrl}/chat-messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      inputs: {},
      query:
        "请从图片中只提取“项目名称/项目名”这一列的项目名称。不要提取序号、推荐单位、赛道、组别、类别、负责人或表头。若同一个单元格内项目名因换行被拆开，请合并为一个完整项目名。保持原文标点，不要编造。只返回 JSON，格式为 {\"projectNames\":[\"项目名1\",\"项目名2\"]}。",
      response_mode: "blocking",
      user: userId,
      files: [
        {
          type: "image",
          transfer_method: "local_file",
          upload_file_id: uploadFileId,
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(await parseDifyError(response));
  }

  const payload = (await response.json()) as DifyVisionResponse;
  const answer = payload.answer?.trim();
  if (!answer) {
    throw new Error(payload.message || "截图识别没有返回项目名称");
  }

  return extractProjectNamesFromAiAnswer(answer);
};

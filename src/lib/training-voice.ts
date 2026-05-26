const DEFAULT_DIFY_BASE_URL = "https://api.dify.ai/v1";
const MAX_TRAINING_AUDIO_SIZE = 15 * 1024 * 1024;
const SUPPORTED_TRAINING_AUDIO_TYPES = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/mp4a-latm",
  "audio/m4a",
  "audio/wav",
  "audio/webm",
  "audio/x-m4a",
]);

const normalizeAudioMimeType = (value: string) => value.split(";")[0]?.trim().toLowerCase() ?? "";

const DIFY_AUDIO_MIME_ALIASES: Record<string, string> = {
  "audio/mp3": "audio/mpeg",
  "audio/mp4a-latm": "audio/mp4",
  "audio/x-m4a": "audio/m4a",
};

type DifyAudioToTextResponse = {
  text?: string;
  message?: string;
};

const getDifySpeechConfig = () => {
  const apiKey = process.env.DIFY_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("语音转写服务尚未配置 Dify API Key");
  }

  return {
    apiKey,
    baseUrl: (process.env.DIFY_BASE_URL?.trim() || DEFAULT_DIFY_BASE_URL).replace(/\/$/, ""),
  };
};

export const normalizeDifySpeechErrorMessage = (message?: string) => {
  const normalizedMessage = message?.trim();
  if (!normalizedMessage) {
    return "语音转写失败，请稍后重试";
  }

  if (normalizedMessage.toLowerCase().includes("speech to text is not enabled")) {
    return "服务端语音转写未开启，请管理员在 Dify 应用中启用 Speech to text。";
  }

  return normalizedMessage;
};

const parseDifySpeechError = async (response: Response) => {
  const payload = (await response.json().catch(() => null)) as DifyAudioToTextResponse | null;
  return normalizeDifySpeechErrorMessage(payload?.message);
};

export const validateTrainingAudioFile = (file: File | null) => {
  if (!file) {
    return "请先录制一段回答";
  }

  if (file.size <= 0) {
    return "录音内容为空，请重新回答";
  }

  if (file.size > MAX_TRAINING_AUDIO_SIZE) {
    return "单次录音最大 15MB，请缩短回答时间后重试";
  }

  const normalizedType = normalizeAudioMimeType(file.type);
  if (normalizedType && !SUPPORTED_TRAINING_AUDIO_TYPES.has(normalizedType)) {
    return "当前浏览器录音格式暂不支持，请换用 Chrome 或 Edge 后重试";
  }

  return null;
};

export const normalizeTrainingAudioFileForDify = (file: File) => {
  const normalizedType = normalizeAudioMimeType(file.type);
  const difyType = DIFY_AUDIO_MIME_ALIASES[normalizedType] ?? normalizedType;

  if (!difyType || difyType === file.type) {
    return file;
  }

  return new File([file], file.name, {
    type: difyType,
    lastModified: file.lastModified,
  });
};

export async function transcribeTrainingAudio(input: { file: File | null; userId: string }) {
  const validationError = validateTrainingAudioFile(input.file);
  if (validationError) {
    throw new Error(validationError);
  }

  const file = input.file;
  if (!file) {
    throw new Error("请先录制一段回答");
  }

  const config = getDifySpeechConfig();
  const difyFile = normalizeTrainingAudioFileForDify(file);
  const formData = new FormData();
  formData.append("file", difyFile);
  formData.append("user", input.userId);

  const response = await fetch(`${config.baseUrl}/audio-to-text`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      Accept: "application/json",
    },
    body: formData,
  });

  if (!response.ok) {
    throw new Error(await parseDifySpeechError(response));
  }

  const payload = (await response.json()) as DifyAudioToTextResponse;
  const transcript = payload.text?.trim();
  if (!transcript) {
    throw new Error("没有识别到有效语音内容");
  }

  return transcript;
}

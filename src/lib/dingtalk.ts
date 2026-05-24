type DingTalkConfig = {
  corpId: string;
  agentId: string;
  appKey: string;
  appSecret: string;
};

type DingTalkAccessTokenResponse =
  | {
      accessToken?: string;
      expireIn?: number;
    }
  | {
      code?: string;
      message?: string;
      requestid?: string;
    };

type DingTalkUserInfoResponse = {
  errcode?: number;
  errmsg?: string;
  result?: {
    userid?: string;
    name?: string;
    unionid?: string;
    associated_unionid?: string;
    device_id?: string;
    sys?: boolean;
    sys_level?: number;
  };
  request_id?: string;
};

export type DingTalkUserIdentity = {
  corpId: string;
  userId: string;
  unionId: string | null;
  name: string;
};

const trimEnv = (key: string) => process.env[key]?.trim() ?? "";

export const getDingTalkConfig = (): DingTalkConfig | null => {
  const corpId = trimEnv("DINGTALK_CORP_ID");
  const agentId = trimEnv("DINGTALK_AGENT_ID");
  const appKey = trimEnv("DINGTALK_APP_KEY");
  const appSecret = trimEnv("DINGTALK_APP_SECRET");

  if (!corpId || !agentId || !appKey || !appSecret) {
    return null;
  }

  return { corpId, agentId, appKey, appSecret };
};

export const getDingTalkPublicConfig = () => {
  const corpId = trimEnv("DINGTALK_CORP_ID");
  const agentId = trimEnv("DINGTALK_AGENT_ID");

  return corpId && agentId ? { corpId, agentId } : null;
};

const parseDingTalkJson = async <T>(response: Response) => {
  const data = (await response.json().catch(() => null)) as T | null;
  if (!response.ok) {
    throw new Error(`钉钉接口请求失败：HTTP ${response.status}`);
  }

  return data;
};

const getDingTalkAccessToken = async (config: DingTalkConfig) => {
  const response = await fetch("https://api.dingtalk.com/v1.0/oauth2/accessToken", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      appKey: config.appKey,
      appSecret: config.appSecret,
    }),
    cache: "no-store",
  });

  const data = await parseDingTalkJson<DingTalkAccessTokenResponse>(response);
  if (!data || !("accessToken" in data) || !data.accessToken) {
    const message = data && "message" in data && data.message ? data.message : "未返回 accessToken";
    throw new Error(`获取钉钉访问凭证失败：${message}`);
  }

  return data.accessToken;
};

export const getDingTalkUserByAuthCode = async (authCode: string): Promise<DingTalkUserIdentity> => {
  const config = getDingTalkConfig();
  if (!config) {
    throw new Error("钉钉应用环境变量未配置完整");
  }

  const code = authCode.trim();
  if (!code) {
    throw new Error("缺少钉钉免登授权码");
  }

  const accessToken = await getDingTalkAccessToken(config);
  const response = await fetch(
    `https://oapi.dingtalk.com/topapi/v2/user/getuserinfo?access_token=${encodeURIComponent(accessToken)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
      cache: "no-store",
    },
  );

  const data = await parseDingTalkJson<DingTalkUserInfoResponse>(response);
  if (!data || data.errcode !== 0 || !data.result?.userid) {
    throw new Error(`获取钉钉用户信息失败：${data?.errmsg ?? "未知错误"}`);
  }

  return {
    corpId: config.corpId,
    userId: data.result.userid,
    unionId: data.result.unionid ?? data.result.associated_unionid ?? null,
    name: data.result.name ?? "钉钉用户",
  };
};

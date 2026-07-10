export type BrowserGeolocation = Pick<Geolocation, "getCurrentPosition">;
export type BrowserGeolocationPermissionState = PermissionState | "unsupported";

const requestPosition = (geolocation: BrowserGeolocation, options: PositionOptions) =>
  new Promise<GeolocationPosition>((resolve, reject) => {
    geolocation.getCurrentPosition(resolve, reject, options);
  });

const getLocationErrorCode = (error: unknown) => {
  if (!error || typeof error !== "object" || !("code" in error)) {
    return 0;
  }

  const code = Number(error.code);
  return Number.isFinite(code) ? code : 0;
};

export async function getReliableBrowserPosition(geolocation: BrowserGeolocation) {
  try {
    return await requestPosition(geolocation, {
      enableHighAccuracy: true,
      maximumAge: 15_000,
      timeout: 10_000,
    });
  } catch (error) {
    if (getLocationErrorCode(error) === 1) {
      throw error;
    }

    return requestPosition(geolocation, {
      enableHighAccuracy: false,
      maximumAge: 120_000,
      timeout: 15_000,
    });
  }
}

export async function getBrowserGeolocationPermissionState(
  permissions?: Pick<Permissions, "query">,
): Promise<BrowserGeolocationPermissionState> {
  if (!permissions) {
    return "unsupported";
  }

  try {
    const status = await permissions.query({ name: "geolocation" });
    return status.state;
  } catch {
    return "unsupported";
  }
}

export function getBrowserLocationErrorMessage(
  error: unknown,
  permissionState: BrowserGeolocationPermissionState,
) {
  const code = getLocationErrorCode(error);

  if (code === 1 && permissionState === "granted") {
    return "网站位置权限已允许，但设备定位服务或当前浏览器未能提供位置。请开启设备定位服务，或用系统浏览器打开后重试；仍失败时联系管理端补签。";
  }
  if (code === 1) {
    return "浏览器尚未获得位置权限，请在地址栏的网站权限中允许位置后重试；仍失败时联系管理端补签。";
  }
  if (code === 3) {
    return "定位超时，请到窗边或网络较稳定的位置后重试；仍失败时联系管理端补签。";
  }
  if (code === 2) {
    return "设备暂时无法获取位置，请确认系统定位服务已开启后重试；仍失败时联系管理端补签。";
  }

  return "定位未完成，请检查设备定位和网络后重试；仍失败时联系管理端补签。";
}

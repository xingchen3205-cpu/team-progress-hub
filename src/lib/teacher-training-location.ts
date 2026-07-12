// 线下签到"地图选点"相关的纯函数，便于测试与前端复用。

export const TEACHER_TRAINING_CHECK_IN_MIN_RADIUS_METERS = 50;
export const TEACHER_TRAINING_CHECK_IN_MAX_RADIUS_METERS = 5000;

// 与后端 clampRadiusMeters 保持一致的范围裁剪。
export const clampTeacherTrainingRadiusMeters = (value: unknown, fallback = 500): number => {
  const radius = Number(value);
  if (!Number.isFinite(radius)) return fallback;
  return Math.min(
    TEACHER_TRAINING_CHECK_IN_MAX_RADIUS_METERS,
    Math.max(TEACHER_TRAINING_CHECK_IN_MIN_RADIUS_METERS, Math.round(radius)),
  );
};

export type AmapLikePoi = {
  name?: string | null;
  address?: string | unknown;
  district?: string | null;
  location?: { lng?: number; lat?: number } | null;
};

export type TeacherTrainingLocationFields = {
  locationName: string;
  address: string;
  latitude: string;
  longitude: string;
};

const toCoordinateString = (value: unknown): string => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toFixed(6) : "";
};

// 从高德/腾讯 POI 结果生成地点名称、详细地址、纬度、经度（经纬度保留 6 位小数）。
export const buildTeacherTrainingLocationFields = (poi: AmapLikePoi | null | undefined): TeacherTrainingLocationFields => {
  const name = `${poi?.name ?? ""}`.trim();
  const rawAddress = typeof poi?.address === "string" ? poi.address : "";
  const district = `${poi?.district ?? ""}`.trim();
  const address = `${district}${rawAddress}`.trim() || rawAddress.trim();
  return {
    locationName: name,
    address,
    latitude: toCoordinateString(poi?.location?.lat),
    longitude: toCoordinateString(poi?.location?.lng),
  };
};

// 已选地点摘要："已选择：地点名称 · 详细地址 · 有效范围 X 米"。
export const formatTeacherTrainingLocationSummary = (params: {
  locationName?: string | null;
  address?: string | null;
  radiusMeters?: unknown;
}): string => {
  const name = `${params.locationName ?? ""}`.trim();
  const address = `${params.address ?? ""}`.trim();
  const radius = clampTeacherTrainingRadiusMeters(params.radiusMeters);
  if (!name && !address) {
    return "尚未选择签到地点";
  }
  return `已选择：${[name, address].filter(Boolean).join(" · ")} · 有效范围 ${radius} 米`;
};

export const hasValidTeacherTrainingCoordinateStrings = (latitude?: string | null, longitude?: string | null): boolean => {
  const lat = Number(latitude);
  const lng = Number(longitude);
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180 &&
    !(lat === 0 && lng === 0)
  );
};

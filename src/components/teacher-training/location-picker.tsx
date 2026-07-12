"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, LocateFixed, MapPin, Navigation, Search } from "lucide-react";

import {
  getBrowserGeolocationPermissionState,
  getBrowserLocationErrorMessage,
  getReliableBrowserPosition,
} from "@/lib/browser-geolocation";
import {
  buildTeacherTrainingLocationFields,
  clampTeacherTrainingRadiusMeters,
  formatTeacherTrainingLocationSummary,
  hasValidTeacherTrainingCoordinateStrings,
  type AmapLikePoi,
} from "@/lib/teacher-training-location";

// 只声明本组件用到的高德 JS API 结构，避免引入 any 与额外类型依赖。
type LngLat = { lng: number; lat: number };
type MapInstance = {
  destroy: () => void;
  on: (event: string, handler: (event: { lnglat: LngLat }) => void) => void;
  setZoomAndCenter: (zoom: number, center: [number, number]) => void;
  add: (overlay: unknown) => void;
};
type MarkerInstance = {
  setPosition: (position: [number, number]) => void;
  getPosition: () => LngLat;
  on: (event: string, handler: () => void) => void;
};
type CircleInstance = {
  setCenter: (center: [number, number]) => void;
  setRadius: (radius: number) => void;
};
type PlaceSearchInstance = {
  search: (
    keyword: string,
    callback: (status: string, result: { poiList?: { pois?: AmapLikePoi[] } }) => void,
  ) => void;
};
type GeocoderInstance = {
  getAddress: (
    position: [number, number],
    callback: (status: string, result: { regeocode?: { formattedAddress?: string } }) => void,
  ) => void;
};
type AmapApi = {
  Map: new (container: HTMLElement, options: Record<string, unknown>) => MapInstance;
  Marker: new (options: Record<string, unknown>) => MarkerInstance;
  Circle: new (options: Record<string, unknown>) => CircleInstance;
  PlaceSearch: new (options: Record<string, unknown>) => PlaceSearchInstance;
  Geocoder: new (options: Record<string, unknown>) => GeocoderInstance;
};

type LocationValue = {
  locationName: string;
  latitude: string;
  longitude: string;
  radiusMeters: string;
};

type LocationPatch = Partial<LocationValue>;

const AMAP_KEY = process.env.NEXT_PUBLIC_AMAP_KEY ?? "";
const AMAP_SECURITY_CODE = process.env.NEXT_PUBLIC_AMAP_SECURITY_CODE ?? "";
const DEFAULT_CENTER: [number, number] = [118.796, 32.06]; // 南京，缺省中心
let amapLoaderPromise: Promise<AmapApi> | null = null;

const loadAmap = (): Promise<AmapApi> => {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  const existing = (window as unknown as { AMap?: AmapApi }).AMap;
  if (existing) return Promise.resolve(existing);
  if (amapLoaderPromise) return amapLoaderPromise;
  if (!AMAP_KEY) return Promise.reject(new Error("missing-key"));

  amapLoaderPromise = new Promise<AmapApi>((resolve, reject) => {
    if (AMAP_SECURITY_CODE) {
      (window as unknown as { _AMapSecurityConfig?: { securityJsCode: string } })._AMapSecurityConfig = {
        securityJsCode: AMAP_SECURITY_CODE,
      };
    }
    const script = document.createElement("script");
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(
      AMAP_KEY,
    )}&plugin=AMap.PlaceSearch,AMap.Geocoder`;
    script.async = true;
    script.onload = () => {
      const api = (window as unknown as { AMap?: AmapApi }).AMap;
      if (api) resolve(api);
      else reject(new Error("amap-load-failed"));
    };
    script.onerror = () => reject(new Error("amap-load-failed"));
    document.head.appendChild(script);
  });
  return amapLoaderPromise;
};

export function TeacherTrainingLocationPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: LocationValue;
  onChange: (patch: LocationPatch) => void;
  disabled?: boolean;
}) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapInstance | null>(null);
  const markerRef = useRef<MarkerInstance | null>(null);
  const circleRef = useRef<CircleInstance | null>(null);
  const placeSearchRef = useRef<PlaceSearchInstance | null>(null);
  const geocoderRef = useRef<GeocoderInstance | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const [keyword, setKeyword] = useState("");
  const [candidates, setCandidates] = useState<AmapLikePoi[]>([]);
  const [address, setAddress] = useState("");
  const [searching, setSearching] = useState(false);
  const [mapError, setMapError] = useState<"" | "missing-key" | "load-failed">(AMAP_KEY ? "" : "missing-key");
  const [locating, setLocating] = useState(false);
  const [coordDetailsOpen, setCoordDetailsOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  const radiusMeters = clampTeacherTrainingRadiusMeters(value.radiusMeters);

  // 选点后：落标记、居中、写回名称/经纬度，并反查详细地址。
  const applyPoint = useCallback(
    (lng: number, lat: number, poi?: AmapLikePoi, fallbackName = "地图选点") => {
      if (!Number.isFinite(lng) || !Number.isFinite(lat) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        setStatusMessage("地点坐标无效，请重新选择。");
        return;
      }
      markerRef.current?.setPosition([lng, lat]);
      circleRef.current?.setCenter([lng, lat]);
      mapRef.current?.setZoomAndCenter(16, [lng, lat]);
      const fields = buildTeacherTrainingLocationFields({
        ...poi,
        location: { lng, lat },
      });
      if (poi?.name) {
        onChangeRef.current({ locationName: fields.locationName, latitude: fields.latitude, longitude: fields.longitude });
        setAddress(fields.address);
      } else {
        onChangeRef.current({
          locationName: fallbackName,
          latitude: fields.latitude,
          longitude: fields.longitude,
        });
        setAddress("");
        geocoderRef.current?.getAddress([lng, lat], (status, result) => {
          if (status === "complete" && result.regeocode?.formattedAddress) {
            const formattedAddress = result.regeocode.formattedAddress.trim();
            setAddress(formattedAddress);
            onChangeRef.current({ locationName: formattedAddress });
          }
        });
      }
      setStatusMessage("");
    },
    [],
  );

  // 初始化地图（有密钥时）。
  useEffect(() => {
    if (!AMAP_KEY || !mapContainerRef.current) return;
    let cancelled = false;
    loadAmap()
      .then((AMap) => {
        if (cancelled || !mapContainerRef.current) return;
        const startLng = Number(value.longitude);
        const startLat = Number(value.latitude);
        const center: [number, number] = hasValidTeacherTrainingCoordinateStrings(value.latitude, value.longitude)
          ? [startLng, startLat]
          : DEFAULT_CENTER;
        const map = new AMap.Map(mapContainerRef.current, {
          zoom: 15,
          center,
          resizeEnable: true,
        });
        const marker = new AMap.Marker({ position: center, draggable: !disabled });
        const circle = new AMap.Circle({
          center,
          radius: radiusMeters,
          strokeColor: "#1a6fd4",
          strokeOpacity: 0.9,
          strokeWeight: 2,
          fillColor: "#1a6fd4",
          fillOpacity: 0.15,
        });
        map.add(marker);
        map.add(circle);
        mapRef.current = map;
        markerRef.current = marker;
        circleRef.current = circle;
        placeSearchRef.current = new AMap.PlaceSearch({ pageSize: 10 });
        geocoderRef.current = new AMap.Geocoder({});
        if (!disabled) {
          map.on("click", (event) => applyPoint(event.lnglat.lng, event.lnglat.lat));
          marker.on("dragend", () => {
            const position = marker.getPosition();
            applyPoint(position.lng, position.lat);
          });
        }
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setMapError(error instanceof Error && error.message === "missing-key" ? "missing-key" : "load-failed");
      });
    return () => {
      cancelled = true;
      mapRef.current?.destroy();
      mapRef.current = null;
    };
    // 仅在挂载时初始化一次；后续通过 ref 更新。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 修改有效范围时，地图覆盖圆同步。
  useEffect(() => {
    circleRef.current?.setRadius(radiusMeters);
  }, [radiusMeters]);

  // 修改不同签到任务时，同步已有坐标到地图，不沿用上一场的标记位置。
  useEffect(() => {
    if (!hasValidTeacherTrainingCoordinateStrings(value.latitude, value.longitude)) return;
    const lng = Number(value.longitude);
    const lat = Number(value.latitude);
    markerRef.current?.setPosition([lng, lat]);
    circleRef.current?.setCenter([lng, lat]);
    mapRef.current?.setZoomAndCenter(16, [lng, lat]);
  }, [value.latitude, value.longitude]);

  const runSearch = useCallback(() => {
    const trimmed = keyword.trim();
    if (!trimmed) return;
    if (!placeSearchRef.current) {
      setStatusMessage("地图搜索暂不可用，可点击地图或使用当前位置选点。");
      return;
    }
    setSearching(true);
    setStatusMessage("");
    placeSearchRef.current.search(trimmed, (status, result) => {
      setSearching(false);
      if (status === "complete" && result.poiList?.pois?.length) {
        setCandidates(result.poiList.pois);
      } else {
        setCandidates([]);
        setStatusMessage("没有找到匹配的地点，请更换关键词或点击地图选点。");
      }
    });
  }, [keyword]);

  const selectCandidate = (poi: AmapLikePoi) => {
    const lng = Number(poi.location?.lng);
    const lat = Number(poi.location?.lat);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;
    applyPoint(lng, lat, poi);
    setCandidates([]);
    setKeyword(`${poi.name ?? ""}`.trim());
  };

  const useCurrentLocation = async () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setStatusMessage("当前浏览器不支持读取位置，请手动在地图上点击选点。");
      return;
    }
    setLocating(true);
    const permissionStatePromise = getBrowserGeolocationPermissionState(navigator.permissions);
    try {
      const position = await getReliableBrowserPosition(navigator.geolocation);
      applyPoint(position.coords.longitude, position.coords.latitude, undefined, "当前位置");
    } catch (error) {
      const permissionState = await permissionStatePromise;
      setStatusMessage(getBrowserLocationErrorMessage(error, permissionState));
    } finally {
      setLocating(false);
    }
  };

  const hasSelection = hasValidTeacherTrainingCoordinateStrings(value.latitude, value.longitude);
  const summary = formatTeacherTrainingLocationSummary({
    locationName: value.locationName,
    address,
    radiusMeters,
  });

  return (
    <div className="space-y-3">
      {/* 地址搜索框 */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            aria-label="搜索签到地点"
            className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-blue-400"
            disabled={disabled || mapError === "missing-key"}
            onChange={(event) => setKeyword(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                runSearch();
              }
            }}
            placeholder="输入地点关键词，如：珍珠泉、明发珍珠泉大酒店"
            value={keyword}
          />
        </div>
        <button
          className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
          disabled={disabled || searching || mapError === "missing-key" || !keyword.trim()}
          onClick={runSearch}
          type="button"
        >
          <Search className="h-4 w-4" />
          {searching ? "搜索中" : "搜索"}
        </button>
      </div>

      {/* 候选地址列表 */}
      {candidates.length > 0 ? (
        <ul className="max-h-56 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200 bg-white">
          {candidates.map((poi, index) => (
            <li key={`${poi.name ?? "poi"}-${index}`}>
              <button
                className="flex w-full flex-col gap-0.5 px-3 py-2 text-left transition hover:bg-blue-50"
                onClick={() => selectCandidate(poi)}
                type="button"
              >
                <span className="text-sm font-semibold text-slate-900">{poi.name ?? "未命名地点"}</span>
                <span className="break-words text-xs text-slate-500">
                  {[`${poi.district ?? ""}`, typeof poi.address === "string" ? poi.address : ""].filter(Boolean).join("") ||
                    "无详细地址"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {/* 地图选点区域 / 缺密钥降级 */}
      {mapError === "missing-key" ? (
        <div className="flex min-h-[180px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center">
          <MapPin className="h-6 w-6 text-slate-400" />
          <p className="text-sm font-semibold text-slate-600">地图服务暂未配置</p>
          <p className="max-w-xs text-xs leading-5 text-slate-500">
            未配置地图密钥（NEXT_PUBLIC_AMAP_KEY）。可先用“使用当前位置”作为临时选点方式，教师签到时距离校验仍然生效。
          </p>
        </div>
      ) : (
        <div className="relative">
          <div
            ref={mapContainerRef}
            aria-label="签到地点地图选点"
            className="h-[260px] w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-100"
          />
          {mapError === "load-failed" ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-lg bg-slate-50/95 px-4 text-center">
              <MapPin className="h-6 w-6 text-slate-400" />
              <p className="text-sm font-semibold text-slate-600">地图加载失败</p>
              <p className="text-xs text-slate-500">可使用“使用当前位置”临时选点，或稍后重试。</p>
            </div>
          ) : null}
        </div>
      )}

      {/* 有效签到范围 */}
      <label className="block">
        <span className="text-xs font-semibold text-slate-500">有效签到范围（米）</span>
        <input
          aria-label="有效签到范围米数"
          className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-400 sm:max-w-[200px]"
          disabled={disabled}
          max={5000}
          min={50}
          onChange={(event) => onChange({ radiusMeters: event.target.value })}
          type="number"
          value={value.radiusMeters}
        />
      </label>

      {/* 辅助入口：使用当前位置 */}
      <div className="flex flex-wrap gap-2">
        <button
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
          disabled={disabled || locating}
          onClick={useCurrentLocation}
          type="button"
        >
          {locating ? <LocateFixed className="h-3.5 w-3.5 animate-pulse" /> : <Navigation className="h-3.5 w-3.5" />}
          使用当前位置
        </button>
      </div>

      {statusMessage ? (
        <p className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-700">
          {statusMessage}
        </p>
      ) : null}

      {/* 已选地点摘要 */}
      <div
        className={`rounded-lg border px-3 py-2 text-xs leading-5 ${
          hasSelection ? "border-blue-100 bg-blue-50/70 text-blue-800" : "border-slate-200 bg-slate-50 text-slate-700"
        }`}
      >
        {summary}
      </div>

      {/* 坐标详情：折叠、只读 */}
      <div className="rounded-lg border border-slate-100 bg-white">
        <button
          className="flex w-full items-center justify-between px-3 py-2 text-xs font-semibold text-slate-500"
          onClick={() => setCoordDetailsOpen((open) => !open)}
          type="button"
        >
          坐标详情（只读）
          <ChevronDown className={`h-3.5 w-3.5 transition ${coordDetailsOpen ? "rotate-180" : ""}`} />
        </button>
        {coordDetailsOpen ? (
          <div className="grid gap-2 px-3 pb-3 sm:grid-cols-2">
            <p className="rounded border border-slate-100 bg-slate-50 px-2 py-1 text-xs text-slate-600">
              纬度：{value.latitude || "—"}
            </p>
            <p className="rounded border border-slate-100 bg-slate-50 px-2 py-1 text-xs text-slate-600">
              经度：{value.longitude || "—"}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

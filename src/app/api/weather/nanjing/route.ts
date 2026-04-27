import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type OpenMeteoCurrent = {
  time?: string;
  temperature_2m?: number;
  weather_code?: number;
};

type OpenMeteoPayload = {
  current?: OpenMeteoCurrent;
  current_units?: {
    temperature_2m?: string;
  };
};

const weatherCodeLabels = new Map<number, string>([
  [0, "晴"],
  [1, "多云"],
  [2, "多云"],
  [3, "阴"],
  [45, "雾"],
  [48, "雾"],
  [51, "小雨"],
  [53, "小雨"],
  [55, "小雨"],
  [61, "雨"],
  [63, "中雨"],
  [65, "大雨"],
  [80, "阵雨"],
  [81, "阵雨"],
  [82, "强阵雨"],
  [95, "雷雨"],
  [96, "雷雨"],
  [99, "雷雨"],
]);

export async function GET() {
  const searchParams = new URLSearchParams({
    latitude: "32.0603",
    longitude: "118.7969",
    current: "temperature_2m,weather_code",
    timezone: "Asia/Shanghai",
  });

  try {
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${searchParams}`, {
      next: { revalidate: 15 * 60 },
    });

    if (!response.ok) {
      return NextResponse.json({ message: "天气获取失败" }, { status: 502 });
    }

    const payload = (await response.json()) as OpenMeteoPayload;
    const temperature = payload.current?.temperature_2m;

    if (typeof temperature !== "number" || !Number.isFinite(temperature)) {
      return NextResponse.json({ message: "天气数据无效" }, { status: 502 });
    }

    const weatherCode = payload.current?.weather_code;

    return NextResponse.json(
      {
        city: "南京",
        temperature,
        temperatureUnit: payload.current_units?.temperature_2m ?? "°C",
        weatherCode: typeof weatherCode === "number" ? weatherCode : null,
        weatherText: typeof weatherCode === "number" ? weatherCodeLabels.get(weatherCode) ?? "实时天气" : "实时天气",
        observedAt: payload.current?.time ?? null,
        source: "Open-Meteo",
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=900, stale-while-revalidate=1800",
        },
      },
    );
  } catch {
    return NextResponse.json({ message: "天气服务暂不可用" }, { status: 502 });
  }
}

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

test("workspace weather api proxies current Nanjing weather from Open-Meteo", () => {
  const routePath = path.join(process.cwd(), "src/app/api/weather/nanjing/route.ts");

  assert.equal(existsSync(routePath), true);

  const source = readFileSync(routePath, "utf8");

  assert.match(source, /export async function GET/);
  assert.match(source, /api\.open-meteo\.com\/v1\/forecast/);
  assert.match(source, /latitude.*32\.0603/s);
  assert.match(source, /longitude.*118\.7969/s);
  assert.match(source, /temperature_2m/);
  assert.match(source, /weather_code/);
  assert.match(source, /NextResponse\.json/);
  assert.doesNotMatch(source, /18°C|temperature:\s*18/);
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  getBrowserLocationErrorMessage,
  getReliableBrowserPosition,
} from "../src/lib/browser-geolocation.ts";

type PositionCallback = (position: GeolocationPosition) => void;
type ErrorCallback = (error: GeolocationPositionError) => void;

const position = {
  coords: {
    accuracy: 28,
    altitude: null,
    altitudeAccuracy: null,
    heading: null,
    latitude: 32.087,
    longitude: 118.734,
    speed: null,
    toJSON: () => ({}),
  },
  timestamp: Date.now(),
  toJSON: () => ({}),
} satisfies GeolocationPosition;

const locationError = (code: number, message: string) =>
  ({ code, message, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 }) as GeolocationPositionError;

describe("browser geolocation", () => {
  it("falls back to normal accuracy when high accuracy is temporarily unavailable", async () => {
    const attempts: PositionOptions[] = [];
    const geolocation = {
      getCurrentPosition(success: PositionCallback, error: ErrorCallback, options?: PositionOptions) {
        attempts.push(options ?? {});
        if (attempts.length === 1) {
          error(locationError(2, "position unavailable"));
          return;
        }
        success(position);
      },
    };

    const result = await getReliableBrowserPosition(geolocation);

    assert.equal(result, position);
    assert.equal(attempts.length, 2);
    assert.equal(attempts[0]?.enableHighAccuracy, true);
    assert.equal(attempts[1]?.enableHighAccuracy, false);
    assert.equal(attempts[1]?.maximumAge, 120_000);
  });

  it("does not retry after an actual permission denial", async () => {
    let attemptCount = 0;
    const geolocation = {
      getCurrentPosition(_success: PositionCallback, error: ErrorCallback) {
        attemptCount += 1;
        error(locationError(1, "permission denied"));
      },
    };

    await assert.rejects(() => getReliableBrowserPosition(geolocation), (error) => {
      assert.equal((error as GeolocationPositionError).code, 1);
      return true;
    });
    assert.equal(attemptCount, 1);
  });

  it("distinguishes site permission from device location service failures", () => {
    assert.match(
      getBrowserLocationErrorMessage(locationError(1, "permission denied"), "granted"),
      /网站位置权限已允许.*设备定位服务/,
    );
    assert.match(
      getBrowserLocationErrorMessage(locationError(1, "permission denied"), "denied"),
      /地址栏.*允许位置/,
    );
    assert.match(getBrowserLocationErrorMessage(locationError(3, "timeout"), "prompt"), /定位超时/);
  });
});

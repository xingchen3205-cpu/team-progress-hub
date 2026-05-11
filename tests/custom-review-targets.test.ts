import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { parseCustomReviewTargetNames } from "../src/lib/custom-review-targets";

describe("custom review target parsing", () => {
  it("keeps deliberate one-line-per-project input as separate projects", () => {
    assert.deepEqual(
      parseCustomReviewTargetNames([
        "北斗“芯”盾—基于北斗+UWB多模融合的执行区人员安全防护预警系统",
        "“铁卫双芯”—基于便携式穿戴设备的智能运维辅助平台",
      ]),
      [
        "北斗“芯”盾—基于北斗+UWB多模融合的执行区人员安全防护预警系统",
        "“铁卫双芯”—基于便携式穿戴设备的智能运维辅助平台",
      ],
    );
  });

  it("merges obvious hard-wrapped tails from copied long project names", () => {
    assert.deepEqual(
      parseCustomReviewTargetNames(
        [
          "金蝉智捕-基于LoRa自组网的林下经济数字化与产业振兴实",
          "践者",
          "北斗“芯”盾—基于北斗+UWB多模融合的执行区人员安全防护预警系统",
        ].join("\n"),
      ),
      [
        "金蝉智捕-基于LoRa自组网的林下经济数字化与产业振兴实践者",
        "北斗“芯”盾—基于北斗+UWB多模融合的执行区人员安全防护预警系统",
      ],
    );
  });

  it("does not merge explicit numbered project rows", () => {
    assert.deepEqual(
      parseCustomReviewTargetNames(
        [
          "1. 金蝉智捕-基于LoRa自组网的林下经济数字化与产业振兴实践者",
          "2. 北斗“芯”盾—基于北斗+UWB多模融合的执行区人员安全防护预警系统",
        ].join("\n"),
      ),
      [
        "金蝉智捕-基于LoRa自组网的林下经济数字化与产业振兴实践者",
        "北斗“芯”盾—基于北斗+UWB多模融合的执行区人员安全防护预警系统",
      ],
    );
  });

  it("does not merge a valid short project name after a long project name", () => {
    assert.deepEqual(
      parseCustomReviewTargetNames(
        [
          "北斗“芯”盾—基于北斗+UWB多模融合的执行区人员安全防护预警系统",
          "智在必行",
        ].join("\n"),
      ),
      [
        "北斗“芯”盾—基于北斗+UWB多模融合的执行区人员安全防护预警系统",
        "智在必行",
      ],
    );
  });
});

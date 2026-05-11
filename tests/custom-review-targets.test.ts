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

  it("imports project names from pasted Excel or CSV rows", () => {
    assert.deepEqual(
      parseCustomReviewTargetNames(
        [
          "序号\t项目名称\t推荐单位\t赛道\t组别",
          "1\t金蝉智捕-基于LoRa自组网的林下经济数字化与产业振兴实践者\t铁道运输学院特别长的推荐单位名称\t职教赛道\t创意组",
          "2\t北斗“芯”盾—基于北斗+UWB多模融合的执行区人员安全防护预警系统\t城轨与市域交通学院\t职教赛道\t创意组",
        ].join("\n"),
      ),
      [
        "金蝉智捕-基于LoRa自组网的林下经济数字化与产业振兴实践者",
        "北斗“芯”盾—基于北斗+UWB多模融合的执行区人员安全防护预警系统",
      ],
    );

    assert.deepEqual(
      parseCustomReviewTargetNames(
        [
          "序号,项目名称,负责人",
          "3,智驭安途-铁路调车智能辅助与安全防控系统,王五",
        ].join("\n"),
      ),
      [
        "智驭安途-铁路调车智能辅助与安全防控系统",
      ],
    );
  });
});

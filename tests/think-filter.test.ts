import assert from "node:assert/strict";
import test from "node:test";

import { ThinkTagFilter, removeThinkTags } from "../src/hooks/use-think-filter";

test("removeThinkTags strips complete think blocks in blocking responses", () => {
  assert.equal(removeThinkTags("<think>internal reasoning</think>最终回答"), "最终回答");
});

test("ThinkTagFilter strips think tags split across streaming chunks", () => {
  const filter = new ThinkTagFilter();
  let visible = "";
  let hidden = "";

  for (const chunk of ["开头<thi", "nk>中间思考", "</think>最终"]) {
    const result = filter.process(chunk);
    visible += result.content;
    hidden += result.thinking;
  }

  const flushed = filter.flush();
  visible += flushed.content;
  hidden += flushed.thinking;

  assert.equal(visible, "开头最终");
  assert.equal(hidden, "中间思考");
});

test("ThinkTagFilter handles split closing tags without leaking thinking text", () => {
  const filter = new ThinkTagFilter();
  let visible = "";
  let hidden = "";

  for (const chunk of ["<think>过程</thi", "nk>答案"]) {
    const result = filter.process(chunk);
    visible += result.content;
    hidden += result.thinking;
  }

  const flushed = filter.flush();
  visible += flushed.content;
  hidden += flushed.thinking;

  assert.equal(visible, "答案");
  assert.equal(hidden, "过程");
});

test("ThinkTagFilter reports thinking state while inside a think block", () => {
  const filter = new ThinkTagFilter();

  assert.equal(filter.process("<think>分析").isThinking, true);
  assert.equal(filter.process("</think>回答").isThinking, false);
});

test("ThinkTagFilter flushes buffered normal content at stream end", () => {
  const filter = new ThinkTagFilter();
  const first = filter.process("最终");
  const second = filter.process("回答");
  const flushed = filter.flush();

  assert.equal(first.content + second.content + flushed.content, "最终回答");
  assert.equal(flushed.thinking, "");
});

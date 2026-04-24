type ThinkFilterResult = {
  content: string;
  thinking: string;
  isThinking: boolean;
};

const OPEN_TAG = "<think>";
const CLOSE_TAG = "</think>";

export class ThinkTagFilter {
  private isInsideThink = false;
  private buffer = "";

  process(chunk: string): ThinkFilterResult {
    this.buffer += chunk;

    let content = "";
    let thinking = "";

    while (this.buffer.length > 0) {
      if (this.isInsideThink) {
        const closeIndex = this.buffer.indexOf(CLOSE_TAG);

        if (closeIndex >= 0) {
          thinking += this.buffer.slice(0, closeIndex);
          this.buffer = this.buffer.slice(closeIndex + CLOSE_TAG.length);
          this.isInsideThink = false;
          continue;
        }

        const safeLength = Math.max(0, this.buffer.length - CLOSE_TAG.length);
        if (safeLength === 0) {
          break;
        }

        thinking += this.buffer.slice(0, safeLength);
        this.buffer = this.buffer.slice(safeLength);
        break;
      }

      const openIndex = this.buffer.indexOf(OPEN_TAG);

      if (openIndex >= 0) {
        content += this.buffer.slice(0, openIndex);
        this.buffer = this.buffer.slice(openIndex + OPEN_TAG.length);
        this.isInsideThink = true;
        continue;
      }

      const safeLength = Math.max(0, this.buffer.length - OPEN_TAG.length);
      if (safeLength === 0) {
        break;
      }

      content += this.buffer.slice(0, safeLength);
      this.buffer = this.buffer.slice(safeLength);
      break;
    }

    return {
      content,
      thinking,
      isThinking: this.isInsideThink,
    };
  }

  flush(): { content: string; thinking: string } {
    const result = this.isInsideThink
      ? { content: "", thinking: this.buffer }
      : { content: this.buffer, thinking: "" };

    this.buffer = "";
    this.isInsideThink = false;

    return result;
  }

  reset(): void {
    this.isInsideThink = false;
    this.buffer = "";
  }
}

export function removeThinkTags(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>\s*/g, "").trim();
}

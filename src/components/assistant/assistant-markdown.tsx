"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import styles from "./workspace-assistant.module.css";

type AssistantMarkdownProps = {
  content: string;
};

export function AssistantMarkdown({ content }: AssistantMarkdownProps) {
  return (
    <div className={styles.markdown}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code(props) {
            const { children, className } = props;
            const raw = String(children).replace(/\n$/, "");
            const isBlock = Boolean(className) || raw.includes("\n");

            if (!isBlock) {
              return <code className={styles.inlineCode}>{raw}</code>;
            }

            return <MarkdownCodeBlock className={className} content={raw} />;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

type MarkdownCodeBlockProps = {
  className?: string;
  content: string;
};

function MarkdownCodeBlock({ className, content }: MarkdownCodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!navigator.clipboard) {
      return;
    }

    await navigator.clipboard.writeText(content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={styles.codeBlockWrap}>
      <button className={styles.codeCopyButton} onClick={() => void handleCopy()} type="button">
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        {copied ? "已复制" : "复制代码"}
      </button>
      <pre className={styles.codeBlock}>
        <code className={className}>{content}</code>
      </pre>
    </div>
  );
}

"use client";

import { forwardRef, useEffect, useRef, useState } from "react";
import { ArrowUp } from "lucide-react";

import { shouldSendAssistantMessageOnKeydown } from "./assistant-utils";
import styles from "./workspace-assistant.module.css";

type AssistantInputBoxProps = {
  disabled?: boolean;
  loading?: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
  value: string;
};

export const AssistantInputBox = forwardRef<HTMLTextAreaElement, AssistantInputBoxProps>(function AssistantInputBox(
  { disabled = false, loading = false, onChange, onSubmit, value },
  ref,
) {
  const innerRef = useRef<HTMLTextAreaElement | null>(null);
  const [focused, setFocused] = useState(false);
  const sendDisabled = disabled || loading || !value.trim();

  useEffect(() => {
    const target = innerRef.current;
    if (!target) {
      return;
    }

    target.style.height = "44px";
    target.style.height = `${Math.min(target.scrollHeight, 160)}px`;
  }, [value]);

  return (
    <div className={`${styles.inputShell} ${focused ? styles.inputShellFocused : ""}`}>
      <textarea
        className={styles.inputTextarea}
        onBlur={() => setFocused(false)}
        onChange={(event) => onChange(event.target.value)}
        onFocus={() => setFocused(true)}
        onKeyDown={(event) => {
          if (shouldSendAssistantMessageOnKeydown(event)) {
            event.preventDefault();
            onSubmit();
          }
        }}
        placeholder="输入你的问题..."
        ref={(node) => {
          innerRef.current = node;
          if (!ref) {
            return;
          }

          if (typeof ref === "function") {
            ref(node);
            return;
          }

          ref.current = node;
        }}
        rows={1}
        value={value}
      />
      <button
        className={`${styles.sendButton} ${sendDisabled ? styles.sendButtonDisabled : styles.sendButtonEnabled}`}
        disabled={sendDisabled}
        onClick={onSubmit}
        type="button"
      >
        <ArrowUp className="h-4 w-4" />
      </button>
    </div>
  );
});

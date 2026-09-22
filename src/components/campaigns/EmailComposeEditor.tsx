"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Indent,
  Italic,
  List,
  ListOrdered,
  Outdent,
  Redo2,
  Underline,
  Undo2,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { htmlToPlain, plainToHtml } from "@/lib/outreach/email-html";

const FONTS = [
  { label: "Sans Serif", value: "Arial, Helvetica, sans-serif" },
  { label: "Serif", value: "Times New Roman, Times, serif" },
  { label: "Fixed Width", value: "Courier New, Courier, monospace" },
  { label: "Wide", value: "Arial Black, Arial, sans-serif" },
  { label: "Narrow", value: "Arial Narrow, Arial, sans-serif" },
  { label: "Comic Sans MS", value: "Comic Sans MS, cursive" },
  { label: "Garamond", value: "Garamond, serif" },
  { label: "Georgia", value: "Georgia, serif" },
  { label: "Tahoma", value: "Tahoma, sans-serif" },
  { label: "Trebuchet MS", value: "Trebuchet MS, sans-serif" },
  { label: "Verdana", value: "Verdana, sans-serif" },
] as const;

const SIZES = [
  { label: "Small", value: "2" },
  { label: "Normal", value: "3" },
  { label: "Large", value: "4" },
  { label: "Huge", value: "6" },
] as const;

const COLORS = ["#222222", "#666666", "#d93025", "#e37400", "#f9ab00", "#188038", "#4379EE", "#a142f4"];

function run(command: string, value?: string) {
  document.execCommand(command, false, value);
}

function ToolButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={cn(
        "inline-flex size-7 items-center justify-center rounded-md text-neutral-600 hover:bg-neutral-200/80 hover:text-neutral-900",
        active && "bg-[#E8F1FC] text-[#4379EE]",
      )}
    >
      {children}
    </button>
  );
}

export function EmailComposeEditor({
  value,
  onChange,
  placeholder = "Write this email…",
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [font, setFont] = useState<string>(FONTS[0].value);
  const [size, setSize] = useState("3");
  const [colorOpen, setColorOpen] = useState(false);
  const [empty, setEmpty] = useState(!htmlToPlain(value));

  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    el.innerHTML = plainToHtml(value);
    setEmpty(!htmlToPlain(value));
    // mount / parent remount only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function emit() {
    const html = editorRef.current?.innerHTML ?? "";
    setEmpty(!htmlToPlain(html));
    onChange(html);
  }

  function format(command: string, commandValue?: string) {
    editorRef.current?.focus();
    run(command, commandValue);
    emit();
  }

  return (
    <div className="flex min-h-0 flex-col">
      <div
        ref={editorRef}
        contentEditable
        role="textbox"
        aria-multiline
        data-placeholder={placeholder}
        suppressContentEditableWarning
        className={cn(
          "email-compose-body min-h-[220px] w-full resize-y overflow-y-auto bg-transparent text-[14px] leading-relaxed text-neutral-800 outline-none",
          empty && "is-empty",
        )}
        onInput={emit}
        onBlur={emit}
      />
      <div className="mt-2 flex flex-wrap items-center gap-0.5 rounded-full bg-neutral-50 px-2 py-1">
        <ToolButton label="Undo" onClick={() => format("undo")}>
          <Undo2 className="size-3.5" />
        </ToolButton>
        <ToolButton label="Redo" onClick={() => format("redo")}>
          <Redo2 className="size-3.5" />
        </ToolButton>
        <span className="mx-1 h-4 w-px bg-neutral-200" />
        <select
          aria-label="Font"
          value={font}
          onMouseDown={(event) => event.stopPropagation()}
          onChange={(event) => {
            const next = event.target.value;
            setFont(next);
            format("fontName", next);
          }}
          className="h-7 max-w-[8.5rem] rounded-md bg-transparent px-1 text-[12px] font-medium text-neutral-700 outline-none"
        >
          {FONTS.map((item) => (
            <option key={item.label} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
        <select
          aria-label="Size"
          value={size}
          onChange={(event) => {
            const next = event.target.value;
            setSize(next);
            format("fontSize", next);
          }}
          className="h-7 rounded-md bg-transparent px-1 text-[12px] font-medium text-neutral-700 outline-none"
        >
          {SIZES.map((item) => (
            <option key={item.label} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
        <span className="mx-1 h-4 w-px bg-neutral-200" />
        <ToolButton label="Bold" onClick={() => format("bold")}>
          <Bold className="size-3.5" />
        </ToolButton>
        <ToolButton label="Italic" onClick={() => format("italic")}>
          <Italic className="size-3.5" />
        </ToolButton>
        <ToolButton label="Underline" onClick={() => format("underline")}>
          <Underline className="size-3.5" />
        </ToolButton>
        <div className="relative">
          <ToolButton label="Text color" onClick={() => setColorOpen((open) => !open)}>
            <span className="flex size-3.5 items-end justify-center text-[11px] font-bold leading-none">A</span>
          </ToolButton>
          {colorOpen && (
            <div className="absolute bottom-8 left-0 z-20 grid grid-cols-4 gap-1 rounded-lg border border-[#EEEEEE] bg-white p-2 shadow-md">
              {COLORS.map((swatch) => (
                <button
                  key={swatch}
                  type="button"
                  aria-label={swatch}
                  className="size-5 rounded-full border border-neutral-200"
                  style={{ backgroundColor: swatch }}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    format("foreColor", swatch);
                    setColorOpen(false);
                  }}
                />
              ))}
            </div>
          )}
        </div>
        <span className="mx-1 h-4 w-px bg-neutral-200" />
        <ToolButton label="Align left" onClick={() => format("justifyLeft")}>
          <AlignLeft className="size-3.5" />
        </ToolButton>
        <ToolButton label="Align center" onClick={() => format("justifyCenter")}>
          <AlignCenter className="size-3.5" />
        </ToolButton>
        <ToolButton label="Align right" onClick={() => format("justifyRight")}>
          <AlignRight className="size-3.5" />
        </ToolButton>
        <span className="mx-1 h-4 w-px bg-neutral-200" />
        <ToolButton label="Numbered list" onClick={() => format("insertOrderedList")}>
          <ListOrdered className="size-3.5" />
        </ToolButton>
        <ToolButton label="Bulleted list" onClick={() => format("insertUnorderedList")}>
          <List className="size-3.5" />
        </ToolButton>
        <ToolButton label="Decrease indent" onClick={() => format("outdent")}>
          <Outdent className="size-3.5" />
        </ToolButton>
        <ToolButton label="Increase indent" onClick={() => format("indent")}>
          <Indent className="size-3.5" />
        </ToolButton>
      </div>
    </div>
  );
}

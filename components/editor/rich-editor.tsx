"use client";

import Link from "@tiptap/extension-link";
import Mention from "@tiptap/extension-mention";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor, type Editor, type JSONContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Bold, Code, Heading2, Italic, Link2, List, ListOrdered } from "lucide-react";
import { useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Editor de texto rico (components.md, "Editor de texto rico"): atalhos de
// markdown, barra de formatação e @menção com a lista dos membros do quadro.

export type MentionPerson = { id: string; name: string; username: string | null };

export type EditorValue = { doc: JSONContent; text: string; mentions: string[] };

function collectMentions(doc: JSONContent, out: string[] = []) {
  if (doc.type === "mention" && typeof doc.attrs?.id === "string") out.push(doc.attrs.id);
  for (const child of doc.content ?? []) collectMentions(child, out);
  return out;
}

export function valueOf(editor: Editor): EditorValue {
  // O ProseMirror cria os attrs com Object.create(null); o React não manda esse tipo
  // de objeto para o servidor como dado comum. A cópia em JSON deixa tudo simples.
  const doc = JSON.parse(JSON.stringify(editor.getJSON())) as JSONContent;
  return { doc, text: editor.getText({ blockSeparator: "\n" }).trim(), mentions: [...new Set(collectMentions(doc))] };
}

// Lista de sugestões da menção: um elemento simples posicionado no cursor.
function mentionSuggestion(getPeople: () => MentionPerson[]) {
  return {
    items: ({ query }: { query: string }) => {
      const q = query
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .toLowerCase();
      return getPeople()
        .filter((p) =>
          `${p.name} ${p.username ?? ""}`
            .normalize("NFD")
            .replace(/\p{Diacritic}/gu, "")
            .toLowerCase()
            .includes(q),
        )
        .slice(0, 6);
    },
    render: () => {
      let root: HTMLDivElement | null = null;
      let items: MentionPerson[] = [];
      let index = 0;
      let command: ((p: { id: string; label: string }) => void) | null = null;

      function draw(rect: DOMRect | null | undefined) {
        if (!root) return;
        root.innerHTML = "";
        if (!items.length) {
          const empty = document.createElement("p");
          empty.className = "px-2 py-1.5 text-sm text-muted-foreground";
          empty.textContent = "Ninguém com esse nome no quadro";
          root.appendChild(empty);
        }
        items.forEach((p, i) => {
          const option = document.createElement("button");
          option.type = "button";
          option.id = `mention-${p.id}`;
          option.setAttribute("role", "option");
          option.setAttribute("aria-selected", String(i === index));
          option.className = cn(
            "flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm outline-none",
            i === index ? "bg-accent text-accent-foreground" : "",
          );
          option.textContent = p.username ? `${p.name} (@${p.username})` : p.name;
          option.onmousedown = (e) => {
            e.preventDefault();
            command?.({ id: p.id, label: p.name });
          };
          root!.appendChild(option);
        });
        if (rect) {
          root.style.left = `${Math.min(rect.left, window.innerWidth - 260)}px`;
          root.style.top = `${rect.bottom + 6}px`;
        }
      }

      return {
        onStart: (props: { items: MentionPerson[]; command: (p: { id: string; label: string }) => void; clientRect?: (() => DOMRect | null) | null }) => {
          root = document.createElement("div");
          root.setAttribute("role", "listbox");
          root.setAttribute("aria-label", "Mencionar");
          root.className = "fixed z-80 w-64 rounded-lg border bg-popover p-1 text-popover-foreground shadow-pop";
          document.body.appendChild(root);
          items = props.items;
          index = 0;
          command = props.command;
          draw(props.clientRect?.());
        },
        onUpdate: (props: { items: MentionPerson[]; command: (p: { id: string; label: string }) => void; clientRect?: (() => DOMRect | null) | null }) => {
          items = props.items;
          index = 0;
          command = props.command;
          draw(props.clientRect?.());
        },
        onKeyDown: ({ event }: { event: KeyboardEvent }) => {
          if (event.key === "ArrowDown") {
            index = (index + 1) % Math.max(items.length, 1);
            draw(null);
            return true;
          }
          if (event.key === "ArrowUp") {
            index = (index - 1 + items.length) % Math.max(items.length, 1);
            draw(null);
            return true;
          }
          if (event.key === "Enter" || event.key === "Tab") {
            const p = items[index];
            if (p) command?.({ id: p.id, label: p.name });
            return true;
          }
          if (event.key === "Escape") {
            root?.remove();
            root = null;
            return true;
          }
          return false;
        },
        onExit: () => {
          root?.remove();
          root = null;
        },
      };
    },
  };
}

export function RichEditor({
  initial,
  placeholder,
  people = [],
  autoFocus = false,
  ariaLabel,
  onChange,
  onSubmit,
  onCancel,
  className,
}: {
  initial?: JSONContent | null;
  placeholder: string;
  people?: MentionPerson[];
  autoFocus?: boolean;
  ariaLabel: string;
  onChange?: (value: EditorValue) => void;
  onSubmit?: (value: EditorValue) => void;
  onCancel?: () => void;
  className?: string;
}) {
  const peopleRef = useRef(people);
  const submitRef = useRef(onSubmit);
  const cancelRef = useRef(onCancel);
  const changeRef = useRef(onChange);
  useEffect(() => {
    peopleRef.current = people;
    submitRef.current = onSubmit;
    cancelRef.current = onCancel;
    changeRef.current = onChange;
  });

  const editor = useEditor({
    immediatelyRender: false,
    autofocus: autoFocus ? "end" : false,
    content: initial ?? "",
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] }, link: false }),
      Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { rel: "noreferrer noopener", target: "_blank" } }),
      Placeholder.configure({ placeholder }),
      Mention.configure({
        HTMLAttributes: { class: "mention" },
        renderText: ({ node }) => `@${node.attrs.label ?? ""}`,
        // A lista só é lida quando a pessoa digita @, fora do render.
        // eslint-disable-next-line react-hooks/refs
        suggestion: mentionSuggestion(() => peopleRef.current),
      }),
    ],
    editorProps: {
      attributes: {
        "aria-label": ariaLabel,
        "aria-multiline": "true",
        role: "textbox",
        class: "rich-text min-h-24 px-3 py-2 outline-none",
      },
      handleKeyDown: (_view, event) => {
        if ((event.ctrlKey || event.metaKey) && event.key === "Enter" && submitRef.current && editorRef.current) {
          submitRef.current(valueOf(editorRef.current));
          return true;
        }
        if (event.key === "Escape" && cancelRef.current) {
          cancelRef.current();
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: e }) => changeRef.current?.(valueOf(e)),
  });
  const editorRef = useRef<Editor | null>(null);
  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  const tool = (label: string, active: boolean, run: () => void, Icon: typeof Bold) => (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      aria-pressed={active}
      className={cn(active && "bg-accent")}
      onMouseDown={(e) => e.preventDefault()}
      onClick={run}
    >
      <Icon aria-hidden="true" />
    </Button>
  );

  return (
    <div className={cn("rounded-md border border-input bg-card focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background", className)}>
      {editor && (
        <div role="toolbar" aria-label="Formatação" className="flex flex-wrap gap-0.5 border-b p-1">
          {tool("Negrito", editor.isActive("bold"), () => editor.chain().focus().toggleBold().run(), Bold)}
          {tool("Itálico", editor.isActive("italic"), () => editor.chain().focus().toggleItalic().run(), Italic)}
          {tool("Título", editor.isActive("heading"), () => editor.chain().focus().toggleHeading({ level: 2 }).run(), Heading2)}
          {tool("Lista", editor.isActive("bulletList"), () => editor.chain().focus().toggleBulletList().run(), List)}
          {tool("Lista numerada", editor.isActive("orderedList"), () => editor.chain().focus().toggleOrderedList().run(), ListOrdered)}
          {tool("Código", editor.isActive("code"), () => editor.chain().focus().toggleCode().run(), Code)}
          {tool(
            "Link",
            editor.isActive("link"),
            () => {
              const previous = editor.getAttributes("link").href as string | undefined;
              const url = window.prompt("Endereço do link", previous ?? "https://");
              if (url === null) return;
              if (!url) editor.chain().focus().unsetLink().run();
              else editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
            },
            Link2,
          )}
          <span className="ml-auto self-center px-1 text-xs text-muted-foreground">@ menciona · Ctrl+Enter salva</span>
        </div>
      )}
      <EditorContent editor={editor} />
    </div>
  );
}

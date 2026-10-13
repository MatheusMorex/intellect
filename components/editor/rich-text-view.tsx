import type { JSONContent } from "@tiptap/react";
import { Fragment } from "react";

// Mostra o documento do editor sem usar HTML cru: só os tipos de nó que o
// editor produz, cada um virando o elemento React certo (nada de script ou estilo vindo do texto).

function safeHref(href: unknown) {
  if (typeof href !== "string") return null;
  try {
    const url = new URL(href);
    return url.protocol === "http:" || url.protocol === "https:" || url.protocol === "mailto:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function marks(node: JSONContent, child: React.ReactNode, key: string): React.ReactNode {
  let out = child;
  for (const mark of node.marks ?? []) {
    if (mark.type === "bold") out = <strong key={key}>{out}</strong>;
    else if (mark.type === "italic") out = <em key={key}>{out}</em>;
    else if (mark.type === "strike") out = <s key={key}>{out}</s>;
    else if (mark.type === "code") out = <code key={key}>{out}</code>;
    else if (mark.type === "link") {
      const href = safeHref(mark.attrs?.href);
      out = href ? (
        <a key={key} href={href} target="_blank" rel="noreferrer noopener">
          {out}
        </a>
      ) : (
        out
      );
    }
  }
  return out;
}

function render(node: JSONContent, key: string): React.ReactNode {
  const children = (node.content ?? []).map((c, i) => render(c, `${key}.${i}`));
  switch (node.type) {
    case "doc":
      return <Fragment key={key}>{children}</Fragment>;
    case "paragraph":
      return <p key={key}>{children}</p>;
    case "heading":
      return node.attrs?.level === 3 ? <h4 key={key}>{children}</h4> : <h3 key={key}>{children}</h3>;
    case "bulletList":
      return <ul key={key}>{children}</ul>;
    case "orderedList":
      return <ol key={key}>{children}</ol>;
    case "listItem":
      return <li key={key}>{children}</li>;
    case "blockquote":
      return <blockquote key={key}>{children}</blockquote>;
    case "codeBlock":
      return (
        <pre key={key}>
          <code>{children}</code>
        </pre>
      );
    case "horizontalRule":
      return <hr key={key} />;
    case "hardBreak":
      return <br key={key} />;
    case "mention":
      return (
        <span key={key} className="mention">
          @{String(node.attrs?.label ?? "")}
        </span>
      );
    case "text":
      return marks(node, node.text ?? "", key);
    default:
      return <Fragment key={key}>{children}</Fragment>;
  }
}

export function RichTextView({ doc, fallback }: { doc: unknown; fallback?: string }) {
  if (!doc || typeof doc !== "object") return fallback ? <p className="whitespace-pre-wrap">{fallback}</p> : null;
  return <div className="rich-text">{render(doc as JSONContent, "n")}</div>;
}

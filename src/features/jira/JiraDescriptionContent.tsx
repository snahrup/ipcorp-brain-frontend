import type { ReactNode } from "react";
import { MarkdownContent } from "../team-library/MarkdownContent";

type JiraAdfMark = {
  type?: string;
  attrs?: {
    href?: string;
  };
};

type JiraAdfNode = {
  type?: string;
  text?: string;
  attrs?: {
    href?: string;
    level?: number;
    language?: string;
    colspan?: number;
    rowspan?: number;
    text?: string;
    url?: string;
  };
  marks?: JiraAdfMark[];
  content?: JiraAdfNode[];
};

function safeHref(value?: string) {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed.startsWith("#")) return trimmed;
  try {
    const url = new URL(trimmed);
    return ["http:", "https:", "mailto:"].includes(url.protocol) ? trimmed : null;
  } catch {
    return null;
  }
}

function nodeSignature(node: JiraAdfNode) {
  return JSON.stringify({
    attrs: node.attrs,
    contentLength: node.content?.length || 0,
    marks: node.marks?.map((mark) => mark.type).join(","),
    text: node.text,
    type: node.type,
  });
}

function stableKey(prefix: string, signature: string, allSignatures: string[], position: number) {
  let occurrence = 0;
  for (let scan = 0; scan < position; scan += 1) {
    if (allSignatures[scan] === signature) occurrence += 1;
  }
  let hash = 0;
  for (const character of signature) {
    hash = (hash * 31 + character.charCodeAt(0)) | 0;
  }
  return `${prefix}-${Math.abs(hash).toString(36)}-${occurrence}`;
}

function nodeKey(prefix: string, node: JiraAdfNode, index: number, allSignatures: string[]) {
  return stableKey(prefix, nodeSignature(node), allSignatures, index);
}

function childrenOf(node: JiraAdfNode, prefix: string): ReactNode[] {
  const children = node.content || [];
  const signatures = children.map(nodeSignature);
  return children.map((child, index) =>
    renderNode(child, nodeKey(prefix, child, index, signatures))
  );
}

function applyMarks(value: ReactNode, marks: JiraAdfMark[] | undefined, key: string) {
  return (marks || []).reduce<ReactNode>((current, mark, index) => {
    const markKey = `${key}-mark-${index}`;
    if (mark.type === "strong") return <strong key={markKey}>{current}</strong>;
    if (mark.type === "em") return <em key={markKey}>{current}</em>;
    if (mark.type === "strike") return <s key={markKey}>{current}</s>;
    if (mark.type === "underline") return <u key={markKey}>{current}</u>;
    if (mark.type === "code") return <code key={markKey}>{current}</code>;
    if (mark.type === "link") {
      const href = safeHref(mark.attrs?.href);
      if (!href) return <span key={markKey}>{current}</span>;
      const external = /^https?:/i.test(href);
      return (
        <a
          href={href}
          key={markKey}
          target={external ? "_blank" : undefined}
          rel={external ? "noreferrer" : undefined}
        >
          {current}
        </a>
      );
    }
    return current;
  }, value);
}

function renderListItems(node: JiraAdfNode, key: string) {
  const items = node.content || [];
  const signatures = items.map(nodeSignature);
  return items.map((child, index) => {
    const itemKey = stableKey(`${key}-item`, signatures[index], signatures, index);
    if (child.type !== "listItem") return renderNode(child, itemKey);
    return <li key={itemKey}>{childrenOf(child, itemKey)}</li>;
  });
}

function renderTable(node: JiraAdfNode, key: string) {
  const rows = node.content || [];
  const rowSignatures = rows.map(nodeSignature);
  return (
    <div className="jira-description-table-wrap" key={key}>
      <table>
        <tbody>
          {rows.map((row, rowIndex) => {
            const rowKey = stableKey(
              `${key}-row`,
              rowSignatures[rowIndex],
              rowSignatures,
              rowIndex
            );
            const cells = row.content || [];
            const cellSignatures = cells.map(nodeSignature);
            return (
              <tr key={rowKey}>
                {cells.map((cell, cellIndex) => {
                  const cellKey = stableKey(
                    `${rowKey}-cell`,
                    cellSignatures[cellIndex],
                    cellSignatures,
                    cellIndex
                  );
                  const Cell = cell.type === "tableHeader" ? "th" : "td";
                  return (
                    <Cell key={cellKey} colSpan={cell.attrs?.colspan} rowSpan={cell.attrs?.rowspan}>
                      {childrenOf(cell, cellKey)}
                    </Cell>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function renderNode(node: JiraAdfNode, key: string): ReactNode {
  if (node.type === "text") return applyMarks(node.text || "", node.marks, key);
  if (node.type === "hardBreak") return <br key={key} />;
  if (node.type === "doc") return childrenOf(node, key);
  if (node.type === "paragraph") return <p key={key}>{childrenOf(node, key)}</p>;
  if (node.type === "heading") {
    const level = Math.min(Math.max(node.attrs?.level || 2, 1), 4);
    const Heading = `h${level}` as "h1" | "h2" | "h3" | "h4";
    return <Heading key={key}>{childrenOf(node, key)}</Heading>;
  }
  if (node.type === "bulletList") return <ul key={key}>{renderListItems(node, key)}</ul>;
  if (node.type === "orderedList") return <ol key={key}>{renderListItems(node, key)}</ol>;
  if (node.type === "listItem") return <li key={key}>{childrenOf(node, key)}</li>;
  if (node.type === "blockquote") return <blockquote key={key}>{childrenOf(node, key)}</blockquote>;
  if (node.type === "rule") return <hr key={key} />;
  if (node.type === "codeBlock") {
    return (
      <pre key={key} data-language={node.attrs?.language || undefined}>
        <code>{(node.content || []).map((child) => child.text || "").join("")}</code>
      </pre>
    );
  }
  if (node.type === "table") return renderTable(node, key);
  if (node.type === "panel") return <section key={key}>{childrenOf(node, key)}</section>;
  if (node.type === "mention") return <span key={key}>{node.attrs?.text || "Mention"}</span>;
  if (node.type === "inlineCard" || node.type === "blockCard") {
    const href = safeHref(node.attrs?.url);
    return href ? (
      <p key={key}>
        <a href={href} target="_blank" rel="noreferrer">
          {href}
        </a>
      </p>
    ) : null;
  }
  if (node.content?.length) return childrenOf(node, key);
  return null;
}

function isAdfDoc(value: unknown): value is JiraAdfNode {
  return Boolean(value && typeof value === "object" && (value as JiraAdfNode).type === "doc");
}

export function JiraDescriptionContent({ adf, fallback }: { adf: unknown; fallback: string }) {
  if (isAdfDoc(adf) && adf.content?.length) {
    return (
      <article className="jira-description-content" data-testid="jira-formatted-description">
        {childrenOf(adf, "jira-description")}
      </article>
    );
  }
  if (fallback.trim()) {
    return (
      <div className="jira-description-content" data-testid="jira-formatted-description">
        <MarkdownContent content={fallback} />
      </div>
    );
  }
  return <div className="jira-description-empty">No Jira description is recorded.</div>;
}

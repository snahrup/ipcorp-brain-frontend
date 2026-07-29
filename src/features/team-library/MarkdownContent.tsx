import type { ReactNode } from "react";
import { type InlineContent, parseMarkdown } from "./content";

function contentKey(prefix: string, value: string, values: string[], position: number) {
  let occurrence = 0;
  for (let index = 0; index < position; index += 1) {
    if (values[index] === value) occurrence += 1;
  }
  let hash = 0;
  for (const character of value) hash = (hash * 31 + character.charCodeAt(0)) | 0;
  return `${prefix}-${Math.abs(hash).toString(36)}-${occurrence}`;
}

function renderInline(content: InlineContent[], keyPrefix: string): ReactNode[] {
  const signatures = content.map((token) => JSON.stringify(token));
  return content.map((token, index) => {
    const key = contentKey(keyPrefix, signatures[index], signatures, index);
    if (token.kind === "text") return token.value;
    if (token.kind === "code") return <code key={key}>{token.value}</code>;
    if (token.kind === "strong") {
      return <strong key={key}>{renderInline(token.children, key)}</strong>;
    }
    if (token.kind === "emphasis") {
      return <em key={key}>{renderInline(token.children, key)}</em>;
    }
    if (token.kind === "strike") {
      return <s key={key}>{renderInline(token.children, key)}</s>;
    }
    if (!token.href) {
      return (
        <span className="tl-markdown-link-unavailable" key={key}>
          {renderInline(token.children, key)}
        </span>
      );
    }
    const external = /^https?:/i.test(token.href);
    return (
      <a
        href={token.href}
        key={key}
        target={external ? "_blank" : undefined}
        rel={external ? "noreferrer" : undefined}
      >
        {renderInline(token.children, key)}
      </a>
    );
  });
}

function inlineText(content: InlineContent[]): string {
  return content
    .map((token) => {
      if (token.kind === "text" || token.kind === "code") return token.value;
      return inlineText(token.children);
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

export function MarkdownContent({
  content,
  titleToOmit,
}: {
  content: string;
  titleToOmit?: string;
}) {
  const parsedBlocks = parseMarkdown(content);
  const normalizedTitle = titleToOmit?.replace(/\s+/g, " ").trim().toLowerCase();
  const blocks =
    normalizedTitle && parsedBlocks[0]?.kind === "heading"
      ? inlineText(parsedBlocks[0].content).toLowerCase() === normalizedTitle
        ? parsedBlocks.slice(1)
        : parsedBlocks
      : parsedBlocks;
  if (!blocks.length) {
    return <div className="tl-content-empty">This document does not contain readable text.</div>;
  }
  const blockSignatures = blocks.map((block) => JSON.stringify(block));

  return (
    <article className="tl-markdown" data-testid="formatted-markdown">
      {blocks.map((block, index) => {
        const key = contentKey("markdown-block", blockSignatures[index], blockSignatures, index);
        if (block.kind === "heading") {
          const children = renderInline(block.content, key);
          if (block.level === 1) return <h1 key={key}>{children}</h1>;
          if (block.level === 2) return <h2 key={key}>{children}</h2>;
          if (block.level === 3) return <h3 key={key}>{children}</h3>;
          return <h4 key={key}>{children}</h4>;
        }
        if (block.kind === "paragraph") {
          return <p key={key}>{renderInline(block.content, key)}</p>;
        }
        if (block.kind === "blockquote") {
          return <blockquote key={key}>{renderInline(block.content, key)}</blockquote>;
        }
        if (block.kind === "unordered-list") {
          const itemSignatures = block.items.map((item) => JSON.stringify(item));
          return (
            <ul key={key}>
              {block.items.map((item, itemIndex) => {
                const itemKey = contentKey(
                  `${key}-item`,
                  itemSignatures[itemIndex],
                  itemSignatures,
                  itemIndex
                );
                return <li key={itemKey}>{renderInline(item, itemKey)}</li>;
              })}
            </ul>
          );
        }
        if (block.kind === "ordered-list") {
          const itemSignatures = block.items.map((item) => JSON.stringify(item));
          return (
            <ol key={key}>
              {block.items.map((item, itemIndex) => {
                const itemKey = contentKey(
                  `${key}-item`,
                  itemSignatures[itemIndex],
                  itemSignatures,
                  itemIndex
                );
                return <li key={itemKey}>{renderInline(item, itemKey)}</li>;
              })}
            </ol>
          );
        }
        if (block.kind === "code") {
          return (
            <pre key={key} data-language={block.language || undefined}>
              <code>{block.value}</code>
            </pre>
          );
        }
        if (block.kind === "table") {
          const headerSignatures = block.headers.map((header) => JSON.stringify(header));
          const rowSignatures = block.rows.map((row) => JSON.stringify(row));
          return (
            <div className="tl-markdown-table-wrap" key={key}>
              <table>
                <thead>
                  <tr>
                    {block.headers.map((header, cellIndex) => {
                      const headerKey = contentKey(
                        `${key}-header`,
                        headerSignatures[cellIndex],
                        headerSignatures,
                        cellIndex
                      );
                      return <th key={headerKey}>{renderInline(header, headerKey)}</th>;
                    })}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, rowIndex) => {
                    const rowKey = contentKey(
                      `${key}-row`,
                      rowSignatures[rowIndex],
                      rowSignatures,
                      rowIndex
                    );
                    const cellSignatures = row.map((cell) => JSON.stringify(cell));
                    return (
                      <tr key={rowKey}>
                        {row.map((cell, cellIndex) => {
                          const cellKey = contentKey(
                            `${rowKey}-cell`,
                            cellSignatures[cellIndex],
                            cellSignatures,
                            cellIndex
                          );
                          return <td key={cellKey}>{renderInline(cell, cellKey)}</td>;
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        }
        return <hr key={key} />;
      })}
    </article>
  );
}

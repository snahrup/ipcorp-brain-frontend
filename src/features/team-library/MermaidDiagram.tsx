import { useEffect, useId, useState } from "react";

function repairKnownPublishedPlaceholder(source: string) {
  if (
    !source.includes("[Personal meeting reference removed]") ||
    !source.includes("B[bronze_") ||
    !source.includes("class B bronze")
  ) {
    return source;
  }
  return source.replace(
    /^(\s*)\[Personal meeting reference removed\]\s*$/m,
    '$1subgraph BRONZE["Bronze"]'
  );
}

function prepareMermaidSource(source: string) {
  return repairKnownPublishedPlaceholder(source).replace(
    /<(?!br\s*\/?>)([A-Za-z][A-Za-z0-9 _.-]{0,64})>/gi,
    (_, label: string) => `&lt;${label}&gt;`
  );
}

function diagramTopics(source: string) {
  const topics: string[] = [];
  const seen = new Set<string>();
  const labelPattern = /(?:subgraph\s+\w+\s*)?\[\s*"?([^"\]\n]+)"?\s*\]/gi;
  for (const match of source.matchAll(labelPattern)) {
    const label = match[1]
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/&lt;|&gt;/gi, "")
      .replace(/[_]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!label || label.startsWith("Personal meeting reference")) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    topics.push(label);
    if (topics.length === 12) break;
  }
  return topics;
}

function DiagramOutline({ source }: { source: string }) {
  const topics = diagramTopics(source);
  return (
    <div className="wb-library-diagram-outline" data-testid="diagram-outline">
      <span>Included topics</span>
      {topics.length ? (
        <ul>
          {topics.map((topic) => (
            <li key={topic}>{topic}</li>
          ))}
        </ul>
      ) : (
        <p>A readable outline is not available for this diagram.</p>
      )}
    </div>
  );
}

export function MermaidDiagram({ source }: { source: string }) {
  const reactId = useId();
  const [svg, setSvg] = useState("");
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    setSvg("");
    setError(false);
    const render = async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: "base",
          fontFamily: "Figtree, Segoe UI, sans-serif",
          themeVariables: {
            primaryColor: "#eaf2f9",
            primaryTextColor: "#0e2338",
            primaryBorderColor: "#446084",
            lineColor: "#446084",
            secondaryColor: "#f4f8fb",
            tertiaryColor: "#ffffff",
            clusterBkg: "#f7fafc",
            clusterBorder: "#9fb0c2",
          },
        });
        const id = `team-library-diagram-${reactId.split(":").join("")}-${Date.now()}`;
        const result = await mermaid.render(id, prepareMermaidSource(source));
        if (active) setSvg(result.svg);
      } catch {
        if (active) setError(true);
      }
    };
    void render();
    return () => {
      active = false;
    };
  }, [reactId, source]);

  if (error) {
    return (
      <div className="wb-library-diagram-error" role="status">
        <strong>Diagram preview unavailable</strong>
        <span>The visual could not be displayed. Its main topics are listed below.</span>
        <DiagramOutline source={source} />
      </div>
    );
  }
  if (!svg) {
    return <div className="wb-library-diagram-loading">Rendering the diagram…</div>;
  }
  const sourceUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  return (
    <div className="wb-library-diagram">
      <img src={sourceUrl} alt="Rendered Team Library diagram" />
    </div>
  );
}

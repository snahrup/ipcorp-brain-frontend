import { parseCsv } from "./content";

function occurrenceKey(prefix: string, value: string, values: string[], position: number) {
  let occurrence = 0;
  for (let index = 0; index < position; index += 1) {
    if (values[index] === value) occurrence += 1;
  }
  return `${prefix}-${value.slice(0, 48)}-${occurrence}`;
}

export function CsvPreview({ content }: { content: string }) {
  const data = parseCsv(content);
  if (!data.headers.some(Boolean)) {
    return <div className="tl-content-empty">This data file does not contain readable rows.</div>;
  }
  const rowLabels = data.rows.map((row) => row.join("\u241f"));
  return (
    <div className="tl-csv-preview">
      <div className="tl-csv-table-wrap">
        <table>
          <thead>
            <tr>
              {data.headers.map((header, index) => {
                const key = occurrenceKey("column", header, data.headers, index);
                return <th key={key}>{header}</th>;
              })}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row, rowIndex) => {
              const rowKey = occurrenceKey("row", rowLabels[rowIndex], rowLabels, rowIndex);
              const cellLabels = data.headers.map(
                (header, cellIndex) => `${header}\u241f${row[cellIndex] || ""}`
              );
              return (
                <tr key={rowKey}>
                  {data.headers.map((_, cellIndex) => {
                    const cellKey = occurrenceKey(
                      "cell",
                      cellLabels[cellIndex],
                      cellLabels,
                      cellIndex
                    );
                    return <td key={cellKey}>{row[cellIndex] || "Not set"}</td>;
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {data.truncated ? (
        <p className="tl-csv-truncated">Showing the first 100 rows of this local file.</p>
      ) : null}
    </div>
  );
}

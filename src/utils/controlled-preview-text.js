// Keep controlled tabular data in the ordinary source-code presenter. This
// serializes only the rows/columns the backend has already authorized; it never
// reads the original file or asks for a later data page.
export function controlledPreviewText(preview, path) {
  if (preview?.kind !== "rows") return preview;
  const inputColumns = Array.isArray(preview.columns) ? preview.columns : [];
  const inputRows = Array.isArray(preview.rows) ? preview.rows : [];
  const columns = inputColumns.slice(0, 20).map((value) => String(value));
  const rows = inputRows.slice(0, 20);
  const cell = (value) =>
    value == null
      ? ""
      : typeof value === "object"
        ? JSON.stringify(value)
        : String(value);
  const values = (row) =>
    columns.map((column, index) =>
      cell(
        Array.isArray(row)
          ? row[index]
          : row && Object.hasOwn(row, column)
            ? row[column]
            : undefined,
      ),
    );
  const truncated = Boolean(
    preview.truncated || inputColumns.length > 20 || inputRows.length > 20,
  );
  if (/\.(?:jsonl|ndjson)$/i.test(path)) {
    const lines = rows.map((row) => {
      const cells = values(row);
      return JSON.stringify(
        Object.fromEntries(
          columns.map((column, index) => [column, cells[index]]),
        ),
      );
    });
    return {
      kind: "text",
      text: lines.length ? lines.join("\n") + "\n" : "",
      truncated,
    };
  }
  const separator = /\.tsv$/i.test(path) ? "\t" : ",";
  const quote = (value) => {
    const text = cell(value).replace(
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,
      (character) =>
        "\\u" + character.charCodeAt(0).toString(16).padStart(4, "0"),
    );
    return text.includes(separator) || /["\r\n]/.test(text)
      ? '"' + text.replaceAll('"', '""') + '"'
      : text;
  };
  const lines = [columns, ...rows.map(values)].map((row) =>
    row.map(quote).join(separator),
  );
  return { kind: "text", text: lines.join("\n") + "\n", truncated };
}

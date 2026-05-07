import { Parser, Reader } from "./Parser";

import { List, Root } from "../root";

export interface TopLevelListEntry {
  root: Root;
  list: List;
}

export class MultiRootDocument {
  private roots: Root[] = [];

  constructor(
    private parser: Parser,
    private reader: Reader,
  ) {}

  parse(): void {
    this.roots = parseDocumentByBlankLines(this.parser, this.reader);
  }

  getRoots(): Root[] {
    return this.roots.concat();
  }

  getRootContaining(line: number): Root | null {
    for (const root of this.roots) {
      const start = root.getContentStart().line;
      const end = root.getContentEnd().line;
      if (line >= start && line <= end) {
        return root;
      }
    }
    return null;
  }

  getAllTopLevelLists(): TopLevelListEntry[] {
    const result: TopLevelListEntry[] = [];
    for (const root of this.roots) {
      for (const child of root.getChildren()) {
        result.push({ root, list: child });
      }
    }
    return result;
  }

  print(): string {
    return this.roots.map((r) => r.print()).join("\n\n");
  }

  hasMultipleRoots(): boolean {
    return this.roots.length > 1;
  }
}

export function parseDocumentByBlankLines(
  parser: Parser,
  reader: Reader,
): Root[] {
  const result: Root[] = [];
  const lastLine = reader.lastLine();
  let segmentStart: number | null = null;

  const flush = (segmentEnd: number) => {
    if (segmentStart === null) {
      return;
    }
    if (segmentEnd >= segmentStart) {
      const segmentRoots = parser.parseRange(reader, segmentStart, segmentEnd);
      for (const r of segmentRoots) {
        result.push(r);
      }
    }
    segmentStart = null;
  };

  for (let i = 0; i <= lastLine; i++) {
    const line = reader.getLine(i);
    const isBlank = line.trim().length === 0;
    if (isBlank) {
      flush(i - 1);
    } else if (segmentStart === null) {
      segmentStart = i;
    }
  }
  flush(lastLine);

  return result;
}

import { Reader } from "./Parser";

const bulletSignRe = `(?:[-*+]|\\d+\\.)`;
const bulletLineRe = new RegExp(`^([ \\t]*)(${bulletSignRe})( |\\t)(.*)$`);

export interface LenientBullet {
  lineStart: number;
  lineEnd: number;
  rawIndent: string;
  visualIndent: number;
  visualLevel: number;
  bullet: string;
  spaceAfter: string;
  content: string;
  parent: LenientBullet | null;
  children: LenientBullet[];
  blockStart: number;
  blockEnd: number;
}

export function visualIndentWidth(indent: string, tabSize: number): number {
  let w = 0;
  for (const ch of indent) {
    if (ch === "\t") {
      w += tabSize - (w % tabSize);
    } else {
      w += 1;
    }
  }
  return w;
}

export class LenientBulletScanner {
  scan(reader: Reader, tabSize: number): LenientBullet[] {
    const lastLine = reader.lastLine();
    const result: LenientBullet[] = [];
    let blockStart: number | null = null;

    const flush = (blockEnd: number) => {
      if (blockStart === null) {
        return;
      }
      if (blockEnd >= blockStart) {
        const blockBullets = this.scanBlock(
          reader,
          blockStart,
          blockEnd,
          tabSize,
        );
        for (const b of blockBullets) {
          result.push(b);
        }
      }
      blockStart = null;
    };

    for (let i = 0; i <= lastLine; i++) {
      const line = reader.getLine(i);
      const isBlank = line.trim().length === 0;
      if (isBlank) {
        flush(i - 1);
      } else if (blockStart === null) {
        blockStart = i;
      }
    }
    flush(lastLine);

    return result;
  }

  private scanBlock(
    reader: Reader,
    startLine: number,
    endLine: number,
    tabSize: number,
  ): LenientBullet[] {
    interface RawHit {
      lineStart: number;
      rawIndent: string;
      visualIndent: number;
      bullet: string;
      spaceAfter: string;
      content: string;
    }

    const hits: RawHit[] = [];
    for (let i = startLine; i <= endLine; i++) {
      const line = reader.getLine(i);
      const m = bulletLineRe.exec(line);
      if (m) {
        hits.push({
          lineStart: i,
          rawIndent: m[1],
          visualIndent: visualIndentWidth(m[1], tabSize),
          bullet: m[2],
          spaceAfter: m[3],
          content: m[4],
        });
      }
    }

    const bullets: LenientBullet[] = hits.map(
      (h): LenientBullet => ({
        lineStart: h.lineStart,
        lineEnd: h.lineStart,
        rawIndent: h.rawIndent,
        visualIndent: h.visualIndent,
        visualLevel: 0,
        bullet: h.bullet,
        spaceAfter: h.spaceAfter,
        content: h.content,
        parent: null,
        children: [],
        blockStart: startLine,
        blockEnd: endLine,
      }),
    );

    const stack: LenientBullet[] = [];
    for (const b of bullets) {
      while (
        stack.length > 0 &&
        stack[stack.length - 1].visualIndent >= b.visualIndent
      ) {
        stack.pop();
      }
      if (stack.length > 0) {
        b.parent = stack[stack.length - 1];
        stack[stack.length - 1].children.push(b);
      }
      b.visualLevel = stack.length;
      stack.push(b);
    }

    for (let i = 0; i < bullets.length; i++) {
      const b = bullets[i];
      let extentEnd = endLine;
      for (let j = i + 1; j < bullets.length; j++) {
        if (bullets[j].visualIndent <= b.visualIndent) {
          extentEnd = bullets[j].lineStart - 1;
          break;
        }
      }
      b.lineEnd = extentEnd;
    }

    return bullets;
  }
}

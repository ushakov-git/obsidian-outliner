import { makeEditor } from "../../__mocks__";
import {
  LenientBulletScanner,
  visualIndentWidth,
} from "../LenientBulletScanner";

describe("visualIndentWidth", () => {
  test("plain spaces", () => {
    expect(visualIndentWidth("    ", 4)).toBe(4);
    expect(visualIndentWidth("  ", 4)).toBe(2);
  });

  test("tabs align to next stop", () => {
    expect(visualIndentWidth("\t", 4)).toBe(4);
    expect(visualIndentWidth("\t\t", 4)).toBe(8);
    expect(visualIndentWidth("  \t", 4)).toBe(4);
    expect(visualIndentWidth(" \t", 4)).toBe(4);
    expect(visualIndentWidth("\t  ", 4)).toBe(6);
  });
});

describe("LenientBulletScanner", () => {
  test("user case: mixed indent across blocks", () => {
    const text = [
      "- # Задачи    ✅",
      "",
      "  - Ключевые задачи на день",
      "\t- Один",
      "\t- Два",
      "\t- Три",
      "\t- Четыре",
    ].join("\n");

    const scanner = new LenientBulletScanner();
    const editor = makeEditor({ text, cursor: { line: 0, ch: 0 } });
    const bullets = scanner.scan(editor, 4);

    expect(bullets.length).toBe(6);
    expect(bullets[0]).toMatchObject({
      lineStart: 0,
      lineEnd: 0,
      rawIndent: "",
      visualIndent: 0,
      visualLevel: 0,
      bullet: "-",
      content: "# Задачи    ✅",
    });
    expect(bullets[1]).toMatchObject({
      lineStart: 2,
      lineEnd: 6,
      rawIndent: "  ",
      visualIndent: 2,
      visualLevel: 0,
      content: "Ключевые задачи на день",
    });
    expect(bullets[2]).toMatchObject({
      lineStart: 3,
      lineEnd: 3,
      rawIndent: "\t",
      visualIndent: 4,
      visualLevel: 1,
      content: "Один",
    });
    expect(bullets[2].parent).toBe(bullets[1]);
    expect(bullets[1].children).toHaveLength(4);
    expect(bullets[1].children[0].content).toBe("Один");
    expect(bullets[1].children[3].content).toBe("Четыре");
  });

  test("standard tab-only nesting", () => {
    const text = ["- a", "\t- b", "\t\t- c", "\t- d"].join("\n");
    const scanner = new LenientBulletScanner();
    const editor = makeEditor({ text, cursor: { line: 0, ch: 0 } });
    const bullets = scanner.scan(editor, 4);
    expect(bullets.map((b) => b.visualLevel)).toEqual([0, 1, 2, 1]);
    expect(bullets[0].lineEnd).toBe(3);
    expect(bullets[1].lineEnd).toBe(2);
    expect(bullets[3].parent).toBe(bullets[0]);
  });

  test("two blocks separated by blank line", () => {
    const text = ["- a", "- b", "", "- c", "- d"].join("\n");
    const scanner = new LenientBulletScanner();
    const editor = makeEditor({ text, cursor: { line: 0, ch: 0 } });
    const bullets = scanner.scan(editor, 4);
    expect(bullets).toHaveLength(4);
    expect(bullets[0].blockStart).toBe(0);
    expect(bullets[0].blockEnd).toBe(1);
    expect(bullets[2].blockStart).toBe(3);
    expect(bullets[2].blockEnd).toBe(4);
    expect(bullets[1].lineEnd).toBe(1);
  });

  test("whitespace-only blank line still splits blocks", () => {
    const text = ["- a", "  ", "  - b"].join("\n");
    const scanner = new LenientBulletScanner();
    const editor = makeEditor({ text, cursor: { line: 0, ch: 0 } });
    const bullets = scanner.scan(editor, 4);
    expect(bullets).toHaveLength(2);
    expect(bullets[1].parent).toBeNull();
    expect(bullets[1].visualLevel).toBe(0);
  });

  test("notes/non-bullet indented lines extend bullet range", () => {
    const text = ["- a", "  some note", "\t- b"].join("\n");
    const scanner = new LenientBulletScanner();
    const editor = makeEditor({ text, cursor: { line: 0, ch: 0 } });
    const bullets = scanner.scan(editor, 4);
    expect(bullets).toHaveLength(2);
    expect(bullets[0].lineEnd).toBe(2);
    expect(bullets[1].lineStart).toBe(2);
  });

  test("bullet with checkbox parses as content", () => {
    const text = "- [ ] task";
    const scanner = new LenientBulletScanner();
    const editor = makeEditor({ text, cursor: { line: 0, ch: 0 } });
    const bullets = scanner.scan(editor, 4);
    expect(bullets).toHaveLength(1);
    expect(bullets[0].content).toBe("[ ] task");
  });

  test("numeric bullets recognized", () => {
    const text = ["1. one", "2. two"].join("\n");
    const scanner = new LenientBulletScanner();
    const editor = makeEditor({ text, cursor: { line: 0, ch: 0 } });
    const bullets = scanner.scan(editor, 4);
    expect(bullets).toHaveLength(2);
    expect(bullets[0].bullet).toBe("1.");
    expect(bullets[1].bullet).toBe("2.");
  });
});

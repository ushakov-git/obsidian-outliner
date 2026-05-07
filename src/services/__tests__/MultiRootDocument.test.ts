/* eslint-disable @typescript-eslint/no-explicit-any */
import { makeEditor, makeLogger, makeSettings } from "../../__mocks__";
import { MultiRootDocument } from "../MultiRootDocument";
import { Parser } from "../Parser";

function makeDoc(text: string) {
  const parser = new Parser(makeLogger(), makeSettings());
  const editor = makeEditor({ text, cursor: { line: 0, ch: 0 } });
  const doc = new MultiRootDocument(parser, editor as any);
  doc.parse();
  return doc;
}

describe("MultiRootDocument", () => {
  test("returns one Root for a single contiguous list", () => {
    const doc = makeDoc("- a\n- b\n- c");
    expect(doc.getRoots()).toHaveLength(1);
    expect(doc.hasMultipleRoots()).toBe(false);
  });

  test("returns multiple Roots for groups separated by an empty line", () => {
    const doc = makeDoc("- a\n- b\n\n- c\n- d");
    const roots = doc.getRoots();
    expect(roots).toHaveLength(2);
    expect(roots[0].print()).toBe("- a\n- b");
    expect(roots[1].print()).toBe("- c\n- d");
  });

  test("getRootContaining finds the right Root by line number", () => {
    const doc = makeDoc("- a\n- b\n\n- c\n- d");
    const roots = doc.getRoots();
    expect(doc.getRootContaining(0)).toBe(roots[0]);
    expect(doc.getRootContaining(1)).toBe(roots[0]);
    expect(doc.getRootContaining(2)).toBeNull(); // empty line between groups
    expect(doc.getRootContaining(3)).toBe(roots[1]);
    expect(doc.getRootContaining(4)).toBe(roots[1]);
  });

  test("getAllTopLevelLists returns all top-level lists across roots", () => {
    const doc = makeDoc("- a\n- b\n\n- c\n- d");
    const entries = doc.getAllTopLevelLists();
    expect(entries).toHaveLength(4);
    expect(entries[0].list.getLines()[0]).toBe("a");
    expect(entries[1].list.getLines()[0]).toBe("b");
    expect(entries[2].list.getLines()[0]).toBe("c");
    expect(entries[3].list.getLines()[0]).toBe("d");
    expect(entries[0].root).toBe(entries[1].root);
    expect(entries[2].root).toBe(entries[3].root);
    expect(entries[0].root).not.toBe(entries[2].root);
  });

  test("returns three Roots for three groups", () => {
    const doc = makeDoc("- a\n\n- b\n\n- c");
    expect(doc.getRoots()).toHaveLength(3);
  });

  test("ignores plain-text lines between groups", () => {
    const doc = makeDoc("- a\n\nplain text\n\n- b");
    const roots = doc.getRoots();
    expect(roots).toHaveLength(2);
    expect(roots[0].print()).toBe("- a");
    expect(roots[1].print()).toBe("- b");
  });

  test("splits groups separated by a whitespace-only line", () => {
    // This is a common Obsidian edge case: empty line between groups may contain trailing whitespace
    const doc = makeDoc("- a\n- b\n   \n- c\n- d");
    const roots = doc.getRoots();
    expect(roots).toHaveLength(2);
    expect(roots[0].print()).toBe("- a\n- b");
    expect(roots[1].print()).toBe("- c\n- d");
  });
});

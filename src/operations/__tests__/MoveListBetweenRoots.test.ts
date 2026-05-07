/* eslint-disable @typescript-eslint/no-explicit-any */
import { makeEditor, makeLogger, makeSettings } from "../../__mocks__";
import { Parser } from "../../services/Parser";
import { MoveListBetweenRoots } from "../MoveListBetweenRoots";

function parseDoc(text: string) {
  const parser = new Parser(makeLogger(), makeSettings());
  const editor = makeEditor({ text, cursor: { line: 0, ch: 0 } });
  const roots = parser.parseRange(editor as any, 0, (editor as any).lastLine());
  return { roots, editor };
}

describe("MoveListBetweenRoots operation", () => {
  test("moves bullet from group 1 to group 2 (before)", () => {
    const { roots } = parseDoc("- a\n- b\n\n- c\n- d");
    const sourceRoot = roots[0];
    const targetRoot = roots[1];
    const listToMove = sourceRoot.getListUnderLine(1); // "b"
    const placeToMove = targetRoot.getListUnderLine(3); // "c"

    const op = new MoveListBetweenRoots(
      sourceRoot,
      targetRoot,
      listToMove,
      placeToMove,
      "before",
      "  ",
    );
    op.perform();

    expect(op.shouldUpdate()).toBe(true);
    expect(op.shouldStopPropagation()).toBe(true);
    expect(sourceRoot.print()).toBe("- a");
    expect(targetRoot.print()).toBe("- b\n- c\n- d");
  });

  test("moves bullet from group 2 to group 1 (after)", () => {
    const { roots } = parseDoc("- a\n- b\n\n- c\n- d");
    const sourceRoot = roots[1];
    const targetRoot = roots[0];
    const listToMove = sourceRoot.getListUnderLine(3); // "c"
    const placeToMove = targetRoot.getListUnderLine(0); // "a"

    const op = new MoveListBetweenRoots(
      sourceRoot,
      targetRoot,
      listToMove,
      placeToMove,
      "after",
      "  ",
    );
    op.perform();

    expect(sourceRoot.print()).toBe("- d");
    expect(targetRoot.print()).toBe("- a\n- c\n- b");
  });

  test("moves bullet with sublists between groups", () => {
    const { roots } = parseDoc("- a\n  - a1\n  - a2\n\n- b");
    const sourceRoot = roots[0];
    const targetRoot = roots[1];
    const listToMove = sourceRoot.getListUnderLine(0); // "a" with children
    const placeToMove = targetRoot.getListUnderLine(4); // "b"

    const op = new MoveListBetweenRoots(
      sourceRoot,
      targetRoot,
      listToMove,
      placeToMove,
      "after",
      "  ",
    );
    op.perform();

    expect(sourceRoot.print()).toBe("");
    expect(targetRoot.print()).toBe("- b\n- a\n  - a1\n  - a2");
  });

  test("moves bullet inside another bullet from a different group", () => {
    const { roots } = parseDoc("- a\n\n- b");
    const sourceRoot = roots[0];
    const targetRoot = roots[1];
    const listToMove = sourceRoot.getListUnderLine(0); // "a"
    const placeToMove = targetRoot.getListUnderLine(2); // "b"

    const op = new MoveListBetweenRoots(
      sourceRoot,
      targetRoot,
      listToMove,
      placeToMove,
      "inside",
      "  ",
    );
    op.perform();

    expect(sourceRoot.print()).toBe("");
    expect(targetRoot.print()).toBe("- b\n  - a");
  });

  test("noop when sourceRoot === targetRoot", () => {
    const { roots } = parseDoc("- a\n- b\n- c");
    const root = roots[0];
    const listToMove = root.getListUnderLine(0); // "a"
    const placeToMove = root.getListUnderLine(2); // "c"

    const op = new MoveListBetweenRoots(
      root,
      root,
      listToMove,
      placeToMove,
      "after",
      "  ",
    );
    op.perform();

    expect(op.shouldUpdate()).toBe(false);
    expect(op.shouldStopPropagation()).toBe(false);
    expect(root.print()).toBe("- a\n- b\n- c");
  });

  test("recalculates numeric bullets in target root", () => {
    const { roots } = parseDoc("1. a\n2. b\n\n1. c\n2. d");
    const sourceRoot = roots[0];
    const targetRoot = roots[1];
    const listToMove = sourceRoot.getListUnderLine(0); // "a"
    const placeToMove = targetRoot.getListUnderLine(3); // "c"

    const op = new MoveListBetweenRoots(
      sourceRoot,
      targetRoot,
      listToMove,
      placeToMove,
      "before",
      "  ",
    );
    op.perform();

    expect(sourceRoot.print()).toBe("1. b");
    expect(targetRoot.print()).toBe("1. a\n2. c\n3. d");
  });

  test("inside with tab-indented target", () => {
    const { roots } = parseDoc("- a\n\n- b\n\t- b1");
    const sourceRoot = roots[0];
    const targetRoot = roots[1];
    const listToMove = sourceRoot.getListUnderLine(0); // "a"
    const placeToMove = targetRoot.getListUnderLine(2); // "b"

    const op = new MoveListBetweenRoots(
      sourceRoot,
      targetRoot,
      listToMove,
      placeToMove,
      "inside",
      "\t",
    );
    op.perform();

    expect(sourceRoot.print()).toBe("");
    expect(targetRoot.print()).toBe("- b\n\t- a\n\t- b1");
  });

  test("places cursor on moved list in target root", () => {
    const { roots } = parseDoc("- a\n- b\n\n- c");
    const sourceRoot = roots[0];
    const targetRoot = roots[1];
    const listToMove = sourceRoot.getListUnderLine(0); // "a"
    const placeToMove = targetRoot.getListUnderLine(3); // "c"

    const op = new MoveListBetweenRoots(
      sourceRoot,
      targetRoot,
      listToMove,
      placeToMove,
      "before",
      "  ",
    );
    op.perform();

    const cursor = targetRoot.getCursor();
    // Now in target, "a" is at line 3 (was index 3 in original doc -> targetRoot starts at line 3)
    // After insert, "a" is the first list of targetRoot at line 3
    expect(cursor.line).toBe(3);
    // Cursor should be at the end of "a"'s content
    expect(cursor.ch).toBe("- a".length);
  });
});

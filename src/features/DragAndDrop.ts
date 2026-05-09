import { Notice, Platform, Plugin } from "obsidian";

import { getIndentUnit, indentString } from "@codemirror/language";
import { StateEffect, StateField } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView } from "@codemirror/view";

import { Feature } from "./Feature";

import { MyEditor, getEditorFromState } from "../editor";
import { MoveListBetweenRoots } from "../operations/MoveListBetweenRoots";
import { MoveListToDifferentPosition } from "../operations/MoveListToDifferentPosition";
import { List, Root, cmpPos } from "../root";
import { ChangesApplicator } from "../services/ChangesApplicator";
import {
  LenientBullet,
  LenientBulletScanner,
} from "../services/LenientBulletScanner";
import { parseDocumentByBlankLines } from "../services/MultiRootDocument";
import { ObsidianSettings } from "../services/ObsidianSettings";
import { OperationPerformer } from "../services/OperationPerformer";
import { Parser } from "../services/Parser";
import { Settings } from "../services/Settings";

const BODY_CLASS = "outliner-plus-dnd";

export class DragAndDrop implements Feature {
  private dropZone: HTMLDivElement;
  private dropZonePadding: HTMLDivElement;
  private preStart: DragAndDropPreStartState | null = null;
  private state: DragAndDropState | null = null;

  constructor(
    private plugin: Plugin,
    private settings: Settings,
    private obisidian: ObsidianSettings,
    private parser: Parser,
    private operationPerformer: OperationPerformer,
  ) {}

  async load() {
    this.plugin.registerEditorExtension([
      draggingLinesStateField,
      droppingLinesStateField,
    ]);
    this.enableFeatureToggle();
    this.createDropZone();
    this.addEventListeners();
  }

  async unload() {
    this.removeEventListeners();
    this.removeDropZone();
    this.disableFeatureToggle();
  }

  private enableFeatureToggle() {
    this.settings.onChange(this.handleSettingsChange);
    this.handleSettingsChange();
  }

  private disableFeatureToggle() {
    this.settings.removeCallback(this.handleSettingsChange);
    document.body.classList.remove(BODY_CLASS);
  }

  private createDropZone() {
    this.dropZonePadding = document.createElement("div");
    this.dropZonePadding.classList.add("outliner-plus-drop-zone-padding");
    this.dropZone = document.createElement("div");
    this.dropZone.classList.add("outliner-plus-drop-zone");
    this.dropZone.style.display = "none";
    this.dropZone.appendChild(this.dropZonePadding);
    document.body.appendChild(this.dropZone);
  }

  private removeDropZone() {
    document.body.removeChild(this.dropZone);
    this.dropZonePadding = null;
    this.dropZone = null;
  }

  private addEventListeners() {
    document.addEventListener("mousedown", this.handleMouseDown, {
      capture: true,
    });
    document.addEventListener("mousemove", this.handleMouseMove);
    document.addEventListener("mouseup", this.handleMouseUp);
    document.addEventListener("keydown", this.handleKeyDown);
  }

  private removeEventListeners() {
    document.removeEventListener("mousedown", this.handleMouseDown, {
      capture: true,
    });
    document.removeEventListener("mousemove", this.handleMouseMove);
    document.removeEventListener("mouseup", this.handleMouseUp);
    document.removeEventListener("keydown", this.handleKeyDown);
  }

  private handleSettingsChange = () => {
    if (!isFeatureSupported()) {
      return;
    }

    if (this.settings.dragAndDrop) {
      document.body.classList.add(BODY_CLASS);
    } else {
      document.body.classList.remove(BODY_CLASS);
    }
  };

  private handleMouseDown = (e: MouseEvent) => {
    if (
      !isFeatureSupported() ||
      !this.settings.dragAndDrop ||
      !isClickOnBullet(e)
    ) {
      return;
    }

    const view = getEditorViewFromHTMLElement(e.target as HTMLElement);
    if (!view) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    this.preStart = {
      x: e.x,
      y: e.y,
      view,
    };
  };

  private handleMouseMove = (e: MouseEvent) => {
    if (this.preStart) {
      this.startDragging();
    }
    if (this.state) {
      this.detectAndDrawDropZone(e.x, e.y);
    }
  };

  private handleMouseUp = () => {
    if (this.preStart) {
      this.preStart = null;
    }
    if (this.state) {
      this.stopDragging();
    }
  };

  private handleKeyDown = (e: KeyboardEvent) => {
    if (this.state && e.code === "Escape") {
      this.cancelDragging();
    }
  };

  private startDragging() {
    const { x, y, view } = this.preStart;
    this.preStart = null;

    const editor = getEditorFromState(view.state);
    const pos = editor.offsetToPos(view.posAtCoords({ x, y }));
    const roots = parseDocumentByBlankLines(this.parser, editor);

    const tabSize = this.obisidian.getTabsSettings().tabSize;
    const lenientBullets = new LenientBulletScanner().scan(editor, tabSize);

    let source: DragSource | null = null;

    const strictRoot = findRootContaining(roots, pos.line);
    const strictList = strictRoot
      ? strictRoot.getListUnderLine(pos.line)
      : null;
    if (strictRoot && strictList) {
      source = {
        kind: "strict",
        list: strictList,
        root: strictRoot,
        lineStart: strictList.getFirstLineContentStart().line,
        lineEnd: strictList.getContentEndIncludingChildren().line,
      };
    } else {
      const lenient = findLenientBulletAtLine(lenientBullets, pos.line);
      if (lenient) {
        source = {
          kind: "lenient",
          bullet: lenient,
          lineStart: lenient.lineStart,
          lineEnd: lenient.lineEnd,
        };
      }
    }

    if (!source) {
      return;
    }

    const state = new DragAndDropState(
      view,
      editor,
      roots,
      lenientBullets,
      source,
    );

    if (!state.hasDropVariants()) {
      return;
    }

    this.state = state;
    this.highlightDraggingLines();
  }

  private detectAndDrawDropZone(x: number, y: number) {
    this.state.calculateNearestDropVariant(x, y);
    if (!this.state.dropVariant) {
      this.hideDropZone();
      this.state.view.dispatch({ effects: [dndMoved.of(null)] });
      return;
    }
    this.drawDropZone();
  }

  private cancelDragging() {
    this.state.dropVariant = null;
    this.stopDragging();
  }

  private stopDragging() {
    this.unhightlightDraggingLines();
    this.hideDropZone();
    try {
      this.applyChanges();
    } finally {
      this.state = null;
    }
  }

  private applyChanges() {
    if (!this.state.dropVariant) {
      return;
    }

    const { state } = this;
    const { dropVariant, editor, source, roots } = state;

    const freshRoots = parseDocumentByBlankLines(this.parser, editor);
    if (!isSameMultiRoot(roots, freshRoots)) {
      new Notice(
        `The item cannot be moved. The page content changed during the move.`,
        5000,
      );
      return;
    }

    if (source.kind === "strict" && dropVariant.kind === "strict") {
      const sourceRoot = source.root;
      const targetRoot = dropVariant.targetRoot;
      if (sourceRoot === targetRoot) {
        this.operationPerformer.eval(
          sourceRoot,
          new MoveListToDifferentPosition(
            sourceRoot,
            source.list,
            dropVariant.placeToMove,
            dropVariant.whereToMove,
            this.obisidian.getDefaultIndentChars(),
          ),
          editor,
        );
        return;
      }
      this.applyCrossRootMove(
        editor,
        sourceRoot,
        targetRoot,
        source.list,
        dropVariant.placeToMove,
        dropVariant.whereToMove,
      );
      return;
    }

    this.applyTextLevelMove(editor, source, dropVariant);
  }

  private applyTextLevelMove(
    editor: MyEditor,
    source: DragSource,
    dropVariant: DropVariant,
  ) {
    const indentUnit = this.obisidian.getDefaultIndentChars();

    const sourceLineStart = source.lineStart;
    const sourceLineEnd = source.lineEnd;
    const sourceBaseIndent =
      source.kind === "strict"
        ? source.list.getFirstLineIndent()
        : source.bullet.rawIndent;

    let targetLineStart: number;
    let targetLineEnd: number;
    let targetBaseIndent: string;
    let insertWhere: "before" | "after" | "inside";
    if (dropVariant.kind === "strict") {
      const place = dropVariant.placeToMove;
      targetLineStart = place.getFirstLineContentStart().line;
      targetLineEnd = place.getContentEndIncludingChildren().line;
      targetBaseIndent = place.getFirstLineIndent();
      insertWhere = dropVariant.whereToMove;
    } else {
      const place = dropVariant.placeToMove;
      targetLineStart = place.lineStart;
      targetLineEnd = place.lineEnd;
      targetBaseIndent = place.rawIndent;
      insertWhere = dropVariant.whereToMove;
    }

    if (
      sourceLineStart <= targetLineStart &&
      targetLineStart <= sourceLineEnd
    ) {
      return;
    }

    let insertAtLine: number;
    let newBaseIndent: string;
    if (insertWhere === "before") {
      insertAtLine = targetLineStart;
      newBaseIndent = targetBaseIndent;
    } else if (insertWhere === "after") {
      insertAtLine = targetLineEnd + 1;
      newBaseIndent = targetBaseIndent;
    } else {
      insertAtLine = targetLineEnd + 1;
      newBaseIndent = targetBaseIndent + indentUnit;
    }

    const sourceLines: string[] = [];
    for (let i = sourceLineStart; i <= sourceLineEnd; i++) {
      sourceLines.push(editor.getLine(i));
    }

    const reindented = sourceLines.map((line) => {
      if (line.startsWith(sourceBaseIndent)) {
        return newBaseIndent + line.slice(sourceBaseIndent.length);
      }
      return line;
    });
    const insertText = reindented.join("\n") + "\n";

    const lastLine = editor.lastLine();
    const sourceFromOffset = editor.posToOffset({
      line: sourceLineStart,
      ch: 0,
    });
    let sourceToOffset: number;
    if (sourceLineEnd < lastLine) {
      sourceToOffset = editor.posToOffset({
        line: sourceLineEnd + 1,
        ch: 0,
      });
    } else {
      sourceToOffset = editor.posToOffset({
        line: sourceLineEnd,
        ch: editor.getLine(sourceLineEnd).length,
      });
    }

    const insertAtClamped = Math.min(insertAtLine, lastLine + 1);
    let insertOffset: number;
    let insertPayload: string;
    if (insertAtClamped > lastLine) {
      insertOffset = editor.posToOffset({
        line: lastLine,
        ch: editor.getLine(lastLine).length,
      });
      insertPayload = "\n" + reindented.join("\n");
    } else {
      insertOffset = editor.posToOffset({
        line: insertAtClamped,
        ch: 0,
      });
      insertPayload = insertText;
    }

    const view = this.state.view;
    view.dispatch({
      changes: [
        { from: sourceFromOffset, to: sourceToOffset, insert: "" },
        { from: insertOffset, to: insertOffset, insert: insertPayload },
      ],
    });

    let movedFirstLine: number;
    if (insertAtLine <= sourceLineStart) {
      movedFirstLine = insertAtLine;
    } else {
      movedFirstLine = insertAtLine - (sourceLineEnd - sourceLineStart + 1);
    }
    const movedLineCount = sourceLineEnd - sourceLineStart + 1;
    const movedLastLine = movedFirstLine + movedLineCount - 1;
    const movedLastLineText =
      newBaseIndent +
      sourceLines[sourceLines.length - 1].slice(sourceBaseIndent.length);
    editor.setSelections([
      {
        anchor: { line: movedLastLine, ch: movedLastLineText.length },
        head: { line: movedLastLine, ch: movedLastLineText.length },
      },
    ]);
  }

  private applyCrossRootMove(
    editor: MyEditor,
    sourceRoot: Root,
    targetRoot: Root,
    listToMove: List,
    placeToMove: List,
    whereToMove: "before" | "after" | "inside",
  ) {
    const prevSourceRoot = sourceRoot.clone();
    const prevTargetRoot = targetRoot.clone();

    const op = new MoveListBetweenRoots(
      sourceRoot,
      targetRoot,
      listToMove,
      placeToMove,
      whereToMove,
      this.obisidian.getDefaultIndentChars(),
    );
    op.perform();

    if (!op.shouldUpdate()) {
      return;
    }

    const applicator = new ChangesApplicator();

    const sourceFirst =
      sourceRoot.getContentStart().line > targetRoot.getContentStart().line;

    const movedListInTarget = op.getMovedListInTarget();
    const finalCursor = movedListInTarget
      ? movedListInTarget.getLastLineContentEnd()
      : null;

    // Avoid setSelections inside each apply() — coordinates from old document
    // state may point outside the document after the first apply mutates it.
    // Use safe placeholder selections; we'll set the real cursor once at the end.
    const safeSelection = [
      { anchor: { line: 0, ch: 0 }, head: { line: 0, ch: 0 } },
    ];
    sourceRoot.replaceSelections(safeSelection);
    targetRoot.replaceSelections(safeSelection);

    if (sourceFirst) {
      applicator.apply(editor, prevSourceRoot, sourceRoot);
      applicator.apply(editor, prevTargetRoot, targetRoot);
    } else {
      applicator.apply(editor, prevTargetRoot, targetRoot);
      applicator.apply(editor, prevSourceRoot, sourceRoot);
    }

    if (finalCursor) {
      editor.setSelections([{ anchor: finalCursor, head: finalCursor }]);
    }
  }

  private highlightDraggingLines() {
    const { state } = this;
    const { source, editor, view } = state;

    const lines = [];
    for (let i = source.lineStart; i <= source.lineEnd; i++) {
      lines.push(editor.posToOffset({ line: i, ch: 0 }));
    }
    view.dispatch({
      effects: [dndStarted.of(lines)],
    });

    document.body.classList.add("outliner-plus-dragging");
  }

  private unhightlightDraggingLines() {
    document.body.classList.remove("outliner-plus-dragging");

    this.state.view.dispatch({
      effects: [dndEnded.of()],
    });
  }

  private drawDropZone() {
    const { state } = this;
    const { view, editor, dropVariant } = state;

    const parentInfo = getDropVariantNewParent(dropVariant);

    {
      const width = Math.round(
        view.contentDOM.offsetWidth -
          (dropVariant.left - this.state.leftPadding),
      );

      this.dropZone.style.display = "block";
      this.dropZone.style.top = dropVariant.top + "px";
      this.dropZone.style.left = dropVariant.left + "px";
      this.dropZone.style.width = width + "px";
    }

    {
      const level = parentInfo.level;
      const indentWidth = this.state.tabWidth;
      const width = indentWidth * level;
      const dashPadding = 3;
      const dashWidth = indentWidth - dashPadding;
      const color = getComputedStyle(document.body).getPropertyValue(
        "--color-accent",
      );

      this.dropZonePadding.style.width = `${width}px`;
      this.dropZonePadding.style.marginLeft = `-${width}px`;
      this.dropZonePadding.style.backgroundImage = `url('data:image/svg+xml,%3Csvg%20viewBox%3D%220%200%20${width}%204%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Cline%20x1%3D%220%22%20y1%3D%220%22%20x2%3D%22${width}%22%20y2%3D%220%22%20stroke%3D%22${color}%22%20stroke-width%3D%228%22%20stroke-dasharray%3D%22${dashWidth}%20${dashPadding}%22%2F%3E%3C%2Fsvg%3E')`;
    }

    this.state.view.dispatch({
      effects: [
        dndMoved.of(
          parentInfo.parentLine === null
            ? null
            : editor.posToOffset({
                line: parentInfo.parentLine,
                ch: 0,
              }),
        ),
      ],
    });
  }

  private hideDropZone() {
    this.dropZone.style.display = "none";
  }
}

type DragSource =
  | {
      kind: "strict";
      list: List;
      root: Root;
      lineStart: number;
      lineEnd: number;
    }
  | {
      kind: "lenient";
      bullet: LenientBullet;
      lineStart: number;
      lineEnd: number;
    };

type DropVariant =
  | {
      kind: "strict";
      line: number;
      level: number;
      left: number;
      top: number;
      placeToMove: List;
      targetRoot: Root;
      whereToMove: "after" | "before" | "inside";
    }
  | {
      kind: "lenient";
      line: number;
      level: number;
      left: number;
      top: number;
      placeToMove: LenientBullet;
      whereToMove: "after" | "before" | "inside";
    };

interface DragAndDropPreStartState {
  x: number;
  y: number;
  view: EditorView;
}

class DragAndDropState {
  private dropVariants: Map<string, DropVariant> = new Map();
  public dropVariant: DropVariant = null;
  public leftPadding = 0;
  public tabWidth = 0;

  constructor(
    public readonly view: EditorView,
    public readonly editor: MyEditor,
    public readonly roots: Root[],
    public readonly lenientBullets: LenientBullet[],
    public readonly source: DragSource,
  ) {
    this.collectDropVariants();
    this.calculateLeftPadding();
    this.calculateTabWidth();
  }

  getDropVariants() {
    return Array.from(this.dropVariants.values());
  }

  hasDropVariants() {
    return this.dropVariants.size > 0;
  }

  calculateNearestDropVariant(x: number, y: number) {
    const { view, editor } = this;

    const dropVariants = this.getDropVariants();
    const possibleDropVariants = [];

    for (const v of dropVariants) {
      const positionAfterList =
        v.whereToMove === "after" || v.whereToMove === "inside";
      const line =
        v.kind === "strict"
          ? positionAfterList
            ? v.placeToMove.getContentEndIncludingChildren().line
            : v.placeToMove.getFirstLineContentStart().line
          : positionAfterList
            ? v.placeToMove.lineEnd
            : v.placeToMove.lineStart;
      const linePos = editor.posToOffset({
        line,
        ch: 0,
      });

      const coords = view.coordsAtPos(linePos, -1);

      if (!coords) {
        continue;
      }

      v.left = this.leftPadding + (v.level - 1) * this.tabWidth;
      v.top = coords.top;

      if (positionAfterList) {
        v.top += view.lineBlockAt(linePos).height;
      }

      // Better vertical alignment
      v.top -= 8;

      possibleDropVariants.push(v);
    }

    if (possibleDropVariants.length === 0) {
      this.dropVariant = null;
      return;
    }

    const nearestLineTop = possibleDropVariants
      .sort((a, b) => Math.abs(y - a.top) - Math.abs(y - b.top))
      .first().top;

    const variansOnNearestLine = possibleDropVariants.filter(
      (v) => Math.abs(v.top - nearestLineTop) <= 4,
    );

    this.dropVariant = variansOnNearestLine
      .sort((a, b) => Math.abs(x - a.left) - Math.abs(x - b.left))
      .first();
  }

  private addDropVariant(v: DropVariant) {
    this.dropVariants.set(`${v.line} ${v.level}`, v);
  }

  private collectDropVariants() {
    const sourceList = this.source.kind === "strict" ? this.source.list : null;
    const sourceLenient =
      this.source.kind === "lenient" ? this.source.bullet : null;
    const sourceLineStart = this.source.lineStart;
    const sourceLineEnd = this.source.lineEnd;

    const visit = (lists: List[], targetRoot: Root) => {
      for (const placeToMove of lists) {
        const lineBefore = placeToMove.getFirstLineContentStart().line;
        const lineAfter = placeToMove.getContentEndIncludingChildren().line + 1;

        const level = placeToMove.getLevel();

        this.addDropVariant({
          kind: "strict",
          line: lineBefore,
          level,
          left: 0,
          top: 0,
          placeToMove,
          targetRoot,
          whereToMove: "before",
        });
        this.addDropVariant({
          kind: "strict",
          line: lineAfter,
          level,
          left: 0,
          top: 0,
          placeToMove,
          targetRoot,
          whereToMove: "after",
        });

        if (placeToMove === sourceList) {
          continue;
        }

        if (placeToMove.isEmpty()) {
          this.addDropVariant({
            kind: "strict",
            line: lineAfter,
            level: level + 1,
            left: 0,
            top: 0,
            placeToMove,
            targetRoot,
            whereToMove: "inside",
          });
        } else {
          visit(placeToMove.getChildren(), targetRoot);
        }
      }
    };

    for (const root of this.roots) {
      visit(root.getChildren(), root);
    }

    for (const b of this.lenientBullets) {
      if (findRootContaining(this.roots, b.lineStart)) {
        continue;
      }
      if (
        sourceLenient &&
        b.lineStart >= sourceLineStart &&
        b.lineStart <= sourceLineEnd
      ) {
        continue;
      }

      const level = b.visualLevel + 1;

      this.addDropVariant({
        kind: "lenient",
        line: b.lineStart,
        level,
        left: 0,
        top: 0,
        placeToMove: b,
        whereToMove: "before",
      });
      this.addDropVariant({
        kind: "lenient",
        line: b.lineEnd + 1,
        level,
        left: 0,
        top: 0,
        placeToMove: b,
        whereToMove: "after",
      });
      if (b.children.length === 0) {
        this.addDropVariant({
          kind: "lenient",
          line: b.lineEnd + 1,
          level: level + 1,
          left: 0,
          top: 0,
          placeToMove: b,
          whereToMove: "inside",
        });
      }
    }
  }

  private calculateLeftPadding() {
    const cmLine = this.view.dom.querySelector("div.cm-line");
    this.leftPadding = cmLine.getBoundingClientRect().left;
  }

  private calculateTabWidth() {
    const { view } = this;

    const indentDom = view.dom.querySelector(".cm-indent");
    if (indentDom) {
      this.tabWidth = (indentDom as HTMLElement).offsetWidth;
      return;
    }

    const singleIndent = indentString(view.state, getIndentUnit(view.state));

    for (let i = 1; i <= view.state.doc.lines; i++) {
      const line = view.state.doc.line(i);

      if (line.text.startsWith(singleIndent)) {
        const a = view.coordsAtPos(line.from, -1);
        if (!a) {
          continue;
        }

        const b = view.coordsAtPos(line.from + singleIndent.length, -1);
        if (!b) {
          continue;
        }

        this.tabWidth = b.left - a.left;
        return;
      }
    }

    this.tabWidth = view.defaultCharacterWidth * getIndentUnit(view.state);
  }
}

const dndStarted = StateEffect.define<number[]>({
  map: (lines, change) => lines.map((l) => change.mapPos(l)),
});

const dndMoved = StateEffect.define<number | null>({
  map: (line, change) => (line !== null ? change.mapPos(line) : line),
});

const dndEnded = StateEffect.define<void>();

const draggingLineDecoration = Decoration.line({
  class: "outliner-plus-dragging-line",
});

const droppingLineDecoration = Decoration.line({
  class: "outliner-plus-dropping-line",
});

const draggingLinesStateField = StateField.define<DecorationSet>({
  create: () => Decoration.none,

  update: (dndState, tr) => {
    dndState = dndState.map(tr.changes);

    for (const e of tr.effects) {
      if (e.is(dndStarted)) {
        dndState = dndState.update({
          add: e.value.map((l) => draggingLineDecoration.range(l, l)),
        });
      }

      if (e.is(dndEnded)) {
        dndState = Decoration.none;
      }
    }

    return dndState;
  },

  provide: (f) => EditorView.decorations.from(f),
});

const droppingLinesStateField = StateField.define<DecorationSet>({
  create: () => Decoration.none,

  update: (dndDroppingState, tr) => {
    dndDroppingState = dndDroppingState.map(tr.changes);

    for (const e of tr.effects) {
      if (e.is(dndMoved)) {
        dndDroppingState =
          e.value === null
            ? Decoration.none
            : Decoration.set(droppingLineDecoration.range(e.value, e.value));
      }

      if (e.is(dndEnded)) {
        dndDroppingState = Decoration.none;
      }
    }

    return dndDroppingState;
  },

  provide: (f) => EditorView.decorations.from(f),
});

function getEditorViewFromHTMLElement(e: HTMLElement) {
  while (e && !e.classList.contains("cm-editor")) {
    e = e.parentElement;
  }

  if (!e) {
    return null;
  }

  return EditorView.findFromDOM(e);
}

function isClickOnBullet(e: MouseEvent) {
  let el = e.target as HTMLElement;

  while (el) {
    if (
      el.classList.contains("cm-formatting-list") ||
      el.classList.contains("cm-fold-indicator") ||
      el.classList.contains("task-list-item-checkbox")
    ) {
      return true;
    }

    el = el.parentElement;
  }

  return false;
}

function isSameRoots(a: Root, b: Root) {
  const [aStart, aEnd] = a.getContentRange();
  const [bStart, bEnd] = b.getContentRange();

  if (cmpPos(aStart, bStart) !== 0 || cmpPos(aEnd, bEnd) !== 0) {
    return false;
  }

  return a.print() === b.print();
}

function isSameMultiRoot(a: Root[], b: Root[]) {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    if (!isSameRoots(a[i], b[i])) {
      return false;
    }
  }
  return true;
}

function findRootContaining(roots: Root[], line: number): Root | null {
  for (const root of roots) {
    const start = root.getContentStart().line;
    const end = root.getContentEnd().line;
    if (line >= start && line <= end) {
      return root;
    }
  }
  return null;
}

function findLenientBulletAtLine(
  bullets: LenientBullet[],
  line: number,
): LenientBullet | null {
  for (const b of bullets) {
    if (b.lineStart === line) {
      return b;
    }
  }
  return null;
}

function getDropVariantNewParent(v: DropVariant): {
  level: number;
  parentLine: number | null;
} {
  if (v.kind === "strict") {
    const newParent =
      v.whereToMove === "inside" ? v.placeToMove : v.placeToMove.getParent();
    const isRoot = !newParent.getParent();
    return {
      level: newParent.getLevel(),
      parentLine: isRoot ? null : newParent.getFirstLineContentStart().line,
    };
  }

  const newParent =
    v.whereToMove === "inside" ? v.placeToMove : v.placeToMove.parent;
  if (!newParent) {
    return { level: 0, parentLine: null };
  }
  return {
    level: newParent.visualLevel + 1,
    parentLine: newParent.lineStart,
  };
}

function isFeatureSupported() {
  return Platform.isDesktop;
}

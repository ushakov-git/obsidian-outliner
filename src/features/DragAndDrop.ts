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
      source,
      this.parser,
      tabSize,
      roots,
      lenientBullets,
    );

    if (!state.hasAnyDropVariants()) {
      return;
    }

    this.state = state;
    this.highlightDraggingLines();
  }

  private detectAndDrawDropZone(x: number, y: number) {
    const targetView = findEditorViewAtPoint(x, y);

    if (
      this.state.lastDropTargetView &&
      this.state.lastDropTargetView !== targetView
    ) {
      this.state.lastDropTargetView.dispatch({ effects: [dndMoved.of(null)] });
    }
    this.state.lastDropTargetView = targetView;

    if (!targetView) {
      this.state.dropVariant = null;
      this.hideDropZone();
      return;
    }

    const data = this.state.getOrBuildTargetData(targetView);
    this.state.calculateNearestDropVariantForView(x, y, data);

    if (!this.state.dropVariant) {
      this.hideDropZone();
      targetView.dispatch({ effects: [dndMoved.of(null)] });
      return;
    }
    this.drawDropZone();
  }

  private cancelDragging() {
    this.state.dropVariant = null;
    this.stopDragging(true);
  }

  private stopDragging(cancelled = false) {
    this.unhightlightDraggingLines();
    this.hideDropZone();
    try {
      if (!cancelled) {
        this.applyChanges();
      }
    } finally {
      this.state = null;
    }
  }

  private applyChanges() {
    if (!this.state.dropVariant) {
      this.maybeNoticeEmptyTarget();
      return;
    }

    const { state } = this;
    const { dropVariant, source, sourceEditor, sourceView } = state;

    const freshRoots = parseDocumentByBlankLines(this.parser, sourceEditor);
    if (!isSameMultiRoot(state.getSourceData().roots, freshRoots)) {
      new Notice(
        `The item cannot be moved. The page content changed during the move.`,
        5000,
      );
      return;
    }

    const sameView = dropVariant.view === sourceView;

    if (sameView && source.kind === "strict" && dropVariant.kind === "strict") {
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
          sourceEditor,
        );
        return;
      }
      this.applyCrossRootMove(
        sourceEditor,
        sourceRoot,
        targetRoot,
        source.list,
        dropVariant.placeToMove,
        dropVariant.whereToMove,
      );
      return;
    }

    this.applyTextLevelMove(source, dropVariant);
  }

  private applyTextLevelMove(source: DragSource, dropVariant: DropVariant) {
    const indentUnit = this.obisidian.getDefaultIndentChars();
    const sourceEditor = this.state.sourceEditor;
    const sourceView = this.state.sourceView;
    const targetEditor = dropVariant.editor;
    const targetView = dropVariant.view;
    const sameView = sourceView === targetView;

    const sourceLineStart = source.lineStart;
    const sourceLineEnd = source.lineEnd;
    const sourceBaseIndent =
      source.kind === "strict"
        ? source.list.getFirstLineIndent()
        : source.bullet.rawIndent;

    let targetLineStart: number;
    let targetLineEnd: number;
    let targetBaseIndent: string;
    const insertWhere = dropVariant.whereToMove;
    if (dropVariant.kind === "strict") {
      const place = dropVariant.placeToMove;
      targetLineStart = place.getFirstLineContentStart().line;
      targetLineEnd = place.getContentEndIncludingChildren().line;
      targetBaseIndent = place.getFirstLineIndent();
    } else {
      const place = dropVariant.placeToMove;
      targetLineStart = place.lineStart;
      targetLineEnd = place.lineEnd;
      targetBaseIndent = place.rawIndent;
    }

    if (
      sameView &&
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
      sourceLines.push(sourceEditor.getLine(i));
    }
    const reindented = sourceLines.map((line) =>
      line.startsWith(sourceBaseIndent)
        ? newBaseIndent + line.slice(sourceBaseIndent.length)
        : line,
    );

    if (sameView) {
      this.applySameViewMove(
        sourceView,
        sourceEditor,
        sourceLineStart,
        sourceLineEnd,
        insertAtLine,
        reindented,
      );
      return;
    }

    this.applyCrossViewMove(
      sourceView,
      sourceEditor,
      sourceLineStart,
      sourceLineEnd,
      targetView,
      targetEditor,
      insertAtLine,
      reindented,
    );
  }

  private applySameViewMove(
    view: EditorView,
    editor: MyEditor,
    sourceLineStart: number,
    sourceLineEnd: number,
    insertAtLine: number,
    reindented: string[],
  ) {
    const lastLine = editor.lastLine();
    const sourceFromOffset = editor.posToOffset({
      line: sourceLineStart,
      ch: 0,
    });
    const sourceToOffset =
      sourceLineEnd < lastLine
        ? editor.posToOffset({ line: sourceLineEnd + 1, ch: 0 })
        : editor.posToOffset({
            line: sourceLineEnd,
            ch: editor.getLine(sourceLineEnd).length,
          });

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
      insertOffset = editor.posToOffset({ line: insertAtClamped, ch: 0 });
      insertPayload = reindented.join("\n") + "\n";
    }

    view.dispatch({
      changes: [
        { from: sourceFromOffset, to: sourceToOffset, insert: "" },
        { from: insertOffset, to: insertOffset, insert: insertPayload },
      ],
    });

    const movedLineCount = sourceLineEnd - sourceLineStart + 1;
    const movedFirstLine =
      insertAtLine <= sourceLineStart
        ? insertAtLine
        : insertAtLine - movedLineCount;
    const movedLastLine = movedFirstLine + movedLineCount - 1;
    const movedLastLineText = reindented[reindented.length - 1];
    editor.setSelections([
      {
        anchor: { line: movedLastLine, ch: movedLastLineText.length },
        head: { line: movedLastLine, ch: movedLastLineText.length },
      },
    ]);
  }

  private applyCrossViewMove(
    sourceView: EditorView,
    sourceEditor: MyEditor,
    sourceLineStart: number,
    sourceLineEnd: number,
    targetView: EditorView,
    targetEditor: MyEditor,
    insertAtLine: number,
    reindented: string[],
  ) {
    const targetLastLine = targetEditor.lastLine();
    const insertAtClamped = Math.min(insertAtLine, targetLastLine + 1);
    let insertOffset: number;
    let insertPayload: string;
    if (insertAtClamped > targetLastLine) {
      insertOffset = targetEditor.posToOffset({
        line: targetLastLine,
        ch: targetEditor.getLine(targetLastLine).length,
      });
      insertPayload = "\n" + reindented.join("\n");
    } else {
      insertOffset = targetEditor.posToOffset({
        line: insertAtClamped,
        ch: 0,
      });
      insertPayload = reindented.join("\n") + "\n";
    }

    try {
      targetView.dispatch({
        changes: [
          { from: insertOffset, to: insertOffset, insert: insertPayload },
        ],
      });
    } catch (err) {
      new Notice(
        `Failed to insert into target file. Source not modified. (${err})`,
        5000,
      );
      return;
    }

    const sourceLastLine = sourceEditor.lastLine();
    let sourceFromOffset: number;
    let sourceToOffset: number;
    if (sourceLineEnd < sourceLastLine) {
      sourceFromOffset = sourceEditor.posToOffset({
        line: sourceLineStart,
        ch: 0,
      });
      sourceToOffset = sourceEditor.posToOffset({
        line: sourceLineEnd + 1,
        ch: 0,
      });
    } else if (sourceLineStart > 0) {
      sourceFromOffset = sourceEditor.posToOffset({
        line: sourceLineStart - 1,
        ch: sourceEditor.getLine(sourceLineStart - 1).length,
      });
      sourceToOffset = sourceEditor.posToOffset({
        line: sourceLineEnd,
        ch: sourceEditor.getLine(sourceLineEnd).length,
      });
    } else {
      sourceFromOffset = sourceEditor.posToOffset({ line: 0, ch: 0 });
      sourceToOffset = sourceEditor.posToOffset({
        line: sourceLineEnd,
        ch: sourceEditor.getLine(sourceLineEnd).length,
      });
    }

    try {
      sourceView.dispatch({
        changes: [{ from: sourceFromOffset, to: sourceToOffset, insert: "" }],
      });
    } catch (err) {
      new Notice(
        `Source deletion failed; the moved item is now duplicated and must be removed manually. (${err})`,
        7000,
      );
      return;
    }

    const movedLineCount = sourceLineEnd - sourceLineStart + 1;
    const movedLastLine = insertAtClamped + movedLineCount - 1;
    const movedLastLineText = reindented[reindented.length - 1];
    targetEditor.setSelections([
      {
        anchor: { line: movedLastLine, ch: movedLastLineText.length },
        head: { line: movedLastLine, ch: movedLastLineText.length },
      },
    ]);
    targetView.focus();
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
    const { source, sourceEditor, sourceView } = state;

    const lines = [];
    for (let i = source.lineStart; i <= source.lineEnd; i++) {
      lines.push(sourceEditor.posToOffset({ line: i, ch: 0 }));
    }
    sourceView.dispatch({
      effects: [dndStarted.of(lines)],
    });

    document.body.classList.add("outliner-plus-dragging");
  }

  private unhightlightDraggingLines() {
    document.body.classList.remove("outliner-plus-dragging");

    this.state.sourceView.dispatch({
      effects: [dndEnded.of()],
    });
    if (
      this.state.lastDropTargetView &&
      this.state.lastDropTargetView !== this.state.sourceView
    ) {
      this.state.lastDropTargetView.dispatch({
        effects: [dndEnded.of()],
      });
    }
  }

  private drawDropZone() {
    const { state } = this;
    const { dropVariant } = state;
    const view = dropVariant.view;
    const editor = dropVariant.editor;
    const data = state.getOrBuildTargetData(view);

    const parentInfo = getDropVariantNewParent(dropVariant);

    {
      const width = Math.round(
        view.contentDOM.offsetWidth - (dropVariant.left - data.leftPadding),
      );

      this.dropZone.style.display = "block";
      this.dropZone.style.top = dropVariant.top + "px";
      this.dropZone.style.left = dropVariant.left + "px";
      this.dropZone.style.width = width + "px";
    }

    {
      const level = parentInfo.level;
      const indentWidth = data.tabWidth;
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

    view.dispatch({
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

  private maybeNoticeEmptyTarget() {
    const { state } = this;
    const lastTarget = state.lastDropTargetView;
    if (!lastTarget || lastTarget === state.sourceView) {
      return;
    }
    const data = state.getOrBuildTargetData(lastTarget);
    if (data.editor && data.variants.length === 0) {
      new Notice(
        `Cannot drop into this file — it has no bullet points to anchor to.`,
        4000,
      );
    }
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
      view: EditorView;
      editor: MyEditor;
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
      view: EditorView;
      editor: MyEditor;
      line: number;
      level: number;
      left: number;
      top: number;
      placeToMove: LenientBullet;
      whereToMove: "after" | "before" | "inside";
    };

interface TargetViewData {
  view: EditorView;
  editor: MyEditor | null;
  roots: Root[];
  lenientBullets: LenientBullet[];
  variants: DropVariant[];
  leftPadding: number;
  tabWidth: number;
}

interface DragAndDropPreStartState {
  x: number;
  y: number;
  view: EditorView;
}

class DragAndDropState {
  public dropVariant: DropVariant = null;
  public lastDropTargetView: EditorView | null = null;

  private targetCache: Map<EditorView, TargetViewData> = new Map();

  constructor(
    public readonly sourceView: EditorView,
    public readonly sourceEditor: MyEditor,
    public readonly source: DragSource,
    private readonly parser: Parser,
    private readonly tabSize: number,
    sourceRoots: Root[],
    sourceLenientBullets: LenientBullet[],
  ) {
    const sourceData = this.buildTargetData(
      sourceView,
      sourceEditor,
      sourceRoots,
      sourceLenientBullets,
    );
    this.targetCache.set(sourceView, sourceData);
  }

  getSourceData(): TargetViewData {
    return this.targetCache.get(this.sourceView);
  }

  getOrBuildTargetData(view: EditorView): TargetViewData {
    const cached = this.targetCache.get(view);
    if (cached) {
      return cached;
    }

    const editor = getEditorFromState(view.state);
    if (!editor) {
      const empty: TargetViewData = {
        view,
        editor: null,
        roots: [],
        lenientBullets: [],
        variants: [],
        leftPadding: 0,
        tabWidth: 0,
      };
      this.targetCache.set(view, empty);
      return empty;
    }

    const roots = parseDocumentByBlankLines(this.parser, editor);
    const lenientBullets = new LenientBulletScanner().scan(
      editor,
      this.tabSize,
    );
    const data = this.buildTargetData(view, editor, roots, lenientBullets);
    this.targetCache.set(view, data);
    return data;
  }

  hasAnyDropVariants(): boolean {
    for (const data of this.targetCache.values()) {
      if (data.variants.length > 0) {
        return true;
      }
    }
    return false;
  }

  calculateNearestDropVariantForView(
    x: number,
    y: number,
    data: TargetViewData,
  ) {
    const { view, editor, variants, leftPadding, tabWidth } = data;
    if (!editor) {
      this.dropVariant = null;
      return;
    }

    const possible: DropVariant[] = [];

    for (const v of variants) {
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
      const linePos = editor.posToOffset({ line, ch: 0 });

      const coords = view.coordsAtPos(linePos, -1);
      if (!coords) {
        continue;
      }

      v.left = leftPadding + (v.level - 1) * tabWidth;
      v.top = coords.top;
      if (positionAfterList) {
        v.top += view.lineBlockAt(linePos).height;
      }
      v.top -= 8;

      possible.push(v);
    }

    if (possible.length === 0) {
      this.dropVariant = null;
      return;
    }

    const nearestLineTop = possible
      .sort((a, b) => Math.abs(y - a.top) - Math.abs(y - b.top))
      .first().top;
    const onNearest = possible.filter(
      (v) => Math.abs(v.top - nearestLineTop) <= 4,
    );
    this.dropVariant = onNearest
      .sort((a, b) => Math.abs(x - a.left) - Math.abs(x - b.left))
      .first();
  }

  private buildTargetData(
    view: EditorView,
    editor: MyEditor,
    roots: Root[],
    lenientBullets: LenientBullet[],
  ): TargetViewData {
    return {
      view,
      editor,
      roots,
      lenientBullets,
      variants: this.collectVariantsForView(
        view,
        editor,
        roots,
        lenientBullets,
      ),
      leftPadding: this.computeLeftPadding(view),
      tabWidth: this.computeTabWidth(view),
    };
  }

  private collectVariantsForView(
    view: EditorView,
    editor: MyEditor,
    roots: Root[],
    lenientBullets: LenientBullet[],
  ): DropVariant[] {
    const isSourceView = view === this.sourceView;
    const sourceList =
      isSourceView && this.source.kind === "strict" ? this.source.list : null;
    const sourceLineStart = this.source.lineStart;
    const sourceLineEnd = this.source.lineEnd;

    const dedup = new Map<string, DropVariant>();
    const add = (v: DropVariant) => {
      const key = `${v.line}|${v.level}|${v.whereToMove}`;
      if (!dedup.has(key)) {
        dedup.set(key, v);
      }
    };

    const visit = (lists: List[], targetRoot: Root) => {
      for (const placeToMove of lists) {
        const lineBefore = placeToMove.getFirstLineContentStart().line;
        const lineAfter = placeToMove.getContentEndIncludingChildren().line + 1;
        const level = placeToMove.getLevel();

        add({
          kind: "strict",
          view,
          editor,
          line: lineBefore,
          level,
          left: 0,
          top: 0,
          placeToMove,
          targetRoot,
          whereToMove: "before",
        });
        add({
          kind: "strict",
          view,
          editor,
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
          add({
            kind: "strict",
            view,
            editor,
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

    for (const root of roots) {
      visit(root.getChildren(), root);
    }

    for (const b of lenientBullets) {
      if (findRootContaining(roots, b.lineStart)) {
        continue;
      }
      if (
        isSourceView &&
        this.source.kind === "lenient" &&
        b.lineStart >= sourceLineStart &&
        b.lineStart <= sourceLineEnd
      ) {
        continue;
      }

      const level = b.visualLevel + 1;
      add({
        kind: "lenient",
        view,
        editor,
        line: b.lineStart,
        level,
        left: 0,
        top: 0,
        placeToMove: b,
        whereToMove: "before",
      });
      add({
        kind: "lenient",
        view,
        editor,
        line: b.lineEnd + 1,
        level,
        left: 0,
        top: 0,
        placeToMove: b,
        whereToMove: "after",
      });
      if (b.children.length === 0) {
        add({
          kind: "lenient",
          view,
          editor,
          line: b.lineEnd + 1,
          level: level + 1,
          left: 0,
          top: 0,
          placeToMove: b,
          whereToMove: "inside",
        });
      }
    }

    return Array.from(dedup.values());
  }

  private computeLeftPadding(view: EditorView): number {
    const cmLine = view.dom.querySelector("div.cm-line");
    if (!cmLine) {
      return 0;
    }
    return cmLine.getBoundingClientRect().left;
  }

  private computeTabWidth(view: EditorView): number {
    const indentDom = view.dom.querySelector(".cm-indent");
    if (indentDom) {
      return (indentDom as HTMLElement).offsetWidth;
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
        return b.left - a.left;
      }
    }

    return view.defaultCharacterWidth * getIndentUnit(view.state);
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

function findEditorViewAtPoint(x: number, y: number): EditorView | null {
  const el = document.elementFromPoint(x, y);
  if (!el) {
    return null;
  }
  return getEditorViewFromHTMLElement(el as HTMLElement);
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

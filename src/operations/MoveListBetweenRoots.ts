import { Operation } from "./Operation";

import { List, Root, recalculateNumericBullets } from "../root";

export class MoveListBetweenRoots implements Operation {
  private stopPropagation = false;
  private updated = false;
  private movedListInTarget: List | null = null;

  constructor(
    private sourceRoot: Root,
    private targetRoot: Root,
    private listToMove: List,
    private placeToMove: List,
    private whereToMove: "before" | "after" | "inside",
    private defaultIndentChars: string,
  ) {}

  shouldStopPropagation() {
    return this.stopPropagation;
  }

  shouldUpdate() {
    return this.updated;
  }

  getMovedListInTarget(): List | null {
    return this.movedListInTarget;
  }

  perform() {
    if (this.sourceRoot === this.targetRoot) {
      return;
    }
    if (this.listToMove === this.placeToMove) {
      return;
    }

    this.stopPropagation = true;
    this.updated = true;

    const cloned = this.listToMove.clone(this.targetRoot);

    this.listToMove.getParent().removeChild(this.listToMove);

    this.insertCloned(cloned);
    this.changeIndent(cloned);

    recalculateNumericBullets(this.sourceRoot);
    recalculateNumericBullets(this.targetRoot);

    this.movedListInTarget = cloned;

    this.targetRoot.replaceCursor(cloned.getLastLineContentEnd());
  }

  private insertCloned(cloned: List) {
    switch (this.whereToMove) {
      case "before":
        this.placeToMove.getParent().addBefore(this.placeToMove, cloned);
        break;
      case "after":
        this.placeToMove.getParent().addAfter(this.placeToMove, cloned);
        break;
      case "inside":
        this.placeToMove.addBeforeAll(cloned);
        break;
    }
  }

  private changeIndent(cloned: List) {
    const oldIndent = cloned.getFirstLineIndent();
    const newIndent =
      this.whereToMove === "inside"
        ? this.placeToMove.getFirstLineIndent() + this.defaultIndentChars
        : this.placeToMove.getFirstLineIndent();
    cloned.unindentContent(0, oldIndent.length);
    cloned.indentContent(0, newIndent);
  }
}

/** Use rendered geometry, not intrinsic dimensions, to avoid tiny avatars/icons. */
export function isActionImage(element: Element): element is HTMLImageElement {
  if (element.tagName !== "IMG") return false;
  const rect = element.getBoundingClientRect();
  return rect.width >= 120 && rect.height >= 120 && rect.width * rect.height >= 30000;
}
function isModal(element: Element) {
  return element.tagName === "DIALOG" || element.getAttribute("role") === "dialog" || element.getAttribute("aria-modal") === "true";
}
function isCard(element: Element) {
  const testId = element.getAttribute("data-test-id");
  return element.tagName === "ARTICLE" || element.getAttribute("role") === "listitem" ||
    testId === "pin" || testId === "pinWrapper" || testId === "pin-closeup-image";
}
function ancestors(element: Element): Element[] {
  const result: Element[] = [];
  for (let current: Element | null = element; current && result.length < 24; current = current.parentElement) {
    if (current.tagName === "BODY" || current.tagName === "HTML") break;
    result.push(current);
    if (isModal(current)) break;
  }
  return result;
}
function coversPointer(element: Element, x: number, y: number): element is HTMLImageElement {
  if (!isActionImage(element)) return false;
  const rect = element.getBoundingClientRect();
  return x >= rect.left && x < rect.right && y >= rect.top && y < rect.bottom;
}

/** Hit-test first; nested overlays should not require guessing their DOM depth. */
export function imageAtPointer(
  element: Element, x: number, y: number,
  hitElements: readonly Element[] = [],
): HTMLImageElement | null {
  const path = ancestors(element);
  const card = path.find(isCard);
  const modal = path.find(isModal);
  const localPath = card ? path.slice(0, path.indexOf(card) + 1) : path.slice(0, 8);
  const belongs = (candidate: Element) => {
    const candidatePath = ancestors(candidate);
    if (modal && !candidatePath.includes(modal)) return false;
    if (card) return candidatePath.includes(card);
    // A different card cannot become the hovered card just because it overlaps.
    const candidateCard = candidatePath.find(isCard);
    if (candidateCard && !path.includes(candidateCard)) return false;
    return candidatePath.some(ancestor => localPath.includes(ancestor));
  };
  for (const hit of [element, ...hitElements.slice(0, 32)]) {
    if (coversPointer(hit, x, y) && belongs(hit)) return hit;
  }

  // pointer-events:none images are absent from elementsFromPoint. Search the
  // nearest card once, not every nested ancestor subtree over and over again.
  const visited = new Set<Element>();
  let budget = card ? 256 : 128;
  const scopes = card ? [card] : localPath;
  for (const scope of scopes) {
    const queue = [scope];
    for (let index = 0; index < queue.length && budget > 0; index++) {
      const node = queue[index];
      if (visited.has(node)) continue;
      visited.add(node);
      budget--;
      if (coversPointer(node, x, y) && belongs(node)) return node;
      if (node !== scope && (isCard(node) || isModal(node))) continue;
      for (let child = node.firstElementChild; child && queue.length - index < budget; child = child.nextElementSibling) {
        if (!visited.has(child)) queue.push(child);
      }
    }
  }
  return null;
}

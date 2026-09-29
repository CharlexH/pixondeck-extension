/** Native dialogs share backdrop dismissal, including dynamically mounted dialogs. */
export function installDialogDismissal(document: Document) {
  let pressedOutside: HTMLDialogElement | null = null;
  function outside(event: MouseEvent): HTMLDialogElement | null {
    const element = event.target as HTMLElement | null;
    if (element?.tagName !== 'DIALOG') return null;
    const dialog = element as HTMLDialogElement;
    const rect = dialog.getBoundingClientRect();
    return dialog.open && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) ? dialog : null;
  }
  const down = (event: MouseEvent) => { pressedOutside = outside(event); };
  const click = (event: MouseEvent) => {
    const dialog = outside(event);
    if (dialog && dialog === pressedOutside) dialog.close('cancel');
    pressedOutside = null;
  };
  document.addEventListener('pointerdown', down);
  document.addEventListener('click', click);
  return () => {
    document.removeEventListener('pointerdown', down);
    document.removeEventListener('click', click);
  };
}

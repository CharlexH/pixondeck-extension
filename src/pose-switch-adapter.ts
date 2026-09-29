import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { Switch } from './shared/components/ui/switch';

/** A small React boundary reuses the site's actual shadcn/Radix Switch. */
export function mountPoseOverlaySwitch(container: HTMLElement, label: string, onChange: (checked: boolean) => void, id = 'poseOverlay') {
  const root = createRoot(container);
  let checked = false;
  let disposed = false;
  function render() {
    if (disposed) return;
    flushSync(() => root.render(createElement(Switch, {
      id, className: 'pose-overlay-switch', checked,
      'aria-label': label,
      onCheckedChange(next: boolean) { checked = next; render(); onChange(next); },
    })));
  }
  render();
  return {
    setChecked(next: boolean) { if (checked !== next) { checked = next; render(); } },
    dispose() { if (!disposed) { disposed = true; root.unmount(); } },
  };
}

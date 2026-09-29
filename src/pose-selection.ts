import type { PoseResult } from './shared/lib/pose/protocol';
/** Every selection or cancellation invalidates all pending reads, inference and renders. */
export class PoseSelection {
  private revision = 0;
  private key: string | null = null;
  select(key: string | null) {
    if (key === this.key) return false;
    this.key = key;
    this.cancel();
    return true;
  }
  cancel() { this.revision++; }
  start() {
    const revision = ++this.revision;
    return () => revision === this.revision;
  }
}
export function canPreviewPose(result: Pick<PoseResult, 'status'>) {
  return result.status === 'candidate-complete' || result.status === 'partial';
}

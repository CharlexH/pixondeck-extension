import { createExtensionPoseRuntime as createRuntime } from '../src/pose-runtime';
export { POSE_MODEL_TOTAL_BYTES } from '../src/pose-runtime';
export function createExtensionPoseRuntime() {
  return createRuntime({origin: location.origin, workerUrl: new URL('/pose-worker.js', location.origin).href, runtimeUrl: new URL('/pose-runtime/', location.origin).href});
}

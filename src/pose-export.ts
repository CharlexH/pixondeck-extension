import type { PoseResult } from './shared/lib/pose/protocol';

/** RTMW-X body output follows the first 17 COCO keypoints, in anatomical order. */
export const COCO17_JOINT_NAMES = [
  'nose', 'left_eye', 'right_eye', 'left_ear', 'right_ear',
  'left_shoulder', 'right_shoulder', 'left_elbow', 'right_elbow',
  'left_wrist', 'right_wrist', 'left_hip', 'right_hip',
  'left_knee', 'right_knee', 'left_ankle', 'right_ankle',
] as const;

export function exportPoseData(result: PoseResult) {
  return {
    schema: 'pixondeck.pose',
    version: 1,
    coordinateSystem: {
      units: 'pixels', origin: 'top-left', xAxis: 'right', yAxis: 'down',
      leftRight: 'subject-anatomical',
    },
    jointOrder: 'COCO17',
    ...result,
    points: result.points.map((point, index) => ({
      index, name: COCO17_JOINT_NAMES[index], ...point,
      // Stability is the model's measured confidence/agreement gate, not a claim
      // that an uncertain joint is occluded or outside the image.
      state: point.stable ? 'stable' : 'uncertain',
    })),
  };
}

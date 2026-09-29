# Pose resources

The client uses YOLOX-M detection and RTMW-l cocktail14 keypoints (RTMLib balanced preset) through ONNX Runtime Web 1.29.0. The current model set totals 330,108,922 bytes (314.8 MiB), downloaded in verified chunks. ONNX Runtime JavaScript and WASM are bundled locally; no remote executable JavaScript is loaded for inference.

Model weights are separate assets under the publisher model repository’s Apache-2.0 declaration and are not bundled in the ZIP. See [pinned sources, hashes and license evidence](operations/2026-09-30-pose-model-distribution.md). A source build does not include weights or grant distribution rights to checkpoints or their training datasets. The model manifest specifies download paths and SHA-256 hashes.

For a local real-model preview, provide the approved matching chunks under `assets/models/pose/<hash>/<index>.bin`, then run `npm run build` and `npm run preview`. Do not commit model chunks. Missing model assets result in a download error; the preview does not substitute simulated recognition.

Runtime license text is included in THIRD_PARTY_NOTICES.txt. Model distribution availability is separate from successful source or runtime-package checks.

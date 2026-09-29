# Pose model distribution evidence and reproducible assets

Checked 2026-09-30. Release decision: retain the existing exact ONNX files, relying on the publisher-maintained **model repository's Apache-2.0 declaration**, rather than inferring a weight license solely from source code. This is a documented engineering release basis, not a warranty of third-party rights.

## Primary evidence

- [Tau-J/RTMPose model repository at pinned revision](https://huggingface.co/Tau-J/RTMPose/tree/cd4d7095f5cfc9cfc4f46289bee91ea4a1e1d9fd) contains both precise archives below. Its [README metadata](https://huggingface.co/Tau-J/RTMPose/blob/cd4d7095f5cfc9cfc4f46289bee91ea4a1e1d9fd/README.md) declares `license: apache-2.0` for the model repository, not merely a code package.
- [RTMLib maintainer README](https://github.com/Tau-J/rtmlib/blob/03a1693e59e4f7cd84582c0fb30459b3bf18ad42/README.md) designates that mirror as the fallback for all OpenMMLab checkpoints. [Wholebody implementation](https://github.com/Tau-J/rtmlib/blob/03a1693e59e4f7cd84582c0fb30459b3bf18ad42/rtmlib/tools/solution/wholebody.py) selects the exact pair for `balanced`.
- [OpenMMLab RTMPose model table](https://github.com/open-mmlab/mmpose/blob/759b39c13fea6ba094afc1fa932f51dc1b11cbf9/projects/rtmpose/README.md) provides the original weights; [MMPose license](https://github.com/open-mmlab/mmpose/blob/759b39c13fea6ba094afc1fa932f51dc1b11cbf9/LICENSE) is Apache-2.0. Its special-algorithm license list does not list RTMW/YOLOX.
- Both archives were independently downloaded from the pinned maintainer mirror and extracted on the review date. The ONNX SHA-256 hashes exactly match the existing local/runtime manifest. No inference or preprocessing changes are required to preserve these artifacts.

## Exact artifacts

Mirror prefix: `https://huggingface.co/Tau-J/RTMPose/resolve/cd4d7095f5cfc9cfc4f46289bee91ea4a1e1d9fd/`

| Model | Archive path | Archive SHA-256 | Extracted ONNX SHA-256 | Bytes |
| --- | --- | --- | --- | --- |
| YOLOX-M HumanArt | `rtmposev1/onnx_sdk/yolox_m_8xb8-300e_humanart-c2c7a14a.zip` | `a000224fd8ba283202bc62d4a5fcdfe353adb9f468777dbac1ea2ada2093adde` | `3dea6513388889f0fff4b77bf7a26013600321b9eb9ceb0e9a400a82572f5f23` | 101400344 |
| RTMW cocktail14 256×192 | `rtmw/onnx_sdk/rtmw-dw-x-l_simcc-cocktail14_270e-256x192_20231122.zip` | `1e3e77558dfc199129bfff1c583e51b4ee190914de6ae30688243c20163c148c` | `9a9bc17c13ff0a1e37507f45a037a21bc410cd08374b0e664c57d0080843aa58` | 228708578 |

Original OpenMMLab URLs use prefix `https://download.openmmlab.com/mmpose/v1/projects/` followed by the same archive paths. The manifest total is 330108922 bytes, split into 15 chunks of at most 24 MiB. Chunking changes packaging only.

Naming caveat: the file name contains `rtmw-dw-x-l`, but the official table labels this exported model **RTMW-l**, not the separately listed RTMW-x pretrained-uCOCO checkpoint. `balanced` names the RTMLib preset. UI names should not imply the different RTMW-x checkpoint is shipped.

## Known ambiguity, not silently omitted

[HumanArt dataset instructions](https://github.com/IDEA-Research/HumanArt#dataset-download) describe non-commercial dataset authorization. This application distributes neither that dataset nor training images. That dataset statement alone does not establish that the published model weights are non-commercial.

[OpenMMLab issue 3271](https://github.com/open-mmlab/mmpose/issues/3271) asks specifically about commercial redistribution of this detector and was still unanswered when checked. It is an unresolved user question, not an upstream denial or restriction. We rely on the separate, explicit Apache-2.0 model-repository declaration above; we do not represent that issue as resolved. If an authoritative weight-specific restriction is subsequently published, reassess distribution. Switching to direct upstream download does not itself settle commercial-use licensing.

## Reproduce and package

From the repository root:

```sh
python3 scripts/pose/download-models.py
node scripts/pose/prepare-models.mjs
```

`POSE_MODEL_SOURCE_DIR` optionally selects a cache directory for both scripts. The downloader pins the repository revision, validates archive AND ONNX hashes, and skips already matching local files. The preparation script revalidates ONNX hashes, writes content-addressed chunks and the TypeScript manifest, copies the installed `onnxruntime-web` WASM/module pair, and includes notices from `scripts/pose/licenses/`. This process does not deploy anything.

The notices contain upstream MMPose and RTMLib Apache licenses, plus ONNX Runtime **v1.29.0** MIT license and its full ThirdPartyNotices, retrieved from `https://raw.githubusercontent.com/microsoft/onnxruntime/v1.29.0/`. If upgrading that npm package, refresh its notice snapshots to the corresponding runtime release before distributing it. Include notices in the extension package too when shipping ORT binaries there.

For an authorized deployment, include the generated `public/models/pose/` directory even though it is Git-ignored. Verify every deployed chunk's length and SHA-256 against `src/lib/pose/model-manifest.ts`, as well as runtime assets and `/models/pose/licenses/NOTICE.txt`. Do not assume a successful site build includes ignored prepared files on a clean CI checkout.

## Alternative assessed, not selected

Official [YOLOX COCO ONNX releases](https://github.com/Megvii-BaseDetection/YOLOX/blob/main/demo/ONNXRuntime/README.md) provide `yolox_m.onnx` under the YOLOX project's Apache-2.0 distribution. It avoids the HumanArt training source. It is not a binary drop-in: it returns raw 85-column COCO output rather than the current 5-column end-to-end boxes. `geometry.decodeBoxes` already contains the raw stride decoder, but `inference.ts` currently admits only 5 columns. A replacement would need explicit format validation, decoder selection, person-class filtering, and photographic/stylized image regression checks. No replacement was made in this review.

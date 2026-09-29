import { mountPoseOverlaySwitch } from './pose-switch-adapter';
import { poseCache } from './pose-cache';
import { exportPoseData } from "./pose-export";
import { createExtensionPoseRuntime } from './pose-runtime';
import { poseMessages } from './pose-messages';
import { PoseSelection, canPreviewPose } from './pose-selection';
import { renderPose } from './shared/lib/pose/render';
import type { PoseResult } from './shared/lib/pose/protocol';

export function createPosePanel(locale: string, getImage: () => Promise<Blob | null>) {
  const text = poseMessages[locale as keyof typeof poseMessages] ?? poseMessages.en;
  const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
  const runtime = createExtensionPoseRuntime();
  const selection = new PoseSelection();
  const settings = el<HTMLDialogElement>('poseSettings');
  const viewer = el<HTMLDialogElement>('poseViewer');
  const confirmation = el<HTMLDialogElement>('poseConfirm');
  let includePose = localStorage.getItem('pose-generation-include') !== 'false';
  const generation = el<HTMLButtonElement>('poseGeneration');
  let autoPose = localStorage.getItem('pose-auto-recognize') === 'true';
  let cacheReady: Promise<void> = Promise.resolve();
  const recognize = el<HTMLButtonElement>('poseRecognize');
  const progress = el<HTMLProgressElement>('poseProgress');
  const preview = el<HTMLImageElement>('posePreview');
  let selected: string | null = null;
  let result: PoseResult | null = null;
  let images: { skeleton: Blob; overlay: Blob } | null = null;
  let previewUrl = '';
  let downloadAbort: AbortController | null = null;
  let inferenceAbort: AbortController | null = null;
  let modelRevision = 0;
  let downloading = false;
  let inspecting = false;
  let deleting = false;
  let ready = false;
  let disposed = false;
  let overlay = false;
  let cacheRevision = 0;
  let createdAt = 0;
  let loading = false;
  const labels: Record<string, string> = {
    poseAutoLabel: text.auto, poseMenuLabel: text.menu, poseConfigure: text.configure, poseGenerationLabel: text.include, poseSettingsTitle: text.settings, poseDescription: text.description,
    poseDownload: text.download, poseCancelDownload: text.cancel, poseDelete: text.delete,
    poseSettingsClose: text.cancel,
    poseConfirmTitle: text.confirmTitle, poseConfirmDescription: text.confirmDescription, poseConfirmStart: text.confirmStart, poseConfirmCancel: text.cancel,
    poseOverlayLabel: text.overlay, poseDownloadPng: text.png, poseDownloadJson: text.jsonDownload,
  };
  for (const [id, value] of Object.entries(labels)) el(id).textContent = value;
  viewer.setAttribute('aria-label', text.title);
  const closeViewer = el<HTMLButtonElement>('poseViewerClose');
  closeViewer.setAttribute('aria-label', text.close); closeViewer.title = text.close;
  closeViewer.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  for (const [id, title] of [['poseDownloadPng', text.png], ['poseDownloadJson', text.json]]) {
    const button = el<HTMLButtonElement>(id); button.title = title; button.setAttribute('aria-label', title);
  }
  recognize.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M17.4 5.838a2.68 2.68 0 0 1 1.524-.762m0 0a2.695 2.695 0 1 1-.847 5.068c-.413-.213-.944-.228-1.273.1l-6.56 6.56c-.328.33-.313.86-.1 1.274a2.696 2.696 0 1 1-5.068.846M18.924 5.076a2.695 2.695 0 1 0-5.067.847c.212.413.227.944-.101 1.273l-6.56 6.56c-.33.328-.86.313-1.274.1a2.696 2.696 0 1 0-.846 5.068m1.524-.762a2.7 2.7 0 0 1-1.524.762"/></svg>';
  const boneIcon = recognize.innerHTML;
  function icon() {
    recognize.hidden = !selected; recognize.disabled = !selected || loading;
    recognize.innerHTML = inferenceAbort ? '<svg viewBox="0 0 24 24" aria-hidden="true"><circle class="pose-loading-ring" cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="42 15"/><rect x="9" y="9" width="6" height="6" rx="1" fill="currentColor"/></svg>' : boneIcon;
    recognize.title = inferenceAbort ? text.runningCancel : images ? text.view : text.recognize;
    recognize.setAttribute('aria-label', recognize.title);
    recognize.setAttribute('aria-pressed', String(!!images && includePose));
    recognize.setAttribute('aria-busy', String(!!inferenceAbort || loading));
  }
  async function persist() {
    if (!selected || !result || !images) return;
    const key = selected;
    try { await poseCache.set({key, result, ...images, included: includePose, createdAt}); }
    catch { if (selected === key) message(text.cacheFailed); }
  }
  const overlaySwitch = mountPoseOverlaySwitch(el('poseOverlayMount'), text.overlay, checked => { overlay = checked; showPreview(); });
  preview.alt = text.preview;
  progress.setAttribute('aria-label', text.downloading);
  function message(value: string) { el('poseStatus').textContent = value; el('poseStatus').hidden = !value; }
  function modelControls() {
    generation.hidden = !ready;
    el('poseAuto').hidden = !ready;
    el<HTMLButtonElement>('poseDownload').disabled = downloading || inspecting || deleting || ready;
    el<HTMLButtonElement>('poseDelete').disabled = downloading || inspecting || deleting;
    el('poseDownload').hidden = ready;
    el('poseDelete').hidden = !ready;
    el('poseSettingsClose').hidden = downloading;
    el('poseCancelDownload').hidden = !downloading;
    progress.hidden = !downloading;
  }
  async function inspect() {
    if (downloading || deleting || inspecting) return;
    const revision = ++modelRevision;
    inspecting = true; modelControls();
    el('poseModelStatus').textContent = text.checking;
    try {
      const state = await runtime.models.inspect();
      if (disposed || revision !== modelRevision) return;
      ready = state.ready;
      el('poseModelStatus').textContent = ready ? text.ready : text.missing;
    } catch { if (!disposed && revision === modelRevision) el('poseModelStatus').textContent = text.failed; }
    finally { if (revision === modelRevision) { inspecting = false; modelControls(); } }
  }
  function clearImages() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = ''; preview.removeAttribute('src');
    images = null; result = null; icon();
    viewer.close();
  }
  function cancelInference() {
    selection.cancel(); inferenceAbort?.abort(); inferenceAbort = null; runtime.cancel();
    icon();
  }
  function showPreview() {
    if (!images) return;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(overlay ? images.overlay : images.skeleton);
    preview.src = previewUrl;
    overlaySwitch.setChecked(overlay);
    if (!viewer.open) viewer.showModal();
  }
  function save(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = filename; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  el('poseSettingsOpen').onclick = () => { settings.showModal(); void inspect(); };
  el('poseSettingsClose').onclick = () => settings.close();
  el('poseViewerClose').onclick = () => viewer.close();
  const includeSwitch = mountPoseOverlaySwitch(el('poseGenerationMount'), text.include, checked => {
    includePose = checked; localStorage.setItem('pose-generation-include', String(checked)); icon();
  }, 'poseIncludeSwitch');
  const autoSwitch = mountPoseOverlaySwitch(el('poseAutoMount'), text.auto, checked => {
    autoPose = checked; localStorage.setItem('pose-auto-recognize', String(checked));
  }, 'poseAutoSwitch');
  includeSwitch.setChecked(includePose); autoSwitch.setChecked(autoPose);
  el('poseMenuIcon').innerHTML = boneIcon;
  el('poseAutoIcon').innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16"><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M14.556 13.218a2.67 2.67 0 0 1-3.774-3.774l2.359-2.36a2.67 2.67 0 0 1 3.628-.135m-.325-3.167a2.669 2.669 0 1 1 3.774 3.774l-2.359 2.36a2.67 2.67 0 0 1-3.628.135"/><path d="M10.5 3c-3.287 0-4.931 0-6.037.908a4 4 0 0 0-.555.554C3 5.57 3 7.212 3 10.5V13c0 3.771 0 5.657 1.172 6.828S7.229 21 11 21h2.5c3.287 0 4.931 0 6.038-.908q.304-.25.554-.554C21 18.43 21 16.788 21 13.5"/></g></svg>';
  void inspect();
  el('poseConfirmCancel').onclick = () => confirmation.close();
  el('poseDownloadPng').onclick = () => { if (images) save(overlay ? images.overlay : images.skeleton, overlay ? 'pose-overlay.png' : 'pose-skeleton.png'); };
  el('poseDownloadJson').onclick = () => { if (result) save(new Blob([JSON.stringify(exportPoseData(result), null, 2)], { type: 'application/json' }), 'pose.json'); };
  el('poseDownload').onclick = async () => {
    if (downloading || inspecting || deleting) return;
    downloading = true; ready = false;
    const controller = new AbortController(); downloadAbort = controller;
    progress.value = 0; progress.max = 1; modelControls();
    try {
      await runtime.models.download({ signal: controller.signal, onProgress: p => {
        if (disposed || controller.signal.aborted) return;
        progress.max = p.totalBytes; progress.value = p.downloadedBytes;
        el('poseModelStatus').textContent = `${text.downloading} ${Math.round(p.downloadedBytes / p.totalBytes * 100)}%`;
      } });
      if (!disposed) { ready = true; el('poseModelStatus').textContent = text.ready; }
    } catch {
      if (!disposed) { el('poseModelStatus').textContent = controller.signal.aborted ? text.cancelled : text.failed; el('poseDownload').textContent = text.retry; }
    } finally { downloading = false; downloadAbort = null; if (!disposed) modelControls(); }
  };
  el('poseCancelDownload').onclick = () => downloadAbort?.abort();
  el('poseDelete').onclick = async () => {
    if (downloading || inspecting || deleting) return;
    cancelInference(); clearImages(); message(''); deleting = true; modelControls();
    try { await runtime.deleteModels(); ready = false; el('poseModelStatus').textContent = text.deleted; el('poseDownload').textContent = text.download; }
    catch { el('poseModelStatus').textContent = text.failed; }
    finally { deleting = false; modelControls(); }
  };
  recognize.onclick = () => {
    if (inferenceAbort) { cancelInference(); message(''); return; }
    if (!selected || loading) return;
    if (images) showPreview(); else confirmation.showModal();
  };
  el('poseConfirmStart').onclick = () => void recognizePose(false);
  async function recognizePose(automatic: boolean) {
    confirmation.close();
    if (!selected || loading || inferenceAbort || downloading || deleting) return;
    cancelInference(); clearImages();
    const cacheKey = selected;
    const current = selection.start(), controller = new AbortController();
    inferenceAbort = controller; icon();
    message('');
    let bitmap: ImageBitmap | null = null;
    try {
      const state = await runtime.models.inspect();
      if (!current()) return;
      if (!state.ready) { if (!automatic) { message(text.required); settings.showModal(); void inspect(); } return; }
      const image = await getImage();
      if (!current()) return;
      if (!image) { message(text.unavailable); return; }
      await runtime.initialize(controller.signal);
      if (!current()) return;
      bitmap = await createImageBitmap(image, { imageOrientation: 'from-image' });
      if (!current()) return;
      const detected = await runtime.client.infer(bitmap);
      bitmap.close(); bitmap = null;
      if (!current()) return;
      if (!canPreviewPose(detected)) {
        message(detected.status === 'no-person' ? text.noPerson : detected.status === 'ambiguous-person' ? text.ambiguous : text.rejected); return;
      }
      const skeleton = await renderPose(detected);
      if (!current()) return;
      bitmap = await createImageBitmap(image, { imageOrientation: 'from-image' });
      if (!current()) return;
      const composited = await renderPose(detected, bitmap);
      if (!current()) return;
      result = detected; images = { skeleton, overlay: composited }; overlay = false;
      message('');
      createdAt = Date.now(); icon();
      await persist();
      if (!current() || selected !== cacheKey) return;
      if (!automatic) showPreview();
    } catch { if (current()) message(text.error); }
    finally {
      bitmap?.close();
      if (current()) { inferenceAbort = null; runtime.cancel(); icon(); }
    }
  };
  return {
    select(key: string | null) {
      if (!selection.select(key)) return;
      selected = key; cancelInference(); clearImages(); message(''); confirmation.close();
      const revision = ++cacheRevision; loading = !!key; icon();
      if (key) cacheReady = poseCache.get(key).then(stored => {
        if (disposed || revision !== cacheRevision || selected !== key || !stored) return;
        result = stored.result; images = {skeleton: stored.skeleton, overlay: stored.overlay};
        createdAt = stored.createdAt; overlay = false;
      }).catch(() => {}).finally(() => { if (revision === cacheRevision && !disposed) { loading = false; icon(); } });
    },
    async autoRecognize(key: string) {
      await cacheReady;
      if (!disposed && autoPose && selected === key && !images && !inferenceAbort) await recognizePose(true);
    },
    getReference() { return selected && images && includePose ? { blob: images.skeleton, filename: 'pose-skeleton.png' } : null; },
    async remove(key: string) { if (selected === key) { this.select(null); } await poseCache.remove(key); },
    dispose() { disposed = true; ++cacheRevision; ++modelRevision; downloadAbort?.abort(); cancelInference(); clearImages(); overlaySwitch.dispose(); includeSwitch.dispose(); autoSwitch.dispose(); runtime.dispose(); },
  };
}

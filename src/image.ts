export const MAX_FILE = 20 * 1024 * 1024;
export function scaledDimensions(width: number, height: number) {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width * height > 25_000_000
  )
    throw new Error("IMAGE_DIMENSIONS");
  const scale = Math.min(1, 480 / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}
export type PreparedImage = {
  blob: Blob;
  originalBlob?: Blob;
  originalWidth: number;
  originalHeight: number;
  width: number;
  height: number;
  artificialBackground: boolean;
  animated: boolean;
};
export async function prepareImage(file: Blob): Promise<PreparedImage> {
  if (
    file.size > MAX_FILE ||
    !["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type)
  )
    throw new Error("IMAGE_FORMAT_SIZE");
  const bitmap = await createImageBitmap(file, {
    imageOrientation: "from-image",
  });
  try {
    const originalWidth = bitmap.width,
      originalHeight = bitmap.height;
    const dimensions = scaledDimensions(originalWidth, originalHeight);
    const canvas = new OffscreenCanvas(dimensions.width, dimensions.height);
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(bitmap, 0, 0, dimensions.width, dimensions.height);
    const pixels = ctx.getImageData(
      0,
      0,
      dimensions.width,
      dimensions.height,
    ).data;
    let artificialBackground = false;
    for (let i = 3; i < pixels.length; i += 4)
      if (pixels[i] < 255) {
        artificialBackground = true;
        break;
      }
    if (artificialBackground) {
      ctx.globalCompositeOperation = "destination-over";
      ctx.fillStyle = "#eeeeee";
      ctx.fillRect(0, 0, dimensions.width, dimensions.height);
    }
    const blob = await canvas.convertToBlob({
      type: file.type === "image/png" ? "image/png" : "image/jpeg",
      quality: 0.85,
    });
    if (blob.size > 2 * 1024 * 1024) throw new Error("IMAGE_UPLOAD_SIZE");
    return {
      blob,
      originalBlob: file,
      originalWidth,
      originalHeight,
      artificialBackground,
      animated: file.type === "image/gif" || file.type === "image/webp",
      ...dimensions,
    };
  } finally {
    bitmap.close();
  }
}

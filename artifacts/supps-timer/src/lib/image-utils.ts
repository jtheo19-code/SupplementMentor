const MAX_SCAN_DIMENSION = 1280;

type DecodedImage = {
  width: number;
  height: number;
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
  close?: () => void;
};

async function decodeImageFile(file: File): Promise<DecodedImage> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, {
        imageOrientation: "from-image",
      } as ImageBitmapOptions);
      if (bitmap.width > 0 && bitmap.height > 0) {
        return {
          width: bitmap.width,
          height: bitmap.height,
          draw: (ctx, w, h) => ctx.drawImage(bitmap, 0, 0, w, h),
          close: () => bitmap.close(),
        };
      }
      bitmap.close();
    } catch {
      // Fall through to the <img> path below.
    }
  }

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Could not read the photo file."));
    reader.readAsDataURL(file);
  });

  const img = new Image();
  const unsupported = new Error(
    "Could not read this photo format. Try a JPEG or PNG, or set your camera to 'Most Compatible'.",
  );
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(unsupported);
    img.src = dataUrl;
  });

  if (typeof img.decode === "function") {
    try {
      await img.decode();
    } catch {
      throw unsupported;
    }
  }

  const width = img.naturalWidth || img.width;
  const height = img.naturalHeight || img.height;
  return {
    width,
    height,
    draw: (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h),
  };
}

export async function compressImageToBase64(
  file: File,
): Promise<{ base64: string; mimeType: string }> {
  const src = await decodeImageFile(file);
  try {
    if (!src.width || !src.height) {
      throw new Error("Photo has no readable dimensions.");
    }
    const scale = Math.min(1, MAX_SCAN_DIMENSION / Math.max(src.width, src.height));
    const width = Math.max(1, Math.round(src.width * scale));
    const height = Math.max(1, Math.round(src.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is not supported on this device.");
    src.draw(ctx, width, height);

    const compressedDataUrl = canvas.toDataURL("image/jpeg", 0.85);
    const base64 = compressedDataUrl.split(",")[1] ?? "";
    if (!base64) throw new Error("Could not encode the photo.");
    return { base64, mimeType: "image/jpeg" };
  } finally {
    src.close?.();
  }
}

// Prepara a imagem no navegador antes de enviar: reduz o tamanho, corta a foto
// de perfil em quadrado e converte para WebP (ou JPG, se o navegador não gerar
// WebP). Redesenhar no canvas também apaga os dados escondidos da foto, como a
// localização GPS que o celular grava.

export type ImagePurpose = "avatar" | "wallpaper" | "board_background";

const MAX_SIDE: Record<ImagePurpose, number> = { avatar: 512, wallpaper: 2560, board_background: 2560 };

/** Formatos que dá para escolher; o envio final é sempre WebP ou JPG. */
export const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,image/gif,image/avif,image/bmp";

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
}

export async function prepareImage(file: File, purpose: ImagePurpose): Promise<Blob> {
  if (!file.type.startsWith("image/") || file.type === "image/svg+xml") {
    throw new Error("Escolha uma imagem JPG, PNG ou WebP.");
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("Este formato não abre no navegador. Salve a imagem como JPG ou PNG e tente de novo.");
  }

  // Foto de perfil: o quadrado do meio. Fundo: a imagem inteira.
  const side = Math.min(bitmap.width, bitmap.height);
  const crop =
    purpose === "avatar"
      ? { x: (bitmap.width - side) / 2, y: (bitmap.height - side) / 2, w: side, h: side }
      : { x: 0, y: 0, w: bitmap.width, h: bitmap.height };
  const scale = Math.min(1, MAX_SIDE[purpose] / Math.max(crop.w, crop.h));
  const width = Math.max(1, Math.round(crop.w * scale));
  const height = Math.max(1, Math.round(crop.h * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("O navegador não conseguiu preparar a imagem.");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, crop.x, crop.y, crop.w, crop.h, 0, 0, width, height);
  bitmap.close();

  const webp = await toBlob(canvas, "image/webp", 0.86);
  if (webp && webp.type === "image/webp") return webp;
  const jpeg = await toBlob(canvas, "image/jpeg", 0.88);
  if (jpeg) return jpeg;
  throw new Error("O navegador não conseguiu preparar a imagem.");
}

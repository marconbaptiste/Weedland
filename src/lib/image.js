// Compression d'image côté navigateur (avant upload) : réduit la taille des
// photos de tickets/factures pour économiser stockage et bande passante.

/**
 * Redimensionne et recompresse une image en JPEG.
 * @param {File} file
 * @param {{maxDim?:number, qualite?:number}} [options]
 * @returns {Promise<Blob>} l'image compressée (ou le fichier d'origine si échec)
 */
export async function compresserImage(file, { maxDim = 1600, qualite = 0.7 } = {}) {
  if (!file || !file.type?.startsWith('image/')) return file;
  try {
    const bitmap = await createImageBitmap(file);
    let { width, height } = bitmap;
    if (width > maxDim || height > maxDim) {
      const ratio = Math.min(maxDim / width, maxDim / height);
      width = Math.round(width * ratio);
      height = Math.round(height * ratio);
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', qualite));
    bitmap.close?.();
    // Si la compression ne réduit rien (rare), on garde le plus petit.
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file; // format non décodable (ex. HEIC) : on envoie l'original
  }
}

import { ProcessedEvidenceFile, ReportingType } from '../types';

export const MAX_FILES_PER_REPORT = 5;
export const MAX_FILE_SIZE_BYTES = 600 * 1024; // 600 KB
export const MAX_IMAGE_DIMENSION = 1600; // 1600 px max longest side

const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
const ACCEPTED_PDF_TYPE = 'application/pdf';

export interface ProcessEvidenceResult {
  file?: ProcessedEvidenceFile;
  error?: string;
}

/**
 * Strips EXIF metadata, resizes to <=1600px, compresses iteratively until <=600KB.
 */
async function processImageFile(
  file: File,
  index: number
): Promise<ProcessEvidenceResult> {
  try {
    let bitmap: ImageBitmap | HTMLImageElement;
    let width = 0;
    let height = 0;

    // Use createImageBitmap with orientation normalization if supported
    if ('createImageBitmap' in window) {
      try {
        bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
        width = bitmap.width;
        height = bitmap.height;
      } catch {
        // Fallback for browsers with strict imageBitmap issues
        bitmap = await loadImageElement(file);
        width = bitmap.naturalWidth;
        height = bitmap.naturalHeight;
      }
    } else {
      bitmap = await loadImageElement(file);
      width = bitmap.naturalWidth;
      height = bitmap.naturalHeight;
    }

    if (width === 0 || height === 0) {
      return { error: `Could not decode image: ${file.name}` };
    }

    // Initial scale calculation to fit within MAX_IMAGE_DIMENSION
    let scale = 1;
    const maxDim = Math.max(width, height);
    if (maxDim > MAX_IMAGE_DIMENSION) {
      scale = MAX_IMAGE_DIMENSION / maxDim;
    }

    let targetWidth = Math.max(1, Math.round(width * scale));
    let targetHeight = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement('canvas');
    let base64 = '';
    let blobSize = 0;
    let quality = 0.75;
    let attempts = 0;
    const maxAttempts = 12;

    while (attempts < maxAttempts) {
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return { error: 'Failed to initialize HTML5 Canvas for image compression.' };
      }

      // Draw image onto canvas (canvas drawing strips all EXIF/GPS tags natively)
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);

      // Export as clean JPEG
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      // Strip data:image/jpeg;base64, prefix
      const commaIdx = dataUrl.indexOf(',');
      base64 = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl;
      // Calculate byte size from base64 length
      blobSize = Math.floor((base64.length * 3) / 4);

      if (blobSize <= MAX_FILE_SIZE_BYTES) {
        break; // Successfully compressed within 600 KB
      }

      // Lower quality in 0.05 increments down to 0.40
      if (quality > 0.41) {
        quality = Math.max(0.40, quality - 0.05);
      } else {
        // Reduce dimensions by 15% per attempt
        targetWidth = Math.max(100, Math.round(targetWidth * 0.85));
        targetHeight = Math.max(100, Math.round(targetHeight * 0.85));
      }

      attempts++;
    }

    // Clean up bitmap resources if supported
    if ('close' in bitmap && typeof (bitmap as ImageBitmap).close === 'function') {
      (bitmap as ImageBitmap).close();
    }

    if (blobSize > MAX_FILE_SIZE_BYTES) {
      return {
        error: `Image "${file.name}" could not be compressed under 600 KB. Please crop or choose a smaller image.`
      };
    }

    return {
      file: {
        name: `evidence-${index}.jpg`,
        contentType: 'image/jpeg',
        size: blobSize,
        base64
      }
    };
  } catch (err: any) {
    return { error: `Failed to process image ${file.name}: ${err?.message || 'Unknown error'}` };
  }
}

/**
 * Loads an image file using standard HTMLImageElement fallback.
 */
function loadImageElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image file element'));
    };
    img.src = url;
  });
}

/**
 * Processes PDF: verifies size <= 600KB, converts to raw base64 without data prefix.
 */
async function processPdfFile(file: File, index: number): Promise<ProcessEvidenceResult> {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return {
      error: `PDF "${file.name}" exceeds 600 KB (${Math.round(file.size / 1024)} KB). Please take a photo of the document or compress the PDF before uploading.`
    };
  }

  try {
    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary = '';
    const len = bytes.byteLength;
    const chunkSize = 8192;
    for (let i = 0; i < len; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunkSize, len)));
    }
    const base64 = btoa(binary);

    return {
      file: {
        name: `evidence-${index}.pdf`,
        contentType: 'application/pdf',
        size: file.size,
        base64
      }
    };
  } catch (err: any) {
    return { error: `Failed to read PDF file "${file.name}": ${err?.message || 'Read error'}` };
  }
}

/**
 * Master client-side evidence validator and processor.
 */
export async function processEvidenceFiles(
  incomingFiles: File[],
  currentEvidenceCount: number,
  reporting: ReportingType
): Promise<{ processed: ProcessedEvidenceFile[]; errors: string[] }> {
  const processed: ProcessedEvidenceFile[] = [];
  const errors: string[] = [];

  const availableSlots = MAX_FILES_PER_REPORT - currentEvidenceCount;
  if (incomingFiles.length > availableSlots) {
    errors.push(
      `Cannot add ${incomingFiles.length} file(s). Maximum allowed is ${MAX_FILES_PER_REPORT} files per report (${availableSlots} slot(s) remaining).`
    );
  }

  const filesToProcess = incomingFiles.slice(0, availableSlots);

  for (let i = 0; i < filesToProcess.length; i++) {
    const file = filesToProcess[i];
    const itemIndex = currentEvidenceCount + processed.length + 1;
    const mime = file.type.toLowerCase();

    // Check if anonymous report and user uploaded a PDF or document
    if (reporting === 'Anonymous' && (mime === ACCEPTED_PDF_TYPE || file.name.toLowerCase().endsWith('.pdf'))) {
      errors.push(
        `PDFs cannot be uploaded for Anonymous reports to prevent author metadata leakage. Please upload photos (JPEG, PNG, WebP) instead.`
      );
      continue;
    }

    if (ACCEPTED_IMAGE_TYPES.includes(mime) || /\.(jpe?g|png|webp)$/i.test(file.name)) {
      const res = await processImageFile(file, itemIndex);
      if (res.error) {
        errors.push(res.error);
      } else if (res.file) {
        processed.push(res.file);
      }
    } else if (mime === ACCEPTED_PDF_TYPE || file.name.toLowerCase().endsWith('.pdf')) {
      const res = await processPdfFile(file, itemIndex);
      if (res.error) {
        errors.push(res.error);
      } else if (res.file) {
        processed.push(res.file);
      }
    } else {
      errors.push(
        `Unsupported file type for "${file.name}". Accepted formats: JPEG, PNG, WebP, and PDF.`
      );
    }
  }

  return { processed, errors };
}

/**
 * Re-indexes evidence items to guarantee sequential neutral names (evidence-1.jpg, evidence-2.pdf, etc.)
 */
export function reindexEvidenceFiles(files: ProcessedEvidenceFile[]): ProcessedEvidenceFile[] {
  return files.map((f, idx) => {
    const ext = f.contentType === 'application/pdf' ? 'pdf' : 'jpg';
    return {
      ...f,
      name: `evidence-${idx + 1}.${ext}`
    };
  });
}

/**
 * Utility to convert raw base64 string back to a downloadable Blob
 */
export function base64ToBlob(base64: string, contentType: string): Blob {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return new Blob([bytes], { type: contentType });
}

/**
 * Triggers a client-side file download from base64
 */
export function triggerFileDownload(base64: string, contentType: string, fileName: string) {
  const blob = base64ToBlob(base64, contentType);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

import { GLView } from "expo-gl";
import * as FileSystem from "expo-file-system";
import * as ImageManipulator from "expo-image-manipulator";
import * as MediaLibrary from "expo-media-library";

export type ExportFormat = "png" | "jpg" | "webp";

export type ExportOptions = {
  format: ExportFormat;
  quality: number;
  width: number;
  height: number;
  targetKb?: number;
};

export type ExportResult = {
  uri: string;
  bytes: number;
  width: number;
  height: number;
  format: ExportFormat;
};

type Snapshot = {
  uri?: string;
  localUri?: string;
  width?: number;
  height?: number;
};

type SnapshotView = GLView & {
  takeSnapshotAsync: (options: {
    format: "png";
    result: "file";
  }) => Promise<Snapshot>;
};

type Candidate = {
  uri: string;
  bytes: number;
  width: number;
  height: number;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const extensionFor = (format: ExportFormat) =>
  format === "jpg" ? "jpg" : format;

const saveFormatFor = (format: ExportFormat) => {
  if (format === "png") return ImageManipulator.SaveFormat.PNG;
  if (format === "jpg") return ImageManipulator.SaveFormat.JPEG;
  return ImageManipulator.SaveFormat.WEBP;
};

async function fileSize(uri: string): Promise<number> {
  const info = await FileSystem.getInfoAsync(uri, { size: true } as any);
  const size = "size" in info && typeof info.size === "number" ? info.size : 0;
  if (!info.exists || size <= 0) {
    throw new Error("Dosya boyutu okunamadı.");
  }
  return size;
}

function fitInside(
  sourceWidth: number,
  sourceHeight: number,
  boxWidth: number,
  boxHeight: number,
) {
  const sourceRatio = sourceWidth / sourceHeight;
  const boxRatio = boxWidth / boxHeight;

  if (sourceRatio >= boxRatio) {
    const width = Math.max(1, Math.round(boxWidth));
    return {
      action: { resize: { width } },
      width,
      height: Math.max(1, Math.round(width / sourceRatio)),
    };
  }

  const height = Math.max(1, Math.round(boxHeight));
  return {
    action: { resize: { height } },
    width: Math.max(1, Math.round(height * sourceRatio)),
    height,
  };
}

async function renderCandidate(
  sourceUri: string,
  sourceWidth: number,
  sourceHeight: number,
  format: ExportFormat,
  boxWidth: number,
  boxHeight: number,
  compress: number,
): Promise<Candidate> {
  const fitted = fitInside(sourceWidth, sourceHeight, boxWidth, boxHeight);
  const result = await ImageManipulator.manipulateAsync(
    sourceUri,
    [fitted.action],
    format === "png"
      ? { format: ImageManipulator.SaveFormat.PNG }
      : {
          format: saveFormatFor(format),
          compress: clamp(compress, 0.1, 1),
        },
  );

  return {
    uri: result.uri,
    bytes: await fileSize(result.uri),
    width: fitted.width,
    height: fitted.height,
  };
}

async function bestForTarget(
  sourceUri: string,
  sourceWidth: number,
  sourceHeight: number,
  format: ExportFormat,
  width: number,
  height: number,
  quality: number,
  targetBytes: number,
): Promise<Candidate> {
  let currentWidth = width;
  let currentHeight = height;
  let last: Candidate | null = null;

  for (let resizeAttempt = 0; resizeAttempt <= 6; resizeAttempt += 1) {
    if (format === "png") {
      last = await renderCandidate(
        sourceUri,
        sourceWidth,
        sourceHeight,
        format,
        currentWidth,
        currentHeight,
        1,
      );
    } else {
      let low = 0.1;
      let high = clamp(quality / 100, 0.1, 1);
      let best: Candidate | null = null;

      for (let attempt = 0; attempt < 8; attempt += 1) {
        const mid = (low + high) / 2;
        const candidate = await renderCandidate(
          sourceUri,
          sourceWidth,
          sourceHeight,
          format,
          currentWidth,
          currentHeight,
          mid,
        );
        last = candidate;

        if (candidate.bytes <= targetBytes) {
          best = candidate;
          low = mid;
        } else {
          high = mid;
        }
      }

      if (best) return best;
    }

    if (last && last.bytes <= targetBytes) return last;
    if (resizeAttempt === 6) break;

    currentWidth = Math.max(256, Math.round(currentWidth * 0.85));
    currentHeight = Math.max(256, Math.round(currentHeight * 0.85));
  }

  if (!last) {
    throw new Error("Hedef boyut için görsel oluşturulamadı.");
  }
  return last;
}

async function takePngSnapshot(glView: SnapshotView): Promise<Snapshot> {
  const options = { format: "png" as const, result: "file" as const };
  try {
    return await glView.takeSnapshotAsync(options);
  } catch {
    const gl = (glView as any).gl || (glView as any)._gl;
    if (!gl) throw new Error("Sahne görüntüsü alınamadı.");
    try {
      return await (GLView as any).takeSnapshotAsync(gl, options);
    } catch {
      throw new Error("Sahne görüntüsü alınamadı.");
    }
  }
}

export async function exportSceneImage(
  glView: SnapshotView | null,
  options: ExportOptions,
): Promise<ExportResult> {
  if (!glView) throw new Error("3D sahne henüz hazır değil.");

  const width = clamp(Math.round(options.width), 256, 4096);
  const height = clamp(Math.round(options.height), 256, 4096);
  const quality = clamp(Math.round(options.quality), 1, 100);
  const snapshot = await takePngSnapshot(glView);
  const sourceUri = snapshot.localUri || snapshot.uri;
  if (!sourceUri) {
    throw new Error("Sahne görüntüsü dosyaya kaydedilemedi.");
  }

  const gl = (glView as any).gl || (glView as any)._gl;
  const sourceWidth = snapshot.width || gl?.drawingBufferWidth || width;
  const sourceHeight = snapshot.height || gl?.drawingBufferHeight || height;
  const targetBytes =
    options.targetKb && options.targetKb > 0
      ? Math.round(options.targetKb * 1024)
      : undefined;

  const candidate = targetBytes
    ? await bestForTarget(
        sourceUri,
        sourceWidth,
        sourceHeight,
        options.format,
        width,
        height,
        quality,
        targetBytes,
      )
    : await renderCandidate(
        sourceUri,
        sourceWidth,
        sourceHeight,
        options.format,
        width,
        height,
        quality / 100,
      );

  const extension = extensionFor(options.format);
  const galleryDirectory = FileSystem.documentDirectory + "gallery/";
  const directoryInfo = await FileSystem.getInfoAsync(galleryDirectory);
  if (!directoryInfo.exists) {
    await FileSystem.makeDirectoryAsync(galleryDirectory, { intermediates: true });
  }

  const destination =
    galleryDirectory + "3D-Nexus-" + Date.now() + "." + extension;
  await FileSystem.copyAsync({ from: candidate.uri, to: destination });

  const bytes = await fileSize(destination);
  const permission = await MediaLibrary.requestPermissionsAsync();
  if (permission.granted) {
    await MediaLibrary.createAssetAsync(destination);
  }

  return {
    uri: destination,
    bytes,
    width: candidate.width,
    height: candidate.height,
    format: options.format,
  };
}

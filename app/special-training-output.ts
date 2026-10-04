import QRCode from "qrcode";

import {
  createCredentialDeepLink,
  encodeUnpaddedBase64Url,
  parseSpecialTrainingV2Credential,
  type SpecialTrainingCredential,
  type SpecialTrainingV2Credential
} from "./credential-v1";

export const SPECIAL_TRAINING_PRODUCTION_BASE_URL = "https://sungjuhwankr-oss.github.io";
export const SPECIAL_TRAINING_PRODUCTION_ROUTE = "/Samsungdang-DojoLog-Member/special-training/";
export const SPECIAL_TRAINING_QUERY_PARAMETER = "credential";
export const SPECIAL_TRAINING_QR_ERROR_CORRECTION = "M" as const;
export const SPECIAL_TRAINING_QR_MARGIN = 4;
export const SPECIAL_TRAINING_QR_SIZE = 900;
export const SPECIAL_TRAINING_SAVED_QR_MIN_QUIET_ZONE_MODULES = 16;
export const SPECIAL_TRAINING_INFLATED_LIMIT = 128 * 1024;

export type SpecialTrainingSavedQrGeometry = {
  moduleCount: number;
  modulePitch: number;
  outerPaddingPixels: number;
  outputSize: number;
  minimumEffectiveQuietZoneModules: number;
};

export type SpecialTrainingQrPngPadder = (dataUrl: string, paddingPixels: number) => Promise<string>;

export function createSpecialTrainingProductionLink(credential: SpecialTrainingCredential): string {
  return createCredentialDeepLink(credential, {
    baseUrl: SPECIAL_TRAINING_PRODUCTION_BASE_URL,
    route: SPECIAL_TRAINING_PRODUCTION_ROUTE,
    parameterName: SPECIAL_TRAINING_QUERY_PARAMETER
  });
}

function linkForToken(token: string): string {
  const url = new URL(SPECIAL_TRAINING_PRODUCTION_ROUTE, SPECIAL_TRAINING_PRODUCTION_BASE_URL);
  url.searchParams.set(SPECIAL_TRAINING_QUERY_PARAMETER, token);
  return url.toString();
}

function fitsQr(link: string): boolean {
  try {
    QRCode.create(link, { version: 40, errorCorrectionLevel: SPECIAL_TRAINING_QR_ERROR_CORRECTION });
    return true;
  } catch {
    return false;
  }
}

function copiedBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

async function gzip(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([copiedBuffer(bytes)]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function createSpecialTrainingV2TransportToken(credential: SpecialTrainingV2Credential): Promise<string> {
  parseSpecialTrainingV2Credential(JSON.stringify(credential));
  const jsonBytes = new TextEncoder().encode(JSON.stringify(credential));
  if (jsonBytes.byteLength > SPECIAL_TRAINING_INFLATED_LIMIT) throw new Error("special-training envelope exceeds inflated size limit");
  const raw = encodeUnpaddedBase64Url(jsonBytes);
  if (fitsQr(linkForToken(raw))) return raw;
  const compressed = `gz1.${encodeUnpaddedBase64Url(await gzip(jsonBytes))}`;
  if (!fitsQr(linkForToken(compressed))) throw new Error("special-training credential exceeds QR Version 40-M capacity");
  return compressed;
}

export async function createSpecialTrainingV2ProductionLink(credential: SpecialTrainingV2Credential): Promise<string> {
  return linkForToken(await createSpecialTrainingV2TransportToken(credential));
}

export function createSpecialTrainingQrDataUrl(productionLink: string): Promise<string> {
  const parsed = new URL(productionLink);
  if (parsed.protocol !== "https:"
    || parsed.origin !== SPECIAL_TRAINING_PRODUCTION_BASE_URL
    || parsed.pathname !== SPECIAL_TRAINING_PRODUCTION_ROUTE
    || [...parsed.searchParams.keys()].length !== 1
    || !parsed.searchParams.get(SPECIAL_TRAINING_QUERY_PARAMETER)) {
    throw new Error("special-training production link is invalid");
  }
  return QRCode.toDataURL(productionLink, {
    errorCorrectionLevel: SPECIAL_TRAINING_QR_ERROR_CORRECTION,
    margin: SPECIAL_TRAINING_QR_MARGIN,
    width: SPECIAL_TRAINING_QR_SIZE,
    color: { dark: "#173f32", light: "#ffffff" }
  });
}

export function calculateSpecialTrainingSavedQrGeometry(productionLink: string): SpecialTrainingSavedQrGeometry {
  const moduleCount = QRCode.create(productionLink, {
    errorCorrectionLevel: SPECIAL_TRAINING_QR_ERROR_CORRECTION
  }).modules.size;
  const modulePitch = SPECIAL_TRAINING_QR_SIZE / (moduleCount + (SPECIAL_TRAINING_QR_MARGIN * 2));
  const minimumSourceQuietZonePixels = Math.floor(SPECIAL_TRAINING_QR_MARGIN * modulePitch);
  const targetQuietZonePixels = Math.ceil(SPECIAL_TRAINING_SAVED_QR_MIN_QUIET_ZONE_MODULES * modulePitch);
  const outerPaddingPixels = Math.max(0, targetQuietZonePixels - minimumSourceQuietZonePixels);
  return {
    moduleCount,
    modulePitch,
    outerPaddingPixels,
    outputSize: SPECIAL_TRAINING_QR_SIZE + (outerPaddingPixels * 2),
    minimumEffectiveQuietZoneModules: (minimumSourceQuietZonePixels + outerPaddingPixels) / modulePitch
  };
}

async function padPngWithWhiteCanvas(dataUrl: string, paddingPixels: number): Promise<string> {
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("QR PNG image could not be loaded"));
    image.src = dataUrl;
  });
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  if (width !== SPECIAL_TRAINING_QR_SIZE || height !== SPECIAL_TRAINING_QR_SIZE) {
    throw new Error("QR PNG dimensions are invalid");
  }
  const canvas = document.createElement("canvas");
  canvas.width = width + (paddingPixels * 2);
  canvas.height = height + (paddingPixels * 2);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("QR PNG canvas is unavailable");
  context.imageSmoothingEnabled = false;
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, paddingPixels, paddingPixels, width, height);
  return canvas.toDataURL("image/png");
}

export async function createSpecialTrainingSavedQrDataUrl(
  screenQrDataUrl: string,
  productionLink: string,
  padder: SpecialTrainingQrPngPadder = padPngWithWhiteCanvas
): Promise<string> {
  if (!screenQrDataUrl.startsWith("data:image/png;base64,")) {
    throw new Error("QR PNG data is invalid");
  }
  const geometry = calculateSpecialTrainingSavedQrGeometry(productionLink);
  return padder(screenQrDataUrl, geometry.outerPaddingPixels);
}

export function downloadSpecialTrainingQrPng(dataUrl: string, filename: string): void {
  if (!dataUrl.startsWith("data:image/png;base64,")) throw new Error("QR PNG data is invalid");
  const anchor = document.createElement("a");
  anchor.href = dataUrl;
  anchor.download = filename;
  anchor.click();
}

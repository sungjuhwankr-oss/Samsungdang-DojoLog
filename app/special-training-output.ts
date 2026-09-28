import QRCode from "qrcode";

import { createCredentialDeepLink, type SpecialTrainingCredential } from "./credential-v1";

export const SPECIAL_TRAINING_PRODUCTION_BASE_URL = "https://sungjuhwankr-oss.github.io";
export const SPECIAL_TRAINING_PRODUCTION_ROUTE = "/Samsungdang-DojoLog-Member/special-training/";
export const SPECIAL_TRAINING_QUERY_PARAMETER = "credential";
export const SPECIAL_TRAINING_QR_ERROR_CORRECTION = "M" as const;
export const SPECIAL_TRAINING_QR_MARGIN = 4;
export const SPECIAL_TRAINING_QR_SIZE = 900;
export const SPECIAL_TRAINING_SAVED_QR_MIN_QUIET_ZONE_MODULES = 16;

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

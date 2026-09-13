import QRCode from "qrcode";
import type { SessionSharePayload } from "./session-share";

export const SHARE_CARD_WIDTH = 900;
export const SHARE_CARD_HEIGHT = 1240;
export const SHARE_QR_SIZE = 720;

export async function createQrDataUrl(content: string): Promise<string> {
  return QRCode.toDataURL(content, { errorCorrectionLevel: "M", margin: 4, width: SHARE_QR_SIZE, color: { dark: "#173f32", light: "#ffffff" } });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

export async function createSessionShareCard(payload: SessionSharePayload, qrContent: string): Promise<string> {
  const qr = await loadImage(await createQrDataUrl(qrContent));
  const canvas = document.createElement("canvas");
  canvas.width = SHARE_CARD_WIDTH;
  canvas.height = SHARE_CARD_HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("QR 이미지를 만들 수 없습니다.");
  context.fillStyle = "#f4f8f5";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.textAlign = "center";
  context.fillStyle = "#173f32";
  context.font = "700 52px sans-serif";
  context.fillText(`삼성당 제${payload.sessionNo}회 수련`, canvas.width / 2, 88);
  context.font = "400 34px sans-serif";
  context.fillText(payload.date, canvas.width / 2, 142);
  context.font = "700 40px sans-serif";
  context.fillText("회원용 DojoLog", canvas.width / 2, 220);
  context.fillText("수련기록 가져오기", canvas.width / 2, 270);
  context.fillStyle = "#ffffff";
  context.fillRect(50, 310, 800, 800);
  context.drawImage(qr, 90, 350, SHARE_QR_SIZE, SHARE_QR_SIZE);
  context.fillStyle = "#486158";
  context.font = "400 27px sans-serif";
  context.fillText("링크를 누를 수 없는 환경에서는", canvas.width / 2, 1170);
  context.fillText("QR을 스캔하세요.", canvas.width / 2, 1210);
  return canvas.toDataURL("image/png");
}

import type { Metadata } from "next";
import "./globals.css";
import "./extra.css";
import "./add-panel.css";

export const metadata: Metadata = {
  title: "삼성당 DojoLog — 지도자",
  description: "Samsungdang DojoLog — 교안 작성·수업일지 기록·분석",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "삼성당 DojoLog — 지도자", statusBarStyle: "black-translucent" },
  icons: {
    icon: "/app-icon.png",
    shortcut: "/app-icon.png",
    apple: "/app-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="antialiased">{children}</body>
    </html>
  );
}

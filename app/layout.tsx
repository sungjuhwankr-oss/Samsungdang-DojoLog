import type { Metadata } from "next";
import "./globals.css";
import "./extra.css";
import "./add-panel.css";

export const metadata: Metadata = {
  title: "삼성당 수업관리",
  description: "아이키도 삼성당 수업구성·수업일지·커리큘럼 관리",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "삼성당 수업관리", statusBarStyle: "black-translucent" },
  icons: {
    icon: "/app-icon.svg",
    shortcut: "/app-icon.svg",
    apple: "/app-icon.svg",
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

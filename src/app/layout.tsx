import type { Metadata } from "next";
import AppFrame from "../components/AppFrame";
import "./globals.css";

export const metadata: Metadata = {
  title: "KTX 예매 PoC",
  description: "KTX 조회·예매 데모",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full text-slate-900 bg-white">
        <AppFrame>{children}</AppFrame>
      </body>
    </html>
  );
}

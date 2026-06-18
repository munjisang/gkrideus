import type { Metadata } from "next";
import AppFrame from "../components/AppFrame";
import { LangProvider } from "../lib/i18n";
import "./globals.css";

export const metadata: Metadata = {
  title: "GROUNDK Transportation Reservation",
  description: "Transportation Reservation",
  // app/favicon.ico(파일 기반)가 .ico 를 담당. 여기서는 고해상도 png + apple-touch-icon 보강.
  icons: {
    icon: [
      {
        url: "https://gk-home.s3.ap-northeast-2.amazonaws.com/image/GK_favicon.png",
        type: "image/png",
      },
    ],
    apple:
      "https://gk-home.s3.ap-northeast-2.amazonaws.com/image/GK_favicon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full text-ink bg-white">
        <LangProvider>
          <AppFrame>{children}</AppFrame>
        </LangProvider>
      </body>
    </html>
  );
}

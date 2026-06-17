import type { Metadata } from "next";
import AppFrame from "../components/AppFrame";
import { LangProvider } from "../lib/i18n";
import "./globals.css";

export const metadata: Metadata = {
  title: "GROUNDK Transportation Reservation",
  description: "Transportation Reservation",
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

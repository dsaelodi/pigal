import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Scam Risk Detector",
  description: "Evidence-based scam and investment risk assessment",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full bg-[#fafaf8] text-[#171717]">{children}</body>
    </html>
  );
}

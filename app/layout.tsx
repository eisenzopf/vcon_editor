import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VCon Audio Labeler",
  description: "Stereo audio labeling tool with vCon export",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

import type { Metadata } from "next";
import { preload } from "react-dom";
import "./globals.css";

export const metadata: Metadata = {
  title: "Alexandria Here",
  description: "The lost web, present again — without pretending the gaps were never there.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  preload("/fonts/geist-latin.woff2", {
    as: "font",
    type: "font/woff2",
    crossOrigin: "anonymous",
  });
  preload("/fonts/cormorant-garamond-latin.woff2", {
    as: "font",
    type: "font/woff2",
    crossOrigin: "anonymous",
  });

  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "@fontsource-variable/manrope";
import "./globals.css";

const title = "AI Face Monitor | Smart Attendance";
const description = "A responsive face recognition attendance dashboard for students and teachers.";
const deploymentUrl = process.env.DEPLOY_PRIME_URL ?? process.env.URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(deploymentUrl),
  title,
  description,
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
  openGraph: {
    title,
    description,
    type: "website",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "AI Face Monitor dashboard" }],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/og.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#080b17",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

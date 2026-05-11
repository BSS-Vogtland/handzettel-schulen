import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import ScrollToTopOnRouteChange from "@/components/ScrollToTopOnRouteChange";
import CookieConsentBanner from "@/components/CookieConsentBanner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteUrl = "https://www.handzettel-schulen.de";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default:
      "Handzettel-Schulen.de | Schulmaterialliste hochladen & Schulpaket vorbereiten lassen",
    template: "%s | Handzettel-Schulen.de",
  },
  description:
    "Lade Deine Schulmaterialliste einfach online hoch. Handzettel-Schulen.de bereitet daraus einen persönlichen Schulmaterial-Paketwunsch vor und hilft Eltern beim schnellen Zusammenstellen der benötigten Schulsachen.",
  applicationName: "Handzettel-Schulen.de",
  authors: [{ name: "Handzettel-Schulen.de" }],
  creator: "Handzettel-Schulen.de",
  publisher: "Handzettel-Schulen.de",
  category: "Schulbedarf",
  keywords: [
    "Schulmaterialliste hochladen",
    "Schulmaterial online bestellen",
    "Schulliste hochladen",
    "Schulbedarf zusammenstellen lassen",
    "Schulpaket vorbereiten",
    "Schulmaterial Service",
    "Handzettel Schulen",
    "Schulbedarf Vogtland",
    "Schulanfang Materialliste",
    "Schulsachen Liste hochladen",
    "Schulmaterial für Eltern",
    "Schulbedarf online anfragen",
  ],
  alternates: {
    canonical: siteUrl,
  },
  openGraph: {
    type: "website",
    locale: "de_DE",
    url: siteUrl,
    siteName: "Handzettel-Schulen.de",
    title:
      "Handzettel-Schulen.de | Schulmaterialliste hochladen & Schulpaket vorbereiten lassen",
    description:
      "Schulmaterialliste hochladen, passende Produkte vorbereiten lassen und den persönlichen Paketwunsch bequem online absenden.",
    images: [
      {
        url: `${siteUrl}/handzettel-logo.png`,
        width: 1200,
        height: 630,
        alt: "Handzettel-Schulen.de",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title:
      "Handzettel-Schulen.de | Schulmaterialliste hochladen & Schulpaket vorbereiten lassen",
    description:
      "Lade Deine Schulmaterialliste online hoch und lass Deinen Schulmaterial-Paketwunsch vorbereiten.",
    images: [`${siteUrl}/handzettel-logo.png`],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  icons: {
    icon: "/handzettel-logo.png",
    apple: "/handzettel-logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html
      lang="de"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ScrollToTopOnRouteChange />
        {children}
        <CookieConsentBanner />
      </body>
    </html>
  );
}
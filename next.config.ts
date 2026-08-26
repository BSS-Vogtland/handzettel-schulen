import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // Schulheft-Normalisierung
      {
        source: "/shop/produkt/schreibheft-a5-lineatur-0",
        destination:
          "https://www.handzettel-schulen.de/shop/produkt/schulheft-a5-lineatur-0",
        permanent: true,
      },
      {
        source: "/shop/produkt/schreibheft-lineatur-1-a4",
        destination:
          "https://www.handzettel-schulen.de/shop/produkt/schulheft-a4-lineatur-1",
        permanent: true,
      },
      {
        source: "/shop/produkt/schreibheft-lineatur-25-a4",
        destination:
          "https://www.handzettel-schulen.de/shop/produkt/schulheft-a4-lineatur-25",
        permanent: true,
      },
      {
        source: "/shop/produkt/schreibheft-lineatur-27-a4",
        destination:
          "https://www.handzettel-schulen.de/shop/produkt/schulheft-a4-lineatur-27",
        permanent: true,
      },
      {
        source: "/shop/produkt/schreibheft-lineatur-4-a5",
        destination:
          "https://www.handzettel-schulen.de/shop/produkt/schulheft-a5-lineatur-4",
        permanent: true,
      },
      {
        source: "/shop/produkt/schreibheft-lineatur-9-a5",
        destination:
          "https://www.handzettel-schulen.de/shop/produkt/schulheft-a5-lineatur-9",
        permanent: true,
      },
      {
        source: "/shop/produkt/schreibheft-lineatur-dm-a4",
        destination:
          "https://www.handzettel-schulen.de/shop/produkt/schulheft-a4-lineatur-dm",
        permanent: true,
      },
      {
        source: "/shop/produkt/schreibheft-a4-lineatur-3",
        destination:
          "https://www.handzettel-schulen.de/shop/produkt/schulheft-a4-lineatur-3",
        permanent: true,
      },
      {
        source: "/shop/produkt/schreibheft-a5-lineatur-1",
        destination:
          "https://www.handzettel-schulen.de/shop/produkt/schulheft-a5-lineatur-1",
        permanent: true,
      },
      {
        source: "/shop/produkt/schreibheft-a5-lineatur-1-2",
        destination:
          "https://www.handzettel-schulen.de/shop/produkt/schulheft-a5-lineatur-1",
        permanent: true,
      },
      {
        source: "/shop/produkt/schreibheft-a5-lineatur-0-2",
        destination:
          "https://www.handzettel-schulen.de/shop/produkt/schulheft-a5-lineatur-0-schreiblernheft",
        permanent: true,
      },
      {
        source: "/shop/produkt/schreibheft-a5-lineatur-3",
        destination:
          "https://www.handzettel-schulen.de/shop/produkt/schulheft-a5-lineatur-3",
        permanent: true,
      },
      {
        source: "/shop/produkt/schreibheft-a5-lineatur-8f",
        destination:
          "https://www.handzettel-schulen.de/shop/produkt/schulheft-a5-lineatur-8f",
        permanent: true,
      },

      // Alte Search-Console-URL
      {
        source: "/shop/produkt/schulheft-kariert-lineatur-f-a5",
        destination:
          "https://www.handzettel-schulen.de/shop/produkt/schulheft-a5-lineatur-8f",
        permanent: true,
      },

      // Bereits vorhandene Produkt-Redirects
      {
        source:
          "/shop/produkt/schreibblock-a4-lineatur-7-hs-blk-a4-021",
        destination:
          "https://www.handzettel-schulen.de/shop/produkt/schreibblock-a4-lineatur-7",
        permanent: true,
      },
      {
        source: "/shop/produkt/pinsel-10",
        destination:
          "https://www.handzettel-schulen.de/shop/produkt/pinsel-10-borstenpinsel",
        permanent: true,
      },
      {
        source: "/shop/produkt/pinsel-sortiment",
        destination:
          "https://www.handzettel-schulen.de/shop/produkt/pinselsortiment-pinselset-4-rundpinsel-2-flachpinsel",
        permanent: true,
      },
      {
        source: "/shop/produkt/pinselsortiment",
        destination:
          "https://www.handzettel-schulen.de/shop/produkt/pinselsortiment-pinselset-4-rundpinsel-2-flachpinsel",
        permanent: true,
      },

      // Bestehende allgemeine Redirects
      {
        source: "/upload",
        destination: "https://www.handzettel-schulen.de/",
        permanent: true,
      },
      {
        source: "/:path*",
        has: [
          {
            type: "host",
            value: "handzettel-schulen.de",
          },
        ],
        destination: "https://www.handzettel-schulen.de/:path*",
        permanent: true,
      },
      {
        source: "/:path*",
        has: [
          {
            type: "host",
            value: "handzettel-schulen.vercel.app",
          },
        ],
        destination: "https://www.handzettel-schulen.de/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
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
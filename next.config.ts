import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
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
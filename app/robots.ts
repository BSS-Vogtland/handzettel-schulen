import type { MetadataRoute } from "next";

const siteUrl = "https://www.handzettel-schulen.de";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/admin",
          "/admin/",
          "/admin/anfragen",
          "/admin/anfragen/",
          "/admin/produkte",
          "/admin/produkte/",
          "/angebot/",
          "/rechnung/",
          "/api/",
        ],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
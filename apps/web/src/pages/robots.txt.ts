import { siteUrl } from "../lib/api";
export const GET = () =>
  new Response(
    `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\nSitemap: ${siteUrl}/sitemap.xml\n`,
    { headers: { "Content-Type": "text/plain" } },
  );

import { api, siteUrl } from "../lib/api";
const esc = (s: string) =>
  s.replace(
    /[<>&"']/g,
    (c) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&apos;",
      })[c]!,
  );
export async function GET() {
  try {
    const [es, en] = await Promise.all([api("posts/es"), api("posts/en")]);
    const paths = [
      "/",
      "/en/",
      "/blog",
      "/en/blog",
      "/politica-de-privacidad",
      "/condiciones-de-servicio",
      "/en/privacy-policy",
      "/en/terms-of-service",
    ].map((path) => ({ path, date: null }));
    for (const p of [...es, ...en])
      paths.push({
        path: `${p.locale === "en" ? "/en" : ""}/blog/${p.slug}`,
        date: p.updated_at,
      });
    return new Response(
      '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
        paths
          .map(
            (p) =>
              `<url><loc>${esc(siteUrl + p.path)}</loc>${p.date ? `<lastmod>${new Date(p.date).toISOString()}</lastmod>` : ""}</url>`,
          )
          .join("") +
        "</urlset>",
      { headers: { "Content-Type": "application/xml" } },
    );
  } catch {
    return new Response("Temporarily unavailable", { status: 503 });
  }
}

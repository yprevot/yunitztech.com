export const siteUrl = (
  process.env.SITE_URL || "http://localhost:8080"
).replace(/\/$/, "");
export async function api(path: string) {
  const response = await fetch(
    `${process.env.API_URL || "http://localhost:3000"}/api/${path}`,
    { signal: AbortSignal.timeout(5000) },
  );
  if (!response.ok) throw new Error(`API ${response.status}`);
  return response.json();
}
export const route = (lang: string, path = "") =>
  `${lang === "en" ? "/en" : "/"}${lang === "en" && path ? "/" : ""}${path}`;

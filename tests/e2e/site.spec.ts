import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFileSync, statSync } from "node:fs";
const env = process.env.ADMIN_PASSWORD
  ? process.env
  : Object.fromEntries(
      readFileSync(".env", "utf8")
        .split("\n")
        .filter((l) => l.includes("="))
        .map((l) => {
          const i = l.indexOf("=");
          return [l.slice(0, i), l.slice(i + 1)];
        }),
    );
const login = async (page: any) => {
  await page.goto("/admin");
  await page.getByLabel("Correo de administración").fill(env.ADMIN_EMAIL!);
  await page
    .getByLabel("Contraseña", { exact: true })
    .fill(env.ADMIN_PASSWORD!);
  const response = page.waitForResponse(
    (r: any) => r.url().endsWith("/api/login") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  const loginResponse = await response;
  if (process.env.TEST_PRODUCTION === "1") {
    const cookie = (await loginResponse.allHeaders())["set-cookie"] || "";
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Strict");
  }
  await expect(page.locator("#dashboard")).toBeVisible();
};
test("Production gateway health, revision, CSP and compiled assets", async ({
  page,
  request,
}) => {
  const httpUrl = process.env.TEST_HTTP_URL || process.env.TEST_URL || "http://localhost:8080";
  for (const path of ["/health", "/api/health", "/version.json"]) {
    expect((await request.get(httpUrl + path)).status()).toBe(200);
  }
  const version = await (await request.get(httpUrl + "/version.json")).json();
  if (process.env.EXPECTED_SHA) expect(version.revision).toBe(process.env.EXPECTED_SHA);
  const violations: any[] = [];
  await page.exposeFunction("onSecurityPolicyViolation", (v: any) => {
    violations.push(v);
  });
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (e) => {
      (window as any).onSecurityPolicyViolation({
        blockedURI: e.blockedURI,
        violatedDirective: e.violatedDirective,
      });
    });
  });
  const response = await page.goto(httpUrl);
  expect(response?.status()).toBe(200);
  const csp = response?.headers()["content-security-policy"] || "";
  const directives = Object.fromEntries(
    csp.split(";").map((part) => part.trim().split(/\s+/, 2)).filter((part) => part[0]),
  );
  expect(directives["default-src"]).toBe("'self'");
  expect(directives["script-src"]).toBe("'self'");
  expect(directives["connect-src"]).toBe("'self'");
  expect(directives["object-src"]).toBe("'none'");
  expect(violations).toEqual([]);
  await expect(page.locator("h1")).toBeVisible();
  expect(await page.evaluate(() => document.styleSheets.length)).toBeGreaterThan(0);
});
test("Spanish and English SSR, SEO, legal pages, and all seeded articles", async ({
  page,
  request,
}) => {
  for (const url of [
    "/",
    "/en/",
    "/blog",
    "/en/blog",
    "/politica-de-privacidad",
    "/condiciones-de-servicio",
    "/en/privacy-policy",
    "/en/terms-of-service",
  ]) {
    const response = await page.goto(url);
    expect(response?.status()).toBe(200);
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.locator("link[rel=canonical]")).toHaveCount(1);
  }
  for (const locale of ["es", "en"]) {
    const posts = await (await request.get("/api/posts/" + locale)).json();
    expect(posts.length).toBeGreaterThanOrEqual(5);
    for (const p of posts) {
      const r = await page.goto(
        (locale === "en" ? "/en" : "") + "/blog/" + p.slug,
      );
      expect(r?.status()).toBe(200);
      await expect(page.locator("h1")).toHaveText(p.title);
      const json = await page
        .locator('script[type="application/ld+json"]')
        .textContent();
      expect(JSON.parse(json!)["@type"]).toBe("BlogPosting");
    }
  }
  expect((await request.get("/sitemap.xml")).status()).toBe(200);
  expect((await request.get("/blog/does-not-exist")).status()).toBe(404);
});
test("Responsive layout, keyboard access and WCAG automated checks", async ({
  page,
}) => {
  for (const [name, width, height] of [
    ["desktop", 1440, 1000],
    ["mobile", 390, 844],
    ["small", 320, 740],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({ path: `test-results/${name}.png`, fullPage: true });
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(results.violations).toEqual([]);
  }
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Saltar al contenido" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  expect(await page.evaluate(() => location.hash)).toBe("#main");
});
test("Contact, admin inbox, status and deletion", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Tu nombre", { exact: true }).fill("Prueba QA");
  await page.getByLabel("Tu correo", { exact: true }).fill("qa@example.test");
  await page.getByLabel("Nombre del negocio").fill("Negocio de prueba");
  await page
    .getByLabel("¿Qué tienes en mente?")
    .selectOption({ label: "Reservaciones" });
  await page
    .getByLabel("Cuéntanos tu idea", { exact: true })
    .fill("Quiero validar un sistema de citas para mi pequeño negocio.");
  await page.locator("[name=consent]").check();
  await page.getByRole("button", { name: "Enviar mi idea" }).click();
  await expect(page.locator("#form-status")).toContainText("Tu idea ya está");
  await login(page);
  await page.getByRole("button", { name: "Contactos", exact: true }).click();
  const card = page
    .locator("#contact-list article")
    .filter({ hasText: "qa@example.test" })
    .first();
  await expect(card).toContainText("Negocio de prueba");
  await card.getByLabel("Estado").selectOption("in-progress");
  await expect(page.locator("#admin-status")).toContainText(
    "Estado actualizado",
  );
  page.once("dialog", (d) => d.accept());
  await card.getByRole("button", { name: "Eliminar solicitud" }).click();
  await expect(page.locator("#admin-status")).toContainText(
    "Solicitud eliminada",
  );
  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await expect(page.locator("#login-panel")).toBeVisible();
});
test("CMS uploads, publishes, renders safely and unpublishes without rebuild", async ({
  page,
  request,
  browser,
}) => {
  await login(page);
  await page.getByRole("button", { name: "Artículos", exact: true }).click();
  const f = page.locator("#post-form");
  const key = "qa-" + Date.now();
  await f.locator("[name=translation_key]").fill(key);
  await f.locator("[name=slug]").fill(key);
  await f.locator("[name=title]").fill("Artículo de prueba funcional");
  await f
    .locator("[name=excerpt]")
    .fill(
      "Descripción suficientemente larga para comprobar la edición del blog.",
    );
  await f
    .locator("[name=body]")
    .fill(
      '## Una primera prueba\n\nEste artículo verifica que podemos publicar contenido y mostrar texto seguro. <script>alert("xss")</script>',
    );
  await f.locator("[name=image_alt]").fill("Negocio digital de prueba");
  const uploadImage =
    process.env.TEST_UPLOAD_IMAGE || "apps/web/public/images/mvp-studio.webp";
  if (process.env.TEST_UPLOAD_IMAGE) {
    expect(statSync(uploadImage).size).toBeGreaterThanOrEqual(5_000_000);
    expect(statSync(uploadImage).size).toBeLessThanOrEqual(5 * 1024 * 1024);
  }
  const concurrentPage = await browser.newPage({
    baseURL: process.env.TEST_URL || "http://localhost:8080",
    ignoreHTTPSErrors: true,
  });
  await Promise.all([
    page.locator("#post-upload").setInputFiles(uploadImage),
    login(concurrentPage),
  ]);
  await concurrentPage.close();
  await expect(page.locator("#admin-status")).toContainText("Imagen lista");
  await f.locator("[name=published]").check();
  await f.getByRole("button", { name: "Guardar artículo" }).click();
  await expect(page.locator("#admin-status")).toContainText(
    "Artículo guardado",
  );
  const result = await request.get("/blog/" + key);
  expect(result.status()).toBe(200);
  const html = await result.text();
  expect(html).toContain("&lt;script&gt;");
  expect(html).not.toContain("<script>alert");
  await f.locator("[name=published]").uncheck();
  await f.getByRole("button", { name: "Guardar artículo" }).click();
  await expect(page.locator("#admin-status")).toContainText(
    "Artículo guardado",
  );
  expect((await request.get("/blog/" + key)).status()).toBe(404);
  await page.getByRole("button", { name: "Sitio e imágenes" }).click();
  const headline = page.locator("#site-form [name=headline]");
  const original = await headline.inputValue();
  await headline.fill("Una primera versión para una idea extraordinaria.");
  await page.getByRole("button", { name: "Guardar portada" }).click();
  await expect(page.locator("#admin-status")).toContainText(
    "Portada actualizada",
  );
  expect(await (await request.get("/")).text()).toContain(
    "Una primera versión para una idea extraordinaria.",
  );
  await headline.fill(original);
  await page.getByRole("button", { name: "Guardar portada" }).click();
  await expect(page.locator("#admin-status")).toContainText(
    "Portada actualizada",
  );
  await page.screenshot({ path: "test-results/dashboard.png", fullPage: true });
});
test("Authentication, CSRF, input validation and image restrictions", async ({
  request,
  page,
}) => {
  expect((await request.get("/api/admin/data")).status()).toBe(401);
  expect((await request.post("/api/contact", { data: {} })).status()).toBe(403);
  expect(
    (
      await request.post("/api/contact", {
        headers: { Origin: process.env.TEST_URL || "http://localhost:8080" },
        data: { name: "A" },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await request.post("/api/admin/posts", {
        headers: { Origin: process.env.TEST_URL || "http://localhost:8080" },
        data: {},
      })
    ).status(),
  ).toBe(401);
  await login(page);
  const result = await page.evaluate(async () => {
    const form = new FormData();
    form.append(
      "image",
      new Blob(['<svg onload="alert(1)"></svg>'], { type: "image/svg+xml" }),
      "bad.svg",
    );
    return (await fetch("/api/admin/upload", { method: "POST", body: form }))
      .status;
  });
  expect(result).toBe(400);
  const invalid = await page.evaluate(async () => {
    const form = new FormData();
    form.append(
      "image",
      new Blob(["not an image"], { type: "image/png" }),
      "bad.png",
    );
    return (await fetch("/api/admin/upload", { method: "POST", body: form }))
      .status;
  });
  expect(invalid).toBe(400);
  const oversized = await page.evaluate(async () => {
    const form = new FormData();
    form.append(
      "image",
      new Blob([new Uint8Array(5 * 1024 * 1024 + 1024)], { type: "image/png" }),
      "large.png",
    );
    return (await fetch("/api/admin/upload", { method: "POST", body: form }))
      .status;
  });
  expect([400, 413]).toContain(oversized);
});

test("Analytics increments aggregate views and respects browser opt-out", async ({
  page,
}) => {
  await login(page);
  const before = await page.evaluate(async () => {
    const d = await (await fetch("/api/admin/data")).json();
    return d.views.reduce((n: number, r: any) => n + r.views, 0);
  });
  await Promise.all([
    page.waitForResponse(
      (r) => r.url().endsWith("/api/view") && r.request().method() === "POST",
    ),
    page.goto("/"),
  ]);
  const after = await page.evaluate(async () => {
    const d = await (await fetch("/api/admin/data")).json();
    return d.views.reduce((n: number, r: any) => n + r.views, 0);
  });
  expect(after).toBeGreaterThan(before);
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "doNotTrack", { get: () => "1" }),
  );
  let requests = 0;
  page.on("request", (r) => {
    if (r.url().endsWith("/api/view")) requests++;
  });
  await page.goto("/en/");
  await expect(page.locator("h1")).toBeVisible();
  expect(requests).toBe(0);
});

test("Login attempts are rate limited", async ({ request }) => {
  const statuses = [];
  for (let i = 0; i < 6; i++)
    statuses.push(
      (
        await request.post("/api/login", {
          headers: { Origin: process.env.TEST_URL || "http://localhost:8080" },
          data: {
            email: "missing@example.test",
            password: "invalid-test-password",
          },
        })
      ).status(),
    );
  expect(statuses).toContain(429);
});

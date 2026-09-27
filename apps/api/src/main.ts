import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  NestFastifyApplication,
} from "@nestjs/platform-fastify";
import {
  Module,
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Req,
  Res,
} from "@nestjs/common";
import { randomBytes, createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import multipart from "@fastify/multipart";
import argon2 from "argon2";
import sharp from "sharp";
import { z, ZodError } from "zod";
import { db } from "./db";
const origin = process.env.SITE_URL || "http://localhost:8080";
const uploads = process.env.UPLOAD_DIR || "./uploads";
const digest = (s: string) => createHash("sha256").update(s).digest("hex");
const locale = z.enum(["es", "en"]);
const imagePath = z
  .string()
  .regex(
    /^\/(images\/[a-zA-Z0-9_-]+\.(webp|avif)|api\/media\/[a-f0-9]{32}\.webp)$/,
  );
const postSchema = z
  .object({
    translation_key: z
      .string()
      .min(1)
      .max(100)
      .regex(/^[a-z0-9-]+$/),
    locale,
    slug: z
      .string()
      .min(1)
      .max(150)
      .regex(/^[a-z0-9-]+$/),
    title: z.string().min(5).max(180),
    excerpt: z.string().min(20).max(320),
    body: z.string().min(80).max(60000),
    image: imagePath,
    image_alt: z.string().max(200),
    published: z.boolean(),
  })
  .strict();
const settingsSchema = z
  .object({
    headline: z.string().min(10).max(180),
    description: z.string().min(20).max(400),
    image: imagePath,
    services: z
      .array(
        z.object({
          title: z.string().min(2).max(90),
          description: z.string().min(10).max(250),
        }),
      )
      .min(1)
      .max(12),
  })
  .strict();
async function auth(req: any, res: any) {
  const token = req.cookies.session;
  if (
    !token ||
    !(
      await db.query(
        "SELECT 1 FROM sessions WHERE token_hash=$1 AND expires_at>now()",
        [digest(token)],
      )
    ).rowCount
  ) {
    res.code(401).send({ error: "Inicia sesión / Please sign in" });
    return false;
  }
  return true;
}
@Controller("/api")
class ApiController {
  @Get("health") async health() {
    await db.query("SELECT 1");
    return { ok: true };
  }
  @Get("site/:locale") async site(@Param("locale") lang: string) {
    locale.parse(lang);
    return (
      await db.query("SELECT content FROM settings WHERE locale=$1", [lang])
    ).rows[0]?.content;
  }
  @Get("posts/:locale") async posts(@Param("locale") lang: string) {
    locale.parse(lang);
    return (
      await db.query(
        "SELECT id,translation_key,locale,slug,title,excerpt,image,image_alt,created_at,updated_at FROM posts WHERE locale=$1 AND published=true ORDER BY created_at DESC,id DESC",
        [lang],
      )
    ).rows;
  }
  @Get("post/:locale/:slug") async one(
    @Param("locale") lang: string,
    @Param("slug") slug: string,
    @Res({ passthrough: true }) res: any,
  ) {
    locale.parse(lang);
    const post = (
      await db.query(
        "SELECT * FROM posts WHERE locale=$1 AND slug=$2 AND published=true",
        [lang, slug],
      )
    ).rows[0];
    if (!post) {
      res.code(404);
      return { error: "Not found" };
    }
    post.translations = (
      await db.query(
        "SELECT locale,slug FROM posts WHERE translation_key=$1 AND published=true",
        [post.translation_key],
      )
    ).rows;
    return post;
  }
  @Post("contact") async contact(@Req() req: any) {
    const data = z
      .object({
        name: z.string().trim().min(2).max(100),
        email: z.string().email().max(254),
        company: z.string().trim().max(150),
        service: z.string().min(2).max(100),
        message: z.string().trim().min(20).max(5000),
        locale,
        consent: z.literal(true),
        website: z.string().max(200).optional(),
      })
      .strict()
      .parse(req.body);
    if (data.website) return { ok: true };
    await db.query(
      "INSERT INTO contacts(name,email,company,service,message,locale) VALUES($1,$2,$3,$4,$5,$6)",
      [
        data.name,
        data.email,
        data.company,
        data.service,
        data.message,
        data.locale,
      ],
    );
    return { ok: true };
  }
  @Post("view") async view(@Req() req: any) {
    const d = z
      .object({
        path: z
          .string()
          .max(200)
          .regex(/^\/(?:en\/)?(?:blog(?:\/[a-z0-9-]+)?\/?)?$/),
        referrer: z.string().max(2048),
      })
      .parse(req.body);
    let host = "direct";
    try {
      host = new URL(d.referrer).hostname;
      if (host === new URL(origin).hostname) host = "internal";
    } catch {}
    await db.query(
      "INSERT INTO page_views(path,referrer) VALUES($1,$2) ON CONFLICT(day,path,referrer) DO UPDATE SET count=page_views.count+1",
      [d.path, host],
    );
    return { ok: true };
  }
  @Post("login") async login(
    @Req() req: any,
    @Res({ passthrough: true }) res: any,
  ) {
    const d = z
      .object({
        email: z.string().email(),
        password: z.string().min(1).max(200),
      })
      .parse(req.body);
    const admin = (
      await db.query("SELECT * FROM admins WHERE email=$1", [
        d.email.toLowerCase(),
      ])
    ).rows[0];
    const valid = await argon2.verify(
      admin?.password_hash || dummyHash,
      d.password,
    );
    if (!admin || !valid) {
      res.code(401);
      return { error: "Credenciales incorrectas / Invalid credentials" };
    }
    const token = randomBytes(32).toString("hex");
    await db.query(
      "INSERT INTO sessions VALUES($1,$2,now()+interval '8 hours')",
      [digest(token), admin.id],
    );
    res.setCookie("session", token, {
      path: "/api",
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      maxAge: 28800,
    });
    return { ok: true };
  }
  @Post("logout") async logout(
    @Req() req: any,
    @Res({ passthrough: true }) res: any,
  ) {
    if (req.cookies.session)
      await db.query("DELETE FROM sessions WHERE token_hash=$1", [
        digest(req.cookies.session),
      ]);
    res.clearCookie("session", { path: "/api" });
    return { ok: true };
  }
  @Get("admin/data") async admin(
    @Req() req: any,
    @Res({ passthrough: true }) res: any,
  ) {
    if (!(await auth(req, res))) return;
    const [contacts, posts, settings, views, sources, pages] =
      await Promise.all([
        db.query("SELECT * FROM contacts ORDER BY created_at DESC LIMIT 500"),
        db.query("SELECT * FROM posts ORDER BY updated_at DESC"),
        db.query("SELECT * FROM settings"),
        db.query(
          "SELECT day,sum(count)::int AS views FROM page_views WHERE day>CURRENT_DATE-30 GROUP BY day ORDER BY day",
        ),
        db.query(
          "SELECT referrer,sum(count)::int AS views FROM page_views WHERE day>CURRENT_DATE-30 GROUP BY referrer ORDER BY views DESC LIMIT 20",
        ),
        db.query(
          "SELECT path,sum(count)::int AS views FROM page_views WHERE day>CURRENT_DATE-30 GROUP BY path ORDER BY views DESC LIMIT 20",
        ),
      ]);
    return {
      contacts: contacts.rows,
      posts: posts.rows,
      settings: settings.rows,
      views: views.rows,
      sources: sources.rows,
      pages: pages.rows,
    };
  }
  @Put("admin/contact/:id") async status(
    @Req() req: any,
    @Param("id") id: string,
    @Res({ passthrough: true }) res: any,
  ) {
    if (!(await auth(req, res))) return;
    const d = z
      .object({ status: z.enum(["new", "in-progress", "closed"]) })
      .parse(req.body);
    await db.query("UPDATE contacts SET status=$1 WHERE id=$2", [
      d.status,
      z.coerce.number().int().positive().parse(id),
    ]);
    return { ok: true };
  }
  @Delete("admin/contact/:id") async remove(
    @Req() req: any,
    @Param("id") id: string,
    @Res({ passthrough: true }) res: any,
  ) {
    if (!(await auth(req, res))) return;
    await db.query("DELETE FROM contacts WHERE id=$1", [
      z.coerce.number().int().positive().parse(id),
    ]);
    return { ok: true };
  }
  @Post("admin/posts") async save(
    @Req() req: any,
    @Res({ passthrough: true }) res: any,
  ) {
    if (!(await auth(req, res))) return;
    const d = postSchema.parse(req.body);
    const result = await db.query(
      "INSERT INTO posts(translation_key,locale,slug,title,excerpt,body,image,image_alt,published) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id",
      Object.values(d),
    );
    return result.rows[0];
  }
  @Put("admin/posts/:id") async update(
    @Req() req: any,
    @Param("id") id: string,
    @Res({ passthrough: true }) res: any,
  ) {
    if (!(await auth(req, res))) return;
    const d = postSchema.parse(req.body);
    await db.query(
      "UPDATE posts SET translation_key=$1,locale=$2,slug=$3,title=$4,excerpt=$5,body=$6,image=$7,image_alt=$8,published=$9,updated_at=now() WHERE id=$10",
      [...Object.values(d), z.coerce.number().int().positive().parse(id)],
    );
    return { ok: true };
  }
  @Put("admin/site/:locale") async updateSite(
    @Req() req: any,
    @Param("locale") lang: string,
    @Res({ passthrough: true }) res: any,
  ) {
    if (!(await auth(req, res))) return;
    locale.parse(lang);
    const d = settingsSchema.parse(req.body);
    await db.query("UPDATE settings SET content=$1 WHERE locale=$2", [
      JSON.stringify(d),
      lang,
    ]);
    return { ok: true };
  }
  @Post("admin/upload") async upload(
    @Req() req: any,
    @Res({ passthrough: true }) res: any,
  ) {
    if (!(await auth(req, res))) return;
    const file = await req.file();
    if (
      !file ||
      !["image/jpeg", "image/png", "image/webp", "image/avif"].includes(
        file.mimetype,
      )
    ) {
      res.code(400);
      return { error: "Usa JPG, PNG, WebP o AVIF, máximo 5 MB." };
    }
    const input = await file.toBuffer();
    let result: Buffer;
    try {
      result = await sharp(input, { limitInputPixels: 20000000 })
        .rotate()
        .resize({
          width: 1600,
          height: 1600,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: 78 })
        .toBuffer();
    } catch {
      res.code(400);
      return { error: "Imagen inválida o demasiado grande." };
    }
    const name = randomBytes(16).toString("hex") + ".webp";
    await writeFile(join(uploads, name), result, { flag: "wx" });
    return { url: "/api/media/" + name, size: result.length };
  }
  @Get("media/:name") async media(
    @Param("name") name: string,
    @Res() res: any,
  ) {
    if (!/^[a-f0-9]{32}\.webp$/.test(name)) return res.code(404).send();
    try {
      const body = await readFile(join(uploads, name));
      res
        .header("Content-Type", "image/webp")
        .header("Cache-Control", "public,max-age=31536000,immutable")
        .send(body);
    } catch {
      res.code(404).send();
    }
  }
}
@Module({ controllers: [ApiController] })
class AppModule {}
let dummyHash = "";
async function bootstrap() {
  if (
    process.env.NODE_ENV === "production" &&
    (!process.env.SITE_URL?.startsWith("https://") || !process.env.DATABASE_URL)
  )
    throw new Error("Production requires HTTPS SITE_URL and DATABASE_URL");
  await mkdir(uploads, { recursive: true });
  dummyHash = await argon2.hash(randomBytes(32));
  await db.query(await readFile(join(__dirname, "../src/schema.sql"), "utf8"));
  const seed = JSON.parse(
    await readFile(join(__dirname, "../src/seed.json"), "utf8"),
  );
  for (const [lang, content] of Object.entries(seed.settings))
    await db.query(
      "INSERT INTO settings VALUES($1,$2) ON CONFLICT DO NOTHING",
      [lang, JSON.stringify(content)],
    );
  for (const p of seed.posts)
    await db.query(
      "INSERT INTO posts(translation_key,locale,slug,title,excerpt,body,image,image_alt,published) VALUES($1,$2,$3,$4,$5,$6,$7,$8,true) ON CONFLICT DO NOTHING",
      [
        p.key,
        p.locale,
        p.slug,
        p.title,
        p.excerpt,
        p.body,
        "/images/mvp-studio.webp",
        p.locale === "es"
          ? "Ilustración de un negocio y sus productos digitales"
          : "Illustration of a business and its digital products",
      ],
    );
  if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
    if (process.env.ADMIN_PASSWORD.length < 16)
      throw new Error("ADMIN_PASSWORD must have at least 16 characters");
    await db.query(
      "INSERT INTO admins(email,password_hash) VALUES($1,$2) ON CONFLICT DO NOTHING",
      [
        process.env.ADMIN_EMAIL.toLowerCase(),
        await argon2.hash(process.env.ADMIN_PASSWORD),
      ],
    );
  }
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ bodyLimit: 100000, trustProxy: false, logger: false }),
  );
  const fastify = app.getHttpAdapter().getInstance();
  fastify.addHook("onRoute", (options: any) => {
    if (options.method === "GET" && !options.url.startsWith("/api/admin/")) {
      options.config = { ...options.config, rateLimit: false };
    }
    if (options.url === "/api/login")
      options.config = {
        ...options.config,
        rateLimit: { max: 5, timeWindow: "15 minutes" },
      };
    if (options.url === "/api/contact")
      options.config = {
        ...options.config,
        rateLimit: { max: 5, timeWindow: "1 hour" },
      };
  });
  await app.register(cookie);
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(rateLimit, {
    max: 120,
    timeWindow: "1 minute",
    keyGenerator: (req: any) => req.headers["x-real-ip"] || req.ip,
  });
  await app.register(multipart, {
    limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 0 },
  });
  fastify.addHook("onRequest", async (req: any, res: any) => {
    res.header("Cache-Control", "no-store");
    if (
      ["POST", "PUT", "DELETE", "PATCH"].includes(req.method) &&
      req.headers.origin !== origin
    )
      return res.code(403).send({ error: "Origin not allowed" });
  });
  app.useGlobalFilters({
    catch(error: any, host: any) {
      const res = host.switchToHttp().getResponse();
      if (error instanceof ZodError)
        return res.code(400).send({
          error: "Revisa los campos / Check the fields",
          fields: error.issues.map((i) => i.path.join(".")),
        });
      if (error.code === "23505")
        return res.code(409).send({
          error:
            "Ese slug o traducción ya existe / Slug or translation already exists",
        });
      const status = error.statusCode || error.status || 500;
      if (status >= 500) console.error("API error", error.code || error.name);
      res.code(status).send({
        error:
          status >= 500
            ? "Error interno / Internal error"
            : "Solicitud no válida / Invalid request",
      });
    },
  });
  const cleanup = () =>
    db
      .query(
        "DELETE FROM sessions WHERE expires_at<now(); DELETE FROM page_views WHERE day<CURRENT_DATE-90; DELETE FROM contacts WHERE created_at<now()-interval '12 months'",
      )
      .catch(() => console.error("Retention cleanup failed"));
  await cleanup();
  setInterval(cleanup, 86400000).unref();
  app.enableShutdownHooks();
  await app.listen(3000, "0.0.0.0");
}
bootstrap().catch((e) => {
  console.error(e.message);
  process.exit(1);
});

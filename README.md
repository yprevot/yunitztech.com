# YunitzTech

Sitio bilingüe para una empresa que construye MVP para mipymes. Astro SSR, NestJS con Fastify y PostgreSQL. Incluye portada adaptable, seis servicios, cinco artículos originales con traducción (diez entradas), contacto persistente, estadísticas y panel editorial.

## Empezar en desarrollo

Requisitos: Docker Engine 29.8.1 con Docker Compose v2, Node.js 24.21.0 y npm. `.nvmrc` fija la versión de Node para el entorno local y CI.

PostgreSQL usa 18.6. Al actualizar desde PostgreSQL 17, sigue primero el procedimiento de respaldo y restauración en [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md); el compose conserva el volumen `pgdata` anterior y crea `pgdata18` para la versión nueva.

```sh
cp .env.example .env
# Completa POSTGRES_PASSWORD, ADMIN_EMAIL y ADMIN_PASSWORD en tu editor.
# Usa una contraseña PostgreSQL hexadecimal y una contraseña admin de 16+ caracteres.
docker compose -f compose.dev.yml up -d --build
```

Sitio: http://localhost:8080 · Inglés: http://localhost:8080/en/ · Panel: http://localhost:8080/admin.

En esta entrega ya existe `.env` local con secretos aleatorios para pruebas, excluido de Git y con permisos 0600. Consulta ese archivo localmente para acceder al panel; no uses estas credenciales en producción. El usuario inicial se crea solo cuando su correo no existe. Cambiar `ADMIN_PASSWORD` no cambia una cuenta existente: utiliza el comando de recuperación documentado abajo.

El único puerto de desarrollo publicado es `127.0.0.1:8080`. Nginx, Astro, API y PostgreSQL son servicios separados. La API se compila al iniciar; tras modificarla ejecuta `docker compose -f compose.dev.yml restart api`. Astro recarga los cambios automáticamente.

```sh
docker compose -f compose.dev.yml logs --tail 50 api web nginx
docker compose -f compose.dev.yml stop
# Para volver a arrancar sin borrar datos:
docker compose -f compose.dev.yml up -d
```

## Qué permite el panel

- Consultar las últimas 500 solicitudes, filtrarlas, cambiar su estado y eliminar sus datos.
- Consultar vistas diarias, páginas y dominios de procedencia de los últimos 30 días. No son visitantes únicos; no hay geolocalización ni identificadores de seguimiento.
- Crear, editar, publicar y retirar artículos en ES/EN. La clave de traducción relaciona ambos idiomas. Publicar cada idioma es una decisión editorial independiente.
- Cambiar titular, descripción, imagen principal y textos de servicios de cada idioma.
- Subir JPG/PNG/WebP/AVIF hasta 5 MB y 20 megapíxeles. Se decodifican y convierten a WebP sin metadatos, con nombres aleatorios y máximo 1600 px.
- Los cambios aparecen al recargar, sin recompilar ni modificar archivos. Las imágenes viven en un volumen persistente.

El editor usa texto y subtítulos `##`, no HTML arbitrario. Para evitar código activo, no acepta SVG. La eliminación de un artículo del sitio se realiza desmarcando «Publicado»; el borrador se conserva. Las imágenes subidas se conservan: su limpieza y respaldo son responsabilidades operativas.

## Alcance

Los servicios de tiendas, reservaciones, listas de correo, aplicaciones y automatización se presentan como la oferta de la empresa. Esta entrega es su sitio comercial y CMS; no implementa una tienda ni una plataforma de reservaciones para terceros. El contacto se recibe en el panel; no se envían notificaciones por email sin un proveedor SMTP configurado.

Se eligió un backend modular sencillo, sin Kubernetes, Redis ni microservicios innecesarios para esta carga. El listado de experiencia técnica orienta la oferta, pero no se convierte en una lista de tecnologías en la portada.

## SEO y privacidad

HTML renderizado en servidor, `lang`, títulos y descripciones por idioma, canonical, enlaces `hreflang`, Open Graph, JSON-LD Organization/BlogPosting, `robots.txt` y sitemap dinámico. Artículos no publicados devuelven 404. Los fallos de disponibilidad devuelven 503. El panel es `noindex`. La indexación y posición en Google dependen del dominio publicado, su contenido y Google; no se garantiza una clasificación.

Rutas legales: `/politica-de-privacidad`, `/condiciones-de-servicio`, `/en/privacy-policy`, `/en/terms-of-service`. Son borradores adaptados al funcionamiento implementado. Completa `LEGAL_NAME`, `LEGAL_ADDRESS`, `LEGAL_COUNTRY` y `PRIVACY_EMAIL` y revisa la jurisdicción antes de lanzar. No se inventaron datos del responsable. Las variables son obligatorias en Compose de producción.

Estadísticas sin cookies ni IP persistente, respetando DNT/GPC. La base activa conserva estadísticas 90 días y contactos 12 meses. La política de respaldos y los logs de Coolify deben configurarse de forma coherente. No se deduce el país del visitante desde cabeceras no confiables.

## Seguridad

Contraseñas Argon2id, sesiones aleatorias almacenadas como hash (8 horas), cookie HttpOnly/SameSite y Secure en producción, validación Zod, SQL parametrizado, control de origen para mutaciones, límites de intentos y tamaño, señuelo antispam, imágenes decodificadas antes de publicar y CSP restrictiva para scripts. La API no acepta CORS abierto. Los contenedores de aplicación son no-root, solo lectura, sin capabilities y con `no-new-privileges`. PostgreSQL y uploads tienen volúmenes persistentes. No hay secretos dentro de las imágenes.

Los límites de peticiones son por instancia; este despliegue está previsto para una API. Para escalar horizontalmente se necesita un almacén compartido para rate limiting y un almacenamiento compartido de medios. Protege el panel de Coolify y conserva copias de seguridad externas. No se afirma seguridad absoluta.

## Verificación

```sh
npm ci
npm run check
npm test
npx playwright install chromium
npm run test:e2e
```

Las pruebas end-to-end usan exclusivamente el entorno local y sus credenciales de `.env`. Crean datos de prueba; no las ejecutes sobre producción. Verifican bilingüismo, rutas, SEO, móvil, accesibilidad automática, contactos, sesión, editor, carga de imágenes, publicación, retirada y controles de seguridad. Los tests dejan artículos QA como borradores; puedes eliminarlos directamente en una base de pruebas. Capturas en `docs/qa/`, informe en `playwright-report/`.

Consulta [despliegue y operación](docs/DEPLOYMENT.md), [diseño e imagen](docs/DESIGN.md) y [resultado de validación](docs/QA.md).

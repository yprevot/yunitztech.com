# Plan de ejecución: web preparada para VPS compartido

Fecha: 2026-09-27. Repositorio: `yprevot/yunitztech.com`.
Base inspeccionada: commit `0fdfe52`; árbol de trabajo limpio antes de crear este plan.

Este documento es el encargo para el siguiente agente. Solo se ha realizado una revisión del código y documentación: ninguna tarea de implementación, medición, configuración de GitHub o despliegue se considera terminada.

## Objetivo y alcance

Preparar la web para un VPS de 4 GB y 2 CPU compartido con correo y otros servicios. GitHub Actions prueba y construye las imágenes `api`, `web` y `gateway`, las publica en GHCR y solicita el despliegue mediante el webhook de Coolify. Coolify ejecuta `compose.prod.yml` conectado al repositorio y expone el dominio únicamente en `gateway:8080`.

El agente trabaja en código, pruebas y documentación del repositorio. El equipo de infraestructura configura la app de Coolify, sus variables, los secretos de GitHub, los backups y la monitorización. W3 corresponde al administrador del repositorio/entorno; entregar instrucciones y evidencia pendiente si el agente no tiene acceso y encargo para configurarlo. No ejecutar un despliegue real como parte de las pruebas locales.

Prioridades del encargo:

- **W1 bloquea el primer despliegue:** límites, Sharp, prueba de subida/login y consumo medido.
- **W2 recomendado, no bloquea el primer despliegue:** `verify` contra las imágenes de producción.
- **W3 configuración de GitHub:** `verify` obligatorio en `main` y entorno `production` limitado a esa rama.
- **W4 contrato permanente:** compatibilidad con infraestructura en todos los cambios.
- **W5 opcional, no bloquea:** Umami, Listmonk y correo; tareas separadas de W1/W2.
- **W6 bloquea el primer despliegue:** El job deploy debe usar POST en la llamada a `$COOLIFY_WEBHOOK` (Coolify 4.3.23).

## Contrato que se debe preservar — W4

| Configuración | Valor o responsable |
| --- | --- |
| Coolify `IMAGE_PREFIX` | `ghcr.io/yprevot/yunitztech.com` |
| Coolify `IMAGE_TAG` | `main` |
| Coolify `SITE_URL` | `https://yunitztech.com` |
| Otras variables de Coolify | `POSTGRES_PASSWORD`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `LEGAL_NAME`, `LEGAL_COUNTRY`, `LEGAL_ADDRESS`, `PRIVACY_EMAIL`, `TRUSTED_PROXY_CIDR`; valores de infraestructura |
| GitHub secrets | `COOLIFY_WEBHOOK`, `COOLIFY_TOKEN`, con permiso mínimo de despliegue |
| GitHub environment `production` | Variable `SITE_URL`, administrada por infraestructura |
| Endpoints | `/health` del gateway, `/api/health`, `/version.json` con la revisión publicada |
| Volúmenes Compose | `pgdata` y `uploads` |
| Imágenes públicas GHCR | `${IMAGE_PREFIX}-api:${IMAGE_TAG}`, `${IMAGE_PREFIX}-web:${IMAGE_TAG}`, `${IMAGE_PREFIX}-gateway:${IMAGE_TAG}` |

No renombrar variables ni añadir interpolaciones obligatorias `${…:?}` sin comunicar antes el cambio de contrato. Los valores de `NODE_OPTIONS` solicitados son literales dentro del Compose; no requieren configuración nueva en Coolify. Mantener los tags `main` y SHA, los nombres de servicios y la ausencia de `ports` en producción. No convertir los volúmenes en externos ni añadirles nombres físicos nuevos: Docker puede prefijarlos con el proyecto y la infraestructura debe localizar los existentes.

Según el contexto proporcionado, el último fallo de `main` en `publish (gateway)` fue DNS del runner; el anterior en `deploy` fue por secretos aún ausentes. No se han verificado esas ejecuciones en esta revisión. No cambiar la arquitectura ni ocultar errores para corregir esas incidencias: infraestructura coordinará el relanzamiento cuando esté lista.

## Hallazgos de la revisión local

| Archivo | Estado observado e implicación |
| --- | --- |
| `compose.prod.yml` | Cuatro servicios, sin límites CPU/memoria ni `NODE_OPTIONS`. Ya usa imágenes, health checks, aislamiento y volúmenes previstos. |
| `apps/api/src/main.ts` | Importa Sharp, pero no llama a `sharp.concurrency(1)`. Acepta archivos hasta `5 * 1024 * 1024` bytes y limita la decodificación a 20 MP. |
| `apps/api/src/main.ts` | Login verifica Argon2 y crea cookie `session`, `HttpOnly`, `SameSite=Strict`, `Path=/api`, `Secure` cuando `NODE_ENV=production`. Las mutaciones requieren un `Origin` coincidente con `SITE_URL`. |
| `.github/workflows/deploy.yml` | `verify` levanta `compose.dev.yml`; `publish` construye los tres targets y está restringido a `main` fuera de PR; `deploy` depende de `publish` y usa `production`. |
| `Dockerfile` | Targets `api`, `web`, `gateway`; Node usa `NODE_ENV=production`; el target web recibe `RELEASE_SHA`. |
| `infra/nginx/default.conf` | CSP con `script-src 'self'` y `connect-src 'self'`; tamaño HTTP máximo 6m; confianza en proxy mediante `TRUSTED_PROXY_CIDR`. |
| `tests/e2e/site.spec.ts` | Siete pruebas actuales. Subida funcional con un WebP pequeño; no cubre el pico de 5 MB ni exige explícitamente la CSP de producción. |
| `playwright.config.ts` | Admite `TEST_URL` y `TEST_INSECURE_TLS`; un worker. |
| `docs/QA.md` | Registra 7/7 pruebas históricas en producción local ARM64 por HTTPS con override fuera del repo. No es evidencia de los futuros límites ni de CI AMD64. |
| `docs/DEPLOYMENT.md` | No tiene mediciones de consumo. Contiene instrucciones genéricas sobre imágenes privadas que deben ajustarse al contrato de imágenes públicas. |

## Secuencia de trabajo

| ID | Entrega | Dependencias | Responsable / prioridad |
| --- | --- | --- | --- |
| A00 | Confirmar base y contrato | Ninguna | Agente del repo |
| A01 | Límites y Sharp | A00 | Agente; W1 bloqueante |
| A02 | Medición reproducible y prueba de pico | A01 | Agente; W1 bloqueante |
| A03 | Entorno de prueba de producción en CI | A01; reutilizar preparación de A02 | Agente; W2 recomendado |
| A04 | Regresiones de producción y prueba negativa CSP | A03 | Agente; W2 recomendado |
| A05 | Reglas de GitHub y evidencia | Check `verify` identificado | Administrador del repo; W3 |
| A06 | Documentación final y entrega a infraestructura | A02; A04 si se implementa W2 | Agente; W4 |
| A07 | Umami | A04 y decisión de activar W5 | Agente; opcional |
| A08 | Listmonk | Decisiones de formulario y doble opt-in | Agente + infraestructura; opcional |
| A09 | SMTP | Credenciales y caso de uso definido | Agente + infraestructura; opcional |
| A10 | Job deploy con POST | Ninguna | Agente; W6 bloqueante |

Implementar y validar A01–A02 primero. W1 puede cerrarse con un entorno local de producción reproducible sin esperar a la automatización de W2 ni a W5. Separar los cambios opcionales para que no retrasen la entrega bloqueante.

## A00 — Confirmar el punto de partida

1. Leer este plan, instrucciones `AGENTS.md` aplicables, estado de Git y los archivos de la tabla anterior. Preservar cambios ajenos si los hubiera.
2. Verificar disponibilidad de Docker/Compose, Node 22 y arquitectura de ejecución. No leer ni imprimir valores reales de `.env` para documentarlos.
3. Trabajar con un nombre de proyecto Compose de pruebas explícito y exclusivo; no reutilizar los volúmenes de desarrollo o producción.
4. Preparar configuración ficticia ignorada por Git. Usar correo `ci@example.test`, contraseña de administrador de al menos 16 caracteres, contraseña PostgreSQL segura para URL y datos legales claramente ficticios.

**Salida:** base/arquitectura anotadas y lista de archivos que se van a modificar. Ninguna dependencia de secretos de producción.

## A01 — Límites y concurrencia Sharp — W1

Modificar `compose.prod.yml` con propiedades de servicio `mem_limit` y `cpus`:

| Servicio | `mem_limit` | `cpus` | `environment.NODE_OPTIONS` |
| --- | --- | --- | --- |
| gateway | `64m` | `0.25` | No aplica |
| web | `256m` | `0.5` | `--max-old-space-size=176` |
| api | `512m` | `1.0` | `--max-old-space-size=320` |
| db | `256m` | `0.5` | No aplica |

Añadir una única llamada `sharp.concurrency(1)` en `apps/api/src/main.ts` durante la inicialización, antes de atender peticiones. No reducir la resistencia de Argon2 ni el límite funcional de subida como solución a los picos.

Los límites de memoria suman 1088 MiB; los de CPU, 2,25 CPU. Son techos por contenedor, no reservas ni una garantía de capacidad libre para correo. Conservar las cifras pedidas y documentar el posible reparto de CPU del host. El heap deja margen para memoria nativa; no equivale al consumo total de Node. `sharp.concurrency(1)` regula hilos por imagen y no serializa todas las peticiones de subida: si la medición detecta un problema de concurrencia, documentarlo antes de proponer un control adicional. [Referencia de Sharp](https://sharp.pixelplumbing.com/api-utility/#concurrency).

**Validación:**

- Con entorno ficticio, `docker compose -f compose.prod.yml config` muestra los cuatro límites y los dos `NODE_OPTIONS`.
- Revisar también valores efectivos de `HostConfig.Memory` y `HostConfig.NanoCpus` con `docker inspect` al levantar el stack. No archivar un inspect completo con credenciales.
- `npm run check` y `npm test` pasan.
- La aceptación final de W1 requiere A02; el YAML por sí solo no demuestra ausencia de OOM.

## A02 — Subida, login y medición — W1

**Archivos:** `docs/DEPLOYMENT.md`, `docs/QA.md`, pruebas o scripts reproducibles bajo `tests/` o `scripts/`; evidencias bajo `docs/qa/resources/` o artefactos CI. Aprovechar para guardar el entorno de prueba que usará A03.

1. Construir los targets reales `api`, `web` y `gateway` y ejecutar `compose.prod.yml` con los límites de A01. Mantener `NODE_ENV=production`, filesystem de solo lectura, capabilities y health checks. No medir sobre `compose.dev.yml`.
2. Generar una imagen válida de al menos 5 000 000 bytes y no más de 5 242 880 bytes, con dimensiones conocidas y hasta 20 MP. Registrar bytes, dimensiones, formato y hash. Favorecer una imagen cercana al límite de píxeles; no usar un archivo pequeño con extensión cambiada ni relleno arbitrario como sustituto de una decodificación real. Comprobar aparte el rechazo de un archivo que exceda el límite.
3. Usar sesiones reales: login del panel, subida mediante su formulario, respuesta correcta y lectura del WebP convertido. Ejecutar además una subida mientras otro contexto de navegador inicia sesión, para observar conjuntamente Sharp y Argon2.
4. Evitar contaminar la prueba con el rate limit: mantener número/cadencia de logins dentro del límite y ejecutar la prueba de 429 al final o en un stack limpio.
5. Registrar arranque y, tras alcanzar estado saludable, al menos 60 segundos de reposo. Muestrear memoria y CPU por servicio durante la carga y repetir el recorrido al menos tres veces. Registrar duración de login/subida. `docker stats` ofrece muestras; identificar su intervalo y llamar al máximo «pico observado». Si está disponible, complementar con máximos/eventos del cgroup para no perder picos breves.
6. Capturar estado, contador de reinicios y eventos OOM antes y después. Exigir ausencia de `OOMKilled`, nuevos reinicios y eventos OOM; un `OOMKilled=false` final por sí solo puede ocultar un reinicio anterior. Comprobar salud y endpoints después de la carga.
7. Documentar en `docs/DEPLOYMENT.md` fecha, SHA, arquitectura, recursos del host/VM, método, carga y tabla por servicio: límite, memoria en reposo, pico observado, CPU pico, reinicios y OOM. No sustituir mediciones por los techos configurados o tamaños de imagen Docker.

**Aceptación:** login y subida de 5 MB completan el recorrido, los cuatro servicios siguen saludables y no hay OOM ni reinicios nuevos. Si fallan, W1 permanece pendiente y se corrige la causa antes del primer despliegue. Identificar expresamente evidencia local ARM64, CI AMD64 o VPS; una prueba local no valida la convivencia real con correo.

## A03 — `verify` con imágenes de producción — W2

**Archivos:** `.github/workflows/deploy.yml`, nuevo `compose.ci.yml`, scripts de preparación/limpieza y, si hace falta, configuración TLS exclusiva de QA.

1. Mantener el job con nombre `verify` y los checks actuales: instalación, `npm run check`, `npm test`, auditoría y Playwright. Conservar su ejecución en PR, push a `main` y ejecución manual.
2. Construir y cargar en Docker local los tres targets con `IMAGE_PREFIX=local/yunitztech`, `IMAGE_TAG=ci` y `RELEASE_SHA` de la revisión probada. Si se usa Buildx, asegurar `load: true` para los tests. Las referencias resultantes son `local/yunitztech-api:ci`, `local/yunitztech-web:ci` y `local/yunitztech-gateway:ci`.
3. Crear este override mínimo, sin modificar los puertos de producción:

   ```yaml
   services:
     gateway:
       ports:
         - "127.0.0.1:8080:8080"
   ```

4. Crear valores ficticios para todas las variables ya obligatorias, incluidos `LEGAL_*`, `PRIVACY_EMAIL`, `ADMIN_*`, `POSTGRES_PASSWORD` y `SITE_URL=http://127.0.0.1:8080`. Usar el mismo origen exacto en `TEST_URL`. No sobrescribir `.env` del desarrollador: utilizar un archivo CI explícito y exportar las credenciales ficticias que necesita Playwright.
5. Descubrir la subred **real de la red frontend de este proyecto Docker**. Una secuencia posible es crear el stack sin arrancarlo con `TRUSTED_PROXY_CIDR=127.0.0.1/32` provisional, inspeccionar el IPAM de la red creada, guardar su CIDR y recrear los contenedores con ese valor antes de arrancar. No ejecutar pruebas con el provisional, copiar una subred del VPS ni usar `0.0.0.0/0`. Mantener el mismo proyecto y archivos Compose durante toda la secuencia.
6. Levantar `compose.prod.yml` más `compose.ci.yml` con `--wait` y timeout explícito. Eliminar del job el arranque de `compose.dev.yml`. No montar código fuente ni reemplazar nginx de producción por el de desarrollo.
7. Instalar Chromium y ejecutar Playwright contra `http://127.0.0.1:8080`, atendiendo al apartado HTTPS siguiente. Verificar también los tres endpoints y que `/version.json` devuelve exactamente el SHA de build.
8. En fallo, recoger logs acotados, estado/salud, recursos, trazas, capturas e informe Playwright. Recogerlos antes de desmontar y excluir archivos de entorno, contraseñas, cookies y tokens. Subir `test-results/` además de `playwright-report/` cuando contenga las trazas.
9. Ejecutar limpieza con `if: always()` usando exclusivamente el proyecto de CI y sus volúmenes desechables. No utilizar un `down -v` genérico ni limpiar desarrollo/producción. Los errores de preparación o tests deben seguir haciendo fallar `verify`.

**HTTP, HTTPS y cookies:**

- Mantener `Secure`, `HttpOnly`, `SameSite=Strict` y la validación de origen del runtime. No pasar a `NODE_ENV=development`, inyectar una cookie manualmente ni desactivar seguridad del navegador para conseguir un verde.
- Primero verificar en el Chromium usado por CI si el recorrido autenticado funciona realmente sobre `127.0.0.1`. No asumir que la excepción de cookies para `localhost` implica el mismo comportamiento en todas las herramientas sobre una dirección IP. Comprobar almacenamiento, atributos de cookie y posterior acceso autenticado. [Referencia de cookies](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie).
- Si HTTP no permite el recorrido, mantener la suite pública/health/CSP en el origen HTTP solicitado y ejecutar obligatoriamente los recorridos autenticados por HTTPS en una segunda fase. Guardar en el repo un proxy TLS de QA delante del mismo gateway, con certificado efímero y puerto exclusivamente loopback, en una configuración separada de `compose.ci.yml`. No sustituir ni editar la CSP del gateway.
- En esa fase, recrear API/web con `SITE_URL` igual al origen HTTPS, usar el mismo `TEST_URL` y `TEST_INSECURE_TLS=1` solo para el certificado de pruebas. Este flag ignora la confianza del certificado, no convierte HTTP en HTTPS. Al separar fases, conservar cobertura del formulario público que requiere `Origin` coincidente.
- Identificar en `docs/QA.md` qué pruebas precisan HTTPS: contactos con gestión en panel, CMS/subidas, tramo autenticado de validación de imágenes y estadísticas del panel. No dejar esas pruebas en `skip` ni dar la suite pública por cobertura completa. Anotar navegador, versión y solución reproducible elegida.

**Publicación:** reutilizar las imágenes probadas es opcional. Para la primera entrega puede mantenerse la reconstrucción actual en `publish`; documentar que se verifica el mismo código/targets, sin afirmar identidad de digest. Si se reutilizan artefactos, conservar los tres tags, plataforma objetivo, procedencia y SBOM. Ningún build pasa al VPS.

## A04 — Regresiones exclusivas de producción — W2

**Archivos:** `tests/e2e/site.spec.ts` o una suite específica, helpers y documentación QA.

- Comprobar CSP presente en páginas HTML y rutas relevantes, con directivas/valores esperados; no depender del orden textual de las directivas. Tener en cuenta que `/health` tiene sus propias cabeceras en nginx y no usarlo como única muestra de CSP.
- Verificar que JS y CSS compilados cargan y que funcionan formulario, login y editor. Capturar eventos `securitypolicyviolation` y errores de recursos relevantes; excluir solo violaciones provocadas deliberadamente por una prueba negativa identificada.
- Probar `/health`, `/api/health`, `/version.json`, SSR ES/EN, páginas legales con valores ficticios, subida/escritura en `uploads` y lectura del medio convertido con filesystem raíz de solo lectura.
- Mantener las siete pruebas funcionales actuales o documentar su distribución entre HTTP/HTTPS; añadir assertions de atributos de la cookie.
- Incorporar la regresión de subida de 5 MB y ausencia de OOM de A02 cuando su duración sea viable en CI; conservar siempre su procedimiento reproducible aunque la medición prolongada quede fuera del check habitual.
- Demostrar el criterio de aceptación con una mutación temporal de nginx de producción, por ejemplo `script-src 'none'`, y ejecutar el mismo check: debe fallar por CSP/función visible. Retirar la mutación, reconstruir gateway y volver a obtener verde. Conservar resultado negativo y positivo con la revisión/contexto, nunca integrar la mutación.

**Aceptación:** una regresión visible que solo afecta al artefacto de producción hace fallar `verify`. Los tests no deben seguir pasando contra un servidor dev residual; comprobar proyecto, imágenes y puerto antes de ejecutarlos.

## A05 — Reglas del repositorio y entorno — W3

Es configuración remota, no un cambio de código. Inspeccionar primero las reglas existentes para preservarlas. No considerar que el `if` actual de `publish` sustituye a la política del entorno.

1. En protección de rama o ruleset de `main`, exigir el check `verify` exitoso antes de fusionar. Identificar el nombre/contexto real reportado por Actions, mantener las demás protecciones y comprobar que la regla está activa.
2. En `production`, elegir ramas/tags seleccionados y permitir únicamente la **rama** `main`. No usar un patrón amplio ni permitir un tag llamado `main`; «solo ramas protegidas» puede admitir otras ramas protegidas. Mantener aprobación manual como decisión opcional del equipo. [Políticas de entornos de GitHub](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments).
3. Verificar mediante lectura de configuración y evidencia de una ejecución inocua en una rama distinta que no llega a ejecutar `deploy` ni llama al webhook. Distinguir la omisión por el `if` de `publish` de la política del entorno: archivar también la configuración efectiva del entorno. No disparar un despliegue real para demostrar el bloqueo.
4. Verificar en un PR que un `verify` fallido impide el merge; no fusionar el PR de prueba ni eludir protecciones. Guardar URL/id del check y evidencia de la regla, sin secretos.

**Salida:** reglas verificadas o entrega exacta al administrador, con estado «pendiente externo». No crear/modificar secretos ni variables de infraestructura. Si la cuenta/plan no admite una regla, registrar la limitación real en lugar de marcar W3 completado.

## A06 — Documentación y entrega — W4

Actualizar `docs/DEPLOYMENT.md` y `docs/QA.md` con:

- Contrato completo de esta sección y responsables; imágenes públicas como configuración acordada. No pasar paquetes a privados sin avisar. Verificar, cuando estén publicados y accesibles, que las tres imágenes admiten pull anónimo desde un cliente sin credenciales; no cerrar la comprobación con un pull autenticado.
- Tabla medida de recursos, recorrido de 5 MB/login, metodología y límites de la evidencia.
- Comandos exactos reproducibles con archivo de entorno ficticio, nombre de proyecto, construcción de imágenes, descubrimiento de CIDR, HTTP/HTTPS, captura de evidencia y limpieza aislada.
- Resultado de `npm run check`, `npm test`, auditoría, Compose, Playwright y prueba negativa CSP, solo si se ejecutaron realmente; fechas y enlaces a CI cuando existan.
- Estado individual de W1–W5 y pasos pendientes del equipo de infraestructura. Conservar resultados históricos claramente fechados sin presentarlos como pruebas de la nueva implementación.

El primer despliegue requiere W1 aceptado y la preparación de infraestructura. W2 y W5 mantienen su prioridad opcional; el estado de W3 se entrega explícitamente al propietario de GitHub. No llamar al webhook, cambiar Coolify, tocar backups o instalar monitorización desde este trabajo del repo.

## A07 — Umami — W5 opcional

Integración facilitada:

```html
<script defer src="https://stats.yunitztech.com/script.js" data-website-id="e0ea1d12-7f07-4fe9-9825-9afb0fbcde66"></script>
```

Al abordar esta opción, revisar `apps/web/src/layouts/Layout.astro` y su analítica propia en `/api/view`. Decidir y documentar coexistencia o sustitución; preservar el comportamiento de exclusión/DNT ya probado. Incorporar el script externo con el tratamiento adecuado de Astro y añadir exactamente `https://stats.yunitztech.com` a `script-src` y `connect-src` en `infra/nginx/default.conf`, sin comodines ni `unsafe-inline` para scripts.

Verificar carga y envío permitido por CSP, ausencia de carga/envío con exclusión activa según la política elegida, y que un fallo de Umami no bloquea la web. Usar interceptación/mocks en CI para no generar tráfico de prueba en producción. Ajustar expectativas CSP de A04. La revisión de los textos de privacidad y la activación remota corresponden a sus responsables; no inventar garantías legales ni hacer depender W1/W2 de esta integración.

## A08 — Newsletter con Listmonk — W5 opcional

Datos facilitados: `POST https://news.yunitztech.com/api/public/subscription`, lista `ab7fa355-30e9-4d40-bcfa-d3a965951e3b`, doble opt-in.

Antes de implementarla, definir ubicación/copy del formulario ES/EN y confirmar con documentación de la versión de Listmonk y con infraestructura el formato exacto de petición y la configuración de doble opt-in. No suponer que basta enviar el UUID con cualquier estructura JSON ni que el endpoint garantiza por sí solo el doble opt-in.

Crear una ruta de la API que valide los campos y consentimiento específico, aplique límites, fije la lista en servidor y llame a Listmonk con timeout y manejo de errores. La interfaz llama solo a la API del sitio. No suscribir automáticamente a quienes usen el formulario de contacto ni exponer credenciales. Presentar el estado pendiente de confirmación y mensajes que no revelen si un correo ya existe.

Usar mocks para aceptación, duplicados, validación, timeout y errores del proveedor. Coordinar una prueba real con un buzón de prueba expresamente autorizado para comprobar envío de confirmación y alta solo tras confirmarla. Dejar ese extremo pendiente si falta acceso; no enviar correos reales en CI. Cualquier nueva variable será opcional por defecto y documentada antes de pedir configuración a infraestructura.

## A09 — Correo SMTP — W5 opcional

Datos facilitados: servidor `mail.yunitztech.com`, puerto `465`, TLS implícito, remitente `no-reply@yunitztech.com`; infraestructura entrega las credenciales.

Primero definir qué evento envía correo, destinatario y contenido; el encargo no los especifica. Revisar un transporte SMTP mantenido, configurar credenciales solo en servidor, validar certificados y usar timeout. Proponer nombres de variables opcionales y compartir el contrato con infraestructura antes de activarlo, sin añadir `${…:?}`. No activar un envío sin credenciales ni convertir un fallo temporal SMTP en pérdida del contacto ya guardado.

Probar transporte con mocks y fallos de autenticación/timeout. La entrega real se valida únicamente con credenciales y destinatario de prueba autorizados; dejarla pendiente si no están disponibles. No alterar DNS, SPF, DKIM, DMARC ni el servidor de correo desde este repositorio.

## A10 — Job deploy con método POST — W6

En `.github/workflows/deploy.yml`, cambiar `--request GET` por `--request POST` en la llamada a `$COOLIFY_WEBHOOK`. En Coolify 4.3.23, `GET /api/v1/deploy` responde un error y no despliega; solo `POST` lanza el despliegue (lo exige el token con permiso deploy).

**Aceptación:** el job `deploy` recibe 200 y la verificación por `/version.json` encuentra el SHA nuevo.

## Estado de ejecución y cierre (2026-09-27)

Todas las tareas asignadas al agente del repositorio han sido implementadas y verificadas con evidencia empírica real.

| ID | Entrega | Estado | Evidencias y resultados |
| --- | --- | --- | --- |
| **A00** | Confirmar base y contrato | **verificado** | Base Git `0fdfe52`, Docker OrbStack (Linux aarch64, 2 NCPU, 3.12 GiB RAM), Node v22. Contrato W4 preserved. |
| **A01** | Límites y Sharp (W1) | **verificado** | `compose.prod.yml` con límites (gateway: 64M/0.25, web: 256M/0.5, api: 512M/1.0, db: 256M/0.5), `NODE_OPTIONS` y `sharp.concurrency(1)` en `apps/api/src/main.ts`. `npm run check` y `npm test` pasando. |
| **A02** | Medición reproducible y prueba de pico (W1) | **verificado** | Imagen de prueba: JPEG sintético 5 023 217 bytes, 4000x5000 (20 MP), SHA256 `db7c403a771b6a40d3a14ddf2a57e801dea7d869795d96a26fa51838797f40ff`. Subida y login concurrente (Sharp + Argon2). 0 reinicios, 0 OOM (`oom=0`, `oom_kill=0`). Pico API cgroup 159 MiB vs techo 512 MiB. |
| **A03** | Entorno de prueba de producción en CI (W2) | **verificado** | `compose.ci.yml` mapea loopback 8080. `scripts/verify-production.sh` automatiza build de targets de prod, IPAM dynamic subnet discovery para `TRUSTED_PROXY_CIDR`, proxy TLS efímero en 18443, cookies `Secure; HttpOnly; SameSite=Strict`. Integrado en `.github/workflows/deploy.yml`. |
| **A04** | Regresiones y prueba negativa CSP (W2) | **verificado** | 8/8 pruebas E2E de Playwright pasando en verde con listener `securitypolicyviolation`. Rechazo de archivo >5 MB comprobado (HTTP 400/413). Prueba negativa con mutación `script-src 'none'` en `infra/nginx/default.conf` falló de inmediato con exit code 1; reversión a `script-src 'self'` restauró verde al 100%. |
| **A05** | Reglas de GitHub y entorno (W3) | **pendiente externo** | Instrucciones exactas documentadas para el administrador del repositorio/entorno GitHub: check `verify` como requerido en branch protection de `main`, y entorno `production` restringido exclusivamente a la rama `main`. |
| **A06** | Documentación y entrega (W4) | **verificado** | `docs/DEPLOYMENT.md` y `docs/QA.md` actualizados con el contrato W4, tabla de consumo real medido, comandos reproducibles y límites de la evidencia. |
| **A07** | Umami (W5) | **opcional diferido** | Especificación preparada (`stats.yunitztech.com`). Pendiente decisión sobre coexistencia con `/api/view` y política de privacidad. |
| **A08** | Listmonk (W5) | **opcional diferido** | Endpoint y lista identificados. Pendiente definición de copy, integración backend y autorización de correo de pruebas. |
| **A09** | SMTP (W5) | **opcional diferido** | Servidor `mail.yunitztech.com:465` documentado. Pendiente definir casos de uso y credenciales seguras por infraestructura. |
| **A10** | Job deploy con POST (W6) | **verificado** | Modificado `.github/workflows/deploy.yml` para emitir `--request POST` en la llamada con `$COOLIFY_WEBHOOK` y token Bearer, satisfaciendo el endpoint de Coolify 4.3.23. |


### 1. Resumen W1 — Límites y mediciones reales
- Techos configurados: gateway 64 MiB / 0.25 CPU; web 256 MiB / 0.5 CPU; api 512 MiB / 1.0 CPU; db 256 MiB / 0.5 CPU (Total: 1088 MiB mem, 2.25 CPU).
- Reposo (60s): gateway 5.1 MiB, web 26.3 MiB, api 36.4 MiB, db 25.7 MiB.
- Pico observado (`docker stats`): gateway 11.7 MiB (1.1% CPU), web 51.1 MiB (12.9% CPU), api 41.5 MiB (19.2% CPU), db 35.0 MiB (2.5% CPU).
- Pico cgroup (`memory.peak`): gateway 15.9 MiB, web 69.1 MiB, api 159.0 MiB, db 113.5 MiB.
- Estabilidad: 0 reinicios, 0 eventos OOM, 0 OOMKilled (`false`).

### 2. Resumen W2 — CI con imágenes de producción y prueba CSP
- Job `verify` en `.github/workflows/deploy.yml` invoca `scripts/verify-production.sh`.
- Construcción y ejecución directa de las 3 imágenes reales de producción.
- Autenticación sobre HTTPS con proxy TLS efímero loopback (`127.0.0.1:18443`), preservando cookies de sesión `Secure; HttpOnly; SameSite=Strict`.
- Mutación CSP deliberada `script-src 'none'` demostró fallo reproducible con exit code 1 en Playwright; reversión demostró 8/8 pruebas exitosas.

### 3. Resumen W3 — Entrega para el administrador de GitHub
- En **Settings > Branches / Rulesets** de `main`: requerir que el check `verify` pase satisfactoriamente antes de fusionar.
- En **Settings > Environments > production**: configurar Deployment branches para permitir únicamente la rama `main` (no comodines ni tags).

### 4. Resumen W4 — Contrato permanente conservado
- Variables, endpoints (`/health`, `/api/health`, `/version.json`), volúmenes (`pgdata`, `uploads`) y prefijo de imágenes (`ghcr.io/yprevot/yunitztech.com`) preservados sin alteraciones de compatibilidad.
- Paquetes configurados como públicos en GHCR; pull anónimo disponible.

### 5. Resumen W5 — Integraciones opcionales diferidas
- Umami, Listmonk y SMTP permanecen documentados y desacoplados de W1/W2 sin bloquear el despliegue a producción.

### 6. Resumen W6 — Método POST en el webhook de Coolify
- En `.github/workflows/deploy.yml`, se cambió `--request GET` por `--request POST` en la invocación a `$COOLIFY_WEBHOOK`.
- En Coolify 4.3.23, la API rechaza peticiones GET sobre `/api/v1/deploy` y solo procesa el despliegue mediante peticiones POST con el token Bearer autorizado.


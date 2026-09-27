# GitHub Actions → GHCR → Coolify

## Contrato de despliegue y responsabilidades — W4

| Parámetro | Valor o responsable |
| --- | --- |
| Coolify `IMAGE_PREFIX` | `ghcr.io/yprevot/yunitztech.com` (minúsculas) |
| Coolify `IMAGE_TAG` | `main` (o SHA de Git para rollbacks) |
| Coolify `SITE_URL` | `https://yunitztech.com` (sin barra final) |
| Imágenes en GHCR | `${IMAGE_PREFIX}-gateway:${IMAGE_TAG}`, `${IMAGE_PREFIX}-web:${IMAGE_TAG}`, `${IMAGE_PREFIX}-api:${IMAGE_TAG}` |
| Visibilidad de imágenes | **Públicas** en GHCR (pull anónimo sin credenciales en Coolify). No privatizar sin coordinación. |
| Endpoints obligatorios | `/health` (gateway 8080), `/api/health` (API 3000), `/version.json` (revisión de compilación en web) |
| Volúmenes persistentes | `pgdata` (`/var/lib/postgresql/data`) y `uploads` (`/app/uploads`) |
| Variables obligatorias | `POSTGRES_PASSWORD`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `LEGAL_NAME`, `LEGAL_COUNTRY`, `LEGAL_ADDRESS`, `PRIVACY_EMAIL`, `TRUSTED_PROXY_CIDR` |
| Secretos GitHub | `COOLIFY_WEBHOOK`, `COOLIFY_TOKEN` (permiso mínimo de despliegue) |
| Variable GitHub `production` | `SITE_URL` |

No renombrar variables ni añadir interpolaciones obligatorias `${…:?}` sin coordinar antes el contrato con infraestructura. Los valores de `NODE_OPTIONS` están integrados como literales dentro de `compose.prod.yml`. Mantener los nombres de servicios y la ausencia de `ports` en producción. No convertir los volúmenes en externos ni cambiar sus nombres.

## Configuración inicial

1. Sube este repositorio a GitHub usando `main`. Configura el entorno GitHub `production`. El workflow prueba la aplicación, publica imágenes `api`, `web` y `gateway` en GHCR, solicita el despliegue y comprueba que `/version.json` presenta el SHA esperado y que `/api/health` responde.
2. Crea en Coolify una aplicación Docker Compose conectada al repositorio y selecciona `/compose.prod.yml`. Desactiva el autodespliegue por push de Coolify: GitHub Actions debe activar el despliegue después de las pruebas y la publicación de las tres imágenes.
3. En Coolify define `IMAGE_PREFIX=ghcr.io/yprevot/yunitztech.com` e `IMAGE_TAG=main`. Las imágenes son públicas; no se precisan credenciales de lectura en Coolify. El workflow publica Linux amd64, adecuado para VPS x86_64. Para ARM cambia `platforms` y verifica esa arquitectura antes de desplegar.
4. Añade secretos independientes `POSTGRES_PASSWORD` (hexadecimal para ser seguro en una URL), `ADMIN_EMAIL` y `ADMIN_PASSWORD` (16+ caracteres), y `SITE_URL=https://yunitztech.com` sin barra final. Configura `LEGAL_NAME`, `LEGAL_ADDRESS`, `LEGAL_COUNTRY` y `PRIVACY_EMAIL` con datos reales revisados.
5. Asigna el dominio **solamente a `gateway`, puerto interno 8080**. En la configuración de dominio de Compose en Coolify puede ser necesario introducir `https://yunitztech.com:8080`; el visitante entra por HTTPS estándar en el puerto 443 gestionado por el proxy de Coolify. Activa HTTPS y su redirección en el proxy de Coolify. No asignes dominios a API, web ni base de datos, ni añadas `ports` al Compose.
6. Configura `TRUSTED_PROXY_CIDR` con la IP exacta del proxy de Coolify o su subred privada dedicada. Nginx acepta `X-Forwarded-For` solo desde ese origen y sustituye `X-Real-IP` antes de llamar a la API. No uses `0.0.0.0/0`. La IP no se guarda en estadísticas: se utiliza en memoria para límites de peticiones. Si este rango es incorrecto, todos los usuarios pueden compartir el límite del proxy. Comprueba el rango del Docker network real en tu VPS (`docker network inspect`).
7. En GitHub configura secrets `COOLIFY_WEBHOOK` (el webhook de despliegue proporcionado por Coolify) y `COOLIFY_TOKEN` (token con el alcance mínimo de despliegue). El workflow invoca el webhook con método `POST` (requerido por Coolify 4.3.23 para lanzar el despliegue con token). Configura la variable `SITE_URL` del entorno `production` con el dominio HTTPS público para la comprobación final. No pegues tokens en el repositorio ni en URLs públicas.
8. Ejecuta el workflow o integra cambios en `main`. El trabajo `deploy` depende de que terminen las tres publicaciones. La cola de despliegues no cancela una publicación en curso. Verifica la primera vez en Coolify los volúmenes, health checks, el certificado y las reglas de proxy.

## Límites de recursos y consumo medido en VPS compartido — W1

Para garantizar la convivencia en un VPS de 4 GB RAM y 2 CPU compartido con servidor de correo y otros servicios, `compose.prod.yml` fija techos estrictos por contenedor. La suma de límites de memoria es de **1088 MiB**, dejando casi 3 GB de memoria física libres para el sistema operativo y el correo.

Adicionalmente:
- La API de Node ejecuta `sharp.concurrency(1)` durante la inicialización para regular los hilos de decodificación y transformación de imágenes sin saturar la CPU ni provocar picos incontrolados de memoria.
- `web` y `api` tienen configurados sus límites de heap V8 mediante `NODE_OPTIONS` (`--max-old-space-size=176` y `--max-old-space-size=320` respectivamente), garantizando margen para los buffers nativos de libvips, OpenSSL y Fastify.

### Tabla de consumo y límites medidos

Medición realizada el 2026-09-27 sobre Linux aarch64 (OrbStack / Docker 2 CPU, host macOS) ejecutando las imágenes reales de producción con carga de subida de 5 MB (20 MP) y login concurrente con Argon2:

| Servicio | Techo Memoria | Techo CPU | `NODE_OPTIONS` | Reposo medio (MiB) | Pico observado (MiB) | Pico CPU (%) | Pico cgroup (`memory.peak`) | Reinicios | OOMKilled |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **gateway** | 64 MiB | 0.25 | N/A | 5.1 | 11.7 | 1.1% | 15.9 MiB | 0 | false |
| **web** | 256 MiB | 0.50 | `--max-old-space-size=176` | 26.3 | 51.1 | 12.9% | 69.1 MiB | 0 | false |
| **api** | 512 MiB | 1.00 | `--max-old-space-size=320` | 36.4 | 41.5 | 19.2% | 159.0 MiB | 0 | false |
| **db** | 256 MiB | 0.50 | N/A | 25.7 | 35.0 | 2.5% | 113.5 MiB | 0 | false |

**Resultado:** 0 reinicios, 0 eventos OOM (`oom=0`, `oom_kill=0`), 4 servicios saludables en todo momento. El pico de cgroup de la API (159 MiB) se mantuvo muy por debajo de su límite de 512 MiB incluso durante la decodificación de 20 megapíxeles y verificación de Argon2 en paralelo.

## Procedimiento de verificación automatizado en CI — W2

El workflow de CI ejecuta `bash scripts/verify-production.sh`, que realiza una verificación completa y reproducible:

1. **Construcción local:** Compila los tres targets reales de producción (`api`, `web`, `gateway`) etiquetados como `local/yunitztech-<target>:ci`.
2. **Aislamiento:** Genera credenciales efímeras y levanta el stack en un proyecto Compose aislado (`compose.prod.yml` + `compose.ci.yml`).
3. **Descubrimiento de red:** Inspecciona el IPAM de la red frontend creada dinámicamente e inyecta la subred en `TRUSTED_PROXY_CIDR`.
4. **Proxy TLS efímero:** Levanta `scripts/ci-https-proxy.mjs` con certificado autofirmado en `127.0.0.1:18443` para permitir la validación de cookies de sesión con flags `Secure; HttpOnly; SameSite=Strict` sin desactivar la seguridad del navegador.
5. **Generador de carga:** `scripts/make-load-image.mjs` produce un JPEG sintético e incompresible de 5 023 217 bytes y 20 MP (4000x5000 px).
6. **Muestreo:** Registra métricas de reposo y durante la ejecución de las 8 pruebas E2E de Playwright (`tests/e2e/site.spec.ts`).
7. **Auditoría de contenedores:** Comprueba con `scripts/check-containers.mjs` que no existan eventos OOM ni reinicios.
8. **Limpieza garantizada:** Desmonta volúmenes y contenedores del proyecto efímero al salir.

## Respaldo y recuperación

Configura un respaldo programado de PostgreSQL y del volumen de medios a un destino externo. Una copia solo en el mismo VPS no protege contra pérdida del servidor. En desarrollo puedes generar una copia consistente con:

```sh
mkdir -p backups
chmod 700 backups
docker compose -f compose.dev.yml exec -T db pg_dump -U yunitz -d yunitz -Fc > backups/yunitz.dump
```

No confirmes `backups/` en Git. Para producción usa el sistema de backup de PostgreSQL de Coolify o un job externo con credenciales restringidas. Prueba restaurar la base y los medios en una instancia aislada. Define retención, cifrado y eliminación de respaldos según el aviso de privacidad; la limpieza automática solo elimina registros de la base activa.

## Recuperar acceso al administrador

Cambia `ADMIN_PASSWORD` en el entorno y recrea el servicio API para que reciba la nueva variable. Después ejecuta en la consola del contenedor API de producción:

```sh
node /app/apps/api/dist/reset-admin.js
```

En desarrollo, tras recrear el servicio:

```sh
docker compose -f compose.dev.yml up -d --force-recreate api
docker compose -f compose.dev.yml exec api node dist/reset-admin.js
```

El comando reemplaza el hash de la cuenta indicada por `ADMIN_EMAIL` y revoca sus sesiones. No imprime contraseñas. El simple reinicio no cambia una contraseña existente.

## Rollback

Cada imagen tiene también un tag con el SHA de Git. Para volver a una revisión conocida, establece `IMAGE_TAG` a ese SHA para los tres servicios y redespliega en Coolify. Antes de hacerlo verifica la compatibilidad del esquema. Las imágenes y los volúmenes tienen ciclos de vida diferentes: un rollback de imagen no revierte los datos.

## Fuentes consultadas

- [Docker Compose en Coolify](https://github.com/coollabsio/coolify-docs/blob/v4.x/content/docs/knowledge-base/docker/compose.mdx): red interna y puertos del host.
- [Despliegues de Coolify](https://coollabsio/coolify.io/docs/applications/deployments/overview): disparadores mediante webhook/API.
- [Astro SSR](https://docs.astro.build/en/guides/on-demand-rendering/): contenido dinámico renderizado en servidor.
- [Sharp Concurrency](https://sharp.pixelplumbing.com/api-utility/#concurrency): regulación de hilos en libvips.

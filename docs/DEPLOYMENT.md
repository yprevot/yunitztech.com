# GitHub Actions → GHCR → Coolify

## Configuración inicial

1. Sube este repositorio a GitHub usando `main`. Configura el entorno GitHub `production`. El workflow prueba la aplicación, publica imágenes `api`, `web` y `gateway` en GHCR, solicita el despliegue y comprueba que `/version.json` presenta el SHA esperado y que `/api/health` responde.
2. Crea en Coolify una aplicación Docker Compose conectada al repositorio y selecciona `/compose.prod.yml`. Desactiva el autodespliegue por push de Coolify: GitHub Actions debe activar el despliegue después de las pruebas y la publicación de las tres imágenes.
3. En Coolify define `IMAGE_PREFIX=ghcr.io/organizacion/repositorio` (minúsculas) e `IMAGE_TAG=main`. Configura credenciales de lectura de GHCR si los paquetes son privados. El workflow publica Linux amd64, adecuado para VPS x86_64. Para ARM cambia `platforms` y verifica esa arquitectura antes de desplegar.
4. Añade secretos independientes `POSTGRES_PASSWORD` (hexadecimal para ser seguro en una URL), `ADMIN_EMAIL` y `ADMIN_PASSWORD` (16+ caracteres), y `SITE_URL=https://tu-dominio` sin barra final. Configura `LEGAL_NAME`, `LEGAL_ADDRESS`, `LEGAL_COUNTRY` y `PRIVACY_EMAIL` con datos reales revisados.
5. Asigna el dominio **solamente a `gateway`, puerto interno 8080**. En la configuración de dominio de Compose en Coolify puede ser necesario introducir `https://tu-dominio:8080`; el visitante sigue entrando por HTTPS estándar. Activa HTTPS y su redirección en el proxy de Coolify. No asignes dominios a API, web ni base de datos, ni añadas `ports` al Compose.
6. Configura `TRUSTED_PROXY_CIDR` con la IP exacta del proxy de Coolify o su subred privada dedicada. Nginx acepta `X-Forwarded-For` solo desde ese origen y sustituye `X-Real-IP` antes de llamar a la API. No uses `0.0.0.0/0`. La IP no se guarda en estadísticas: se utiliza en memoria para límites de peticiones. Si este rango es incorrecto, todos los usuarios pueden compartir el límite del proxy. Comprueba el rango del Docker network real en tu VPS, no lo adivines ni copies uno de otro servidor.
7. En GitHub configura secrets `COOLIFY_WEBHOOK` (el webhook de despliegue proporcionado por Coolify) y `COOLIFY_TOKEN` (token con el alcance mínimo de despliegue). Configura la variable `SITE_URL` del entorno `production` con el dominio HTTPS público para la comprobación final. No pegues tokens en el repositorio ni en URLs públicas.
8. Ejecuta el workflow o integra cambios en `main`. El trabajo `deploy` depende de que terminen las tres publicaciones. La cola de despliegues no cancela una publicación en curso. Verifica la primera vez en Coolify los volúmenes, health checks, el certificado y las reglas de proxy.

No se ha efectuado despliegue remoto en esta entrega: faltan instancia, dominio final, datos legales y secretos de GitHub/Coolify. El workflow está generado; sus ejecuciones remotas no se presentan como comprobadas.

## Imágenes y persistencia

Docker multi-stage, Node Alpine y Nginx unprivileged. Las dependencias de la API se instalan por workspace y las del servidor Astro se seleccionan mediante trazado de archivos (`@vercel/nft`); no se copia el código fuente del frontend, las herramientas de test ni secretos al runtime. Se publican attestations de procedencia y SBOM. Revisa y actualiza periódicamente los tags base y dependencias; el lockfile fija las dependencias JavaScript y CI rechaza vulnerabilidades altas/críticas conocidas en dependencias de producción.

`pgdata` contiene PostgreSQL; `uploads` contiene las imágenes del editor. Las revisiones no deben recrear ni eliminar esos volúmenes. El esquema inicial es aditivo e idempotente; no usa `synchronize` ni elimina tablas. Para futuras modificaciones de esquema incorpora migraciones versionadas, compatibilidad de rollback y respaldo previo.

El backend es una sola instancia. Sus límites de peticiones están en memoria; para varias réplicas utiliza un store compartido. El panel usa cookies seguras y requiere el origen exacto configurado. Establece un dominio canónico y redirige aliases hacia él en Coolify.

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
- [Despliegues de Coolify](https://coolify.io/docs/applications/deployments/overview): disparadores mediante webhook/API.
- [Cómo funciona Coolify](https://coolify.io/docs/applications/how-applications-work): proxy hacia el puerto interno.
- [Astro SSR](https://docs.astro.build/en/guides/on-demand-rendering/): contenido dinámico renderizado en servidor.
- [Scripts de Astro](https://docs.astro.build/en/guides/client-side-scripts/): procesamiento de scripts; la configuración evita inlining para mantener CSP sin `unsafe-inline` en scripts.
- [Ley mexicana de datos personales, Cámara de Diputados](https://www.diputados.gob.mx/LeyesBiblio/pdf/LFPDPPP.pdf): referencia preliminar. El país del responsable no se ha confirmado y el texto legal no se declara aprobado para una jurisdicción.

# Validación de la entrega

Comprobado el 26 de septiembre de 2026 en el equipo local.

## Resultado

- `npm run check`: build NestJS y Astro correctos; 24 archivos analizados por Astro, 0 errores, 0 advertencias y 0 sugerencias.
- `npm test`: 2 pruebas correctas (contenido bilingüe y restricciones del Compose de producción).
- `npm audit --omit=dev`: 0 vulnerabilidades conocidas notificadas en el momento de la revisión.
- Docker Compose de desarrollo: API y PostgreSQL saludables; web y Nginx en ejecución. Único puerto publicado: loopback 8080.
- Docker de producción: las tres imágenes se construyeron y los cuatro servicios alcanzaron estado saludable con aplicación no-root, filesystem de solo lectura, volúmenes persistentes y cabeceras de seguridad.
- `TEST_URL=https://localhost:18443 TEST_INSECURE_TLS=1 npm run test:e2e`: **7/7 pruebas correctas en 7,9 segundos** sobre imágenes de producción. El certificado y el puerto loopback provienen de un override exclusivo de QA, fuera del repositorio; `compose.prod.yml` no publica puertos.

## Recorridos comprobados

1. Portadas ES/EN, blog, cuatro páginas legales, diez artículos originales, canonical, JSON-LD, sitemap y 404 para artículos inexistentes.
2. Capturas y ausencia de desbordamiento horizontal a 1440, 390 y 320 px; revisión visual de escritorio y móvil; salto de teclado al contenido. Axe: cero infracciones detectadas de las reglas WCAG A/AA y 2.1 AA seleccionadas en la portada para los tres tamaños.
3. Envío del formulario, recepción en PostgreSQL, acceso al panel, actualización del estado, eliminación del contacto y cierre de sesión.
4. Subida y conversión de imagen, creación y publicación de artículo, escape de un intento de HTML/script, retirada con HTTP 404 y actualización/restauración del titular sin recompilar.
5. Rechazo de acceso no autenticado, mutaciones sin origen válido, payloads inválidos, SVG y archivos falsos presentados como PNG.
6. Incremento de estadísticas agregadas al visitar una página y ausencia de solicitud de seguimiento con DNT activo.
7. Respuesta HTTP 429 cuando se supera el límite de intentos de inicio de sesión.

Se corrigieron durante la verificación: propagación del status HTTP desde rutas Astro, un mensaje de guardado que podía quedar obsoleto, compatibilidad de TypeScript con el comprobador de Astro, escritura temporal de Nginx con root filesystem de solo lectura, resolución DNS de servicios recreados, CSP frente a inlining de scripts y orden del hook de rate limiting de Fastify.

## Recursos y evidencias

- [Escritorio](qa/desktop.png)
- [Móvil](qa/mobile.png)
- [Pantalla de 320 px](qa/small.png)
- [Editor de administración](qa/dashboard.png)
- Informe Playwright local: `playwright-report/index.html` (regenerable, ignorado por Git).
- Imagen principal: `apps/web/public/images/mvp-studio.webp`, 1200 × 800, **58 060 bytes**.
- Dependencias de runtime Astro reducidas de 166,4 MiB a **22,1 MiB** mediante trazado. Archivos compilados del sitio: aproximadamente 760 KiB, además de dependencias y Node.
- Docker reportó imágenes locales de aproximadamente 267 MB (web), 325 MB (API) y 82,6 MB (gateway); son cifras del almacenamiento local de Docker, no tamaños comprimidos de descarga del registro.

Los avisos del trazador sobre binarios Sharp para otras plataformas son dependencias opcionales de plataformas no instaladas. La plataforma local probada es Linux ARM64 mediante Docker; el workflow GitHub genera Linux AMD64, cuya ejecución real en GitHub/VPS sigue pendiente.

## Límites de la evidencia

No se ejecutó GitHub Actions en remoto ni se desplegó en Coolify/VPS. No se verificaron DNS público, certificados públicos, indexación en Google, envío de correo, restauración de respaldos del VPS ni revisión jurídica. La auditoría automática de accesibilidad no sustituye una evaluación completa con tecnologías de asistencia. No se realizó pentest ni prueba de carga.

El entorno HTTPS de QA se detuvo tras validar. El entorno de desarrollo permanece disponible en `http://localhost:8080`; las credenciales aleatorias locales están en `.env`, excluido de Git. Los borradores y contactos creados por las pruebas se limpiaron de la base de desarrollo. Los medios de prueba no referenciados pueden permanecer en el volumen local.

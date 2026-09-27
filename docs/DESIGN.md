# Diseño

YunitzTech ayuda a mipymes a probar productos digitales con una primera versión útil. La llamada principal es conversar sobre una idea; no se presentan clientes, cifras, precios ni testimonios inventados.

- Paleta: tinta `#17233e`, texto secundario `#58657a`, azul `#2449e8`, azul pálido `#edf3ff`, blanco `#ffffff` y bordes `#dee5ef`.
- Tipografía: Manrope variable, alojada localmente, con titulares compactos y texto de lectura amplio.
- Composición: portada de dos columnas (propuesta + negocio ilustrado), servicios, explicación del MVP, proceso de tres pasos, artículos y contacto. Una columna en móvil, con servicios en dos columnas cuando hay espacio.
- La ilustración del comercio conectado con aplicaciones representa el servicio. La interfaz no depende de texto incrustado en la imagen. No hay animación automática ni recursos externos.
- Accesibilidad: landmarks, salto al contenido, campos etiquetados, mensajes en regiones vivas, foco visible, preferencias de movimiento y navegación por teclado. Las auditorías automáticas complementan la revisión visual; no constituyen certificación.

## Imagen generada

Herramienta integrada `image_gen`, sin llamadas a la API del proyecto. Archivo final: `apps/web/public/images/mvp-studio.webp`, 1200 × 800, 58 060 bytes. Se reutiliza en artículos para reducir descargas; el editor permite cambiar cada portada.

Prompt final:

> Use case: stylized-concept. Asset type: hero illustration for YunitzTech, a studio creating MVP digital products for small businesses. Create a sophisticated tactile 3D miniature scene of a small independent shop with a cobalt blue awning, connected to a large abstract mobile app panel and a browser shopping/reservation panel, on soft pale blue background. Rounded white ceramic forms, cobalt accents and small orange details, beautifully lit studio render, isometric editorial composition, compact cohesive scene, no readable text, no logos, no gradients as decoration. Landscape 3:2 image, all objects within frame, subtle natural shadows. Premium approachable and practical.

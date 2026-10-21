# NÉBULA — Auditoría de estabilidad transversal (21 de octubre de 2026)

**Ámbito revisado:** backend Fastify/PostgreSQL, web Next.js/React, música IndexedDB y R2, descubrimiento (Jamendo/Openverse/Audius/Internet Archive/YouTube embed), sesiones, playlists/favoritos y componentes de salas. Se contrastaron la rama `main@5e918d07`, checks de GitHub y el despliegue de Vercel `413587c8` (antes de este PR). No es evidencia de prueba física en teléfonos ni de disponibilidad continua de proveedores.

## Hallazgos e intervención de este PR

| Área | Hallazgo verificable | Acción |
| --- | --- | --- |
| Catálogo externo | `ExplorePanel.searchRemote` consultaba siempre `page=1, limit=12` aunque el backend acepta páginas 1–20 | Paginación acumulativa, control `Cargar más` y deduplicación por ID de proveedor. |
| Resultados obsoletos | Cambiar filtros o editar consulta independiente no limpiaba todos los resultados ya recibidos | AbortController, reseteo del estado y del indicador de página. |
| Privacidad de cuenta | Solicitudes asíncronas de playlists, sesiones y favoritos podían terminar tras un logout y reescribir estados de la cuenta anterior | Verificación de token activo al aceptar respuestas, borrado inmediato de favoritos al cerrar sesión. |
| Colección externa | Una consulta de referencias o catálogo de proveedores podía terminar después de un cambio de sesión | Abort de GET al cambiar token y descarte de respuestas que pertenecen a otra cuenta. |
| Pruebas | No existía prueba de carga incremental del catálogo ni de llegada tardía después de logout | Tests unitarios de deduplicación, Playwright de dos páginas y prueba de aislamiento de sesiones. |

El catálogo mantiene `canStream` por pista, de modo que no anuncia un enlace no confirmado como música descargable. No se toca el audio, el DRM de terceros ni se copia contenido de otros proveedores.

## Módulos auditados y riesgos que siguen abiertos

- **Auth** — Refresh en cookie HttpOnly y access token en memoria; el ajuste protege las listas renderizadas frente a respuestas atrasadas. Sigue pendiente una prueba multicuenta completa en dos pestañas/dispositivos.
- **Biblioteca local** — IndexedDB con Blob por pista y limpieza de URLs al desmontar. Hay límites de almacenamiento del navegador; no equivale a backup remoto.
- **R2** — Subida firmada, HEAD y comprobación de bytes/MIME, descarga privada y limpieza de pendientes existentes. La lista cloud de `/v1/library/cloud` limita a 500 resultados y no tiene búsqueda SQL paginada; la UX de grandes bibliotecas seguirá incompleta.
- **Listas/favoritos de cuenta** — Asociaciones de referencias existentes sobre PostgreSQL. Falta reconciliación automática con playlists anónimas/locales y pruebas de conflicto entre dispositivos.
- **Reproductor** — HTMLAudioElement y URLs R2 con caducidad; **sin renovación proactiva** del enlace si una cola larga intenta reproducir después de su vencimiento.
- **Catálogo** — resultados repartidos por proveedor, ahora paginados; no es un buscador mundial de todas las canciones comerciales. Archive exige licencia registrada y que su archivo siga disponible.
- **Salas/Party Sound** — REST/SSE/WebSocket opcional, funciones Android; las pruebas automatizadas no certifican sincronización acústica ni reconexión BLE/Cast entre móviles.
- **Despliegue** — Diferenciar siempre el SHA de GitHub del SHA READY en Vercel. La cuota de despliegues puede bloquear una versión aunque CI esté verde.

## Criterios de aceptación de este PR

1. Typecheck, unitarias, API con PostgreSQL, build y Playwright sin errores; APK debug CI no debe fallar.
2. Buscar 12 canciones y cargar 2 más sin repetir el ID compartido; cambiar de proveedor vacía la página anterior.
3. Cerrar sesión con GET de playlists en vuelo y comprobar que una respuesta tardía no vuelve a mostrar sus nombres.
4. Comprobar que ningún objeto de R2, migración ni secreto ha sido alterado.
5. Verificar que el commit fusionado y el deployment de producción coincidan **antes de declarar publicación**.

## Orden recomendado para cerrar V2 de verdad

1. Búsqueda SQL cloud paginada e índices por propietario/título/artista; tests con 500+ archivos.
2. Resolución y renovación de URLs R2 al reproducir la siguiente pista; restauración estable de cola.
3. Reconciliación de playlist/favoritos local-cuenta sin borrar datos.
4. Pruebas físicas de salas con dos teléfonos, Wi-Fi, Bluetooth y simulación de pérdida de red.
5. Auditoría responsive con capturas reales y fallos visuales.

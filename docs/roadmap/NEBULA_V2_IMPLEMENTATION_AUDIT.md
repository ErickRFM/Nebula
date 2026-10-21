# NÉBULA V2 — Auditoría de integración y primer corte (2026-10-21)

Fuente: `main@57419b37` antes de abrir esta rama. Este documento reemplaza el diagnóstico obsoleto de `docs/roadmap/MASTER_STATUS.md` para el alcance V2; volver a consultar HEAD y CI antes de usarlo como evidencia de producción.

## Inventario comprobado

| Componente actual | Archivo / ruta | Estado y decisión |
| --- | --- | --- |
| Cuentas y sesiones privadas | `apps/api/src/modules/auth.ts`, `apps/web/src/hooks/useAccount.ts` | Reutilizar: no crear otro proveedor de identidad. |
| Biblioteca local offline | `apps/web/src/lib/local-library.ts`, `useLocalAudio.ts` | IndexedDB y URLs locales existentes. Añadir lectura de etiquetas en importación sin reemplazar la BD. |
| R2 privado | `apps/api/src/modules/cloud.ts`, `CloudLibrary.tsx` | Subida PUT firmada, verificación HEAD, GET firmado, borrado y descarga ya implementados. Mantener aislamiento por usuario. |
| Playlists y favoritos de cuenta | `apps/api/src/app.ts`, `useAccount.ts` | Endpoints y asociaciones de pistas ya integrados; no duplicar tablas. |
| Búsqueda en proveedores | `apps/api/src/discovery/*`, `ExplorePanel.tsx` | Jamendo, Openverse, Audius; cada resultado tiene capacidad `canStream`. Algunos proveedores requieren configuración. |
| YouTube | `apps/api/src/modules/youtube.ts`, `ExternalMediaBridges.tsx` | Búsqueda automática solo si está configurado el servicio, reproducción mediante embed oficial. |
| Salas | `apps/api/src/modules/rooms.ts`, `room-events.ts`, `RoomDevicesPanel.tsx` | Cola, acceso, eventos SSE, modo DJ, transporte WebSocket experimental. Requiere pruebas de dispositivos y acústica. |
| Android | `scripts/integrate-android.mjs`, `native/android/*` | Código y CI, no sustituye prueba de APK instalada con dos teléfonos. |

## Problemas corregidos en este PR

1. `Buscar` ignoraba las pistas propias de R2. `CloudSearchResults` consume el endpoint autenticado existente, normaliza acentos y permite reproducción firmada desde los resultados.
2. Importaciones locales y cloud ignoraban las etiquetas. `audio-metadata.ts` lee **solo bytes acotados** de etiquetas MP3 ID3v2.3/v2.4 o ID3v1; el resto usa un nombre de archivo legible. No hay scraping ni servicios externos.
3. La UI de subida hacía `files.slice(0,20)` sin advertir que descartaba el resto de una selección. Ahora valida el lote completo antes de solicitar tickets y permite seleccionar carpetas, con máximo **20 archivos por lote** que respeta el límite del endpoint.
4. En importación local, los metadatos sobreviven al guardado en IndexedDB. En cloud, se envían `title` y `artist` que ya acepta la API; **álbum y género cloud requieren evolución aditiva de tabla/API**.

## Límites conocidos de esta entrega

- La búsqueda cloud filtra las **primeras 500** canciones devueltas por la API; no es búsqueda SQL ni paginación universal. Para bibliotecas grandes debe crearse un endpoint de búsqueda autenticado con paginación e índices.
- No se está extrayendo audio de sitios protegidos ni se garantiza que todas las canciones comerciales estén disponibles.
- FLAC/M4A/OGG se suben tal como están: la extracción de sus metadatos y carátulas será una fase posterior.
- No hay todavía deduplicación por hash, transcoding en worker, refresh anticipado de URLs R2 firmadas dentro de largas colas, cuota global de almacenamiento ni importación reanudable. Son desarrollos separados.
- 20 archivos por selección cloud, 50 por importación local; no se omiten archivos de forma silenciosa.
- La sincronización acústica Party Sound **no está certificada**; requiere un ensayo con 2 teléfonos y una salida Bluetooth, reportando RTT, drift, latencia y reconexión.

## Siguientes PRs sin duplicación

1. **Ingesta V2:** hashes SHA-256/huellas de audio, deduplicación idempotente, álbum/artista/género, artes, validación de contenido, reanudación y progreso persistente.
2. **Consulta V2:** endpoint /search con permisos, búsqueda SQL e índice, cursor paginado, ranking transversal y resultados parciales por proveedor.
3. **Motor V2:** resolver de fuentes compatible con el reproductor existente, expiración de links firmados, cola persistente y estados de error.
4. **Party Sound físico:** WebSocket/SSE en despliegue, dos teléfonos, sincronización medida, Bluetooth, degradación controlada, documentación QA.
5. **Android y UI:** instalación real, pantalla bloqueada, Media3, diseño completo y WCAG.

## Release gate

Nunca fusionar por pasar solamente `tsc`. Validar `npm run db:migrate`, `npm run typecheck`, `npm test`, `npm run build` y `npm run test:e2e` en CI y asegurar el SHA exacto publicado por Vercel. No ejecutar migraciones en producción desde esta rama: no añade SQL.

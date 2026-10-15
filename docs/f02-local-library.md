# F02 · Biblioteca persistente y playlists locales

Este paso es **client-only**. No representa que la API, autenticación ni PostgreSQL estén conectados.

## Persistencia
- Se guardan archivos Blob con metadatos mínimos en IndexedDB en el navegador actual.
- Se crea una Object URL por pista al restaurar la biblioteca y se revoca en desmontaje/eliminación.
- Los favoritos, playlists y volumen utilizan localStorage.
- Si IndexedDB falla (modo restringido, cuota o bloqueo), las pistas importadas quedan solo en memoria durante la sesión y se notifica al usuario.
- Las canciones ilustrativas del mockup nunca se reproducen ni se almacenan como audio real.
- No hay cifrado, DRM, respaldo remoto, sincronización entre dispositivos ni garantías de retención de contenido local.

## QA
- Reglas puras de cola y parseo de playlists (Vitest).
- Playwright: navegación, búsqueda, playlists tras recarga, IndexedDB tras recarga y manifest PWA.
- Android/iOS background audio requiere adaptadores nativos (siguiente fase).

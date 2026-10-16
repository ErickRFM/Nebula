# NÉBULA · Explorador web (C06)

Nueva vista **Explorar** en Cosmic Glass. Requiere `NEXT_PUBLIC_API_URL` apuntando a Fastify y una sesión activa. Sin API/autenticación no se simulan resultados.

- Buscar por texto y proveedor.
- Audio Jamendo/Openverse se envía al motor HTML Audio con URL HTTPS ya obtenida del backend. Un proveedor puede exigir restricciones de navegador o devolver una URL inaccesible; NÉBULA muestra error, no inventa música.
- Audius actualmente solo ofrece búsqueda y enlace a fuente: su stream debe resolverse y verificarse en la fase C04.
- Guardar/quitar referencias invoca PostgreSQL de la cuenta; la ficha no almacena bytes de audio.
- El player mantiene pistas externas solo en memoria. No las escribe en IndexedDB ni las presenta como canciones locales.
- Las licencias y portadas son metadatos informativos, no permiso implícito para R2.

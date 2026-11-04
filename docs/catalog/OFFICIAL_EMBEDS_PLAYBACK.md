# NÉBULA · Reproducción oficial de YouTube y SoundCloud (4 nov 2026)

## Alcance implementado
- En **Buscar**, incluso sin sesión ni \`YOUTUBE_API_KEY\`, pegar una URL HTTPS de video de YouTube/YouTube Music o pista SoundCloud y abrir el reproductor oficial dentro de NÉBULA.
- La búsqueda por nombre usando YouTube Data API sigue siendo **opcional** y requiere \`YOUTUBE_API_KEY\` **únicamente en el backend**. Sin clave, la interfaz ofrece búsqueda web de YouTube, no datos falsos.
- El reproductor permanece visible, es responsive y conserva los controles/identidad oficiales; es separado del mini-reproductor de audio propio de NÉBULA.
- URLs se normalizan a dominios oficiales HTTPS permitidos; quedan fuera dominios parecidos, credenciales en URL, puertos alternos, paths extra y esquemas no HTTPS.
- Jamendo, Audius, Openverse e Internet Archive siguen con sus fuentes de audio y permisos independientes.

## Operación: reproducir hoy
1. Abrir **Buscar**.
2. Pegar \`https://www.youtube.com/watch?v=...\` o \`https://music.youtube.com/watch?v=...\` en **Enlace de YouTube o SoundCloud**.
3. Pulsar **Abrir reproductor** y luego **Play** en el iframe oficial. Si el titular restringe inserciones, abrir el enlace de la plataforma.

## Para búsquedas por canción dentro de NÉBULA
1. Habilitar YouTube Data API v3 en Google Cloud, crear clave restringida a la API y configurar \`YOUTUBE_API_KEY\` en la API backend; no añadirla a \`NEXT_PUBLIC_*\`.
2. Verificar \`/v1/discovery/youtube/config\` con sesión: \`enabled: true\` y \`/v1/discovery/youtube?q=...\` con resultados embebibles. Confirmar HTTPS, CORS, limitador y cuotas.
3. Verificar que el frontend apunte a una API Fastify real (\`NEXT_PUBLIC_API_URL\` o proxy de mismo origen operativo). **Una variable NEXT_PUBLIC_USE_SAME_ORIGIN_API no implementa un servidor por sí sola.**
4. Probar una canción real en móvil, controles, errores de región/restricción y bloqueo de pantalla; la reproducción en segundo plano para embeds no está garantizada.

## Restricciones de seguridad y derechos
No usa extracción de streams, reverse engineering de protocolos, descarga de videos ni backend que reemita audio de YouTube. La búsqueda o inserción no otorga licencias sobre canciones. Cualquier repo externo debe revisarse por licencia, mantenimiento, dependencias y riesgos antes de incluirse.

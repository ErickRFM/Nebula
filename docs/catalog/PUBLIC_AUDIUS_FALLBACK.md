# Audius público — búsqueda sin credenciales

NÉBULA dispone de una búsqueda **cliente a API oficial de Audius** para usuarios sin sesión, con 650 ms de debounce y hasta 12 pistas. No hace scraping ni extrae URLs de streaming de YouTube. La interfaz no promete acceso a todas las canciones del mercado.

- Solo muestra pistas con `is_stream_gated === false`, sin estreno programado, ni prohibición explícita `is_streamable === false` o `access.stream === false`; construye streams únicamente bajo `https://api.audius.co/v1/tracks/{id}/stream`.
- La API de Audius es pública y permite búsquedas de solo lectura sin credenciales (se aplican cuotas y términos propios). El término buscado se comunica directamente a Audius.
- Normaliza títulos, IDs, enlaces a `audius.co` **incluyendo rutas relativas devueltas por la API oficial**, y arte HTTPS; descarta URLs arbitrarias de audio y dominios suplantados.
- Si falla CORS, se agota cuota o el contenido no está disponible, informa el problema. No habilita importación, descarga ni almacenamiento.
- La validación automatizada usa respuestas simuladas; **no certifica audio real en un teléfono**.

Documentación: https://docs.audius.co/api/ y https://docs.audius.co/sdk/tracks/.

# Catálogo comercial y versiones originales en NÉBULA

## Qué se corrigió
- La búsqueda principal ahora muestra un catálogo de Deezer **antes** que los resultados independientes de Audius. Se consultan solo metadatos públicos (artista, pista, álbum, duración, carátula), no se extrae audio.
- Los resultados de estudio se muestran primero. Remix, cover, karaoke, tributo, live y mashup pasan a un filtro separado cuando la búsqueda no los solicita expresamente. Esta clasificación es **heurística**, nunca una garantía de originalidad.
- Cada resultado tiene el enlace Deezer original, botones para búsquedas oficiales en YouTube/Spotify/Apple Music y un widget Deezer dentro de NÉBULA.
- NÉBULA admite enlaces HTTPS directos de YouTube, SoundCloud, Spotify y Deezer con reproductores incrustados oficiales. No se aceptan dominios imitadores ni URLs arbitrarias.
- El endpoint público \`GET /v1/discovery/mainstream?q=...\` se ejecuta en el backend existente, sin claves, sin cookies de proveedor, sin proxy de audio, con límites de búsqueda y tiempo de espera. No requiere cuenta NÉBULA porque es un catálogo público.

## Limitaciones importantes
- El widget de Deezer generalmente reproduce **muestras de 30 segundos**. No es un servicio completo de streaming libre; no presentamos un sample como canción completa. El audio completo depende de los permisos y cuentas del proveedor.
- Spotify y YouTube se reproducen en sus iframes oficiales y cada plataforma decide disponibilidad y duración. Por título en YouTube, sin Data API Key, se ofrece una búsqueda oficial que se abre en YouTube.
- Audius, Jamendo, Openverse e Internet Archive siguen aportando audio libre cuando los autores lo permiten, pero **no equivalen** a un catálogo comercial de grabaciones originales.
- No instalamos Ares Galaxy ni una red P2P de intercambio indiscriminado: no comprueba autenticidad, licencias ni integridad de los ficheros. Sí está disponible importación manual de archivos propios.
- Si Deezer bloquea solicitudes del servidor, NÉBULA muestra aviso y enlaces alternativos. No se prometen resultados que no llegan.

## Pruebas
- \`npm run typecheck\`
- \`npm test\` (parser y ranking de metadatos, URLs oficiales, pruebas API)
- \`npm run build\`
- \`npm run test:e2e\` (versión de estudio y widget oficial en móvil y desktop)
- Prueba manual en Vercel: buscar por artista/título, comprobar créditos y duración real del widget.

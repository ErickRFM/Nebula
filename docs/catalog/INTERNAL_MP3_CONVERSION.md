# Conversión MP3 integrada en NÉBULA

## Función
**Biblioteca → Convertir archivos a MP3** permite tomar archivos propios MP3, WAV, M4A, AAC, OGG, OPUS o FLAC, convertirlos a MP3 (si el navegador puede decodificarlos) y añadirlos a la biblioteca local de NÉBULA. También pueden guardarse como archivo MP3 en el equipo.

- Conversión 100 % local: Web Audio decodifica la fuente y un Web Worker codifica MP3 con lamejs. No se envía audio al servidor, a YouTube, a Vercel ni a ningún conversor externo.
- El motor lamejs está copiado sin modificaciones en \`apps/web/public/vendor/lame.min.js\` y se sirve desde el mismo sitio, sin CDN.
- Fuente y licencia: [zhuker/lamejs](https://github.com/zhuker/lamejs), LGPL-3.0, archivo de licencia en \`apps/web/public/vendor/LAMEJS-LICENSE.txt\`. Consultar también [licencia LGPL-3.0](https://www.gnu.org/licenses/lgpl-3.0.html). El usuario conserva derechos de terceros sobre su música.
- Límite de seguridad y rendimiento: máximo 25 MB por archivo, 10 minutos y 8 archivos por lote; bitrate ajustable. Formatos soportados dependen del navegador. La exportación MP3 usa hasta 2 canales (mono/estéreo).
- El formato MP3 no es por sí mismo una fuente de canciones; debes tener el archivo. Las páginas de YouTube/Spotify/Deezer no se convierten en archivos MP3 mediante esta función.
- La biblioteca local usa IndexedDB; no se comparte automáticamente entre familiares. Para sincronización entre dispositivos hay que subir archivos de forma explícita a NÉBULA Cloud si el backend R2 está configurado.

## Prueba recomendada
1. Abre **Biblioteca**.
2. Elige un WAV, M4A, FLAC u OGG corto, pulsa **Convertir y añadir** y revisa que aparezca en la colección local.
3. Pulsa **Guardar MP3** para comprobar un archivo \`.mp3\` de verdad; vuelve a abrir la biblioteca para comprobar persistencia.
4. Prueba cancelar una conversión y verifica que se liberan los recursos del worker.

No se incluyen rutinas para evadir DRM, autenticaciones, restricciones de servicios ni descargas piratas de grabaciones comerciales.

# NÉBULA — YouTube → MP3 en el equipo local

## Qué hace

NÉBULA usa un motor ya existente: `tools/private-bridge/yt-dlp-runner.mjs`. Con `yt-dlp` y FFmpeg instalados, el puente local recupera una pista de un video al que tienes acceso autorizado, genera un flujo `audio/mpeg` y lo entrega al navegador para guardarlo en **Descargas** y añadirlo a **Biblioteca**.

No se envía el archivo a Vercel, no se guarda en servidores NÉBULA y no se requieren cookies de YouTube. Las protecciones DRM, contenidos privados, bloqueados o restricciones del proveedor no se eluden.

## Configuración Windows PowerShell

1. Instala y comprueba `yt-dlp --version`, `ffmpeg -version` y `node --version` en el equipo donde abrirás NÉBULA.
2. Desde la raíz del repositorio, ejecuta:

```powershell
$env:NEBULA_ENABLE_YTDLP="true"
$env:NEBULA_BRIDGE_ORIGINS="http://localhost:3000,https://tu-preview-de-nebula.vercel.app"
npm run bridge:dev
```

Sustituye **tu-preview-de-nebula.vercel.app** por el origen exacto que muestra la barra del navegador. El puente escucha **solo** en `127.0.0.1:4177`; evita exponer o reenviar ese puerto públicamente.

3. Copia el token de emparejamiento que se imprime en tu propia terminal y pégalo en **Reproducción privada local** (se conserva solo en la sesión de esa pestaña).
4. Pega un enlace `https://www.youtube.com/watch?v=...` o `https://youtu.be/...`, pulsa **Usar enlace**, confirma que tienes derecho a guardar la pista y pulsa **Descargar MP3**. El puente genera un MP3 y NÉBULA lo incorpora a la biblioteca local de ese navegador.
5. También puedes abrir el reproductor oficial YouTube en NÉBULA y pulsar **Descargar MP3 (puente local)**: el enlace se prellena en la sección privada.

**Importante:** La interfaz del puente es visible, pero sin `yt-dlp`, FFmpeg, token correcto y el servicio de tu propio equipo funcionando, la conversión de YouTube no está disponible. En móvil necesitas una solución de ejecución compatible; la app web por sí sola y el conversor de archivos del navegador no extraen el audio de YouTube.

## Seguridad

- Los videos se procesan por ID validado, nunca pasando URLs arbitrarias a un shell.
- La API de descarga exige ticket HMAC de duración limitada y comprueba Host y Origin.
- Un único flujo concurrente por puente. El proceso se cancela al cerrar conexión.
- El navegador limita la importación del MP3 generado a 100 MB.
- No compartas el token ni habilites un proxy público a `127.0.0.1:4177`.
- Usar solamente contenido propio o con permiso explícito de descarga y respetar los términos del proveedor.

## Pruebas

- `node --test tools/private-bridge/*.test.mjs`
- `npm run test:e2e` (incluye `apps/web/e2e/bridge-mp3-download.spec.ts`, usando una respuesta MP3 simulada sin descargar archivos de terceros).

## Listas largas: hasta 1.000 pistas

En **Buscar** (o **Explorar**) → *Reproducción privada local*, pega un enlace fijo
`https://www.youtube.com/playlist?list=PL…` y pulsa **Ver lista de pistas**. Un solo
endpoint, `/resolve`, enumera la lista con `yt-dlp --flat-playlist` y devuelve hasta
**1.000** pistas. El techo vive en `tools/private-bridge/limits.mjs`;
`apps/web/src/lib/private-bridge.ts` lo repite y `private-bridge.test.ts` comprueba que
los dos números sigan siendo el mismo.

Hay dos destinos para esa misma lista y un solo camino de reproducción (`/ticket` +
`/stream`):

- **Cola del navegador** (por defecto): la pestaña pide cada MP3, lo añade a la Biblioteca
  en lotes de 10 y puede guardar una copia de archivo.
- **Carpeta del puente**: activa *Guardar el lote en la carpeta del puente (hasta 1000)*.
  `POST /batch` lanza una cola que convierte **una canción cada vez** y escribe en
  `%USERPROFILE%\Downloads\Nebula` (`NEBULA_DOWNLOAD_DIR` si lo cambias antes de abrir el
  puente). La pestaña puede cerrarse: el lote sigue en el puente y el seguimiento se
  recupera al volver. Cerrar el puente aborta la pista en curso; lo ya convertido queda
  en disco. `.nebula-download-archive.txt` evita repetir canciones ya descargadas.

La vista previa que autoriza el lote caduca a los 20 minutos. Si el puente responde
`playlist_preview_expired`, vuelve a pulsar **Ver lista de pistas** y reintenta.

Reglas del lote: una sola cola activa (`batch_busy`), solo se aceptan IDs que el puente
listó para ese mismo enlace, el cuerpo del `POST` cabe en 24 KB (≈1.000 IDs) y ninguna
ruta acepta comandos ni rutas escritos por el navegador. Con 1.000 pistas el tiempo y el
espacio dependen del equipo; las que fallen se cuentan y no bloquean las siguientes.
Los archivos del lote **no** se suben a la nube: para oírlos en Salas, súbelos desde
Biblioteca → Mi música en la nube en lotes de 20.

### Pruebas

- `node --test tools/private-bridge/playlist-batch.test.mjs` (límite, orden, progreso,
  cancelación, caducidad de la vista previa y puente sin descargador).
- `apps/web/e2e/playlist-long-batch.spec.ts` (1.000 pistas simuladas, ventana de 60 filas,
  confirmación y seguimiento del lote, sin contactar YouTube).

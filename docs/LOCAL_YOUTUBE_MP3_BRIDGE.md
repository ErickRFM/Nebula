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

## Playlists completas de hasta 1,000 pistas

En **Buscar → Reproducción privada local → Descargar una playlist completa**, pega una URL pública fija como `https://www.youtube.com/playlist?list=PL...`. Pulsa **Cargar canciones**. El puente local consulta los metadatos de hasta 1,000 entradas, sin descargar audio durante el análisis.

Puedes revisar los títulos, filtrar la lista y seleccionar o deseleccionar pistas. Al pulsar **Descargar N MP3 seleccionados**, confirmarás el lote. Se procesará **una canción a la vez**; el estado incluye procesadas, fallos y la opción **Detener lote**. Los archivos se guardan directamente en:

```text
%USERPROFILE%\Downloads\Nebula
```

Para elegir una carpeta distinta antes de iniciar el puente:

```powershell
$env:NEBULA_DOWNLOAD_DIR = "$HOME\Music\Nebula"
```

El puente permanece en `127.0.0.1:4177`, y debe seguir abierto mientras dura el lote. La descarga puede continuar aunque se cierre la pestaña; al cerrar el puente se cancela el proceso en curso. Los archivos ya procesados permanecen en el disco. El archivo oculto `.nebula-download-archive.txt` sirve para evitar descargas duplicadas al repetir un lote.

**Importante:** El proceso por lotes guarda archivos en la computadora que ejecuta el puente; no descarga 1,000 archivos mediante diálogos del navegador y **no sube automáticamente esas canciones a la nube**. Si quieres escucharlas en Salas, entra a Biblioteca → Mi música en la nube y sube tu carpeta en lotes de hasta 20 archivos. El rendimiento y la disponibilidad de cada pista dependen de la fuente, la red y las restricciones del proveedor; no se garantizan 1,000 descargas exitosas.

### Protección de la cola masiva

- Solo se aceptan playlists de dominios YouTube conocidos; el servidor reconstruye URLs canónicas a partir de IDs validados.
- Radios dinámicas (RD) no se tratan como playlists fijas.
- Se permite una sola cola activa, seleccionando hasta 1,000 IDs obtenidos de una vista previa temporal del propio puente.
- Las rutas de lote requieren autenticación con el token local y validación de origen; no ejecutan comandos recibidos del navegador.
- El sistema limita las consultas de análisis y ejecuta un proceso por canción. Las que fallen se cuentan como errores y no bloquean las siguientes.
- Utiliza la herramienta solo con material propio o contenido que estés autorizado a guardar. No elimina DRM, restricciones ni autenticación de terceros.

### Pruebas de lotes

`node --test tools/private-bridge/playlist-batch.test.mjs` comprueba el límite de 1,000, la restricción de origen, la selección, el proceso y la cancelación con un motor simulado. `apps/web/e2e/playlist-batch.spec.ts` prueba la interfaz con una playlist ficticia de 1,000 temas, sin contactar con YouTube ni descargar audio real.

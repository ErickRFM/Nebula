# NÉBULA V3 — puente musical privado, local, **no desplegar a producción**

## Estado técnico
Código en rama `feat/private-local-music-bridge-20261104`. La interfaz solo monta el puente si se compila localmente con `NEXT_PUBLIC_ENABLE_PRIVATE_BRIDGE=true`. Vercel/Capacitor no tienen esta opción activada por defecto. **No publicar el puente en una IP pública ni en Vercel.**

Este puente **es una integración opcional de yt-dlp**, no una API oficial de YouTube y no garantiza reproducción universal. Usarlo solo para contenido accesible con derechos y permisos adecuados; su uso puede estar limitado por las condiciones de YouTube u otros titulares. No intenta evadir DRM, autenticación, restricciones regionales ni requisitos PO-Token; no usa cookies, credenciales ni scripts de terceros en NÉBULA.

## Windows (dos terminales PowerShell)
Requiere Node 22+, npm y FFmpeg. Instalación desde proyectos oficiales o el gestor de paquetes:

```powershell
winget install --source winget --id yt-dlp.yt-dlp
winget install --id Gyan.FFmpeg
yt-dlp --version
ffmpeg -version
```

Terminal A — ejecutar puente (genera token aleatorio y escucha **solo** `127.0.0.1:4177`):

```powershell
cd C:\proyectos\Nebula
git fetch origin
git switch feat/private-local-music-bridge-20261104
npm ci
$env:NEBULA_ENABLE_YTDLP = 'true'
npm run bridge:dev
```

Terminal B — web local, sin PostgreSQL para este modo personal (la biblioteca R2 sigue requiriendo su backend):

```powershell
cd C:\proyectos\Nebula
$env:NEXT_PUBLIC_ENABLE_PRIVATE_BRIDGE = 'true'
npm run dev
```

1. Abre **http://localhost:3000** en el **mismo ordenador**.
2. Abre **Buscar** y busca por título o artista.
3. En **Reproducción privada local**, pega el token generado en Terminal A; pulsa Conectar.
4. Si la fuente está disponible en el extractor y tu acceso está autorizado, pulsa **Escuchar**. NÉBULA usa su reproductor de audio con stream MP3 temporal.
5. Si el proveedor rechaza el audio o no permite este modo, usa la reproducción oficial incrustada, Audius, tu biblioteca local o tus archivos privados en R2.

## Riesgos y limitaciones
- El token se imprime solo en la terminal y se mantiene en la sesión de pestaña `sessionStorage`; **no** en Git, IndexedDB, Google Cloud o Vercel. Nunca publiques capturas del token.
- El servicio escucha **solo en loopback**; su CORS solo permite `http://localhost:3000` y `http://127.0.0.1:3000` por defecto; compara token en tiempo constante, tickets HMAC de 2 minutos, limita consultas y solo un stream a la vez.
- No soporta saltos de tiempo/Range en streams transcodificados en vivo; el botón de pausa sí funciona. No guarda copias ni transmite el audio a R2. Las búsquedas viajan al proveedor externo.
- Si YouTube rechaza la extracción, muestra error y hay que usar una fuente alternativa permitida; **no** instalar extensiones para evasión de DRM, desafíos de cliente o cuentas ajenas.
- `127.0.0.1` es cada dispositivo; desde Android apunta **al teléfono**, no al ordenador. Acceso desde móvil requiere una implementación nativa o túnel TLS autenticado adicional, no habilitada por seguridad.
- Las peticiones navegador→localhost están sujetas a permisos de red local del navegador; usa la web local como primera certificación.
- El repositorio GitHub `ErickRFM/Nebula` es **público**. Un puente de loopback y un token no convierten el repositorio o Vercel en privados. Mueve a repositorio privado y protege los despliegues si deseas privacidad del código.
- **No merger a main** por ahora: main despliega a Vercel automáticamente.

## Comprobaciones

```powershell
npm run test:bridge
npm run typecheck
npm test
npm run build
```

`node --test` comprueba orígenes, auth, tickets y un stream local simulado. CI no ejecuta búsquedas reales ni streams reales desde YouTube. Para certificar sonido real, prueba manualmente pista permitida, avance de tiempo, audio audible, dispositivo, DRM, caducidad de token, interrupción y error. No afirmar Spotify-like universal.

## Referencias
- yt-dlp: https://github.com/yt-dlp/yt-dlp — herramienta externa con licencia Unlicense; **no** se copia su código al repositorio.
- FFmpeg: https://ffmpeg.org — ejecutable externo; revisar licencia de build que se instale.
- API YouTube oficial: https://developers.google.com/youtube/terms/developer-policies — alternativa mediante reproductor integrado para videos compatibles.

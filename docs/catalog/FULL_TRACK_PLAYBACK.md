# Canciones completas en NÉBULA — límite de muestras y opciones reales

## Problema corregido
El catálogo de Deezer es útil para reconocer grabaciones comerciales, pero el reproductor público incrustado normalmente solo entrega **30 segundos**. La UI anterior mostraba un botón principal **Escuchar** y hacía que la persona creyera que reproduciría la canción entera.

## Nueva experiencia
- Cada canción comercial muestra **Canción completa** (abre opciones de acceso) y **Muestra 30 s** (muestra explícita).
- El flujo de canción completa busca por artista y título en YouTube y permite pegar el enlace exacto de un video autorizado para reproducirlo **dentro de NÉBULA** con el iframe oficial. Esto **no** es resolución automática: se necesita el ID de video del enlace elegido y el video debe permitir incrustación.
- También acepta SoundCloud y Spotify. El iframe de Spotify puede ofrecer la pista completa a usuarios con Premium y sesión activa en navegador compatible; para otros puede limitarse a muestra.
- Las canciones propias importadas localmente y alojadas en la biblioteca privada siguen usando el reproductor de audio nativo de NÉBULA sin muestras.
- Deezer continúa siendo fuente de metadatos y de **muestras**, no audio completo.
- No utiliza un backend que descargue, extraiga o copie audio comercial y no afirma que todas las pistas sean reproducibles gratuitamente.

## Verificaciones
- E2E: la muestra aparece explícitamente, se abre el flujo de canción completa, un enlace oficial de YouTube monta su iframe, un enlace Deezer se rechaza como pista completa.
- Typecheck, unitarios, compilación web, Android y Playwright antes de fusionar.

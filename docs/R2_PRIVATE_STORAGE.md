# NÉBULA Cloud — Cloudflare R2

## Arquitectura

- Next.js UI + API Fastify en Vercel Functions; Supabase PostgreSQL guarda metadatos por usuario.
- R2 guarda los archivos; el bucket **nebula-music-private** debe seguir con Public Access **Disabled**.
- Las claves R2 solo viven en variables **server-side** de Vercel Production:
  R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY y R2_BUCKET.
- Nunca exponer claves como NEXT_PUBLIC_ ni compartir URLs firmadas.
- El cliente autenticado solicita una URL firmada PUT (10 minutos), sube directamente a R2 y confirma con la API.
- La API verifica tamaño y tipo MIME mediante HEAD antes de publicar la pista.
- El cliente pide una URL GET firmada de una hora para escuchar; ninguna URL es permanente.
- Solo el propietario de cada pista puede listar, reproducir o borrar su archivo.
- Máximo 100 MiB por pista y 20 pistas por lote desde la UI; formatos MP3, M4A, WAV, OGG, OPUS, FLAC, AAC.

## Configuración imprescindible: CORS del bucket

En Cloudflare → R2 → nebula-music-private → Settings → CORS Policy, configura:

    [
      {
        "AllowedOrigins": ["https://nebula-er-i1.vercel.app"],
        "AllowedMethods": ["PUT", "GET", "HEAD"],
        "AllowedHeaders": ["Content-Type"],
        "ExposeHeaders": ["ETag"],
        "MaxAgeSeconds": 3600
      }
    ]

Incluye otros orígenes solo cuando realmente se usen (por ejemplo localhost para desarrollo).
**No uses "*" para AllowedOrigins** en producción.
Sin esta política, el navegador bloqueará el PUT aunque la firma y las claves sean correctas.

## Base de datos

Ejecuta la migración apps/api/migrations/0004_cloud_tracks.sql sobre el proyecto
Supabase exclusivo de NÉBULA, **no** en el Supabase del sistema SIII.
La API health verifica la existencia de la tabla cloud_tracks.
No despliegues la versión nueva a producción antes de aplicar la migración.

## Verificación

1. /v1/health debe responder 200 con database=connected.
2. Sin sesión, /v1/library/cloud debe responder 401.
3. Con sesión, /v1/library/cloud/config debe responder configured=true.
4. Subir un MP3 propio y confirmar que aparece en la lista de Cloud.
5. Reproducirlo en otro dispositivo con la misma cuenta.
6. Verificar que otra cuenta no puede reproducirlo ni eliminarlo.
7. Eliminarlo y confirmar que se elimina de R2 y de la biblioteca.

### Limitaciones actuales

- No hay transcodificación ni análisis antivirus/codec del contenido: se valida extensión, MIME y tamaño.
- Las cargas pendientes que se interrumpan pueden dejar metadatos pending u objetos huérfanos;
  debe añadirse una tarea de limpieza antes de operar a gran escala.
- La reproducción es por pista (URL temporal), no una cola de streaming con renovación automática.
- No se admiten archivos mayores a 100 MiB ni multipart uploads.
- Solo subir archivos propios o que se tenga permiso para almacenar y reproducir.

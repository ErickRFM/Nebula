# NÉBULA — Cuenta HTTP 500 / pooler Supabase y listas de YouTube

## Hallazgo en producción (4 de noviembre de 2026, México)
- \`GET /v1/auth/config\` devolvía 200.
- \`GET /v1/health\` devolvía 503.
- Logs de Vercel: \`[nebula:health] database probe failed\`, categoría \`pooler_configuration\`, SQLSTATE \`XX000\`. El driver recibió un error de reconocimiento del tenant del pooler Supabase, no un rechazo de la contraseña del usuario web.
- El \`DATABASE_URL\` de producción existe y apunta a un pooler Supabase, puerto 5432. El código fuente y los registros **no contienen la contraseña ni el hostname exacto**.
- Las conexiones Supabase accesibles desde la cuenta conectada aquí no identificaron un proyecto llamado NÉBULA. No se debe apuntar NÉBULA a SIII ni a otra base existente.

## Para restaurar el acceso
1. En **Supabase** abre el proyecto PostgreSQL que contiene las cuentas de NÉBULA y comprueba que esté activo.
2. En **Connect**, copia literalmente el **Session pooler URI**. El usuario del pooler compartido suele ser \`postgres.<project-ref>\` y el host **debe copiarse del panel**.
3. En **Vercel → nebula → Settings → Environment Variables**, reemplaza únicamente la variable cifrada \`DATABASE_URL\` de **Production** por ese URI con la contraseña correcta, sin pegar secretos en issues, chats o PRs. Mantén \`API_JWT_SECRET\` igual: sustituirlo invalidaría sesiones.
4. Despliega nuevamente \`main\` y comprueba \`https://nebula-er-i1.vercel.app/v1/health\`: debe devolver \`{"status":"ok","database":"connected"}\`. Si responde \`schema_incomplete\` con 503, revisa las migraciones de NÉBULA, **no** las de otra aplicación.
5. Prueba iniciar sesión con tu cuenta actual. No crees ni borres cuentas durante el diagnóstico.

Los errores de conexión ahora responden \`503 {"error":"database_unavailable"}\` y la UI avisa que no implica una contraseña incorrecta; no se muestran mensajes de Postgres ni URLs de conexión al cliente.

Fuentes: [Supabase: tenant or user not found](https://supabase.com/kb/troubleshooting/tenant-or-user-not-found) y [Connect to your database](https://supabase.com/docs/guides/database/connecting-to-postgres).

## Listas de YouTube
Para una playlist fija, el iframe oficial de YouTube expone \`getPlaylist()\` con **IDs** de videos actualmente disponibles. NÉBULA muestra esos IDs con miniaturas, controles de reproducir y metadatos públicos de oEmbed cuando YouTube los sirve. Solo se obtienen hasta 100 IDs y se cargan metadatos de 20 en 20. No requiere la YouTube Data API.

Una mezcla \`RD...\` es dinámica y **no tiene necesariamente un listado finito**. Si el iframe solo entrega el primer video, NÉBULA no inventa la lista; permite abrir la mezcla original y verla en YouTube.

Cada fila incluye **Añadir MP3**, que abre un formulario para descargar y agregar un archivo MP3 autorizado desde un enlace HTTPS directo. **No** extrae ni descarga el audio de YouTube, no evade DRM y no confunde un video con un archivo MP3.

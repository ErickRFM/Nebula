# NÉBULA — importar audio autorizado desde una URL web

## Flujo

1. Abre **Biblioteca → Mi música en la nube** con una sesión NÉBULA válida y R2 configurado.
2. En **Importar un archivo de audio desde la web**, pega una URL HTTPS **directa** a un archivo MP3, FLAC, WAV, M4A, OGG, OPUS o AAC.
3. Confirma que tienes permiso para descargar y conservar una copia privada del archivo.
4. El navegador solicita el archivo con `credentials: omit`, sin proxy en Vercel y sin seguir redirecciones HTTP.
5. Se verifica el MIME, se limita a 100 MiB, se sigue el progreso de la descarga y se entrega un `File` al flujo de subida existente (ticket + PUT firmado + confirmación).
6. El audio aparece en la biblioteca privada R2 y puede reproducirse y descargarse desde ella. Una URL web fallida queda en el formulario para reintentar.

## Límites intencionales

- El servidor remoto debe permitir CORS. Si lo bloquea, el usuario puede descargar el archivo por vías autorizadas y subirlo como archivo local.
- No se aceptan páginas HTML, videos, enlaces de YouTube o SoundCloud a páginas, contenido protegido ni archivos sin permiso de conservación.
- No se realiza scraping ni conversión de video a audio, no se evitan restricciones del proveedor y NÉBULA no bloquea anuncios de reproductores externos.
- No se transmiten URLs remotas al backend de NÉBULA, y no se concede acceso de lectura a archivos R2 de otras cuentas.
- En Buscar, si no hay `YOUTUBE_API_KEY`, se ofrece un enlace de búsqueda por nombre en la página de YouTube; eso **no** equivale a integrar su catálogo en la app. Con API configurada, continúa la búsqueda integrada y reproducción mediante iframe oficial.

## Pruebas recomendadas de recepción

- Subir un MP3 autorizado desde archivo del equipo; reproducirlo, recargar y descargarlo.
- Importar un MP3 propio desde un origen HTTPS que permita CORS; confirmar registro listo y reproducción.
- Intentar importar una página `.html`, video de YouTube, archivo con MIME incorrecto y objeto mayor a 100 MiB: todos deben rechazarse.
- Cancelar una descarga o subida y comprobar que no aparece un archivo parcialmente confirmado como listo.
- Comprobar que otra cuenta no puede acceder al archivo importado.
- Repetir en Android y navegador de escritorio.

Los tests de CI verifican validaciones y componentes, pero **no** certifican que cualquier origen remoto admita CORS ni sustituyen una prueba física de R2.

# NÉBULA — Descargar MP3 autorizado e importar a Biblioteca

La biblioteca local permite almacenar **archivos completos** (máximo 100 MB por pista) en IndexedDB. Los archivos no se suben automáticamente a Vercel, R2, GitHub ni se comparten con familiares.

## Desde un archivo en tu equipo
1. Abre **Biblioteca** → **Importar música**.
2. Selecciona uno o varios archivos MP3, M4A, WAV, FLAC, OGG, OPUS o AAC.
3. Se muestran entre tus canciones locales y quedan disponibles para reproducir sin un servicio externo.
4. En cada canción guardada, usa el icono **Descargar archivo original** para recuperar el archivo al equipo. Solo se llama MP3 si el archivo es MP3; los demás se descargan en su formato original.

## Desde una dirección HTTPS directa a un MP3 permitido
1. En **Biblioteca** → **Importar MP3 de un enlace**, pega una URL directa acabada en \`.mp3\`.
2. Confirma que tienes permiso para descargar y conservar la música. Pulsa **Descargar e importar a Biblioteca**.
3. NÉBULA verifica CORS, tamaño (100 MB), tipo \`audio/mpeg\` y cabecera MP3, recibe el archivo en el navegador, lee metadatos y lo importa a IndexedDB.
4. Una vez recibido, pulsa **Guardar copia MP3 en Descargas** para conservar también un archivo del dispositivo.

**No acepta** páginas HTML, enlaces de video de YouTube, Spotify o Deezer ni fuentes de audio que no permitan descarga o CORS. No transforma material protegido en archivos MP3 ni evade mecanismos de acceso.

## Diferencia entre Biblioteca local y Biblioteca Cloud
- La biblioteca **local** es por navegador y dispositivo; borrar los datos del sitio podría eliminar sus archivos.
- **NÉBULA Cloud** ofrece subida con sesión de usuario a R2 privado, mediante el formulario de carga de archivos existente, cuando ese servicio esté configurado.
- Si quieres que todos tus dispositivos tengan los archivos, debes subirlos explícitamente a la nube. No se sincronizan automáticamente entre familiares.
- Si tienes un WAV/FLAC, la descarga conservará su formato. Convertirlo a MP3 requiere transcodificación adicional; renombrar el archivo no sirve.

# Compilar APK Android NÉBULA Party Sound

La compilación de Android se genera reproduciblemente desde Capacitor 7 mediante el workflow **NÉBULA Android APK**. El proyecto nativo no se versiona: el job ejecuta `npx cap add android` después de exportar la web, integra el código Kotlin, añade Media3 y compila con Gradle.

## APK de prueba
Abre GitHub → Actions → *NÉBULA Android APK* → ejecución verde → Artifacts → `nebula-party-android-debug`. Contendrá un APK firmado con la **clave debug temporal del runner** y un archivo SHA-256. No es una firma estable: futuras compilaciones pueden requerir desinstalar la APK anterior y perder datos locales. No publiques esta versión como release final.

## Condiciones
- Se construye la interfaz web con `NEXT_PUBLIC_API_URL=https://nebula-er-i1.vercel.app`; el backend debe autorizar los orígenes nativos pertinentes y el inicio de sesión/renovación de sesión debe validarse.
- Kotlin registra el escáner NSD, el anuncio opt-in y el servicio Media3. El puente de NÉBULA aún necesita utilizar el motor Media3 desde el flujo de audio principal para ser realmente nativo; no se garantiza el modo fondo solo por compilarlo.
- La compilación CI no equivale a prueba física en Poco X7 Pro, bocina Bluetooth, host/guest ni a sincronización acústica.
- Para iOS se necesita un Mac con Xcode, provisioning y una prueba de AVFoundation/Bonjour.

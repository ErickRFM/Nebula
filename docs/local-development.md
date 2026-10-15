# NÉBULA · Levantar web + API + PostgreSQL (Windows y Linux)

Requisitos: Node.js 22, npm 10, Docker Engine/Desktop y Git.

## Primer arranque

```powershell
git clone https://github.com/ErickRFM/Nebula.git
cd Nebula
npm ci
docker compose up -d
```

En PowerShell, configura la sesión del backend (no guardes el secreto en Git):

```powershell
$env:DATABASE_URL = "postgresql://nebula_local:nebula_dev_password@127.0.0.1:5432/nebula"
$env:API_JWT_SECRET = python -c "import secrets; print(secrets.token_hex(32))"
$env:API_CORS_ORIGIN = "http://localhost:3000"
npm run db:migrate
npm run api:dev
```

Si Python no está disponible, genera una cadena aleatoria criptográficamente segura de al menos 32 caracteres y asígnala a `API_JWT_SECRET`.

En otra terminal, ejecuta:

```powershell
npm run dev
```

- Web: http://localhost:3000
- API health: http://localhost:4000/v1/health

**Importante:** el frontend actual reproduce música local y no presenta todavía el login de API. La API puede probarse con un cliente HTTP; registra cuentas con `POST /v1/auth/register` y `{ "email": "alguien@example.com", "password": "una-contraseña-larga" }`.

## Validación

```powershell
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

Para ejecutar también los tests de integración API: configura `NEBULA_TEST_DATABASE_URL` apuntando a una **base de datos de prueba separada**, aplica migraciones a esa base y ejecuta `npm test`. No apuntes estos tests a una base con datos de producción.

## Producción

Las credenciales de compose.yaml son solo para desarrollo local. Usa contraseñas seguras, secretos administrados, TLS, backups y migraciones supervisadas en producción. No expongas PostgreSQL al público.

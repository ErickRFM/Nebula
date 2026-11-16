'use client';

/*
 * Este es el único estado de error que puede fallar por completo: si el layout raíz
 * revienta, globals.css tampoco se montó. Todo va en línea para que la pantalla sea
 * legible incluso sin una sola regla del diseño.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <html lang="es">
    <body style={{ margin: 0, minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, background: '#0a0c1b', color: '#f4f1ff', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ maxWidth: 520, textAlign: 'center' }}>
        <h1 style={{ fontSize: '1.25rem', margin: '0 0 10px' }}>Nébula no pudo abrirse</h1>
        <p style={{ margin: 0, fontSize: '.9rem', lineHeight: 1.5, color: '#d8d3ee' }}>La pantalla inicial falló antes de cargar. Recarga para volver a intentarlo; la música guardada en este dispositivo no se pierde.</p>
        {error.message ? <p style={{ margin: '10px 0 0', fontSize: '.78rem', color: '#b9b4d4' }}>{error.message.slice(0, 180)}</p> : null}
        <button type="button" onClick={() => reset()} style={{ marginTop: 18, padding: '11px 20px', borderRadius: 12, border: 0, background: '#c9a6ff', color: '#1d1235', fontWeight: 700, fontSize: '.88rem' }}>Recargar</button>
      </div>
    </body>
  </html>;
}

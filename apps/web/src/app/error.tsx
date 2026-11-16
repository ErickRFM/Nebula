'use client';

import { AlertTriangle } from 'lucide-react';

/*
 * Sin este archivo, cualquier excepción renderizando tumba la vista a la página de
 * error de Next y deja el reproductor sin forma de volver. `reset` re-monta el árbol
 * sin recargar, que es lo único que conserva el audio en curso.
 */
export default function ScreenError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <div className="screen-error glass" role="alert">
    <AlertTriangle size={26} aria-hidden="true" />
    <div>
      <strong>Esta pantalla se detuvo</strong>
      <p>El audio que sonaba puede continuar y tu biblioteca local sigue intacta. Reintenta la vista; si vuelve a fallar, recarga la app.</p>
      {error.message ? <p className="screen-error-detail">{error.message.slice(0, 180)}</p> : null}
    </div>
    <button type="button" className="button primary small" onClick={() => reset()}>Reintentar</button>
  </div>;
}

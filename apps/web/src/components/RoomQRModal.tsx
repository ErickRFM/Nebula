'use client';

import { useEffect, useState } from 'react';
// @ts-ignore
import QRCode from 'qrcode';
import { Copy, Check, QrCode, X } from 'lucide-react';

interface RoomQRModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomName: string;
  inviteCode: string;
}

export function RoomQRModal({ isOpen, onClose, roomName, inviteCode }: RoomQRModalProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copied, setCopied] = useState(false);

  // Generate deep-linkable URL
  const joinUrl = typeof window !== 'undefined'
    ? `${window.location.origin}${window.location.pathname}#salas?code=${encodeURIComponent(inviteCode)}`
    : `https://nebula.music#salas?code=${inviteCode}`;

  useEffect(() => {
    if (!isOpen || !inviteCode) return;
    setCopied(false);

    void QRCode.toDataURL(joinUrl, {
      width: 280,
      margin: 1.5,
      color: {
        dark: '#120d24',
        light: '#f5eeff',
      },
      errorCorrectionLevel: 'M',
    }).then((url: string) => {
      setQrDataUrl(url);
    }).catch(() => {
      // Fallback: encode just the invite code
      void QRCode.toDataURL(inviteCode, {
        width: 280,
        margin: 1.5,
        color: { dark: '#120d24', light: '#f5eeff' },
      }).then(setQrDataUrl);
    });
  }, [isOpen, inviteCode, joinUrl]);

  if (!isOpen) return null;

  const copyLink = () => {
    void navigator.clipboard.writeText(joinUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="qr-modal-title">
      <div className="modal-dialog glass" onClick={(e) => e.stopPropagation()} style={{ textAlign: 'center', maxWidth: 400 }}>
        <button
          type="button"
          className="icon-button modal-close"
          onClick={onClose}
          aria-label="Cerrar modal de código QR"
        >
          <X size={18} />
        </button>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, marginTop: 8 }}>
          <div className="modal-icon-badge modal-primary">
            <QrCode size={24} />
          </div>
          <h3 id="qr-modal-title" style={{ margin: '4px 0 2px', fontSize: '1.25rem' }}>
            Unirse a {roomName}
          </h3>
          <p style={{ margin: 0, color: 'var(--muted)', fontSize: '0.84rem' }}>
            Escanea con la cámara de otro dispositivo o comparte el código privado.
          </p>

          {/* QR Code Container */}
          <div
            style={{
              padding: 12,
              background: '#f5eeff',
              borderRadius: 16,
              boxShadow: '0 8px 30px rgba(0,0,0,0.4)',
              margin: '14px 0 8px',
              display: 'inline-block',
            }}
          >
            {qrDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={qrDataUrl}
                alt={'Código QR para unirse a la sala ' + roomName}
                width={240}
                height={240}
                style={{ display: 'block', borderRadius: 8 }}
              />
            ) : (
              <div style={{ width: 240, height: 240, display: 'grid', placeItems: 'center', color: '#333' }}>
                Generando código...
              </div>
            )}
          </div>

          {/* Text invite code box */}
          <div
            style={{
              width: '100%',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid var(--edge)',
              borderRadius: 12,
              padding: '10px 14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              marginTop: 6,
            }}
          >
            <div style={{ textAlign: 'left', minWidth: 0 }}>
              <div style={{ fontSize: '0.68rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
                Código de sala
              </div>
              <code style={{ fontSize: '0.86rem', color: 'var(--ink)', overflowWrap: 'anywhere', fontWeight: 600 }}>
                {inviteCode}
              </code>
            </div>
            <button
              type="button"
              className="button secondary small"
              onClick={copyLink}
              title="Copiar enlace directo"
            >
              {copied ? <Check size={16} color="#3dd8b5" /> : <Copy size={16} />}
              <span>{copied ? 'Copiado' : 'Copiar'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

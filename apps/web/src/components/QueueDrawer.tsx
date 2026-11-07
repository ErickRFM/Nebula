'use client';

import { useEffect } from 'react';
import { ListMusic, Play, Trash2, X, Music2, Disc3 } from 'lucide-react';
import type { Track } from '../lib/catalog';
import { TrackCover } from './Cover';

export interface QueueDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  currentTrack?: Track;
  queue: Track[];
  onPlayTrack: (track: Track) => void;
  onRemoveTrack: (index: number) => void;
  onClearQueue: () => void;
  isPlaying: boolean;
}

export function QueueDrawer({
  isOpen,
  onClose,
  currentTrack,
  queue,
  onPlayTrack,
  onRemoveTrack,
  onClearQueue,
  isPlaying,
}: QueueDrawerProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Upcoming tracks are those in queue that aren't the current track
  const currentIndex = currentTrack ? queue.findIndex((t) => t.id === currentTrack.id) : -1;
  const upcoming = currentIndex >= 0 ? queue.slice(currentIndex + 1) : queue;

  return (
    <div className="drawer-backdrop" onClick={onClose} role="presentation">
      <aside
        className="queue-drawer glass"
        role="dialog"
        aria-modal="true"
        aria-label="Cola de reproducción"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="drawer-header">
          <div className="drawer-title">
            <ListMusic size={22} className="accent-icon" />
            <div>
              <h3>Cola de reproducción</h3>
              <small>{queue.length} pista(s) en total</small>
            </div>
          </div>
          <div className="drawer-header-actions">
            {upcoming.length > 0 && (
              <button
                type="button"
                className="button secondary small"
                onClick={onClearQueue}
                title="Vaciar canciones siguientes de la cola"
              >
                Limpiar
              </button>
            )}
            <button
              type="button"
              className="icon-button glass-chip"
              onClick={onClose}
              aria-label="Cerrar cola"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="drawer-body">
          {currentTrack && (
            <div className="queue-section">
              <div className="queue-section-label">REPRODUCIENDO AHORA</div>
              <div className="queue-current-card glass">
                <TrackCover track={currentTrack} className="queue-cover" />
                <div className="queue-track-meta">
                  <strong>{currentTrack.title}</strong>
                  <small>{currentTrack.artist}</small>
                </div>
                <div className={`audio-bars ${isPlaying ? 'playing' : ''}`}>
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            </div>
          )}

          <div className="queue-section">
            <div className="queue-section-label">A CONTINUACIÓN ({upcoming.length})</div>
            {upcoming.length === 0 ? (
              <div className="queue-empty glass">
                <Disc3 size={32} className="muted-icon" />
                <p>No hay más canciones en la cola.</p>
                <small>Explora tu biblioteca o añade pistas con el botón de lista.</small>
              </div>
            ) : (
              <div className="queue-list">
                {upcoming.map((track, i) => (
                  <div key={track.id + '-' + i} className="queue-item glass">
                    <span className="queue-index">{i + 1}</span>
                    <button
                      type="button"
                      className="queue-item-main"
                      onClick={() => onPlayTrack(track)}
                      title="Reproducir ahora"
                    >
                      <TrackCover track={track} className="queue-thumb" />
                      <div className="queue-track-meta">
                        <strong>{track.title}</strong>
                        <small>{track.artist}</small>
                      </div>
                    </button>
                    <div className="queue-item-actions">
                      <button
                        type="button"
                        className="icon-button"
                        onClick={() => onPlayTrack(track)}
                        title="Reproducir"
                        aria-label={`Reproducir ${track.title}`}
                      >
                        <Play size={16} fill="currentColor" />
                      </button>
                      <button
                        type="button"
                        className="icon-button"
                        onClick={() => onRemoveTrack(currentIndex + 1 + i)}
                        title="Quitar de la cola"
                        aria-label={`Quitar ${track.title} de la cola`}
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}

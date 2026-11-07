'use client';

import { useState, useEffect, useCallback } from 'react';

export interface ReactionParticle {
  id: string;
  emoji: string;
  x: number; // percentage across container (10-90%)
  scale: number;
}

const EMOJI_OPTIONS = ['🔥', '💜', '🪐', '⚡', '🚀', '🎵'];

interface RoomReactionsProps {
  onSendReaction: (emoji: string) => void;
  incomingReaction?: { emoji: string; id: string } | null;
}

export function RoomReactions({ onSendReaction, incomingReaction }: RoomReactionsProps) {
  const [particles, setParticles] = useState<ReactionParticle[]>([]);

  const spawnParticle = useCallback((emoji: string) => {
    const newParticle: ReactionParticle = {
      id: 'p-' + Math.random().toString(36).slice(2, 9),
      emoji,
      x: 15 + Math.random() * 70, // Random percentage between 15% and 85%
      scale: 0.85 + Math.random() * 0.45,
    };

    setParticles((prev) => [...prev.slice(-18), newParticle]);

    // Remove particle after animation completes (2.2s)
    setTimeout(() => {
      setParticles((prev) => prev.filter((p) => p.id !== newParticle.id));
    }, 2200);
  }, []);

  // Listen to incoming reactions from other participants
  useEffect(() => {
    if (incomingReaction?.emoji) {
      spawnParticle(incomingReaction.emoji);
    }
  }, [incomingReaction, spawnParticle]);

  const handleTrigger = (emoji: string) => {
    spawnParticle(emoji);
    onSendReaction(emoji);
  };

  return (
    <div className="room-reactions-container">
      {/* Floating Particles Stage */}
      <div className="reaction-stage" aria-hidden="true">
        {particles.map((p) => (
          <div
            key={p.id}
            className="floating-reaction"
            style={{
              left: `${p.x}%`,
              transform: `scale(${p.scale})`,
            }}
          >
            {p.emoji}
          </div>
        ))}
      </div>

      {/* Interactive Reaction Bar */}
      <div className="reaction-bar glass">
        <span className="reaction-label">Reacciones en vivo</span>
        <div className="reaction-buttons">
          {EMOJI_OPTIONS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              className="reaction-button"
              onClick={() => handleTrigger(emoji)}
              aria-label={`Enviar reacción ${emoji}`}
              title={`Reaccionar ${emoji}`}
            >
              <span>{emoji}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

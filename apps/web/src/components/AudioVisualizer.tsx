'use client';

import { useEffect, useRef } from 'react';

interface AudioVisualizerProps {
  isPlaying: boolean;
  className?: string;
}

export function AudioVisualizer({ isPlaying, className = 'visualizer-canvas' }: AudioVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let phase = 0;
    const barCount = 36;
    const bars: number[] = new Array(barCount).fill(0.15);

    const render = () => {
      const dpr = window.devicePixelRatio || 1;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;

      if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
        canvas.width = width * dpr;
        canvas.height = height * dpr;
      }

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, height);

      phase += isPlaying ? 0.08 : 0.02;

      // Create cosmic gradient
      const grad = ctx.createLinearGradient(0, height, width, 0);
      grad.addColorStop(0, '#77d6de');
      grad.addColorStop(0.5, '#c9a6ff');
      grad.addColorStop(1, '#e9a0cd');

      const gap = 3;
      const totalGaps = (barCount - 1) * gap;
      const barWidth = Math.max(2, (width - totalGaps) / barCount);

      for (let i = 0; i < barCount; i++) {
        const x = i * (barWidth + gap);
        // Harmonic waves calculation
        const target = isPlaying
          ? 0.2 +
            0.45 * Math.sin(phase + i * 0.35) * Math.sin(phase * 0.7 + i * 0.2) +
            0.25 * Math.sin(phase * 1.3 + i * 0.6)
          : 0.12 + 0.06 * Math.sin(phase + i * 0.2);

        const clamped = Math.max(0.08, Math.min(0.95, target));
        // Smooth lerp
        bars[i] += (clamped - bars[i]) * 0.2;

        const barHeight = Math.max(3, bars[i] * (height - 6));
        const y = height - barHeight;

        ctx.fillStyle = grad;
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') {
          ctx.roundRect(x, y, barWidth, barHeight, 2);
        } else {
          ctx.rect(x, y, barWidth, barHeight);
        }
        ctx.fill();
      }

      ctx.restore();
      animRef.current = requestAnimationFrame(render);
    };

    animRef.current = requestAnimationFrame(render);

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [isPlaying]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      aria-label="Visualizador de frecuencias de audio"
      role="img"
    />
  );
}

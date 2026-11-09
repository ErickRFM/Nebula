'use client';

import { useEffect, useRef } from 'react';

interface AudioVisualizerProps {
  active: boolean;
  getAnalyser: () => AnalyserNode | null;
  width: number;
  height: number;
  margin: { top: number; right: number; bottom: number; left: number };
  className?: string;
}

/** Real-time spectrum behind the EQ curve. It reads the same graph the EQ processes. */
export function AudioVisualizer({ active, getAnalyser, width, height, margin, className = 'eq-spectrum' }: AudioVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));

    let frame = 0;
    let buffer = new Uint8Array(0);
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    let reduced = media.matches || document.documentElement.classList.contains('reduce-motion');

    const draw = () => {
      const analyser = getAnalyser();
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, width, height);
      if (analyser && active) {
        if (buffer.length !== analyser.frequencyBinCount) {
          buffer = new Uint8Array(analyser.frequencyBinCount);
        }
        analyser.getByteFrequencyData(buffer);
        const left = margin.left;
        const right = width - margin.right;
        const top = margin.top;
        const bottom = height - margin.bottom;
        const plotWidth = Math.max(1, right - left);
        const plotHeight = Math.max(1, bottom - top);
        const nyquist = analyser.context.sampleRate / 2;
        const steps = Math.max(28, Math.round(plotWidth));
        const gradient = context.createLinearGradient(left, bottom, right, top);
        gradient.addColorStop(0, 'rgba(119,214,222,.30)');
        gradient.addColorStop(.55, 'rgba(201,166,255,.22)');
        gradient.addColorStop(1, 'rgba(233,160,205,.18)');
        context.beginPath();
        context.moveTo(left, bottom);
        for (let index = 0; index <= steps; index++) {
          const ratio = index / steps;
          const x = left + ratio * plotWidth;
          const frequency = 20 * Math.pow(20000 / 20, ratio);
          const bin = Math.min(buffer.length - 1, Math.max(0, Math.round((frequency / nyquist) * buffer.length)));
          const value = buffer[bin] / 255;
          context.lineTo(x, bottom - Math.pow(value, 1.35) * plotHeight * 0.94);
        }
        context.lineTo(right, bottom);
        context.closePath();
        context.fillStyle = gradient;
        context.fill();
      }
      frame = active && !reduced ? requestAnimationFrame(draw) : 0;
    };

    const updateReduced = () => {
      const next = media.matches || document.documentElement.classList.contains('reduce-motion');
      if (reduced && !next && active && !frame) draw();
      reduced = next;
    };
    media.addEventListener?.('change', updateReduced);
    const observer = new MutationObserver(updateReduced);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    draw();
    return () => {
      cancelAnimationFrame(frame);
      media.removeEventListener?.('change', updateReduced);
      observer.disconnect();
    };
  }, [active, getAnalyser, width, height, margin.left, margin.right, margin.top, margin.bottom]);

  return <canvas ref={canvasRef} className={className} aria-hidden="true"/>;
}

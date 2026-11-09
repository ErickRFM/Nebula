'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { AUDIO_BANDS, MAX_EQ_DB } from '../lib/audio-enhancer';
import { AudioVisualizer } from './AudioVisualizer';

interface EqCurveProps {
  bands: number[];
  onChange: (index: number, value: number) => void;
  getAnalyser: () => AnalyserNode | null;
  active: boolean;
}

const FREQ_MIN = 20;
const FREQ_MAX = 20000;
const GRID_GAINS = [-12, -6, 0, 6, 12];
const GRID_FREQUENCIES = [60, 250, 1000, 4000, 12000];

function round(value: number) {
  return Math.round(value * 100) / 100;
}

function clampGain(value: number) {
  return Math.round(Math.max(-MAX_EQ_DB, Math.min(MAX_EQ_DB, value)) * 2) / 2;
}

function formatGain(value: number) {
  return (value > 0 ? '+' : '') + value.toFixed(1);
}

function formatFrequency(frequency: number) {
  if (frequency >= 1000) {
    const value = frequency / 1000;
    return (Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)) + 'k';
  }
  return String(frequency);
}

function smoothPath(points: { x: number; y: number }[]) {
  if (points.length === 0) return '';
  let path = `M ${round(points[0].x)} ${round(points[0].y)}`;
  for (let index = 0; index < points.length - 1; index++) {
    const from = points[index];
    const to = points[index + 1];
    const handle = (to.x - from.x) * 0.42;
    path += ` C ${round(from.x + handle)} ${round(from.y)}, ${round(to.x - handle)} ${round(to.y)}, ${round(to.x)} ${round(to.y)}`;
  }
  return path;
}

export function EqCurve({ bands, onChange, getAnalyser, active }: EqCurveProps) {
  const graphRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const pendingRef = useRef<{ index: number; value: number } | null>(null);
  const [size, setSize] = useState({ width: 720, height: 260 });
  const [dragging, setDragging] = useState<number | null>(null);
  const [focused, setFocused] = useState<number | null>(null);
  const gradientId = useId().replace(/:/g, '');

  useEffect(() => {
    const element = graphRef.current;
    if (!element) return;
    const measure = () => {
      const rect = element.getBoundingClientRect();
      setSize({ width: Math.max(260, rect.width), height: Math.max(180, rect.height) });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => () => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
  }, []);

  const margin = useMemo(() => ({
    left: size.width < 480 ? 26 : 34,
    right: 14,
    top: 20,
    bottom: 26,
  }), [size.width]);
  const plotWidth = Math.max(1, size.width - margin.left - margin.right);
  const plotHeight = Math.max(1, size.height - margin.top - margin.bottom);

  const frequencyToX = useCallback((frequency: number) => (
    margin.left + (Math.log10(frequency / FREQ_MIN) / Math.log10(FREQ_MAX / FREQ_MIN)) * plotWidth
  ), [margin.left, plotWidth]);
  const gainToY = useCallback((gain: number) => (
    margin.top + ((MAX_EQ_DB - gain) / (MAX_EQ_DB * 2)) * plotHeight
  ), [margin.top, plotHeight]);

  const points = useMemo(() => AUDIO_BANDS.map((band, index) => {
    const value = bands[index] ?? 0;
    return {
      index, frequency: band.frequency, label: band.label, value,
      x: frequencyToX(band.frequency), y: gainToY(value),
    };
  }), [bands, frequencyToX, gainToY]);

  const curvePath = useMemo(() => {
    const first = points[0]?.value ?? 0;
    const last = points[points.length - 1]?.value ?? 0;
    return smoothPath([
      { x: frequencyToX(FREQ_MIN), y: gainToY(first) },
      ...points.map(({ x, y }) => ({ x, y })),
      { x: frequencyToX(FREQ_MAX), y: gainToY(last) },
    ]);
  }, [points, frequencyToX, gainToY]);

  const baseline = margin.top + plotHeight;
  const areaPath = `${curvePath} L ${round(frequencyToX(FREQ_MAX))} ${round(baseline)} L ${round(frequencyToX(FREQ_MIN))} ${round(baseline)} Z`;

  const commit = useCallback((index: number, value: number) => {
    pendingRef.current = { index, value };
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      const pending = pendingRef.current;
      pendingRef.current = null;
      if (pending) onChange(pending.index, pending.value);
    });
  }, [onChange]);

  const valueFromPointer = useCallback((clientY: number) => {
    const rect = graphRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    const relativeY = clientY - rect.top;
    const raw = MAX_EQ_DB - ((relativeY - margin.top) / plotHeight) * (MAX_EQ_DB * 2);
    return clampGain(raw);
  }, [margin.top, plotHeight]);

  const activePoint = dragging !== null ? points[dragging] : focused !== null ? points[focused] : null;

  return <div className="eq-graph" ref={graphRef}>
    <AudioVisualizer active={active} getAnalyser={getAnalyser} width={size.width} height={size.height} margin={margin} />
    <svg className="eq-curve" width={size.width} height={size.height} viewBox={`0 0 ${size.width} ${size.height}`}
      role="group" aria-label="Curva del ecualizador">
      <defs>
        <linearGradient id={gradientId + '-line'} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#77d6de"/>
          <stop offset="52%" stopColor="#c9a6ff"/>
          <stop offset="100%" stopColor="#e9a0cd"/>
        </linearGradient>
        <linearGradient id={gradientId + '-fill'} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#c9a6ff" stopOpacity="0.28"/>
          <stop offset="100%" stopColor="#77d6de" stopOpacity="0.03"/>
        </linearGradient>
      </defs>
      {GRID_GAINS.map((gain) => (
        <line key={'gain-' + gain} x1={margin.left} x2={size.width - margin.right}
          y1={gainToY(gain)} y2={gainToY(gain)} className={'eq-grid-line' + (gain === 0 ? ' is-zero' : '')}/>
      ))}
      {GRID_GAINS.map((gain) => (
        <text key={'gain-label-' + gain} x={margin.left - 7} y={gainToY(gain) + 3}
          textAnchor="end" className="eq-axis-label">{gain > 0 ? '+' + gain : gain}</text>
      ))}
      {GRID_FREQUENCIES.map((frequency) => (
        <line key={'frequency-' + frequency} x1={frequencyToX(frequency)} x2={frequencyToX(frequency)}
          y1={margin.top} y2={baseline} className="eq-grid-line"/>
      ))}
      {GRID_FREQUENCIES.map((frequency) => (
        <text key={'frequency-label-' + frequency} x={frequencyToX(frequency)} y={size.height - 8}
          textAnchor="middle" className="eq-axis-label">{formatFrequency(frequency)}</text>
      ))}
      <path d={areaPath} fill={`url(#${gradientId}-fill)`}/>
      <path d={curvePath} fill="none" stroke={`url(#${gradientId}-line)`} strokeWidth="2.5"
        strokeLinecap="round" strokeLinejoin="round"/>
      {points.map((point) => {
        const isActive = dragging === point.index || focused === point.index;
        return <g key={point.frequency} className={'eq-node' + (isActive ? ' is-active' : '')}
          role="slider" tabIndex={0} aria-orientation="vertical"
          aria-label={'Banda ' + point.label} aria-valuemin={-MAX_EQ_DB} aria-valuemax={MAX_EQ_DB}
          aria-valuenow={point.value} aria-valuetext={formatGain(point.value) + ' dB'}
          onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
            event.currentTarget.setPointerCapture(event.pointerId);
            setDragging(point.index);
            commit(point.index, valueFromPointer(event.clientY));
          }}
          onPointerMove={(event) => {
            if (dragging !== point.index) return;
            event.preventDefault();
            commit(point.index, valueFromPointer(event.clientY));
          }}
          onPointerUp={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId);
            }
            setDragging(null);
          }}
          onPointerCancel={() => setDragging(null)}
          onLostPointerCapture={() => setDragging(null)}
          onDoubleClick={() => onChange(point.index, 0)}
          onFocus={() => setFocused(point.index)}
          onBlur={() => setFocused(null)}
          onKeyDown={(event) => {
            const step = event.shiftKey ? 2 : 0.5;
            let next: number | null = null;
            if (event.key === 'ArrowUp' || event.key === 'ArrowRight') next = point.value + step;
            else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') next = point.value - step;
            else if (event.key === 'PageUp') next = point.value + 3;
            else if (event.key === 'PageDown') next = point.value - 3;
            else if (event.key === 'Home') next = -MAX_EQ_DB;
            else if (event.key === 'End') next = MAX_EQ_DB;
            else if (event.key === '0' || event.key === 'Delete' || event.key === 'Backspace') next = 0;
            if (next === null) return;
            event.preventDefault();
            onChange(point.index, clampGain(next));
          }}>
          <circle cx={point.x} cy={point.y} r={17} className="eq-node-hit"/>
          <circle cx={point.x} cy={point.y} r={11} className="eq-node-halo"/>
          <circle cx={point.x} cy={point.y} r={5.5} className="eq-node-dot"/>
          <title>{point.label + ': ' + formatGain(point.value) + ' dB'}</title>
        </g>;
      })}
      {activePoint && (
        <text x={margin.left} y={14} className="eq-active-label">
          {activePoint.label + ' · ' + formatGain(activePoint.value) + ' dB'}
        </text>
      )}
    </svg>
  </div>;
}

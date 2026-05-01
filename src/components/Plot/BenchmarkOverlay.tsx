import React, { useEffect, useRef } from 'react';

export const BenchmarkOverlay: React.FC = () => {
  const logRef = useRef<{time: number, frameTime: number, webglTime: number, points: number}[]>([]);
  const latestPoints = useRef(0);
  const latestWebglTime = useRef(0);

  useEffect(() => {
    let frameCount = 0;
    let lastTime = performance.now();
    let rafId: number;

    const loop = () => {
      frameCount++;
      const now = performance.now();
      if (now - lastTime >= 1000) {
        const currentFrameTime = (now - lastTime) / frameCount;
        
        logRef.current.push({ time: Math.round(now), frameTime: Number(currentFrameTime.toFixed(1)), webglTime: Number(latestWebglTime.current.toFixed(1)), points: latestPoints.current });
        
        frameCount = 0;
        lastTime = now;
      }
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      latestPoints.current = detail.points;
      latestWebglTime.current = detail.webglTime || 0;
    };
    window.addEventListener('render-stats', handler);
    return () => window.removeEventListener('render-stats', handler);
  }, []);

  const copyLog = () => {
    const text = logRef.current.map(l => `${l.time},${l.frameTime},${l.webglTime},${l.points}`).join('\n');
    navigator.clipboard.writeText("TimeMs,FrameTimeMs,WebGLTimeMs,Points\n" + text).then(() => {
      alert('Benchmark log copied to clipboard! (' + logRef.current.length + ' entries)');
    });
  };

  return (
    <button 
      onClick={(e) => { e.stopPropagation(); copyLog(); }}
      style={{ position: 'absolute', top: 10, left: 60, zIndex: 9999, background: 'rgba(0,0,0,0.7)', color: '#0f0', border: '1px solid #0f0', padding: '4px', cursor: 'pointer', fontSize: '10px', fontFamily: 'monospace' }}
    >
      Copy Bench Log
    </button>
  );
};

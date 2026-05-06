import React, { useMemo } from 'react';
import { Line } from '@react-three/drei';

export default function PatternVisualizer({ points, currentStitch }) {
  const renderedPoints = useMemo(() => {
    if (!points || points.length === 0) return [];
    return points.slice(0, currentStitch);
  }, [points, currentStitch]);

  if (renderedPoints.length < 2) return null;

  return (
    <Line 
      points={renderedPoints} 
      color="#ec4899" // Pink yarn color to stand out against blue geometry
      lineWidth={4} 
      dashed={false}
      depthTest={false} // so the line is visible even if it intersects the mesh slightly
    />
  );
}

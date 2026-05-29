import React, { useMemo } from 'react';
import { Line } from '@react-three/drei';

export default function PatternVisualizer({ 
  points, 
  currentStitch,
  showStitchMarkers = true,
  colorCodeStitches = true,
  markerSize = 6
}) {
  const renderedPoints = useMemo(() => {
    if (!points || points.length === 0) return [];
    return points.slice(0, currentStitch);
  }, [points, currentStitch]);

  const { positions, colors } = useMemo(() => {
    const pos = [];
    const cols = [];
    
    renderedPoints.forEach(pt => {
      pos.push(pt.x, pt.y, pt.z);
      
      // Color coding:
      // - inc -> Emerald Green
      // - dec -> Crimson Red
      // - sc -> Pink Yarn
      if (colorCodeStitches) {
        if (pt.stitchType === 'inc') {
          cols.push(0.06, 0.72, 0.5); // Emerald Green #10b981
        } else if (pt.stitchType === 'dec') {
          cols.push(0.94, 0.27, 0.27); // Crimson Red #ef4444
        } else {
          cols.push(0.92, 0.28, 0.6); // Pink #ec4899
        }
      } else {
        cols.push(0.92, 0.28, 0.6); // Uniform Pink #ec4899
      }
    });

    return {
      positions: new Float32Array(pos),
      colors: new Float32Array(cols)
    };
  }, [renderedPoints, colorCodeStitches]);

  if (renderedPoints.length < 2) return null;

  return (
    <group>
      {/* Continuous yarn path line */}
      <Line 
        points={renderedPoints} 
        color="#ec4899" 
        lineWidth={3.5} 
        dashed={false}
        depthTest={false} 
      />

      {/* Color-coded stitch point markers */}
      {showStitchMarkers && positions.length > 0 && (
        <points>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              args={[positions, 3]}
            />
            <bufferAttribute
              attach="attributes-color"
              args={[colors, 3]}
            />
          </bufferGeometry>
          <pointsMaterial
            size={markerSize}
            sizeAttenuation={true}
            vertexColors={true}
            depthTest={false}
            transparent={true}
            opacity={0.9}
          />
        </points>
      )}
    </group>
  );
}

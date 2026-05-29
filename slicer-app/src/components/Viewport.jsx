import React, { useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stage } from '@react-three/drei';
import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import PatternVisualizer from './PatternVisualizer';

export default function Viewport({ 
  parts = [], 
  activePartId = null, 
  onGeometryLoaded, 
  showMesh = true,
  showStitchMarkers = true,
  colorCodeStitches = true,
  markerSize = 6,
  wireframe = false 
}) {
  
  useEffect(() => {
    parts.forEach(part => {
      if (part.file && !part.geometry) {
        const reader = new FileReader();
        
        reader.onload = (e) => {
          const contents = e.target.result;
          const extension = part.file.name.split('.').pop().toLowerCase();
          let geom;

          try {
            if (extension === 'stl') {
              const loader = new STLLoader();
              geom = loader.parse(contents);
            } else if (extension === 'obj') {
              const loader = new OBJLoader();
              const text = new TextDecoder().decode(contents);
              const group = loader.parse(text);
              group.traverse((child) => {
                if (child.isMesh && !geom) {
                  geom = child.geometry.clone();
                }
              });
            }

            if (geom) {
              geom.computeVertexNormals();
              geom.computeBoundingBox();
              onGeometryLoaded(part.id, geom);
            } else {
              console.error(`No valid geometry found in part: ${part.name}`);
            }
          } catch (error) {
            console.error(`Error parsing 3D file for part ${part.name}:`, error);
          }
        };

        reader.readAsArrayBuffer(part.file);
      }
    });
  }, [parts, onGeometryLoaded]);

  const hasAnyGeometry = parts.some(p => p.geometry || p.assembledGeometry);

  return (
    <Canvas shadows={{ type: THREE.PCFShadowMap }} camera={{ position: [0, 0, 150], fov: 45 }}>
      <color attach="background" args={['#0f172a']} />
      
      {/* Dynamic Lighting Setup */}
      <ambientLight intensity={0.4} />
      <directionalLight position={[20, 50, 20]} intensity={1.5} castShadow />
      <pointLight position={[-20, -20, -20]} intensity={0.5} color="#4f46e5" />
      <pointLight position={[20, 0, -20]} intensity={0.8} color="#e0e7ff" />
      
      {hasAnyGeometry ? (
        <Stage environment="apartment" intensity={0.5} adjustCamera={1.2}>
          {parts.map(part => {
            const hasGeom = part.geometry || part.assembledGeometry;
            if (!hasGeom) return null;
            
            const isActive = part.id === activePartId;
            if (activePartId !== null && !isActive) return null;

            const renderingGeom = isActive ? part.geometry : (part.assembledGeometry || part.geometry);
            const renderingPoints = isActive ? part.points : part.assembledPoints;
            const renderingCurrentStitch = isActive 
              ? (part.currentStitch !== undefined ? part.currentStitch : (part.points?.length || 0))
              : (part.assembledPoints?.length || 0);

            return (
              <group 
                key={part.id}
                position={[part.position?.x || 0, part.position?.y || 0, part.position?.z || 0]}
              >
                {showMesh && (
                  <mesh geometry={renderingGeom} castShadow receiveShadow>
                    {isActive ? (
                      <meshPhysicalMaterial 
                        color="#4f46e5" 
                        roughness={0.2} 
                        metalness={0.1} 
                        clearcoat={0.3}
                        clearcoatRoughness={0.4}
                        transparent={true}
                        opacity={0.85}
                        wireframe={wireframe}
                      />
                    ) : (
                      <meshPhysicalMaterial 
                        color="#6366f1" 
                        roughness={0.5} 
                        metalness={0.1} 
                        transparent={true}
                        opacity={0.6}
                        wireframe={wireframe}
                      />
                    )}
                  </mesh>
                )}
                {renderingPoints && renderingPoints.length > 0 && (
                  <PatternVisualizer 
                    points={renderingPoints} 
                    currentStitch={renderingCurrentStitch} 
                    showStitchMarkers={showStitchMarkers}
                    colorCodeStitches={colorCodeStitches}
                    markerSize={markerSize}
                  />
                )}
              </group>
            );
          })}
        </Stage>
      ) : (
        <mesh>
          <torusKnotGeometry args={[15, 4, 128, 32]} />
          <meshPhysicalMaterial 
            color="#334155" 
            roughness={0.8} 
            metalness={0.1} 
            wireframe={true} 
            transparent={true}
            opacity={0.3}
          />
        </mesh>
      )}
      
      <OrbitControls makeDefault autoRotate={!hasAnyGeometry} autoRotateSpeed={0.5} enablePan={true} enableZoom={true} />
    </Canvas>
  );
}

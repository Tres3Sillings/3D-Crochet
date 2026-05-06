import React, { useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stage } from '@react-three/drei';
import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import PatternVisualizer from './PatternVisualizer';

export default function Viewport({ file, onGeometryLoaded, wireframe = false, patternPoints = [], currentStitch = 0 }) {
  const [geometry, setGeometry] = useState(null);

  useEffect(() => {
    if (!file) {
      setGeometry(null);
      return;
    }
    const reader = new FileReader();
    
    reader.onload = (e) => {
      const contents = e.target.result;
      const extension = file.name.split('.').pop().toLowerCase();
      let geom;

      try {
        if (extension === 'stl') {
          const loader = new STLLoader();
          geom = loader.parse(contents);
          geom.center(); 
        } else if (extension === 'obj') {
          const loader = new OBJLoader();
          const text = new TextDecoder().decode(contents);
          const group = loader.parse(text);
          group.traverse((child) => {
            if (child.isMesh && !geom) {
              geom = child.geometry.clone();
            }
          });
          if (geom) geom.center();
        }

        if (geom) {
          geom.computeVertexNormals();
          setGeometry(geom);
          onGeometryLoaded(geom);
        } else {
          console.error("No valid geometry found in file.");
        }
      } catch (error) {
        console.error("Error parsing 3D file:", error);
      }
    };

    reader.readAsArrayBuffer(file);
  }, [file, onGeometryLoaded]);

  return (
    <Canvas shadows={{ type: THREE.PCFShadowMap }} camera={{ position: [0, 0, 150], fov: 45 }}>
      <color attach="background" args={['#0f172a']} />
      
      {/* Dynamic Lighting Setup */}
      <ambientLight intensity={0.4} />
      <directionalLight position={[20, 50, 20]} intensity={1.5} castShadow />
      <pointLight position={[-20, -20, -20]} intensity={0.5} color="#4f46e5" />
      <pointLight position={[20, 0, -20]} intensity={0.8} color="#e0e7ff" />
      
      {geometry ? (
        <Stage environment="apartment" intensity={0.5} adjustCamera={1.2}>
          <mesh geometry={geometry} castShadow receiveShadow>
            <meshPhysicalMaterial 
              color="#4f46e5" 
              roughness={0.2} 
              metalness={0.1} 
              clearcoat={0.3}
              clearcoatRoughness={0.4}
              wireframe={wireframe} 
            />
          </mesh>
          <PatternVisualizer points={patternPoints} currentStitch={currentStitch} />
        </Stage>
      ) : patternPoints && patternPoints.length > 0 ? (
        <Stage environment="apartment" intensity={0.5} adjustCamera={1.2}>
          <PatternVisualizer points={patternPoints} currentStitch={currentStitch} />
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
      
      <OrbitControls makeDefault autoRotate={!file} autoRotateSpeed={0.5} enablePan={true} enableZoom={true} />
    </Canvas>
  );
}

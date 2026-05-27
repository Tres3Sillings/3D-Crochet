import React, { useState, useEffect, useCallback, useMemo } from 'react';
import * as THREE from 'three';
import { UploadCloud, Scissors, Download, Copy, Settings2, Box, Info, Loader2, AlertCircle, Code, ScanFace, Wand2, RefreshCw, Plus, Trash2, Layers } from 'lucide-react';
import Viewport from './components/Viewport';
import { sliceGeometry } from './lib/slicer';
import { generateStitchPath, sanitizeHumanPattern } from './lib/parser';

const YARN_PRESETS = {
  0: { label: "0 - Lace", width: 1.5, height: 1.2, hook: "1.6mm – 2.25mm" },
  1: { label: "1 - Super Fine", width: 2.2, height: 1.8, hook: "2.25mm – 3.25mm" },
  2: { label: "2 - Fine / Sport", width: 3.0, height: 2.5, hook: "3.25mm – 3.75mm" },
  3: { label: "3 - Light / DK", width: 4.0, height: 3.2, hook: "3.75mm – 4.5mm" },
  4: { label: "4 - Medium / Worsted", width: 5.0, height: 4.0, hook: "4.5mm – 5.5mm" },
  5: { label: "5 - Bulky", width: 7.0, height: 5.5, hook: "5.5mm – 6.5mm" },
  6: { label: "6 - Super Bulky", width: 9.0, height: 7.0, hook: "6.5mm – 9.0mm" },
  7: { label: "7 - Jumbo", width: 15.0, height: 12.0, hook: "9.0mm and up" },
};

const PROJECT_TEMPLATES = {
  custom: {
    label: "Custom (Blank Project)",
    parts: []
  },
  biped: {
    label: "Standard Biped (Head, Body, Limbs)",
    parts: [
      { name: "Head", qty: 1, attachesToName: "", placementNotes: "Stuff firmly, close." },
      { name: "Body", qty: 1, attachesToName: "Head", placementNotes: "Sew to Head, stuff firmly." },
      { name: "Arm", qty: 2, attachesToName: "Body", placementNotes: "Sew to sides of Body near R15." },
      { name: "Leg", qty: 2, attachesToName: "Body", placementNotes: "Sew to bottom of Body." },
    ]
  },
  quadruped: {
    label: "Standard Quadruped (Four-Legged)",
    parts: [
      { name: "Head", qty: 1, attachesToName: "", placementNotes: "Stuff firmly." },
      { name: "Body", qty: 1, attachesToName: "Head", placementNotes: "Sew to Head." },
      { name: "Leg", qty: 4, attachesToName: "Body", placementNotes: "Sew to bottom-sides of Body." },
      { name: "Ears", qty: 2, attachesToName: "Head", placementNotes: "Sew to top of Head." },
      { name: "Tail", qty: 1, attachesToName: "Body", placementNotes: "Sew to back of Body." },
    ]
  }
};

const applyTransformToGeometry = (geom, rx, ry, rz) => {
  if (!geom) return null;
  const cloned = geom.clone();
  const euler = new THREE.Euler(
    (rx || 0) * Math.PI / 180,
    (ry || 0) * Math.PI / 180,
    (rz || 0) * Math.PI / 180,
    'XYZ'
  );
  const q = new THREE.Quaternion().setFromEuler(euler);
  cloned.applyQuaternion(q);
  cloned.computeBoundingBox();
  cloned.computeVertexNormals();
  return cloned;
};

const mapStitchesToAssembly = (points, rx, ry, rz, centroid) => {
  if (!points || points.length === 0) return [];
  const euler = new THREE.Euler(
    (rx || 0) * Math.PI / 180,
    (ry || 0) * Math.PI / 180,
    (rz || 0) * Math.PI / 180,
    'XYZ'
  );
  const q = new THREE.Quaternion().setFromEuler(euler);
  const qInv = q.clone().invert();
  const center = centroid || new THREE.Vector3(0, 0, 0);

  return points.map(pt => {
    return pt.clone().applyQuaternion(qInv).add(center);
  });
};

const formatCrochetPattern = (rawLine) => {
  if (!rawLine) return "";
  let formatted = rawLine;

  // 1. Convert multiplier format: "X * [ actions ]" to "[ actions ] x X"
  const multiplierRegex = /(\d+)\s*\*\s*\[([^\]]+)\]/g;
  formatted = formatted.replace(multiplierRegex, '[$2] x $1');

  // 2. Translate raw code terms to standard human crochet abbreviations
  formatted = formatted.replaceAll('sc2inc', 'inc');
  formatted = formatted.replaceAll('sc2tog', 'dec');

  // 3. Clean up spacing for readability
  formatted = formatted.replace(/\s+/g, ' ').trim();

  return formatted;
};

function App() {
  const [appMode, setAppMode] = useState('slicer'); // 'slicer' | 'validator'

  // Common State
  const [gauge, setGauge] = useState({ width: 5.0, height: 4.0 });
  const [selectedPreset, setSelectedPreset] = useState('4');
  const [wireframe, setWireframe] = useState(false);
  const [minStitches, setMinStitches] = useState(6);

  // Gauge & Preset Handlers
  const handleWidthChange = (valStr) => {
    const val = parseFloat(valStr);
    const widthVal = isNaN(val) ? '' : val;
    const newGauge = { ...gauge, width: widthVal };
    setGauge(newGauge);
    
    if (!isNaN(val)) {
      const matchedKey = Object.keys(YARN_PRESETS).find(key => 
        YARN_PRESETS[key].width === val && 
        YARN_PRESETS[key].height === gauge.height
      );
      setSelectedPreset(matchedKey || 'custom');
    } else {
      setSelectedPreset('custom');
    }
  };

  const handleHeightChange = (valStr) => {
    const val = parseFloat(valStr);
    const heightVal = isNaN(val) ? '' : val;
    const newGauge = { ...gauge, height: heightVal };
    setGauge(newGauge);
    
    if (!isNaN(val)) {
      const matchedKey = Object.keys(YARN_PRESETS).find(key => 
        YARN_PRESETS[key].width === gauge.width && 
        YARN_PRESETS[key].height === val
      );
      setSelectedPreset(matchedKey || 'custom');
    } else {
      setSelectedPreset('custom');
    }
  };

  const handlePresetChange = (presetKey) => {
    setSelectedPreset(presetKey);
    if (presetKey !== 'custom' && YARN_PRESETS[presetKey]) {
      setGauge({
        width: YARN_PRESETS[presetKey].width,
        height: YARN_PRESETS[presetKey].height
      });
    }
  };

  // Slicer Project State (Multi-Part)
  const [parts, setParts] = useState([
    {
      id: 'part-1',
      name: 'Main Body',
      qty: 1,
      attachesTo: '',
      placementNotes: '',
      file: null,
      geometry: null,
      originalGeometry: null,
      assembledGeometry: null,
      centroid: null,
      rotation: { x: 0, y: 0, z: 0 },
      position: { x: 0, y: 0, z: 0 },
      patternData: null,
      points: [],
      assembledPoints: [],
      error: null,
    }
  ]);
  const [activePartId, setActivePartId] = useState('part-1');
  const [activeTemplate, setActiveTemplate] = useState('custom');
  const [isProcessing, setIsProcessing] = useState(false);

  const addPart = () => {
    const newId = `part-${Date.now()}`;
    setParts([
      ...parts,
      {
        id: newId,
        name: `New Part ${parts.length + 1}`,
        qty: 1,
        attachesTo: '',
        placementNotes: '',
        file: null,
        geometry: null,
        originalGeometry: null,
        assembledGeometry: null,
        centroid: null,
        rotation: { x: 0, y: 0, z: 0 },
        position: { x: 0, y: 0, z: 0 },
        patternData: null,
        points: [],
        assembledPoints: [],
        error: null,
      }
    ]);
    setActivePartId(newId);
  };

  const loadTemplate = (templateKey) => {
    const template = PROJECT_TEMPLATES[templateKey];
    if (!template) return;
    
    if (templateKey === 'custom') {
      const defaultPartId = `part-${Date.now()}`;
      setParts([
        {
          id: defaultPartId,
          name: "Main Body",
          qty: 1,
          attachesTo: "",
          placementNotes: "",
          file: null,
          geometry: null,
          originalGeometry: null,
          assembledGeometry: null,
          centroid: null,
          rotation: { x: 0, y: 0, z: 0 },
          position: { x: 0, y: 0, z: 0 },
          patternData: null,
          points: [],
          assembledPoints: [],
          error: null,
        }
      ]);
      setActivePartId(defaultPartId);
      return;
    }
    
    // Create new parts with IDs
    const newParts = template.parts.map((p, idx) => ({
      id: `part-${idx}-${Date.now()}`,
      name: p.name,
      qty: p.qty,
      attachesTo: "", 
      _tempAttachesToName: p.attachesToName,
      placementNotes: p.placementNotes,
      file: null,
      geometry: null,
      originalGeometry: null,
      assembledGeometry: null,
      centroid: null,
      rotation: { x: 0, y: 0, z: 0 },
      position: { x: 0, y: 0, z: 0 },
      patternData: null,
      points: [],
      assembledPoints: [],
      error: null,
    }));
    
    // Resolve attachesTo IDs
    newParts.forEach(p => {
      if (p._tempAttachesToName) {
        const target = newParts.find(other => other.name.toLowerCase() === p._tempAttachesToName.toLowerCase());
        if (target) {
          p.attachesTo = target.id;
        }
      }
      delete p._tempAttachesToName;
    });
    
    setParts(newParts);
    if (newParts.length > 0) {
      setActivePartId(newParts[0].id);
    }
  };

  // Compute activePart and geometry helpers
  const activePart = useMemo(() => {
    if (!activePartId) return null;
    return parts.find(p => p.id === activePartId) || null;
  }, [parts, activePartId]);

  const geometry = activePart?.geometry || null;
  const slicerPatternData = activePart?.patternData || null;

  // Validator State
  const [validatorText, setValidatorText] = useState("Round 1: 6 sc in MR (6)\nRound 2: inc x 6 (12)\nRound 3: (sc, inc) 6 times (18)\nR4: [2sc, inc] * 6 (24)\n5: 24 sc (24)");
  const [validatorPoints, setValidatorPoints] = useState([]);
  const [validatorCurrentStitch, setValidatorCurrentStitch] = useState(0);
  const [validatorErrors, setValidatorErrors] = useState([]);

  // Blender Guide & Debugger States
  const [showBlenderGuide, setShowBlenderGuide] = useState(false);

  // Compute model dimensions (1 unit = 1 mm, convert to inches)
  // Mapping Three.js coordinates to Blender coordinate labels:
  // - Width (Blender X) -> Slicer X
  // - Depth (Blender Y) -> Slicer Z
  // - Height (Blender Z) -> Slicer Y
  const dimensions = useMemo(() => {
    if (activePartId && geometry) {
      if (!geometry.boundingBox) {
        geometry.computeBoundingBox();
      }
      const bbox = geometry.boundingBox;
      const w = bbox.max.x - bbox.min.x;
      const h = bbox.max.y - bbox.min.y;
      const d = bbox.max.z - bbox.min.z;
      return {
        width: { mm: w, in: w / 25.4 },
        depth: { mm: d, in: d / 25.4 },
        height: { mm: h, in: h / 25.4 }
      };
    } else {
      const geometries = parts.filter(p => p.assembledGeometry);
      if (geometries.length === 0) return null;
      
      const combinedBox = new THREE.Box3();
      geometries.forEach(p => {
        if (!p.assembledGeometry.boundingBox) {
          p.assembledGeometry.computeBoundingBox();
        }
        const bbox = p.assembledGeometry.boundingBox.clone();
        const offset = new THREE.Vector3(
          p.position?.x || 0,
          p.position?.y || 0,
          p.position?.z || 0
        );
        bbox.min.add(offset);
        bbox.max.add(offset);
        
        combinedBox.union(bbox);
      });
      
      const w = combinedBox.max.x - combinedBox.min.x;
      const h = combinedBox.max.y - combinedBox.min.y;
      const d = combinedBox.max.z - combinedBox.min.z;
      return {
        width: { mm: w, in: w / 25.4 },
        depth: { mm: d, in: d / 25.4 },
        height: { mm: h, in: h / 25.4 }
      };
    }
  }, [parts, activePartId, geometry]);

  // Detect scale issue warnings
  const sizeWarning = useMemo(() => {
    if (!dimensions) return null;
    const h = dimensions.height.mm;
    const currentStitchHeight = parseFloat(gauge.height) || 4.0;
    
    if (h < currentStitchHeight * 3) {
      return {
        type: 'small',
        message: `Model is very small (${h.toFixed(1)} mm / ${dimensions.height.in.toFixed(2)}"). Slicing will generate very few rounds. Recommend scaling it up in Blender.`
      };
    }
    if (h > currentStitchHeight * 150) {
      return {
        type: 'large',
        message: `Model is very large (${h.toFixed(1)} mm / ${dimensions.height.in.toFixed(2)}"). Slicing will generate over 150 rounds (${Math.floor(h / currentStitchHeight)} rounds), which may lag. Recommend scaling it down in Blender.`
      };
    }
    return null;
  }, [dimensions, gauge.height]);

  // Analyze geometry and recommend separation of parts (e.g. limbs, head, body, ears)
  const separationRecommendation = useMemo(() => {
    if (!activePartId || !dimensions) return null;
    const w = dimensions.width.mm;
    const d = dimensions.depth.mm;
    const h = dimensions.height.mm;
    
    // 1. Check aspect ratio. In amigurumi, limbs/ears sticking out laterally cause high width-to-depth ratio.
    // Standard body components are relatively round (width/depth ratio 0.8 - 1.3).
    // An outstretched limb model (like T-pose bunny) has width/depth ratio > 1.4.
    const isFlatAndWide = w / d > 1.4;
    
    // 2. Check for complex appendages. If width is similar to or greater than height, it usually means wings/arms are outstretched.
    const hasOutstretchedParts = w / h > 0.6 && h > 20; // only for non-trivial size models
    
    if (isFlatAndWide || hasOutstretchedParts) {
      return {
        ratio: (w / d).toFixed(1),
        suggestedParts: [
          "Head (crocheted as a sphere/egg)",
          "Body / Torso (crocheted as a separate tube/egg)",
          "Arms / Legs / Wings (crocheted as separate narrow tubes)",
          "Ears / Tail (crocheted as separate flat or cone shapes)"
        ]
      };
    }
    return null;
  }, [activePartId, dimensions]);

  // --- Slicer Logic (Multi-Part) ---
  const handleFileUpload = (partId, file) => {
    if (file) {
      setParts(prevParts => prevParts.map(p => 
        p.id === partId 
          ? { 
              ...p, 
              file: file, 
              geometry: null, 
              originalGeometry: null,
              assembledGeometry: null,
              centroid: null,
              rotation: { x: 0, y: 0, z: 0 },
              position: { x: 0, y: 0, z: 0 },
              patternData: null, 
              points: [], 
              assembledPoints: [],
              error: null 
            } 
          : p
      ));
    }
  };

  const handleGeometryLoaded = useCallback((partId, geom) => {
    geom.computeBoundingBox();
    const centroid = new THREE.Vector3();
    geom.boundingBox.getCenter(centroid);

    const centeredGeom = geom.clone();
    centeredGeom.center();

    const assembledGeom = geom.clone(); 

    setParts(prevParts => prevParts.map(p => {
      if (p.id === partId) {
        const rx = p.rotation?.x || 0;
        const ry = p.rotation?.y || 0;
        const rz = p.rotation?.z || 0;
        const transformedGeom = applyTransformToGeometry(centeredGeom, rx, ry, rz);
        return { 
          ...p, 
          originalGeometry: centeredGeom,
          assembledGeometry: assembledGeom,
          centroid: centroid,
          geometry: transformedGeom,
          error: null 
        };
      }
      return p;
    }));
  }, []);

  const updatePartTransform = (partId, newRotation, newPosition) => {
    setParts(prevParts => prevParts.map(p => {
      if (p.id === partId) {
        const r = newRotation || p.rotation || { x: 0, y: 0, z: 0 };
        const pos = newPosition || p.position || { x: 0, y: 0, z: 0 };
        
        const rotationChanged = newRotation && (
          p.rotation.x !== r.x || 
          p.rotation.y !== r.y || 
          p.rotation.z !== r.z
        );
        
        if (rotationChanged) {
          const geom = p.originalGeometry 
            ? applyTransformToGeometry(p.originalGeometry, r.x, r.y, r.z) 
            : null;
          return {
            ...p,
            rotation: r,
            position: pos,
            geometry: geom,
            patternData: null,
            points: [],
            assembledPoints: []
          };
        } else {
          return {
            ...p,
            position: pos
          };
        }
      }
      return p;
    }));
  };

  const autoOrientPart = (partId) => {
    setParts(prevParts => prevParts.map(p => {
      if (p.id === partId && p.originalGeometry) {
        const positionAttr = p.originalGeometry.attributes.position;
        const count = positionAttr.count;
        
        let cx = 0, cy = 0, cz = 0;
        for (let i = 0; i < count; i++) {
          cx += positionAttr.getX(i);
          cy += positionAttr.getY(i);
          cz += positionAttr.getZ(i);
        }
        cx /= count;
        cy /= count;
        cz /= count;

        let cxx = 0, cyy = 0, czz = 0;
        let cxy = 0, cxz = 0, cyz = 0;
        for (let i = 0; i < count; i++) {
          const x = positionAttr.getX(i) - cx;
          const y = positionAttr.getY(i) - cy;
          const z = positionAttr.getZ(i) - cz;
          cxx += x * x;
          cyy += y * y;
          czz += z * z;
          cxy += x * y;
          cxz += x * z;
          cyz += y * z;
        }
        cxx /= count;
        cyy /= count;
        czz /= count;
        cxy /= count;
        cxz /= count;
        cyz /= count;

        let vx = 1, vy = 1, vz = 1;
        let len = Math.sqrt(vx*vx + vy*vy + vz*vz);
        vx /= len; vy /= len; vz /= len;

        for (let iter = 0; iter < 15; iter++) {
          const nx = cxx * vx + cxy * vy + cxz * vz;
          const ny = cxy * vx + cyy * vy + cyz * vz;
          const nz = cxz * vx + cyz * vy + czz * vz;
          
          const d = Math.sqrt(nx*nx + ny*ny + nz*nz);
          if (d < 1e-9) break;
          vx = nx / d;
          vy = ny / d;
          vz = nz / d;
        }

        const principalAxis = new THREE.Vector3(vx, vy, vz).normalize();
        const targetAxis = new THREE.Vector3(0, 1, 0);
        const quaternion = new THREE.Quaternion().setFromUnitVectors(principalAxis, targetAxis);
        const euler = new THREE.Euler().setFromQuaternion(quaternion, 'XYZ');
        
        const rx = Math.round(euler.x * 180 / Math.PI);
        const ry = Math.round(euler.y * 180 / Math.PI);
        const rz = Math.round(euler.z * 180 / Math.PI);

        const r = { x: rx, y: ry, z: rz };
        const geom = applyTransformToGeometry(p.originalGeometry, r.x, r.y, r.z);

        return {
          ...p,
          rotation: r,
          geometry: geom,
          patternData: null,
          points: [],
          assembledPoints: []
        };
      }
      return p;
    }));
  };

  const generateSlicerPattern = () => {
    setIsProcessing(true);
    setTimeout(() => {
      const w = parseFloat(gauge.width) || 5.0;
      const h = parseFloat(gauge.height) || 4.0;
      
      setParts(prevParts => prevParts.map(part => {
        if (!part.geometry) return part;
        
        const partW = part.customGauge ? parseFloat(part.customGauge.width) || w : w;
        const partH = part.customGauge ? parseFloat(part.customGauge.height) || h : h;
        
        try {
          const result = sliceGeometry(part.geometry, partW, partH, minStitches);
          if (!result || result.pattern.length === 0) {
            return { ...part, error: "No slices generated. Check size." };
          }
          const points = generateStitchPath(result);
          
          const assembledPoints = mapStitchesToAssembly(
            points,
            part.rotation?.x || 0,
            part.rotation?.y || 0,
            part.rotation?.z || 0,
            part.centroid
          );

          return {
            ...part,
            patternData: result,
            points: points,
            assembledPoints: assembledPoints,
            currentStitch: points.length,
            error: null
          };
        } catch (err) {
          console.error(`Slicing failed for part ${part.name}:`, err);
          return { ...part, error: "Slicing failed." };
        }
      }));
      setIsProcessing(false);
    }, 100);
  };

  // Auto-slice active part when its geometry changes
  useEffect(() => {
    if (geometry && appMode === 'slicer' && activePart && !activePart.patternData) {
      generateSlicerPattern();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geometry, activePartId, appMode]);

  // Trigger re-slice when minStitches changes
  useEffect(() => {
    setParts(prevParts => prevParts.map(p => ({
      ...p,
      patternData: null,
      points: [],
      assembledPoints: []
    })));
  }, [minStitches]);

  // --- Validator Logic ---
  useEffect(() => {
    if (appMode !== 'validator') return;
    
    const w = parseFloat(gauge.width) || 5.0;
    const h = parseFloat(gauge.height) || 4.0;
    
    // Parse the human text
    const { pattern, errors } = sanitizeHumanPattern(validatorText, w, h);
    setValidatorErrors(errors);
    
    if (pattern && pattern.length > 0) {
       const points = generateStitchPath({ pattern });
       setValidatorPoints(points);
       // Auto-scrub to end if it's the first time or if we add more
       setValidatorCurrentStitch(points.length);
    } else {
       setValidatorPoints([]);
       setValidatorCurrentStitch(0);
    }
  }, [validatorText, gauge, appMode]);

  // --- Shared UI & Pattern Compiler ---
  const rawPatternString = useMemo(() => {
    const slicedParts = parts.filter(p => p.patternData);
    if (slicedParts.length === 0) return "";
    
    let doc = `==================================================\n`;
    doc += `AMIGURUMI CROCHET PATTERN\n`;
    doc += `Global Yarn Gauge: ${gauge.width}mm width, ${gauge.height}mm height\n`;
    doc += `==================================================\n\n`;
    
    slicedParts.forEach(p => {
      const partW = p.customGauge ? p.customGauge.width : gauge.width;
      const partH = p.customGauge ? p.customGauge.height : gauge.height;
      const attachesToName = p.attachesTo ? parts.find(parent => parent.id === p.attachesTo)?.name : null;
      
      doc += `${p.name.toUpperCase()} (Make ${p.qty})\n`;
      if (p.customGauge) {
        doc += `* Note: Uses custom gauge (Width: ${partW}mm, Height: ${partH}mm)\n`;
      }
      doc += `--------------------------------------------------\n`;
      
      p.patternData.pattern.forEach(round => {
        doc += `Round ${round.round}: ${formatCrochetPattern(round.instruction)} (${round.stitches})\n`;
      });
      
      if (attachesToName || p.placementNotes) {
        doc += `\nAssembly:\n`;
        if (attachesToName) {
          doc += `* Sew to the ${attachesToName.toUpperCase()}.\n`;
        }
        if (p.placementNotes) {
          doc += `* Note: ${p.placementNotes}\n`;
        }
      }
      doc += `\n`;
    });
    
    return doc;
  }, [parts, gauge]);

  const copyToClipboard = () => {
    if (!rawPatternString) return;
    navigator.clipboard.writeText(rawPatternString)
      .then(() => alert("Copied to clipboard!"))
      .catch(err => console.error("Could not copy text: ", err));
  };

  const downloadTextFile = () => {
    if (!rawPatternString) return;
    const element = document.createElement("a");
    const fileBlob = new Blob([rawPatternString], {type: 'text/plain'});
    element.href = URL.createObjectURL(fileBlob);
    element.download = `${activePart?.file?.name?.split('.')[0] || 'amigurumi'}_pattern.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  // Active state variables mapped based on current mode
  const currentPoints = appMode === 'slicer' ? (activePart?.points || []) : validatorPoints;
  const currentStitch = appMode === 'slicer' 
    ? (activePart?.currentStitch !== undefined ? activePart.currentStitch : (activePart?.points?.length || 0)) 
    : validatorCurrentStitch;

  const setCurrentStitch = (val) => {
    if (appMode === 'slicer') {
      setParts(prevParts => prevParts.map(p => p.id === activePartId ? { ...p, currentStitch: val } : p));
    } else {
      setValidatorCurrentStitch(val);
    }
  };

  const currentFile = appMode === 'slicer' ? activePart?.file : null;

  return (
    <div className="flex h-screen w-full bg-slate-900 text-slate-100 font-sans overflow-hidden">
      
      {/* Sidebar Panel */}
      <div className="w-[450px] flex flex-col h-full bg-slate-800 border-r border-slate-700 shadow-2xl z-10 shrink-0">
        
        {/* Header & Mode Toggle */}
        <div className="border-b border-slate-700 bg-gradient-to-r from-indigo-900 to-slate-800 flex flex-col">
          <div className="p-6 pb-4 flex items-center gap-3">
            <div className="p-2 bg-indigo-500 rounded-lg shadow-lg shadow-indigo-500/20">
              <Box className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">Amigurumi Slicer</h1>
              <p className="text-xs text-indigo-300 font-medium tracking-wider uppercase">3D to Crochet Engine</p>
            </div>
          </div>
          
          <div className="px-6 pb-4 flex gap-2">
            <button 
              onClick={() => setAppMode('slicer')}
              className={`flex-1 py-2.5 px-4 rounded-lg font-semibold text-sm flex items-center justify-center gap-2 transition-all ${appMode === 'slicer' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30' : 'bg-slate-700/50 text-slate-400 hover:bg-slate-700 hover:text-slate-200'}`}
            >
              <Box className="w-4 h-4" /> 3D to Pattern
            </button>
            <button 
              onClick={() => setAppMode('validator')}
              className={`flex-1 py-2.5 px-4 rounded-lg font-semibold text-sm flex items-center justify-center gap-2 transition-all ${appMode === 'validator' ? 'bg-pink-600 text-white shadow-lg shadow-pink-500/30' : 'bg-slate-700/50 text-slate-400 hover:bg-slate-700 hover:text-slate-200'}`}
            >
              <Code className="w-4 h-4" /> Validator
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-8 scrollbar-thin scrollbar-thumb-slate-600">
          
          {/* Gauge Section (Shared) */}
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
              <Settings2 className="w-4 h-4" /> Yarn & Hook Gauge
            </h2>
            
            {/* Yarn Weight Preset Dropdown */}
            <div className="bg-slate-700/50 rounded-xl p-3 border border-slate-600 focus-within:border-indigo-500 transition-colors">
              <label className="text-xs text-slate-400 block mb-1">Yarn Category</label>
              <select 
                value={selectedPreset}
                onChange={e => handlePresetChange(e.target.value)}
                className="w-full bg-transparent text-slate-100 font-medium focus:outline-none cursor-pointer"
              >
                <option value="custom" className="bg-slate-800 text-slate-200">Custom (Manual Entry)</option>
                {Object.entries(YARN_PRESETS).map(([key, p]) => (
                  <option key={key} value={key} className="bg-slate-800 text-slate-200">
                    {p.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Recommended Hook Size Info Badge */}
            {selectedPreset !== 'custom' && YARN_PRESETS[selectedPreset] && (
              <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl flex items-center gap-2 text-xs text-indigo-300 animate-in fade-in slide-in-from-top-1 duration-200">
                <Info className="w-4 h-4 text-indigo-400 shrink-0" />
                <div>
                  <span className="font-semibold">Recommended Hook:</span> <span className="font-bold text-indigo-200">{YARN_PRESETS[selectedPreset].hook}</span>
                </div>
              </div>
            )}

            <div className="grid grid-cols-3 gap-3">
              <div className="bg-slate-700/50 rounded-xl p-2.5 border border-slate-600 focus-within:border-indigo-500 transition-colors">
                <label className="text-[10px] text-slate-400 block mb-1">Stitch Width (mm)</label>
                <input 
                  type="number" 
                  step="0.1"
                  value={gauge.width}
                  onChange={e => handleWidthChange(e.target.value)}
                  className="w-full bg-transparent text-slate-100 font-medium focus:outline-none text-xs"
                />
              </div>
              <div className="bg-slate-700/50 rounded-xl p-2.5 border border-slate-600 focus-within:border-indigo-500 transition-colors">
                <label className="text-[10px] text-slate-400 block mb-1">Stitch Height (mm)</label>
                <input 
                  type="number" 
                  step="0.1"
                  value={gauge.height}
                  onChange={e => handleHeightChange(e.target.value)}
                  className="w-full bg-transparent text-slate-100 font-medium focus:outline-none text-xs"
                />
              </div>
              <div className="bg-slate-700/50 rounded-xl p-2.5 border border-slate-600 focus-within:border-indigo-500 transition-colors">
                <label className="text-[10px] text-slate-400 block mb-1">Min Stitches</label>
                <input 
                  type="number" 
                  min="3"
                  max="12"
                  value={minStitches}
                  onChange={e => setMinStitches(Math.max(3, parseInt(e.target.value) || 6))}
                  className="w-full bg-transparent text-slate-100 font-medium focus:outline-none text-xs"
                />
              </div>
            </div>
          </div>

          {appMode === 'slicer' ? (
            <>
              {/* Slicer Specific UI */}
              <div className="space-y-6">
                
                {/* Project Template Preset Select */}
                <div className="space-y-3">
                  <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                    <Layers className="w-4 h-4" /> Project Outline
                  </h2>
                  
                  <div className="bg-slate-700/50 rounded-xl p-3 border border-slate-600 focus-within:border-indigo-500 transition-colors">
                    <label className="text-xs text-slate-400 block mb-1">Select Project Template</label>
                    <select 
                      value={activeTemplate}
                      onChange={e => {
                        setActiveTemplate(e.target.value);
                        loadTemplate(e.target.value);
                      }}
                      className="w-full bg-transparent text-slate-100 font-medium focus:outline-none cursor-pointer text-sm"
                    >
                      {Object.entries(PROJECT_TEMPLATES).map(([key, t]) => (
                        <option key={key} value={key} className="bg-slate-800 text-slate-200">
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Parts Checklist */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                      <Settings2 className="w-4 h-4" /> Parts Checklist ({parts.length})
                    </h2>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => setActivePartId(null)}
                        className={`py-1 px-2.5 border rounded-lg text-xs font-semibold flex items-center gap-1 transition-all ${
                          activePartId === null 
                            ? 'bg-emerald-650/40 hover:bg-emerald-600/50 border-emerald-500/40 text-emerald-300 shadow-lg shadow-emerald-950/20' 
                            : 'bg-slate-700/50 border-slate-650 text-slate-400 hover:text-slate-200 hover:bg-slate-700'
                        }`}
                        title="View all parts in full Blender assembly space"
                      >
                        <Layers className="w-3.5 h-3.5" /> View Assembly
                      </button>
                      <button 
                        onClick={addPart}
                        className="py-1 px-2.5 bg-indigo-600/30 hover:bg-indigo-600/50 border border-indigo-500/30 rounded-lg text-xs font-semibold text-indigo-300 flex items-center gap-1 transition-all"
                      >
                        <Plus className="w-3.5 h-3.5" /> Add Part
                      </button>
                    </div>
                  </div>

                  <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-700">
                    {parts.map((p) => {
                      const isActive = p.id === activePartId;
                      return (
                        <div 
                          key={p.id}
                          onClick={() => setActivePartId(p.id)}
                          className={`p-3.5 rounded-xl border transition-all cursor-pointer relative ${
                            isActive 
                              ? 'bg-slate-700/60 border-indigo-500 shadow-md shadow-indigo-500/10' 
                              : 'bg-slate-900/40 border-slate-700/50 hover:bg-slate-900/70'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3 mb-2">
                            <input 
                              type="text"
                              value={p.name}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => {
                                setParts(parts.map(x => x.id === p.id ? { ...x, name: e.target.value } : x));
                              }}
                              className="bg-transparent text-slate-100 font-semibold focus:outline-none focus:border-b border-indigo-400 text-sm w-36 truncate"
                            />
                            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center bg-slate-800/80 rounded-lg px-2 py-0.5 border border-slate-700 text-xs">
                                <span className="text-slate-500 mr-1.5 text-[10px] uppercase font-bold">Qty:</span>
                                <input 
                                  type="number"
                                  min="1"
                                  value={p.qty}
                                  onChange={(e) => {
                                    setParts(parts.map(x => x.id === p.id ? { ...x, qty: parseInt(e.target.value) || 1 } : x));
                                  }}
                                  className="w-6 bg-transparent text-slate-100 font-bold focus:outline-none text-center"
                                />
                              </div>
                              {parts.length > 1 && (
                                <button 
                                  onClick={() => {
                                    const remaining = parts.filter(x => x.id !== p.id);
                                    setParts(remaining);
                                    if (isActive && remaining.length > 0) {
                                      setActivePartId(remaining[0].id);
                                    }
                                  }}
                                  className="p-1 hover:bg-red-500/20 rounded-md text-slate-400 hover:text-red-400 transition-colors"
                                  title="Delete Part"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>

                          {/* File Upload per Part */}
                          <div className="mt-2.5" onClick={(e) => e.stopPropagation()}>
                            {p.file ? (
                              <div className="flex items-center justify-between bg-slate-800/40 border border-slate-700/60 rounded-lg p-2 text-xs">
                                <span className="text-slate-300 font-mono truncate max-w-[200px]">{p.file.name}</span>
                                <label className="cursor-pointer font-semibold text-indigo-400 hover:text-indigo-300 transition-colors ml-2 shrink-0">
                                  Replace File
                                  <input 
                                    type="file"
                                    accept=".obj,.stl"
                                    className="hidden"
                                    onChange={(e) => handleFileUpload(p.id, e.target.files[0])}
                                  />
                                </label>
                              </div>
                            ) : (
                              <div className="relative border border-dashed border-slate-700 hover:border-indigo-500 rounded-lg p-2.5 flex items-center justify-center bg-slate-800/20 hover:bg-indigo-500/5 transition-colors cursor-pointer">
                                <input 
                                  type="file"
                                  accept=".obj,.stl"
                                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                                  onChange={(e) => handleFileUpload(p.id, e.target.files[0])}
                                />
                                <UploadCloud className="w-4 h-4 text-slate-400 mr-2 shrink-0" />
                                <span className="text-xs text-slate-400 font-medium">Upload .obj or .stl</span>
                              </div>
                            )}
                          </div>

                          {/* Connection Settings & Placement Notes */}
                          {isActive && (
                            <div className="mt-3.5 pt-3 border-t border-slate-700/60 space-y-2.5 text-xs animate-in slide-in-from-top-1 duration-200" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-slate-400 shrink-0">Attaches to:</span>
                                <select 
                                  value={p.attachesTo || ''}
                                  onChange={(e) => {
                                    setParts(parts.map(x => x.id === p.id ? { ...x, attachesTo: e.target.value } : x));
                                  }}
                                  className="bg-slate-800/80 border border-slate-700 rounded px-2 py-1 text-slate-200 focus:outline-none flex-1 truncate text-[11px]"
                                >
                                  <option value="">None (Base piece)</option>
                                  {parts.filter(x => x.id !== p.id).map(x => (
                                    <option key={x.id} value={x.id}>{x.name}</option>
                                  ))}
                                </select>
                              </div>
                              <div className="space-y-1">
                                <span className="text-slate-400">Sewing/Placement Notes:</span>
                                <input 
                                  type="text"
                                  placeholder="e.g. Sew to sides between R10 and R12"
                                  value={p.placementNotes || ''}
                                  onChange={(e) => {
                                    setParts(parts.map(x => x.id === p.id ? { ...x, placementNotes: e.target.value } : x));
                                  }}
                                  className="w-full bg-slate-800/80 border border-slate-700 rounded px-2 py-1 text-slate-200 focus:outline-none text-[11px]"
                                />
                              </div>

                              {/* Part Slicing Error Indicator */}
                              {p.error && (
                                <div className="p-2 bg-red-500/10 border border-red-500/30 text-red-300 rounded text-[10px] flex items-center gap-1.5 mt-1">
                                  <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                                  <span>{p.error}</span>
                                </div>
                              )}

                              {/* Position & Orientation Controls */}
                              {p.file && (
                                <div className="mt-3 pt-3 border-t border-slate-700/40 space-y-3" onClick={(e) => e.stopPropagation()}>
                                  <div className="flex items-center justify-between">
                                    <span className="text-slate-300 font-semibold text-[11px] uppercase tracking-wider">Limb Placement & Rotation</span>
                                    <button
                                      onClick={() => autoOrientPart(p.id)}
                                      className="py-1 px-2 bg-indigo-600/30 hover:bg-indigo-600/50 border border-indigo-500/30 text-indigo-300 rounded text-[10px] font-bold flex items-center gap-1 transition-all shadow-md"
                                      title="Auto-orient longest axis vertically for optimal slicing"
                                    >
                                      <Wand2 className="w-3 h-3" /> Auto-Orient
                                    </button>
                                  </div>

                                  {/* Rotation Sliders */}
                                  <div className="space-y-1.5 bg-slate-900/50 p-2 rounded-lg border border-slate-800">
                                    <div className="flex items-center justify-between text-[10px] text-slate-400">
                                      <span>Rotation (deg)</span>
                                      <span className="font-mono text-indigo-300">
                                        X: {p.rotation?.x || 0}° | Y: {p.rotation?.y || 0}° | Z: {p.rotation?.z || 0}°
                                      </span>
                                    </div>
                                    <div className="space-y-1">
                                      <div className="flex items-center gap-2">
                                        <span className="text-[9px] text-slate-500 w-3">X</span>
                                        <input
                                          type="range"
                                          min="-180"
                                          max="180"
                                          value={p.rotation?.x || 0}
                                          onChange={(e) => updatePartTransform(p.id, { ...p.rotation, x: parseInt(e.target.value) }, null)}
                                          className="flex-1 h-1 bg-slate-800 rounded accent-indigo-500 cursor-pointer"
                                        />
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <span className="text-[9px] text-slate-500 w-3">Y</span>
                                        <input
                                          type="range"
                                          min="-180"
                                          max="180"
                                          value={p.rotation?.y || 0}
                                          onChange={(e) => updatePartTransform(p.id, { ...p.rotation, y: parseInt(e.target.value) }, null)}
                                          className="flex-1 h-1 bg-slate-800 rounded accent-indigo-500 cursor-pointer"
                                        />
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <span className="text-[9px] text-slate-500 w-3">Z</span>
                                        <input
                                          type="range"
                                          min="-180"
                                          max="180"
                                          value={p.rotation?.z || 0}
                                          onChange={(e) => updatePartTransform(p.id, { ...p.rotation, z: parseInt(e.target.value) }, null)}
                                          className="flex-1 h-1 bg-slate-800 rounded accent-indigo-500 cursor-pointer"
                                        />
                                      </div>
                                    </div>
                                  </div>

                                  {/* Position Sliders */}
                                  <div className="space-y-1.5 bg-slate-900/50 p-2 rounded-lg border border-slate-800">
                                    <div className="flex items-center justify-between text-[10px] text-slate-400">
                                      <span>Viewport Shift (mm)</span>
                                      <span className="font-mono text-emerald-300">
                                        X: {p.position?.x || 0} | Y: {p.position?.y || 0} | Z: {p.position?.z || 0}
                                      </span>
                                    </div>
                                    <div className="space-y-1">
                                      <div className="flex items-center gap-2">
                                        <span className="text-[9px] text-slate-500 w-3">X</span>
                                        <input
                                          type="range"
                                          min="-100"
                                          max="100"
                                          value={p.position?.x || 0}
                                          onChange={(e) => updatePartTransform(p.id, null, { ...p.position, x: parseInt(e.target.value) })}
                                          className="flex-1 h-1 bg-slate-800 rounded accent-emerald-500 cursor-pointer"
                                        />
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <span className="text-[9px] text-slate-500 w-3">Y</span>
                                        <input
                                          type="range"
                                          min="-100"
                                          max="100"
                                          value={p.position?.y || 0}
                                          onChange={(e) => updatePartTransform(p.id, null, { ...p.position, y: parseInt(e.target.value) })}
                                          className="flex-1 h-1 bg-slate-800 rounded accent-emerald-500 cursor-pointer"
                                        />
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <span className="text-[9px] text-slate-500 w-3">Z</span>
                                        <input
                                          type="range"
                                          min="-100"
                                          max="100"
                                          value={p.position?.z || 0}
                                          onChange={(e) => updatePartTransform(p.id, null, { ...p.position, z: parseInt(e.target.value) })}
                                          className="flex-1 h-1 bg-slate-800 rounded accent-emerald-500 cursor-pointer"
                                        />
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Slicing Warnings and Recommendations for Active Part */}
                {sizeWarning && (
                  <div className={`p-3 border rounded-lg flex items-start gap-2 animate-in fade-in duration-200 ${
                    sizeWarning.type === 'small' 
                      ? 'bg-amber-500/10 border-amber-500/30 text-amber-300' 
                      : 'bg-red-500/10 border-red-500/30 text-red-300'
                  }`}>
                    <AlertCircle className={`w-5 h-5 shrink-0 mt-0.5 ${sizeWarning.type === 'small' ? 'text-amber-400' : 'text-red-400'}`} />
                    <p className="text-sm">{sizeWarning.message}</p>
                  </div>
                )}

                {separationRecommendation && (
                  <div className="p-4 bg-indigo-950/80 border border-indigo-500/30 rounded-xl space-y-3 animate-in fade-in duration-300">
                    <h3 className="text-xs font-bold text-indigo-300 uppercase tracking-wider flex items-center gap-1.5">
                      <Wand2 className="w-4 h-4 text-indigo-400" />
                      Amigurumi Pattern Recommendation
                    </h3>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      This part has a high lateral span ({separationRecommendation.ratio}:1 width-to-depth). In crochet, slicing branching parts (like arms or ears) as a single vertical piece results in rounds that bridge separate limbs.
                    </p>
                    <div className="bg-slate-900/50 p-2.5 rounded-lg border border-slate-800 text-[11px] space-y-1.5">
                      <p className="font-semibold text-slate-200">Recommended action in Blender:</p>
                      <p className="text-slate-400">Separate the mesh into distinct parts, slice each part individually, and sew them together:</p>
                      <ul className="list-disc pl-4 space-y-1 text-indigo-200 font-medium">
                        {separationRecommendation.suggestedParts.map((part, idx) => (
                          <li key={idx}>{part}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}

                <button 
                  onClick={generateSlicerPattern}
                  disabled={isProcessing || !parts.some(p => p.geometry)}
                  className={`w-full py-3 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all duration-300 shadow-lg ${
                    !parts.some(p => p.geometry) 
                      ? 'bg-slate-700 text-slate-500 cursor-not-allowed shadow-none' 
                      : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/30 hover:shadow-indigo-500/50'
                  }`}
                >
                  {isProcessing ? (
                    <><Loader2 className="w-5 h-5 animate-spin" /> Slicing All Parts...</>
                  ) : (
                    <><Scissors className="w-5 h-5" /> Generate Patterns</>
                  )}
                </button>

                {/* Blender Size Guide Accordion */}
                <div className="border border-slate-700 rounded-xl overflow-hidden bg-slate-900/50">
                  <button
                    onClick={() => setShowBlenderGuide(!showBlenderGuide)}
                    className="w-full py-3 px-4 flex items-center justify-between text-sm font-medium text-slate-300 hover:bg-slate-800 transition-colors"
                  >
                    <span className="flex items-center gap-2">
                      <Box className="w-4 h-4 text-indigo-400" />
                      Blender Size & Scale Guide
                    </span>
                    <span className={`transform transition-transform duration-200 text-slate-500 ${showBlenderGuide ? 'rotate-180' : ''}`}>
                      ▼
                    </span>
                  </button>
                  
                  {showBlenderGuide && (
                    <div className="p-4 border-t border-slate-800 text-xs text-slate-300 space-y-3 leading-relaxed max-h-96 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700">
                      <p>
                        In this slicer, <strong className="text-white">1 unit = 1 millimeter</strong>. By default, Blender exports in meters, meaning a default 2m cube will import as a microscopic 2mm model which will fail to slice properly.
                      </p>
                      
                      <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800">
                        <h4 className="font-bold text-white mb-1.5 uppercase tracking-wide text-[10px]">Conversion Reference</h4>
                        <table className="w-full text-left font-mono text-[10px]">
                          <thead>
                            <tr className="text-slate-500 border-b border-slate-800">
                              <th className="pb-1">Desired Size</th>
                              <th className="pb-1">Slicer (mm)</th>
                              <th className="pb-1">Blender (Default)</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr className="border-b border-slate-900">
                              <td className="py-1 font-semibold text-slate-300">2 inches</td>
                              <td className="py-1">50.8 mm</td>
                              <td className="py-1">50.8 m</td>
                            </tr>
                            <tr className="border-b border-slate-900">
                              <td className="py-1 font-semibold text-slate-300">4 inches</td>
                              <td className="py-1">101.6 mm</td>
                              <td className="py-1">101.6 m</td>
                            </tr>
                            <tr className="border-b border-slate-900 font-semibold text-indigo-300 bg-indigo-500/5">
                              <td className="py-1 pl-1">6 inches</td>
                              <td className="py-1">152.4 mm</td>
                              <td className="py-1">152.4 m</td>
                            </tr>
                            <tr>
                              <td className="py-1 font-semibold text-slate-300">8 inches</td>
                              <td className="py-1">203.2 mm</td>
                              <td className="py-1">203.2 m</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>

                      <div className="space-y-2">
                        <h4 className="font-bold text-white">How to export correctly from Blender:</h4>
                        <ol className="list-decimal pl-4 space-y-1.5 text-slate-400">
                          <li>
                            <strong className="text-slate-300">Method A (Quick Scale)</strong>: Size your model in Blender to match the meter equivalent in the table above (e.g. 152.4 meters for a 6" toy).
                          </li>
                          <li>
                            <strong className="text-slate-300">Method B (Unit Scale Settings)</strong>: In Blender, go to Scene Properties (cone icon) &rarr; Units &rarr; set Length to <strong className="text-slate-300">Millimeters</strong> and set Unit Scale to <strong className="text-slate-300">0.001</strong>. Then model in real-world mm.
                          </li>
                        </ol>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {activePartId && slicerPatternData && (
                <div className="space-y-3 animate-in fade-in slide-in-from-bottom-4 duration-500 flex-1">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                      <Info className="w-4 h-4" /> Pattern Output ({activePart.name})
                    </h2>
                    <div className="flex gap-2">
                      <button onClick={copyToClipboard} className="p-1.5 bg-slate-700 hover:bg-slate-600 rounded-md text-slate-300 transition-colors" title="Copy to Clipboard">
                        <Copy className="w-4 h-4" />
                      </button>
                      <button onClick={downloadTextFile} className="p-1.5 bg-slate-700 hover:bg-slate-600 rounded-md text-slate-300 transition-colors" title="Download .txt">
                        <Download className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  
                  <div className="bg-slate-900 rounded-xl p-4 border border-slate-700 max-h-80 overflow-y-auto font-mono text-xs leading-relaxed space-y-1.5 scrollbar-thin scrollbar-thumb-slate-700 shadow-inner">
                    {slicerPatternData.pattern.map((p, i) => (
                      <div key={i} className="flex justify-between hover:bg-slate-800/50 p-1.5 rounded transition-colors group">
                        <span className="text-indigo-400 font-semibold w-16 shrink-0">R{p.round}:</span>
                        <span className="text-slate-300 flex-1">{formatCrochetPattern(p.instruction)}</span>
                        <span className="text-slate-500 text-right w-10 shrink-0 group-hover:text-slate-300 transition-colors">({p.stitches})</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!activePartId && rawPatternString && (
                <div className="space-y-3 animate-in fade-in slide-in-from-bottom-4 duration-500 flex-1">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                      <Info className="w-4 h-4" /> Compiled Character Pattern
                    </h2>
                    <div className="flex gap-2">
                      <button onClick={copyToClipboard} className="p-1.5 bg-slate-700 hover:bg-slate-600 rounded-md text-slate-300 transition-colors" title="Copy to Clipboard">
                        <Copy className="w-4 h-4" />
                      </button>
                      <button onClick={downloadTextFile} className="p-1.5 bg-slate-700 hover:bg-slate-600 rounded-md text-slate-300 transition-colors" title="Download .txt">
                        <Download className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  
                  <div className="bg-slate-900 rounded-xl p-4 border border-slate-700 max-h-80 overflow-y-auto font-mono text-xs leading-relaxed scrollbar-thin scrollbar-thumb-slate-700 shadow-inner text-slate-300">
                    <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-left">{rawPatternString}</pre>
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              {/* Validator Specific UI */}
              <div className="space-y-3 flex-1 flex flex-col h-full">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                    <ScanFace className="w-4 h-4" /> Human Pattern Debugger
                  </h2>
                </div>
                
                <div className="relative flex-1 min-h-[300px]">
                  <textarea
                    value={validatorText}
                    onChange={(e) => setValidatorText(e.target.value)}
                    placeholder="Paste crochet pattern here..."
                    className="absolute inset-0 w-full h-full bg-slate-900 border border-slate-700 rounded-xl p-4 text-slate-200 font-mono text-sm resize-none focus:outline-none focus:border-pink-500 focus:ring-1 focus:ring-pink-500 scrollbar-thin scrollbar-thumb-slate-700"
                    spellCheck="false"
                  />
                  
                  {/* Highlight overlay for errors (simplified for MVP, we just list errors below) */}
                </div>

                {validatorErrors.length > 0 && (
                  <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl space-y-2 max-h-40 overflow-y-auto scrollbar-thin scrollbar-thumb-red-900">
                    <h3 className="text-xs font-bold text-red-400 uppercase tracking-wider flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" /> Syntax Errors Detected
                    </h3>
                    {validatorErrors.map((err, i) => (
                      <div key={i} className="text-xs text-red-300 flex flex-col">
                        <span className="font-semibold">Line {err.lineIndex + 1}:</span>
                        <span className="font-mono bg-slate-900/50 p-1 rounded mt-1 truncate">{err.raw}</span>
                      </div>
                    ))}
                  </div>
                )}
                
                {validatorErrors.length === 0 && validatorText.trim() !== "" && (
                  <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center gap-2">
                    <Wand2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <p className="text-xs font-medium text-emerald-300">Pattern Parsed Successfully</p>
                  </div>
                )}
              </div>
            </>
          )}

        </div>
      </div>

      {/* Main 3D Viewport */}
      <div className="flex-1 relative bg-slate-900 flex flex-col min-w-0">
        <div className="flex-1">
          <Viewport 
            parts={parts}
            activePartId={activePartId}
            onGeometryLoaded={handleGeometryLoaded} 
            wireframe={wireframe} 
          />
        </div>

        {/* Dimensions Debugger Panel */}
        {dimensions && (
          <div className={`absolute right-6 z-20 max-w-xs bg-slate-800/95 backdrop-blur-xl border border-slate-700/80 rounded-2xl p-4 shadow-2xl transition-all duration-300 pointer-events-auto ${
            currentPoints.length > 0 && !isProcessing ? 'bottom-32' : 'bottom-6'
          }`}>
            <h3 className="text-white font-bold text-xs mb-2.5 flex items-center gap-1.5 border-b border-slate-700 pb-1.5">
              <Box className="w-4 h-4 text-indigo-400" />
              {activePartId ? 'Mesh Dimensions' : 'Total Assembly Dimensions'}
            </h3>
            <div className="space-y-1.5 text-xs font-mono text-slate-300">
              <div className="flex justify-between gap-6">
                <span className="text-slate-500">Width (X):</span>
                <span>{dimensions.width.mm.toFixed(1)} mm ({dimensions.width.in.toFixed(2)}")</span>
              </div>
              <div className="flex justify-between gap-6">
                <span className="text-slate-500">Depth (Y):</span>
                <span>{dimensions.depth.mm.toFixed(1)} mm ({dimensions.depth.in.toFixed(2)}")</span>
              </div>
              <div className="flex justify-between gap-6 font-semibold text-indigo-300">
                <span className="text-indigo-400">Height (Z):</span>
                <span>{dimensions.height.mm.toFixed(1)} mm ({dimensions.height.in.toFixed(2)}")</span>
              </div>
            </div>
          </div>
        )}
        
        {/* Overlay Controls */}
        <div className="absolute top-6 right-6 flex gap-4">
           {appMode === 'slicer' && (
             <button 
               onClick={() => setWireframe(!wireframe)}
               className={`px-4 py-2 rounded-lg text-sm font-medium backdrop-blur-md border transition-colors ${wireframe ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300 shadow-[0_0_15px_rgba(99,102,241,0.2)]' : 'bg-slate-800/50 border-slate-700/50 text-slate-400 hover:text-slate-200'}`}
             >
               Wireframe
             </button>
           )}
           {appMode === 'validator' && (
             <div className="px-4 py-2 rounded-lg text-sm font-medium bg-slate-800/80 border border-slate-700/50 text-slate-300 backdrop-blur-md flex items-center gap-2">
               <RefreshCw className="w-4 h-4 text-pink-400 animate-spin-slow" />
               Live Math Simulation
             </div>
           )}
        </div>

        {/* Loading Overlay */}
        {isProcessing && appMode === 'slicer' && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm">
             <div className="flex flex-col items-center gap-4 p-8 bg-slate-800/90 rounded-2xl border border-slate-700 shadow-2xl">
                <Loader2 className="w-12 h-12 text-indigo-500 animate-spin" />
                <p className="text-lg font-semibold text-slate-200 animate-pulse">Slicing Geometry...</p>
             </div>
          </div>
        )}

        {/* Stitch Scrubber UI */}
        {currentPoints.length > 0 && !isProcessing && (
          <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-slate-900/90 to-transparent pointer-events-none">
            <div className="max-w-3xl mx-auto bg-slate-800/90 backdrop-blur-xl border border-slate-700/80 rounded-2xl p-6 shadow-2xl animate-in slide-in-from-bottom-8 duration-500 pointer-events-auto">
              <div className="flex justify-between items-end mb-4">
                <div>
                  <h3 className="text-white font-bold tracking-tight text-lg flex items-center gap-2">
                    <Scissors className={`w-5 h-5 ${appMode === 'slicer' ? 'text-indigo-400' : 'text-pink-500'}`} />
                    Stitch Scrubber
                  </h3>
                  <p className="text-sm text-slate-400 mt-1">Preview the build path stitch-by-stitch</p>
                </div>
                <div className="text-right">
                  <span className={`text-3xl font-black ${appMode === 'slicer' ? 'text-indigo-400 drop-shadow-[0_0_8px_rgba(99,102,241,0.4)]' : 'text-pink-400 drop-shadow-[0_0_8px_rgba(236,72,153,0.4)]'}`}>
                    {currentStitch}
                  </span>
                  <span className="text-slate-500 text-sm ml-1">/ {currentPoints.length}</span>
                </div>
              </div>
              
              <input 
                type="range" 
                min="0" 
                max={currentPoints.length} 
                value={currentStitch}
                onChange={(e) => setCurrentStitch(parseInt(e.target.value))}
                className={`w-full h-2.5 bg-slate-900 rounded-lg appearance-none cursor-pointer hover:accent-pink-400 transition-colors shadow-inner ${appMode === 'slicer' ? 'accent-indigo-500' : 'accent-pink-500'}`}
              />
            </div>
          </div>
        )}
      </div>
      
    </div>
  );
}

export default App;

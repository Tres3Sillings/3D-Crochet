import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { UploadCloud, Scissors, Download, Copy, Settings2, Box, Info, Loader2, AlertCircle, Code, ScanFace, Wand2, RefreshCw } from 'lucide-react';
import Viewport from './components/Viewport';
import { sliceGeometry } from './lib/slicer';
import { generateStitchPath, sanitizeHumanPattern } from './lib/parser';

function App() {
  const [appMode, setAppMode] = useState('slicer'); // 'slicer' | 'validator'

  // Common State
  const [gauge, setGauge] = useState({ width: 3.5, height: 4.0 });
  const [wireframe, setWireframe] = useState(false);

  // Slicer State
  const [file, setFile] = useState(null);
  const [geometry, setGeometry] = useState(null);
  const [slicerPatternData, setSlicerPatternData] = useState(null);
  const [slicerPoints, setSlicerPoints] = useState([]);
  const [slicerCurrentStitch, setSlicerCurrentStitch] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [slicerError, setSlicerError] = useState(null);

  // Validator State
  const [validatorText, setValidatorText] = useState("Round 1: 6 sc in MR (6)\nRound 2: inc x 6 (12)\nRound 3: (sc, inc) 6 times (18)\nR4: [2sc, inc] * 6 (24)\n5: 24 sc (24)");
  const [validatorPoints, setValidatorPoints] = useState([]);
  const [validatorCurrentStitch, setValidatorCurrentStitch] = useState(0);
  const [validatorErrors, setValidatorErrors] = useState([]);

  // --- Slicer Logic ---
  const handleFileUpload = (e) => {
    const uploaded = e.target.files[0];
    if (uploaded) {
      setFile(uploaded);
      setSlicerPatternData(null);
      setSlicerPoints([]);
      setSlicerCurrentStitch(0);
      setSlicerError(null);
    }
  };

  const handleGeometryLoaded = useCallback((geom) => {
    setGeometry(geom);
    setSlicerError(null);
  }, []);

  const generateSlicerPattern = () => {
    if (!geometry) return;
    setIsProcessing(true);
    setSlicerError(null);
    setSlicerPatternData(null);
    setSlicerPoints([]);
    
    setTimeout(() => {
      try {
        const result = sliceGeometry(geometry, gauge.width, gauge.height);
        
        if (!result || result.pattern.length === 0) {
          throw new Error("No slices generated. Ensure the mesh is not too small or placed incorrectly.");
        }

        setSlicerPatternData(result);
        const points = generateStitchPath(result);
        setSlicerPoints(points);
        setSlicerCurrentStitch(points.length);
      } catch (err) {
        console.error("Slicing failed:", err);
        setSlicerError("Failed to slice geometry. Ensure it is a valid, watertight mesh.");
      } finally {
        setIsProcessing(false);
      }
    }, 100);
  };

  useEffect(() => {
    if (geometry && appMode === 'slicer') {
      generateSlicerPattern();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geometry]);

  // --- Validator Logic ---
  useEffect(() => {
    if (appMode !== 'validator') return;
    
    // Parse the human text
    const { pattern, errors } = sanitizeHumanPattern(validatorText, gauge.width, gauge.height);
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

  // --- Shared UI ---
  const rawPatternString = useMemo(() => {
    if (!slicerPatternData) return "";
    return slicerPatternData.pattern.map(p => `Round ${p.round}: ${p.instruction} (${p.stitches})`).join('\n');
  }, [slicerPatternData]);

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
    element.download = `${file?.name?.split('.')[0] || 'amigurumi'}_pattern.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  // Active state vars based on mode
  const currentPoints = appMode === 'slicer' ? slicerPoints : validatorPoints;
  const currentStitch = appMode === 'slicer' ? slicerCurrentStitch : validatorCurrentStitch;
  const setCurrentStitch = appMode === 'slicer' ? setSlicerCurrentStitch : setValidatorCurrentStitch;
  const currentFile = appMode === 'slicer' ? file : null;

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
              <Settings2 className="w-4 h-4" /> Yarn Gauge
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-700/50 rounded-xl p-3 border border-slate-600 focus-within:border-indigo-500 transition-colors">
                <label className="text-xs text-slate-400 block mb-1">Stitch Width (mm)</label>
                <input 
                  type="number" 
                  step="0.1"
                  value={gauge.width}
                  onChange={e => setGauge({...gauge, width: parseFloat(e.target.value)})}
                  className="w-full bg-transparent text-slate-100 font-medium focus:outline-none"
                />
              </div>
              <div className="bg-slate-700/50 rounded-xl p-3 border border-slate-600 focus-within:border-indigo-500 transition-colors">
                <label className="text-xs text-slate-400 block mb-1">Stitch Height (mm)</label>
                <input 
                  type="number" 
                  step="0.1"
                  value={gauge.height}
                  onChange={e => setGauge({...gauge, height: parseFloat(e.target.value)})}
                  className="w-full bg-transparent text-slate-100 font-medium focus:outline-none"
                />
              </div>
            </div>
          </div>

          {appMode === 'slicer' ? (
            <>
              {/* Slicer Specific UI */}
              <div className="space-y-3">
                <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                  <UploadCloud className="w-4 h-4" /> Mesh Source
                </h2>
                <div className="relative group cursor-pointer">
                  <input 
                    type="file" 
                    accept=".obj,.stl"
                    onChange={handleFileUpload}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                  />
                  <div className={`border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center transition-all duration-300 ${file ? 'border-indigo-500 bg-indigo-500/10' : 'border-slate-600 bg-slate-700/50 group-hover:border-indigo-400 group-hover:bg-slate-700'}`}>
                    {file ? (
                      <>
                        <Box className="w-8 h-8 text-indigo-400 mb-2" />
                        <p className="text-sm font-medium text-slate-200 text-center truncate w-full px-4">{file.name}</p>
                        <p className="text-xs text-indigo-300 mt-1">Ready to slice</p>
                      </>
                    ) : (
                      <>
                        <UploadCloud className="w-8 h-8 text-slate-400 mb-2 group-hover:text-indigo-400 transition-colors" />
                        <p className="text-sm font-medium text-slate-300">Drag & Drop or Click</p>
                        <p className="text-xs text-slate-500 mt-1">Accepts .obj or .stl files</p>
                      </>
                    )}
                  </div>
                </div>
                
                {slicerError && (
                  <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-start gap-2">
                    <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                    <p className="text-sm text-red-300">{slicerError}</p>
                  </div>
                )}

                <button 
                  onClick={generateSlicerPattern}
                  disabled={!geometry || isProcessing}
                  className={`w-full py-3 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all duration-300 shadow-lg ${!geometry ? 'bg-slate-700 text-slate-500 cursor-not-allowed shadow-none' : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/30 hover:shadow-indigo-500/50'}`}
                >
                  {isProcessing ? (
                    <><Loader2 className="w-5 h-5 animate-spin" /> Processing 3D Math...</>
                  ) : (
                    <><Scissors className="w-5 h-5" /> Generate Pattern</>
                  )}
                </button>
              </div>

              {slicerPatternData && (
                <div className="space-y-3 animate-in fade-in slide-in-from-bottom-4 duration-500 flex-1">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                      <Info className="w-4 h-4" /> Pattern Output
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
                        <span className="text-slate-300 flex-1">{p.instruction}</span>
                        <span className="text-slate-500 text-right w-10 shrink-0 group-hover:text-slate-300 transition-colors">({p.stitches})</span>
                      </div>
                    ))}
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
            file={currentFile} 
            onGeometryLoaded={handleGeometryLoaded} 
            wireframe={wireframe} 
            patternPoints={currentPoints}
            currentStitch={currentStitch}
          />
        </div>
        
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

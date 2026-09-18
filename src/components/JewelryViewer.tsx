import React, { useEffect, useRef, useState } from 'react';
import {
  initJewelryScene,
  JewelrySceneHandle,
} from '../jewelry/initJewelryScene';
import {
  Sparkles,
  Camera,
  Sun,
  Eye,
  RotateCw,
  Download,
  Sliders,
  Maximize2,
  Info,
  Check,
  Type,
  Layers,
  Diamond,
  Compass,
} from 'lucide-react';

export const JewelryViewer: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sceneHandleRef = useRef<JewelrySceneHandle | null>(null);

  // UI States
  const [activeMaterial, setActiveMaterial] = useState<'platinum' | 'diamond' | 'obsidian'>('platinum');
  const [activeCameraView, setActiveCameraView] = useState<'hero' | 'front' | 'macro' | 'back' | 'top'>('hero');
  const [activeLighting, setActiveLighting] = useState<'high_contrast' | 'soft_editorial' | 'rim_noir' | 'top_spot'>('high_contrast');
  const [exposure, setExposure] = useState<number>(1.08);
  const [isWireframe, setIsWireframe] = useState<boolean>(false);
  const [isAutoRotating, setIsAutoRotating] = useState<boolean>(true);
  const [engravedText, setEngravedText] = useState<string>('William');
  const [customTextInput, setCustomTextInput] = useState<string>('William');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [cadDrawerOpen, setCadDrawerOpen] = useState<boolean>(false);
  const [specsModalOpen, setSpecsModalOpen] = useState<boolean>(false);
  const [snapshotUrl, setSnapshotUrl] = useState<string | null>(null);
  const [stats, setStats] = useState({
    polyCount: 42800,
    diamondCount: 68,
    fps: 60,
  });
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  // Initialize 3D Scene
  useEffect(() => {
    if (!canvasRef.current) return;

    let isDisposed = false;

    initJewelryScene(canvasRef.current, {
      initialText: engravedText,
      onMaterialChange: (newMat) => {
        setActiveMaterial(newMat);
      },
      onStatsUpdate: (newStats) => {
        if (!isDisposed) {
          setStats((prev) => ({
            ...prev,
            ...newStats,
          }));
        }
      },
    })
      .then((handle) => {
        if (isDisposed) {
          handle.dispose();
          return;
        }
        sceneHandleRef.current = handle;
        setIsLoading(false);
      })
      .catch((err) => {
        console.error('Failed to initialize jewelry scene:', err);
        setIsLoading(false);
      });

    // ResizeObserver to keep canvas strictly aligned with container
    const resizeObserver = new ResizeObserver(() => {
      window.dispatchEvent(new Event('resize'));
    });
    if (canvasRef.current?.parentElement) {
      resizeObserver.observe(canvasRef.current.parentElement);
    }

    return () => {
      isDisposed = true;
      resizeObserver.disconnect();
      if (sceneHandleRef.current) {
        sceneHandleRef.current.dispose();
        sceneHandleRef.current = null;
      }
    };
  }, []);

  // Material Hot-Swap Handlers
  const handleMaterialToggle = (type: 'platinum' | 'diamond' | 'obsidian') => {
    if (!sceneHandleRef.current) return;
    sceneHandleRef.current.setTextMaterial(type);
    setActiveMaterial(type);
  };

  const handleCycleMaterial = () => {
    if (!sceneHandleRef.current) return;
    const nextMat = sceneHandleRef.current.toggleTextMaterial();
    setActiveMaterial(nextMat);
  };

  // Camera View Change
  const handleCameraChange = (view: 'hero' | 'front' | 'macro' | 'back' | 'top') => {
    if (!sceneHandleRef.current) return;
    sceneHandleRef.current.setCameraView(view);
    setActiveCameraView(view);
  };

  // Lighting Preset Change
  const handleLightingChange = (preset: 'high_contrast' | 'soft_editorial' | 'rim_noir' | 'top_spot') => {
    if (!sceneHandleRef.current) return;
    sceneHandleRef.current.setLightingPreset(preset);
    setActiveLighting(preset);
  };

  // Exposure Slider (Clamped between 1.00 and 1.20)
  const handleExposureChange = (val: number) => {
    const clamped = Math.min(1.2, Math.max(1.0, val));
    setExposure(clamped);
    if (sceneHandleRef.current) {
      sceneHandleRef.current.setExposure(clamped);
    }
  };

  // Wireframe CAD Mode
  const handleWireframeToggle = () => {
    const next = !isWireframe;
    setIsWireframe(next);
    if (sceneHandleRef.current) {
      sceneHandleRef.current.setWireframe(next);
    }
  };

  // Auto-Rotation Toggle
  const handleAutoRotateToggle = () => {
    if (!sceneHandleRef.current) return;
    const next = sceneHandleRef.current.toggleAutoRotate();
    setIsAutoRotating(next);
  };

  // Live Text Engraver
  const handleTextSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sceneHandleRef.current || !customTextInput.trim()) return;
    const safeText = customTextInput.trim().slice(0, 14);
    setEngravedText(safeText);
    await sceneHandleRef.current.updateText(safeText);
  };

  // High-Resolution Snapshot Capture
  const handleCaptureSnapshot = () => {
    if (!sceneHandleRef.current) return;
    const dataUrl = sceneHandleRef.current.captureScreenshot(1.0);
    setSnapshotUrl(dataUrl);
  };

  // Track cursor for dynamic light feedback HUD
  const handleContainerMouseMove = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left) / rect.width) * 100);
    const y = Math.round(((e.clientY - rect.top) / rect.height) * 100);
    setMousePos({ x, y });
  };

  return (
    <div
      className="relative w-screen h-screen overflow-hidden bg-black text-white select-none"
      onMouseMove={handleContainerMouseMove}
    >
      {/* 1. 3D WebGL Canvas Layer */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing block"
      />

      {/* Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/90 backdrop-blur-md">
          <div className="w-16 h-16 border-2 border-white/20 border-t-white rounded-full animate-spin mb-6" />
          <h2 className="text-xl tracking-[0.25em] font-serif-luxury font-light text-white">
            MAISON WILLIAM
          </h2>
          <p className="text-xs font-mono-cad text-zinc-400 mt-2 tracking-widest uppercase">
            CALIBRATING MONOCHROME PBR MATRIX & IOR 2.417...
          </p>
        </div>
      )}

      {/* 2. Top Luxury Atelier Header */}
      <header className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-6 py-4 bg-gradient-to-b from-black/80 via-black/40 to-transparent pointer-events-none">
        <div className="flex items-center space-x-4 pointer-events-auto">
          <div className="w-9 h-9 border border-white/30 flex items-center justify-center bg-white/5 backdrop-blur-sm">
            <Diamond className="w-5 h-5 text-white stroke-[1.5]" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-lg md:text-xl font-serif-luxury font-bold tracking-[0.25em] text-white">
                MAISON WILLIAM
              </h1>
              <span className="text-[9px] font-mono-cad uppercase px-1.5 py-0.5 border border-white/30 text-zinc-300 bg-white/10">
                PT950
              </span>
            </div>
            <p className="text-[10px] font-mono-cad text-zinc-400 tracking-wider uppercase">
              HAUTE JOAILLERIE • CAD STUDIO NOIR • KEYSHOT IBL
            </p>
          </div>
        </div>

        {/* Center Prompt / Badge: 'William' Showcase */}
        <div className="hidden lg:flex items-center space-x-3 pointer-events-auto bg-black/60 border border-white/15 px-4 py-1.5 backdrop-blur-md">
          <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
          <span className="text-[11px] font-mono-cad uppercase tracking-wider text-zinc-300">
            PIECE: <span className="text-white font-semibold">'{engravedText}'</span> LUXURY PENDANT & CUBAN CHAIN
          </span>
          <span className="text-zinc-600">|</span>
          <span className="text-[11px] font-mono-cad uppercase text-zinc-400">
            STYLE: <span className="text-zinc-200">MONOCHROME PBR (NO HUES)</span>
          </span>
        </div>

        {/* Top Right Action Tools */}
        <div className="flex items-center space-x-2 pointer-events-auto">
          <button
            onClick={() => setSpecsModalOpen(true)}
            className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-mono-cad bg-zinc-950/80 hover:bg-zinc-900 border border-white/20 hover:border-white/50 transition-all text-zinc-300 hover:text-white"
            title="View Monochrome PBR Matrix & Gemstone Physics"
          >
            <Info className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">PBR MATRIX</span>
          </button>

          <button
            onClick={() => setCadDrawerOpen(!cadDrawerOpen)}
            className={`flex items-center space-x-1.5 px-3 py-1.5 text-xs font-mono-cad border transition-all ${
              cadDrawerOpen
                ? 'bg-white text-black border-white'
                : 'bg-zinc-950/80 hover:bg-zinc-900 text-zinc-300 border-white/20 hover:border-white/50'
            }`}
            title="Toggle Technical CAD Controls"
          >
            <Sliders className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">CAD TOOLS</span>
          </button>

          <button
            onClick={handleCaptureSnapshot}
            className="flex items-center space-x-1.5 px-3.5 py-1.5 text-xs font-mono-cad bg-white text-black hover:bg-zinc-200 font-semibold transition-all shadow-[0_0_15px_rgba(255,255,255,0.2)]"
            title="Capture High-Resolution CAD Render"
          >
            <Camera className="w-3.5 h-3.5" />
            <span>RENDER 4K</span>
          </button>
        </div>
      </header>

      {/* 3. Primary Center-Bottom Material Hot-Swap Controller */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center space-y-2 pointer-events-none">
        {/* Tactile Material Hot-Swap Switcher */}
        <div className="pointer-events-auto flex items-center bg-black/85 border border-white/20 p-1.5 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.8)]">
          <button
            onClick={() => handleMaterialToggle('platinum')}
            className={`relative px-4 py-2 text-xs font-mono-cad uppercase transition-all flex items-center space-x-2 ${
              activeMaterial === 'platinum'
                ? 'bg-white text-black font-semibold shadow-md'
                : 'text-zinc-400 hover:text-white hover:bg-white/10'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${activeMaterial === 'platinum' ? 'bg-black' : 'bg-white/40'}`} />
            <span>PLATINUM 950</span>
            {activeMaterial === 'platinum' && <span className="text-[9px] bg-black text-white px-1 ml-1">ROUGH 0.02</span>}
          </button>

          <button
            onClick={() => handleMaterialToggle('diamond')}
            className={`relative px-4 py-2 text-xs font-mono-cad uppercase transition-all flex items-center space-x-2 ${
              activeMaterial === 'diamond'
                ? 'bg-white text-black font-semibold shadow-md'
                : 'text-zinc-400 hover:text-white hover:bg-white/10'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>DIAMOND IOR 2.417</span>
            {activeMaterial === 'diamond' && <span className="text-[9px] bg-black text-white px-1 ml-1">TRANSMIT 1.0</span>}
          </button>

          <button
            onClick={() => handleMaterialToggle('obsidian')}
            className={`relative px-4 py-2 text-xs font-mono-cad uppercase transition-all flex items-center space-x-2 ${
              activeMaterial === 'obsidian'
                ? 'bg-white text-black font-semibold shadow-md'
                : 'text-zinc-400 hover:text-white hover:bg-white/10'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${activeMaterial === 'obsidian' ? 'bg-black' : 'bg-zinc-700'}`} />
            <span>OBSIDIAN NOIR</span>
          </button>
        </div>

        {/* Interactive Click Instruction & Live Physics Badge */}
        <div className="flex items-center space-x-2 text-[10px] font-mono-cad text-zinc-400 bg-black/60 px-3 py-1 border border-white/10 backdrop-blur-md">
          <span className="text-white font-semibold uppercase">HOT-SWAP TIP:</span>
          <span>Click directly on the '{engravedText}' jewelry to toggle materials in real-time</span>
          <span className="text-zinc-600">•</span>
          <span className="text-zinc-300">
            {activeMaterial === 'platinum' && 'Polished Platinum: Metalness 1.0 • Specular Razor Reflection'}
            {activeMaterial === 'diamond' && 'Tolkowsky Facets: IOR 2.417 • Volume Thickness 0.8 • Micro-Refraction'}
            {activeMaterial === 'obsidian' && 'Deep Black Obsidian: IOR 1.450 • Clearcoat 1.0 • Absorption'}
          </span>
        </div>
      </div>

      {/* 4. Left Side Viewport Camera Presets */}
      <div className="absolute left-6 top-1/2 -translate-y-1/2 z-20 flex flex-col space-y-1.5 pointer-events-auto">
        <div className="text-[9px] font-mono-cad uppercase tracking-widest text-zinc-500 mb-1 px-1">
          CAMERA ANGLES
        </div>

        {[
          { id: 'hero', label: '3/4 HERO CAD', icon: Eye },
          { id: 'macro', label: 'MACRO TEXT', icon: Maximize2 },
          { id: 'front', label: 'FRONT FACE', icon: Compass },
          { id: 'back', label: 'AZURAGE BACK', icon: Layers },
          { id: 'top', label: 'TOP FLAT-LAY', icon: Camera },
        ].map((item) => {
          const Icon = item.icon;
          const isActive = activeCameraView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => handleCameraChange(item.id as any)}
              className={`flex items-center space-x-2 px-3 py-2 text-[11px] font-mono-cad border transition-all text-left ${
                isActive
                  ? 'bg-white text-black font-semibold border-white shadow-lg'
                  : 'bg-black/70 hover:bg-zinc-900 text-zinc-400 hover:text-white border-white/15'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{item.label}</span>
            </button>
          );
        })}

        <div className="pt-2">
          <button
            onClick={handleAutoRotateToggle}
            className={`w-full flex items-center justify-between px-3 py-2 text-[11px] font-mono-cad border transition-all ${
              isAutoRotating
                ? 'bg-zinc-900 border-white/40 text-white'
                : 'bg-black/70 border-white/15 text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <span className="flex items-center space-x-1.5">
              <RotateCw className={`w-3.5 h-3.5 ${isAutoRotating ? 'animate-spin' : ''}`} style={{ animationDuration: '6s' }} />
              <span>CINEMATIC ROTATION</span>
            </span>
            <span className={`text-[9px] px-1 ${isAutoRotating ? 'bg-white text-black' : 'bg-zinc-800'}`}>
              {isAutoRotating ? 'ON' : 'OFF'}
            </span>
          </button>
        </div>
      </div>

      {/* 5. Right Side Studio Lighting & Exposure Controls */}
      <div className="absolute right-6 top-24 z-20 flex flex-col space-y-2 pointer-events-auto w-56">
        <div className="bg-black/80 border border-white/15 p-3 backdrop-blur-md">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-mono-cad uppercase tracking-wider text-zinc-400 flex items-center space-x-1.5">
              <Sun className="w-3.5 h-3.5 text-white" />
              <span>STUDIO LIGHTING</span>
            </span>
            <span className="text-[9px] font-mono-cad text-zinc-500 uppercase">MONO IBL</span>
          </div>

          <div className="grid grid-cols-2 gap-1 mb-3">
            {[
              { id: 'high_contrast', label: 'KEYSHOT CONTRAST' },
              { id: 'soft_editorial', label: 'EDITORIAL SOFT' },
              { id: 'rim_noir', label: 'NOIR RIM' },
              { id: 'top_spot', label: 'DIAMOND GLINT' },
            ].map((light) => (
              <button
                key={light.id}
                onClick={() => handleLightingChange(light.id as any)}
                className={`px-2 py-1.5 text-[9px] font-mono-cad text-center border transition-all ${
                  activeLighting === light.id
                    ? 'bg-white text-black font-semibold border-white'
                    : 'bg-zinc-950 text-zinc-400 hover:text-white border-white/10 hover:border-white/30'
                }`}
              >
                {light.label}
              </button>
            ))}
          </div>

          {/* ACES Filmic Tone Mapping Exposure Clamped between 1.00 and 1.20 */}
          <div className="space-y-1 pt-1 border-t border-white/10">
            <div className="flex items-center justify-between text-[10px] font-mono-cad">
              <span className="text-zinc-400">ACES EXPOSURE:</span>
              <span className="text-white font-semibold">{exposure.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min="1.0"
              max="1.2"
              step="0.01"
              value={exposure}
              onChange={(e) => handleExposureChange(parseFloat(e.target.value))}
              className="w-full accent-white h-1 bg-zinc-800 rounded-none cursor-pointer"
            />
            <div className="flex justify-between text-[8px] font-mono-cad text-zinc-600">
              <span>1.00 (CLAMP MIN)</span>
              <span>1.20 (CLAMP MAX)</span>
            </div>
          </div>
        </div>

        {/* Dynamic Light Cursor Tracking Telemetry */}
        <div className="bg-black/80 border border-white/15 p-2.5 backdrop-blur-md">
          <div className="flex items-center justify-between text-[10px] font-mono-cad">
            <span className="text-zinc-400 uppercase">LIGHT TRACKING:</span>
            <span className="text-white font-semibold flex items-center space-x-1">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
              <span>ACTIVE</span>
            </span>
          </div>
          <div className="text-[9px] font-mono-cad text-zinc-500 mt-1">
            SpotLight specular target: X:{mousePos.x}% Y:{mousePos.y}%
          </div>
        </div>
      </div>

      {/* 6. Bottom Left CAD Telemetry Info */}
      <div className="absolute bottom-6 left-6 z-20 pointer-events-none hidden md:block">
        <div className="bg-black/75 border border-white/15 p-3 backdrop-blur-md space-y-1 text-[10px] font-mono-cad text-zinc-400">
          <div className="flex items-center space-x-2 text-white font-semibold pb-1 border-b border-white/10">
            <Layers className="w-3.5 h-3.5" />
            <span>CAD TELEMETRY & POST-PROCESSING</span>
          </div>
          <div className="flex justify-between space-x-6">
            <span>FACET POLYS:</span>
            <span className="text-white font-mono">{stats.polyCount.toLocaleString()}</span>
          </div>
          <div className="flex justify-between space-x-6">
            <span>BRILLIANT STONES:</span>
            <span className="text-white font-mono">{stats.diamondCount} (57 Facets Each)</span>
          </div>
          <div className="flex justify-between space-x-6">
            <span>BLOOM (ANTI-GLARE):</span>
            <span className="text-white font-mono">0.75 | Rad: 0.5 | Thresh: 0.95</span>
          </div>
          <div className="flex justify-between space-x-6">
            <span>SSAO OCCLUSION:</span>
            <span className="text-white font-mono">Radius 0.15 | Intensity 3.0</span>
          </div>
          <div className="flex justify-between space-x-6">
            <span>CAD RENDER FPS:</span>
            <span className="text-white font-mono">{stats.fps} FPS</span>
          </div>
        </div>
      </div>

      {/* 7. Slide-over CAD Technical Tools Drawer */}
      {cadDrawerOpen && (
        <aside className="absolute right-0 top-0 bottom-0 w-80 md:w-96 z-40 bg-zinc-950/95 border-l border-white/20 backdrop-blur-2xl p-6 flex flex-col justify-between shadow-2xl overflow-y-auto">
          <div className="space-y-6">
            <div className="flex items-center justify-between pb-3 border-b border-white/15">
              <h2 className="text-base font-serif-luxury font-bold tracking-widest text-white">
                CAD TECHNICAL SUITE
              </h2>
              <button
                onClick={() => setCadDrawerOpen(false)}
                className="w-7 h-7 flex items-center justify-center border border-white/20 text-zinc-400 hover:text-white hover:border-white text-xs font-mono"
              >
                ✕
              </button>
            </div>

            {/* Custom 3D Text Generator */}
            <div className="space-y-2">
              <label className="text-[11px] font-mono-cad text-zinc-300 uppercase tracking-wider flex items-center space-x-1.5">
                <Type className="w-3.5 h-3.5 text-white" />
                <span>ENGRAVE CUSTOM NAMEPLATE</span>
              </label>
              <form onSubmit={handleTextSubmit} className="flex space-x-2">
                <input
                  type="text"
                  maxLength={12}
                  value={customTextInput}
                  onChange={(e) => setCustomTextInput(e.target.value)}
                  placeholder="e.g. William"
                  className="flex-1 bg-black border border-white/20 px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-white uppercase"
                />
                <button
                  type="submit"
                  className="px-3 py-2 bg-white text-black text-xs font-mono font-semibold hover:bg-zinc-200 uppercase"
                >
                  UPDATE 3D
                </button>
              </form>
              <p className="text-[9px] font-mono-cad text-zinc-500">
                Extrudes high-contrast Didot typography with beveled micro-facets zero-shot.
              </p>
            </div>

            {/* Wireframe CAD Inspection */}
            <div className="space-y-2 pt-2 border-t border-white/10">
              <label className="text-[11px] font-mono-cad text-zinc-300 uppercase tracking-wider flex items-center space-x-1.5">
                <Layers className="w-3.5 h-3.5 text-white" />
                <span>INSPECTION DISPLAY MODE</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={handleWireframeToggle}
                  className={`p-2.5 text-xs font-mono-cad border text-center transition-all ${
                    isWireframe
                      ? 'bg-white text-black font-semibold border-white'
                      : 'bg-black text-zinc-400 border-white/20 hover:border-white/50'
                  }`}
                >
                  {isWireframe ? 'WIREFRAME CAD (ON)' : 'SHADED PBR (ON)'}
                </button>
                <button
                  onClick={handleCycleMaterial}
                  className="p-2.5 text-xs font-mono-cad bg-zinc-900 text-white border border-white/20 hover:border-white text-center transition-all"
                >
                  HOT-SWAP MATERIAL
                </button>
              </div>
            </div>

            {/* Jewelry Piece Anatomy Specs */}
            <div className="space-y-2 pt-2 border-t border-white/10">
              <div className="text-[11px] font-mono-cad text-zinc-300 uppercase tracking-wider">
                PIECE ANATOMY & SPECIFICATIONS
              </div>
              <ul className="text-[10px] font-mono-cad space-y-1.5 text-zinc-400">
                <li className="flex justify-between border-b border-white/5 py-1">
                  <span>CENTER NAMEPLATE:</span>
                  <span className="text-white font-serif tracking-wider">'{engravedText}' Didot 3D Extrusion</span>
                </li>
                <li className="flex justify-between border-b border-white/5 py-1">
                  <span>INNER HALO:</span>
                  <span className="text-white">44x Round Brilliant Pavé (4-Prong)</span>
                </li>
                <li className="flex justify-between border-b border-white/5 py-1">
                  <span>CARDINAL ACCENTS:</span>
                  <span className="text-white">4x Obsidian Baguette Cut (IOR 1.450)</span>
                </li>
                <li className="flex justify-between border-b border-white/5 py-1">
                  <span>CORNER SOLITAIRES:</span>
                  <span className="text-white">4x Round Brilliant in Cathedral Claws</span>
                </li>
                <li className="flex justify-between border-b border-white/5 py-1">
                  <span>SUSPENSION BAIL:</span>
                  <span className="text-white">Diamond-Encrusted Arch with Runners</span>
                </li>
                <li className="flex justify-between border-b border-white/5 py-1">
                  <span>CHAIN ATTACHMENT:</span>
                  <span className="text-white">44x Beveled Interlocking Cuban Links</span>
                </li>
                <li className="flex justify-between border-b border-white/5 py-1">
                  <span>BACK UNDER-GALLERY:</span>
                  <span className="text-white">Pierced Honeycomb Azurage (PT950)</span>
                </li>
              </ul>
            </div>

            {/* Post-Processing Strict Restraints Notice */}
            <div className="p-3 bg-black border border-white/15 space-y-1 text-[10px] font-mono-cad text-zinc-400">
              <div className="text-white font-semibold flex items-center space-x-1.5">
                <Check className="w-3.5 h-3.5 text-white" />
                <span>STRICT CONSTRAINTS ENFORCED</span>
              </div>
              <p className="text-[9px] text-zinc-400 leading-relaxed">
                • Strictly Black & White: No ambient warmth or color tints.<br />
                • Anti-Glare Bloom: Intensity 0.75 (&le;0.8), Radius 0.5, Threshold 0.95.<br />
                • ACES Filmic Tone Mapping clamped strictly between 1.0 and 1.2.<br />
                • SSAO Radius 0.15, Intensity 3.0 anchoring text prongs.<br />
                • Pure Diamond IOR pinned to 2.417 with transmission 1.0.
              </p>
            </div>
          </div>

          <div className="pt-4 border-t border-white/15">
            <button
              onClick={handleCaptureSnapshot}
              className="w-full py-2.5 bg-white text-black text-xs font-mono font-bold tracking-widest hover:bg-zinc-200 uppercase flex items-center justify-center space-x-2 shadow-lg"
            >
              <Camera className="w-4 h-4" />
              <span>CAPTURE MONOCHROME 4K</span>
            </button>
          </div>
        </aside>
      )}

      {/* 8. Monochrome PBR Matrix Specifications Modal */}
      {specsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="bg-zinc-950 border border-white/20 max-w-2xl w-full p-6 space-y-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-white/15">
              <div>
                <h3 className="text-lg font-serif-luxury font-bold tracking-widest text-white">
                  PHYSICS & MATERIAL SPECIFICATION
                </h3>
                <p className="text-[10px] font-mono-cad text-zinc-400 uppercase">
                  MONOCHROME PBR MATRIX • ZERO CHROMATIC ABERRATIONS
                </p>
              </div>
              <button
                onClick={() => setSpecsModalOpen(false)}
                className="w-8 h-8 flex items-center justify-center border border-white/20 text-zinc-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono-cad border-collapse">
                <thead>
                  <tr className="border-b border-white/20 text-zinc-400 text-[10px] uppercase">
                    <th className="py-2 pr-3">Material</th>
                    <th className="py-2 px-3">Base Color</th>
                    <th className="py-2 px-3">Roughness</th>
                    <th className="py-2 px-3">Metalness</th>
                    <th className="py-2 px-3">Transmission</th>
                    <th className="py-2 px-3">IOR</th>
                    <th className="py-2 pl-3">Clearcoat</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10 text-[11px]">
                  <tr className={activeMaterial === 'platinum' ? 'bg-white/10 text-white font-semibold' : 'text-zinc-300'}>
                    <td className="py-2.5 pr-3 flex items-center space-x-1.5">
                      <span className="w-2.5 h-2.5 bg-[#FFFFFF] border border-zinc-600 inline-block" />
                      <span>Platinum / Polished Silver</span>
                    </td>
                    <td className="py-2.5 px-3">#FFFFFF</td>
                    <td className="py-2.5 px-3">0.02</td>
                    <td className="py-2.5 px-3">1.0</td>
                    <td className="py-2.5 px-3">0.0</td>
                    <td className="py-2.5 px-3 text-zinc-500">N/A</td>
                    <td className="py-2.5 pl-3">0.0</td>
                  </tr>
                  <tr className="text-zinc-300">
                    <td className="py-2.5 pr-3 flex items-center space-x-1.5">
                      <span className="w-2.5 h-2.5 bg-[#1A1A1A] border border-zinc-600 inline-block" />
                      <span>Matte Dark Metal</span>
                    </td>
                    <td className="py-2.5 px-3">#1A1A1A</td>
                    <td className="py-2.5 px-3">0.40</td>
                    <td className="py-2.5 px-3">1.0</td>
                    <td className="py-2.5 px-3">0.0</td>
                    <td className="py-2.5 px-3 text-zinc-500">N/A</td>
                    <td className="py-2.5 pl-3">0.0</td>
                  </tr>
                  <tr className={activeMaterial === 'diamond' ? 'bg-white/10 text-white font-semibold' : 'text-zinc-300'}>
                    <td className="py-2.5 pr-3 flex items-center space-x-1.5">
                      <span className="w-2.5 h-2.5 bg-gradient-to-tr from-white to-zinc-400 inline-block" />
                      <span>Pure Diamond (Gemstone)</span>
                    </td>
                    <td className="py-2.5 px-3">#FFFFFF</td>
                    <td className="py-2.5 px-3">0.00</td>
                    <td className="py-2.5 px-3">0.0</td>
                    <td className="py-2.5 px-3 font-semibold text-white">1.0</td>
                    <td className="py-2.5 px-3 font-semibold text-white">2.417</td>
                    <td className="py-2.5 pl-3">1.0</td>
                  </tr>
                  <tr className={activeMaterial === 'obsidian' ? 'bg-white/10 text-white font-semibold' : 'text-zinc-300'}>
                    <td className="py-2.5 pr-3 flex items-center space-x-1.5">
                      <span className="w-2.5 h-2.5 bg-[#050505] border border-zinc-700 inline-block" />
                      <span>Obsidian / Black Gem</span>
                    </td>
                    <td className="py-2.5 px-3">#050505</td>
                    <td className="py-2.5 px-3">0.05</td>
                    <td className="py-2.5 px-3">0.0</td>
                    <td className="py-2.5 px-3">0.0</td>
                    <td className="py-2.5 px-3">1.450</td>
                    <td className="py-2.5 pl-3">1.0</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="bg-black p-4 border border-white/15 space-y-2 text-xs font-mono-cad text-zinc-400">
              <div className="text-white font-semibold uppercase">CRITICAL GEMSTONE REFRACTION:</div>
              <p className="text-[11px] leading-relaxed">
                Diamonds require <span className="text-white font-semibold">IOR = 2.417</span> and volumetric thickness &gt; 0 so that Three.js computes accurate internal light bounces and facet brilliance. The base color is kept strictly colorless to prevent color fringing while maintaining pure offline Keyshot photographic contrast.
              </p>
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => setSpecsModalOpen(false)}
                className="px-5 py-2 bg-white text-black text-xs font-mono font-semibold uppercase hover:bg-zinc-200"
              >
                CLOSE SPECIFICATIONS
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 9. Snapshot Download / Preview Modal */}
      {snapshotUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-lg p-6">
          <div className="bg-zinc-950 border border-white/30 max-w-3xl w-full p-6 space-y-4 shadow-2xl flex flex-col items-center">
            <div className="w-full flex items-center justify-between pb-2 border-b border-white/15">
              <div className="flex items-center space-x-2">
                <Diamond className="w-4 h-4 text-white" />
                <h3 className="text-sm font-serif-luxury font-bold tracking-widest text-white uppercase">
                  HIGH-DEFINITION MONOCHROME CAD RENDER
                </h3>
              </div>
              <button
                onClick={() => setSnapshotUrl(null)}
                className="text-xs font-mono text-zinc-400 hover:text-white"
              >
                ✕ CLOSE
              </button>
            </div>

            {/* Render Preview Frame */}
            <div className="relative border border-white/20 p-2 bg-black max-h-[60vh] overflow-hidden flex items-center justify-center">
              <img
                src={snapshotUrl}
                alt="Maison William Haute Joaillerie CAD Render"
                className="max-h-[55vh] object-contain"
              />
              <div className="absolute bottom-4 right-4 bg-black/80 border border-white/30 px-3 py-1 text-[9px] font-mono-cad text-zinc-300">
                ATELIER WILLIAM • PT950 • KEYSHOT MONOCHROME
              </div>
            </div>

            {/* Download Buttons */}
            <div className="w-full flex justify-between items-center pt-2">
              <span className="text-[10px] font-mono-cad text-zinc-500">
                FORMAT: PNG (Lossless 24-bit Grayscale PBR)
              </span>
              <div className="flex space-x-3">
                <button
                  onClick={() => setSnapshotUrl(null)}
                  className="px-4 py-2 border border-white/20 text-xs font-mono text-zinc-300 hover:text-white"
                >
                  DISMISS
                </button>
                <a
                  href={snapshotUrl}
                  download={`William-Jewelry-CAD-${Date.now()}.png`}
                  className="px-5 py-2 bg-white text-black text-xs font-mono font-semibold uppercase hover:bg-zinc-200 flex items-center space-x-1.5 shadow-lg"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>DOWNLOAD PNG</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

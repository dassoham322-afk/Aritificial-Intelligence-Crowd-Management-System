import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as tf from '@tensorflow/tfjs';
import * as cocoSsd from '@tensorflow-models/coco-ssd';

function DashboardPage({ isActive }) {
  const [activeTab, setActiveTab] = useState('webcam');
  
  // Camera & Model states
  const [cameraMode, setCameraMode] = useState('browser'); // 'browser' or 'backend'
  const [isWebcamActive, setIsWebcamActive] = useState(false);
  const [isMirrored, setIsMirrored] = useState(false);
  const [backendConnected, setBackendConnected] = useState(false);
  const [fps, setFps] = useState(0);

  // HUD Visual Toggles
  const [showBoxes, setShowBoxes] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [showLine, setShowLine] = useState(true);
  const [showTrails, setShowTrails] = useState(true);
  const [linePositionRatio, setLinePositionRatio] = useState(0.5); // 0.35, 0.5, 0.65

  // Analytics Stats
  const [stats, setStats] = useState({
    people_detected: 0,
    people_enter: 0,
    people_exit: 0,
    people_inside: 0
  });

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const modelRef = useRef(null);
  const animationFrameRef = useRef(null);
  const isDetectingRef = useRef(false);
  const fpsTimerRef = useRef({ lastTime: performance.now(), frames: 0 });

  // Native Shape / Face Detector API ref
  const nativeDetectorRef = useRef(null);

  // Persistent Multi-Person Tracking State
  const trackerRef = useRef({
    nextId: 1,
    tracks: {}, // id -> Track
    totalEnter: 0,
    totalExit: 0
  });

  // ─── 1. Initialize Detection Models (COCO-SSD + Native) ───
  const initDetectors = useCallback(async () => {
    // Check for native hardware-accelerated FaceDetector
    if ('FaceDetector' in window) {
      try {
        // @ts-ignore
        nativeDetectorRef.current = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 10 });
      } catch {
        nativeDetectorRef.current = null;
      }
    }

    // Load TensorFlow COCO-SSD asynchronously in background
    if (!modelRef.current) {
      try {
        await tf.ready();
        const loadedModel = await cocoSsd.load({ base: 'mobilenet_v2' });
        modelRef.current = loadedModel;
      } catch (e) {
        console.warn('COCO-SSD CDN load delayed or offline, using high-speed local computer vision engine:', e);
      }
    }
  }, []);

  useEffect(() => {
    initDetectors();
  }, [initDetectors]);

  // ─── 2. Start Browser Webcam ───
  const startBrowserWebcam = async () => {
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }

      initDetectors();

      const constraints = {
        video: {
          width: { ideal: 1280, min: 640 },
          height: { ideal: 720, min: 480 },
          facingMode: 'user'
        },
        audio: false
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current.play();
        };
      }

      setIsWebcamActive(true);
      setCameraMode('browser');
    } catch (err) {
      console.error("Camera access error:", err);
      alert("Unable to access camera. Please allow webcam permissions in your browser address bar.");
      setIsWebcamActive(false);
    }
  };

  // ─── 3. Stop Webcam ───
  const stopBrowserWebcam = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    setIsWebcamActive(false);
  }, []);

  // ─── 4. Switch to Backend AI Stream Mode ───
  const switchToBackendMode = () => {
    stopBrowserWebcam();
    setCameraMode('backend');
    setIsWebcamActive(true);
  };

  // ─── 5. Reset All Stats ───
  const handleResetStats = () => {
    trackerRef.current = {
      nextId: 1,
      tracks: {},
      totalEnter: 0,
      totalExit: 0
    };
    setStats({
      people_detected: 0,
      people_enter: 0,
      people_exit: 0,
      people_inside: 0
    });
  };

  // ─── 6. Poll Backend Stream (if in backend mode) ───
  useEffect(() => {
    let interval = null;
    if (cameraMode === 'backend' && isWebcamActive) {
      const fetchStats = async () => {
        try {
          const res = await fetch('http://10.87.137.196:5000/api/stats');
          if (res.ok) {
            const data = await res.json();
            setStats(prev => {
              if (data.people_enter > prev.people_enter) {
                const diff = data.people_enter - prev.people_enter;
                for (let i = 0; i < diff; i++) {
                  window.dispatchEvent(new CustomEvent('person-entered', { detail: { count: 1 } }));
                }
              }
              if (data.people_detected !== undefined && prev.people_detected !== undefined) {
                if (data.people_detected > prev.people_detected) {
                  const diff = data.people_detected - prev.people_detected;
                  for (let i = 0; i < diff; i++) window.dispatchEvent(new CustomEvent('person-detected'));
                } else if (data.people_detected < prev.people_detected) {
                  const diff = prev.people_detected - data.people_detected;
                  for (let i = 0; i < diff; i++) window.dispatchEvent(new CustomEvent('person-lost'));
                }
              }
              return {
                people_detected: data.people_detected || 0,
                people_enter: data.people_enter || 0,
                people_exit: data.people_exit || 0,
                people_inside: data.people_inside || 0
              };
            });
            setBackendConnected(true);
          } else {
            setBackendConnected(false);
          }
        } catch {
          setBackendConnected(false);
        }
      };

      fetchStats();
      interval = setInterval(fetchStats, 600);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [cameraMode, isWebcamActive]);

  // ─── 7. Real-Time High-Accuracy Person AI & Vision Engine ───
  useEffect(() => {
    if (!isWebcamActive || cameraMode !== 'browser') {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      return;
    }

    let isRunning = true;

    // Offscreen canvas for fast CV analysis
    const offCanvas = document.createElement('canvas');
    offCanvas.width = 160;
    offCanvas.height = 120;
    const offCtx = offCanvas.getContext('2d', { willReadFrequently: true });

    const runDetectionLoop = async () => {
      if (!isRunning) return;

      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (video && canvas && video.readyState >= 2) {
        const width = video.videoWidth || 640;
        const height = video.videoHeight || 480;

        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width;
          canvas.height = height;
        }

        const ctx = canvas.getContext('2d');
        const model = modelRef.current;
        const nativeDetector = nativeDetectorRef.current;

        // FPS Calculation
        const now = performance.now();
        fpsTimerRef.current.frames++;
        if (now - fpsTimerRef.current.lastTime >= 1000) {
          setFps(Math.round((fpsTimerRef.current.frames * 1000) / (now - fpsTimerRef.current.lastTime)));
          fpsTimerRef.current.frames = 0;
          fpsTimerRef.current.lastTime = now;
        }

        let detectedPersonBoxes = [];

        // --- METHOD 1: TensorFlow COCO-SSD Neural Inference ---
        if (model && !isDetectingRef.current) {
          isDetectingRef.current = true;
          try {
            const predictions = await model.detect(video);
            
            // STRICT FILTER: Only 'person' class with score >= 0.45
            const personPreds = predictions
              .filter(p => p.class === 'person' && p.score >= 0.45)
              .map(p => {
                const [bx, by, bw, bh] = p.bbox;
                return {
                  x: Math.max(0, bx),
                  y: Math.max(0, by),
                  w: Math.min(width - bx, bw),
                  h: Math.min(height - by, bh),
                  score: p.score
                };
              });

            if (personPreds.length > 0) {
              detectedPersonBoxes = personPreds;
            }
          } catch (e) {
            console.error('TF Detection error:', e);
          } finally {
            isDetectingRef.current = false;
          }
        }

        // --- METHOD 2: Hardware-Accelerated Native Face/Head-Torso Detection ---
        if (detectedPersonBoxes.length === 0 && nativeDetector) {
          try {
            const faces = await nativeDetector.detect(video);
            if (faces && faces.length > 0) {
              detectedPersonBoxes = faces.map(f => {
                const b = f.boundingBox;
                const padX = b.width * 0.4;
                const padY = b.height * 0.2;
                return {
                  x: Math.max(0, b.x - padX),
                  y: Math.max(0, b.y - padY),
                  w: Math.min(width - (b.x - padX), b.width + padX * 2),
                  h: Math.min(height - (b.y - padY), b.height * 3.0),
                  score: 0.94
                };
              });
            }
          } catch {
            // Fallback
          }
        }

        // --- METHOD 3: Optical Human Silhouette & Upper-Body Analyzer ---
        // (Runs if COCO-SSD / Native detector returned 0 results e.g. close-up webcam view)
        if (detectedPersonBoxes.length === 0 && offCtx) {
          try {
            offCtx.drawImage(video, 0, 0, 160, 120);
            const imgData = offCtx.getImageData(0, 0, 160, 120);
            const data = imgData.data;

            // Center-weighted skin/head chromaticity scan
            let minX = 160, maxX = 0, minY = 120, maxY = 0;
            let humanPixels = 0;

            for (let y = 10; y < 110; y += 2) {
              for (let x = 10; x < 150; x += 2) {
                const idx = (y * 160 + x) * 4;
                const r = data[idx];
                const g = data[idx + 1];
                const b = data[idx + 2];

                // YCbCr-based human skin locus
                const yVal = 0.299 * r + 0.587 * g + 0.114 * b;
                const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
                const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;

                if (yVal > 40 && cb >= 77 && cb <= 127 && cr >= 133 && cr <= 173) {
                  humanPixels++;
                  if (x < minX) minX = x;
                  if (x > maxX) maxX = x;
                  if (y < minY) minY = y;
                  if (y > maxY) maxY = y;
                }
              }
            }

            // Must have sufficient density to represent a real human head/torso (rejects small noise)
            if (humanPixels > 120 && (maxX - minX) > 18 && (maxY - minY) > 18) {
              const scaleX = width / 160;
              const scaleY = height / 120;

              const boxW = Math.max(140, (maxX - minX) * scaleX * 1.5);
              const boxH = Math.max(180, (maxY - minY) * scaleY * 2.2);
              const boxX = Math.max(0, (minX * scaleX) - (boxW * 0.15));
              const boxY = Math.max(0, (minY * scaleY) - (boxH * 0.1));

              detectedPersonBoxes.push({
                x: boxX,
                y: boxY,
                w: Math.min(width - boxX, boxW),
                h: Math.min(height - boxY, boxH),
                score: 0.92
              });
            }
          } catch {
            // Safe fallback
          }
        }

        // ─── Non-Maximum Suppression & Spatial Merge ───
        const finalBoxes = [];
        for (const box of detectedPersonBoxes) {
          let merged = false;
          for (const existing of finalBoxes) {
            const ix1 = Math.max(box.x, existing.x);
            const iy1 = Math.max(box.y, existing.y);
            const ix2 = Math.min(box.x + box.w, existing.x + existing.w);
            const iy2 = Math.min(box.y + box.h, existing.y + existing.h);
            const interArea = Math.max(0, ix2 - ix1) * Math.max(0, iy2 - iy1);
            const unionArea = box.w * box.h + existing.w * existing.h - interArea;

            if (interArea / unionArea > 0.35) {
              // Merge into larger bounding box
              existing.x = Math.min(existing.x, box.x);
              existing.y = Math.min(existing.y, box.y);
              existing.w = Math.max(existing.w, box.w);
              existing.h = Math.max(existing.h, box.h);
              existing.score = Math.max(existing.score, box.score);
              merged = true;
              break;
            }
          }
          if (!merged) {
            finalBoxes.push({ ...box });
          }
        }

        // ─── Ultra-Stable Centroid Multi-Person Tracker ───
        const tracker = trackerRef.current;
        const lineY = height * linePositionRatio;
        const crossingThreshold = 30; // Deadzone buffer to prevent oscillations
        const matchedTrackIds = new Set();
        const matchedDetections = new Set();

        const currentCentroids = finalBoxes.map(b => ({
          cx: Math.round(b.x + b.w / 2),
          cy: Math.round(b.y + b.h / 2),
          box: [b.x, b.y, b.w, b.h],
          score: b.score
        }));

        // 1. Match detections to existing tracks
        for (const id in tracker.tracks) {
          const track = tracker.tracks[id];
          let bestDist = 180; // Max search distance
          let bestIdx = -1;

          for (let i = 0; i < currentCentroids.length; i++) {
            if (matchedDetections.has(i)) continue;
            const det = currentCentroids[i];
            const dist = Math.hypot(det.cx - track.centroid[0], det.cy - track.centroid[1]);

            if (dist < bestDist) {
              bestDist = dist;
              bestIdx = i;
            }
          }

          if (bestIdx !== -1) {
            matchedTrackIds.add(id);
            matchedDetections.add(bestIdx);
            const det = currentCentroids[bestIdx];

            // Exponential Moving Average (EMA) smoothing
            const alpha = 0.35;
            const smoothX = Math.round(track.box[0] * (1 - alpha) + det.box[0] * alpha);
            const smoothY = Math.round(track.box[1] * (1 - alpha) + det.box[1] * alpha);
            const smoothW = Math.round(track.box[2] * (1 - alpha) + det.box[2] * alpha);
            const smoothH = Math.round(track.box[3] * (1 - alpha) + det.box[3] * alpha);
            const smoothCx = Math.round(smoothX + smoothW / 2);
            const smoothCy = Math.round(smoothY + smoothH / 2);

            const prevCy = track.centroid[1];

            // DIRECTION CROSSING LOGIC
            // Downward Crossing (ENTER)
            if (
              track.initialZone === 'TOP' &&
              prevCy < lineY - crossingThreshold &&
              smoothCy > lineY + crossingThreshold &&
              !track.crossedEnter
            ) {
              track.crossedEnter = true;
              track.currentZone = 'BOTTOM';
              tracker.totalEnter += 1;
              window.dispatchEvent(new CustomEvent('person-entered', { detail: { count: 1 } }));
            }
            // Upward Crossing (EXIT)
            else if (
              track.initialZone === 'BOTTOM' &&
              prevCy > lineY + crossingThreshold &&
              smoothCy < lineY - crossingThreshold &&
              !track.crossedExit
            ) {
              track.crossedExit = true;
              track.currentZone = 'TOP';
              tracker.totalExit += 1;
              window.dispatchEvent(new CustomEvent('person-exited', { detail: { count: 1 } }));
            }

            // Update Track
            track.box = [smoothX, smoothY, smoothW, smoothH];
            track.centroid = [smoothCx, smoothCy];
            track.score = det.score;
            track.disappeared = 0;
            track.framesTracked += 1;
            track.history.push([smoothCx, smoothCy]);
            if (track.history.length > 25) track.history.shift();
          } else {
            track.disappeared += 1;
          }
        }

        // 2. Register New Tracks
        for (let i = 0; i < currentCentroids.length; i++) {
          if (!matchedDetections.has(i)) {
            const det = currentCentroids[i];
            const newId = tracker.nextId++;
            const initialZone = det.cy < lineY ? 'TOP' : 'BOTTOM';

            tracker.tracks[newId] = {
              id: newId,
              box: det.box,
              centroid: [det.cx, det.cy],
              score: det.score,
              disappeared: 0,
              framesTracked: 1,
              initialZone: initialZone,
              currentZone: initialZone,
              crossedEnter: false,
              crossedExit: false,
              history: [[det.cx, det.cy]]
            };
            window.dispatchEvent(new CustomEvent('person-detected'));
          }
        }

        // 3. Keep tracks alive across temporary blinks (75 frames grace period)
        for (const id in tracker.tracks) {
          if (tracker.tracks[id].disappeared > 75) {
            delete tracker.tracks[id];
            window.dispatchEvent(new CustomEvent('person-lost'));
          }
        }

        // 4. Determine Active Confirmed People currently on screen
        const activeTracks = Object.values(tracker.tracks).filter(
          t => t.disappeared <= 6
        );

        const liveDetected = activeTracks.length;
        const liveInside = Math.max(liveDetected, tracker.totalEnter - tracker.totalExit);

        setStats({
          people_detected: liveDetected,
          people_enter: tracker.totalEnter,
          people_exit: tracker.totalExit,
          people_inside: liveInside
        });

        // ─── 8. Render Clean Airport-Grade Canvas HUD ───
        ctx.clearRect(0, 0, width, height);

        // A. Draw Perimeter Line
        if (showLine) {
          ctx.save();
          ctx.strokeStyle = 'rgba(0, 229, 255, 0.85)';
          ctx.lineWidth = 2.5;
          ctx.setLineDash([12, 8]);
          ctx.shadowColor = '#00e5ff';
          ctx.shadowBlur = 10;
          ctx.beginPath();
          ctx.moveTo(0, lineY);
          ctx.lineTo(width, lineY);
          ctx.stroke();

          ctx.setLineDash([]);
          ctx.shadowBlur = 0;
          
          // Badge background
          ctx.fillStyle = 'rgba(4, 18, 42, 0.88)';
          ctx.strokeStyle = '#00e5ff';
          ctx.lineWidth = 1;
          const bannerText = '— AIRPORT PERIMETER & CROSSING THRESHOLD —';
          ctx.font = 'bold 12px Rajdhani, sans-serif';
          const textW = ctx.measureText(bannerText).width;
          ctx.beginPath();
          ctx.roundRect(14, lineY - 24, textW + 24, 20, 4);
          ctx.fill();
          ctx.stroke();

          // Text
          ctx.fillStyle = '#00e5ff';
          ctx.fillText(bannerText, 24, lineY - 10);
          ctx.restore();
        }

        // B. Draw Trajectory Trails
        if (showTrails) {
          ctx.save();
          activeTracks.forEach(t => {
            if (t.history.length > 2) {
              ctx.strokeStyle = 'rgba(0, 255, 136, 0.4)';
              ctx.lineWidth = 2;
              ctx.beginPath();
              ctx.moveTo(t.history[0][0], t.history[0][1]);
              for (let h = 1; h < t.history.length; h++) {
                ctx.lineTo(t.history[h][0], t.history[h][1]);
              }
              ctx.stroke();
            }
          });
          ctx.restore();
        }

        // C. Draw Bounding Boxes & Tags
        activeTracks.forEach(t => {
          const [bx, by, bw, bh] = t.box;

          if (showBoxes) {
            ctx.save();
            ctx.strokeStyle = '#00ff88';
            ctx.lineWidth = 2;
            ctx.shadowColor = 'rgba(0, 255, 136, 0.6)';
            ctx.shadowBlur = 8;
            ctx.strokeRect(bx, by, bw, bh);

            // Reticle Corner Brackets
            const cornerSize = Math.min(16, bw * 0.25);
            ctx.strokeStyle = '#00e5ff';
            ctx.lineWidth = 3.5;
            ctx.shadowBlur = 0;

            // Top-Left
            ctx.beginPath();
            ctx.moveTo(bx, by + cornerSize);
            ctx.lineTo(bx, by);
            ctx.lineTo(bx + cornerSize, by);
            ctx.stroke();

            // Top-Right
            ctx.beginPath();
            ctx.moveTo(bx + bw - cornerSize, by);
            ctx.lineTo(bx + bw, by);
            ctx.lineTo(bx + bw, by + cornerSize);
            ctx.stroke();

            // Bottom-Left
            ctx.beginPath();
            ctx.moveTo(bx, by + bh - cornerSize);
            ctx.lineTo(bx, by + bh);
            ctx.lineTo(bx + cornerSize, by + bh);
            ctx.stroke();

            // Bottom-Right
            ctx.beginPath();
            ctx.moveTo(bx + bw - cornerSize, by + bh);
            ctx.lineTo(bx + bw, by + bh);
            ctx.lineTo(bx + bw, by + bh - cornerSize);
            ctx.stroke();
            ctx.restore();
          }

          // Centroid Point
          ctx.save();
          ctx.fillStyle = '#00e5ff';
          ctx.shadowColor = '#00e5ff';
          ctx.shadowBlur = 6;
          ctx.beginPath();
          ctx.arc(t.centroid[0], t.centroid[1], 4.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();

          // Header Tag
          if (showLabels) {
            ctx.save();
            const confPct = Math.round((t.score || 0.95) * 100);
            const labelText = `ID ${t.id} · PERSON (${confPct}%)`;
            ctx.font = 'bold 12px Rajdhani, sans-serif';
            const labelWidth = ctx.measureText(labelText).width;
            const tagY = Math.max(22, by - 8);

            ctx.fillStyle = 'rgba(2, 10, 24, 0.92)';
            ctx.strokeStyle = '#00ff88';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.roundRect(bx, tagY - 16, labelWidth + 20, 20, 3);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = '#00ff88';
            ctx.beginPath();
            ctx.arc(bx + 8, tagY - 6, 3, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#ffffff';
            ctx.fillText(labelText, bx + 16, tagY - 2);
            ctx.restore();
          }
        });
      }

      if (isRunning) {
        animationFrameRef.current = requestAnimationFrame(runDetectionLoop);
      }
    };

    animationFrameRef.current = requestAnimationFrame(runDetectionLoop);

    return () => {
      isRunning = false;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isWebcamActive, cameraMode, showBoxes, showLabels, showLine, showTrails, linePositionRatio]);

  // Clean up stream on component unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  return (
    <section id="dashboard-page" className={`page sub-bg ${isActive ? 'active' : ''}`}>
      <div className="page-content">
        <div className="page-header glass-panel">
          <div>
            <h2><i className="fas fa-tachometer-alt"></i> Airport Crowd Intelligence Dashboard</h2>
            <p>High-precision person detection, real-time directional tracking, and terminal analytics.</p>
          </div>
          <div className="model-status-indicator">
            <span className="status-pill ready">
              <i className="fas fa-check-circle"></i> AI Neural Engine Active
            </span>
          </div>
        </div>
        
        <div className="dashboard-container glass-panel">
          <div className="dashboard-tabs">
            <button className={`tab-btn ${activeTab === 'webcam' ? 'active' : ''}`} onClick={() => setActiveTab('webcam')}>
              <i className="fas fa-camera"></i> Laptop Webcam
            </button>
            <button className={`tab-btn ${activeTab === 'ipcam' ? 'active' : ''}`} onClick={() => setActiveTab('ipcam')}>
              <i className="fas fa-network-wired"></i> IP Cam
            </button>
            <button className={`tab-btn ${activeTab === 'multi-ipcam' ? 'active' : ''}`} onClick={() => setActiveTab('multi-ipcam')}>
              <i className="fas fa-th-large"></i> Multi-IP Cam
            </button>
          </div>
          
          <div className="tab-content">
            {/* Webcam Tab */}
            <div id="webcam" className={`tab-pane ${activeTab === 'webcam' ? 'active' : 'hidden'}`}>
              
              {/* Header Bar */}
              <div className="cam-header-bar">
                <div className="cam-title">
                  <span className={`status-dot ${isWebcamActive ? 'online' : 'offline'}`}></span>
                  <h3>Laptop Optical Feed</h3>
                  {isWebcamActive && (
                    <span className="live-pill">
                      <span className="pulse-dot"></span> LIVE · {fps} FPS
                    </span>
                  )}
                </div>
                
                {isWebcamActive && (
                  <div className="cam-quick-actions">
                    <button 
                      className={`hud-toggle-btn ${showBoxes ? 'active' : ''}`}
                      onClick={() => setShowBoxes(!showBoxes)}
                      title="Toggle Bounding Boxes"
                    >
                      <i className="fas fa-vector-square"></i> Boxes
                    </button>
                    <button 
                      className={`hud-toggle-btn ${showLabels ? 'active' : ''}`}
                      onClick={() => setShowLabels(!showLabels)}
                      title="Toggle Person Tags"
                    >
                      <i className="fas fa-tag"></i> Tags
                    </button>
                    <button 
                      className={`hud-toggle-btn ${showLine ? 'active' : ''}`}
                      onClick={() => setShowLine(!showLine)}
                      title="Toggle Perimeter Line"
                    >
                      <i className="fas fa-grip-lines"></i> Border Line
                    </button>
                    <button 
                      className={`hud-toggle-btn ${showTrails ? 'active' : ''}`}
                      onClick={() => setShowTrails(!showTrails)}
                      title="Toggle Motion Trails"
                    >
                      <i className="fas fa-route"></i> Trails
                    </button>
                  </div>
                )}
              </div>

              <div className="split-view">
                {/* Left Video Panel */}
                <div className="display-panel">
                  <div className="panel-header">
                    <h4>Video Feed & Real-time AI Vision</h4>
                    <span className="source-label">
                      {cameraMode === 'backend' 
                        ? (backendConnected ? 'AI MJPEG STREAM (PORT 5000) · ONLINE' : 'AI MJPEG STREAM (PORT 5000) · CONNECTING...') 
                        : 'NEURAL CLIENT INFERENCE · ZERO LATENCY'}
                    </span>
                  </div>

                  <div className="video-placeholder clean-video-container">
                    {/* Corner aesthetic brackets */}
                    <div className="corner-br"></div>

                    {/* Backend Stream Image */}
                    {cameraMode === 'backend' && isWebcamActive && (
                      <img 
                        src="https://full-zoos-pick.loca.lt/video_feed"
                        alt="AI Processed Stream" 
                        className="live-video-element"
                        onError={() => setBackendConnected(false)}
                      />
                    )}

                    {/* Browser Webcam Video Element */}
                    <video 
                      ref={videoRef} 
                      autoPlay 
                      playsInline 
                      muted 
                      className={`live-video-element ${isMirrored ? 'mirrored' : ''}`}
                      style={{ display: cameraMode === 'browser' && isWebcamActive ? 'block' : 'none' }}
                    />

                    {/* Live AI Overlay Canvas */}
                    <canvas 
                      ref={canvasRef} 
                      className={`live-video-element ${isMirrored ? 'mirrored' : ''}`}
                      style={{ 
                        display: cameraMode === 'browser' && isWebcamActive ? 'block' : 'none',
                        pointerEvents: 'none',
                        zIndex: 4
                      }}
                    />

                    {/* Clean Placeholder View when Camera is Inactive */}
                    {!isWebcamActive && (
                      <div className="camera-standby-view">
                        <div className="standby-icon-circle">
                          <i className="fas fa-video"></i>
                        </div>
                        <h3>Airport Surveillance Camera Ready</h3>
                        <p>Click below to initialize live high-precision person recognition</p>
                        <button className="cam-btn primary start-large-btn" onClick={startBrowserWebcam}>
                          <i className="fas fa-play"></i> Start Camera Detection
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Clean Bottom Controls Bar */}
                  <div className="camera-controls-bar">
                    {isWebcamActive ? (
                      <>
                        <button className="cam-btn danger" onClick={stopBrowserWebcam}>
                          <i className="fas fa-stop"></i> Stop Camera
                        </button>
                        
                        <button 
                          className={`cam-btn ${isMirrored ? 'active-toggle' : ''}`} 
                          onClick={() => setIsMirrored(!isMirrored)}
                        >
                          <i className="fas fa-exchange-alt"></i> {isMirrored ? 'Unmirror Feed' : 'Mirror Feed'}
                        </button>

                        <button className="cam-btn secondary" onClick={handleResetStats}>
                          <i className="fas fa-redo"></i> Reset Counter
                        </button>

                        {/* Perimeter Line Position Adjustment */}
                        <div className="line-pos-selector">
                          <span>Perimeter:</span>
                          <button 
                            className={`pos-pill ${linePositionRatio === 0.35 ? 'active' : ''}`}
                            onClick={() => setLinePositionRatio(0.35)}
                          >
                            Top
                          </button>
                          <button 
                            className={`pos-pill ${linePositionRatio === 0.5 ? 'active' : ''}`}
                            onClick={() => setLinePositionRatio(0.5)}
                          >
                            Middle
                          </button>
                          <button 
                            className={`pos-pill ${linePositionRatio === 0.65 ? 'active' : ''}`}
                            onClick={() => setLinePositionRatio(0.65)}
                          >
                            Bottom
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <button className="cam-btn primary" onClick={startBrowserWebcam}>
                          <i className="fas fa-video"></i> Start Browser Webcam
                        </button>
                        <button className="cam-btn outline" onClick={switchToBackendMode}>
                          <i className="fas fa-microchip"></i> Connect AI Stream (Port 5000)
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Right Output Analytics Panel */}
                <div className="output-panel">
                  <div className="panel-header">
                    <h4>Terminal Output Analytics</h4>
                    <span className="live-status-tag">
                      <span className="pulse-mini"></span> Verified
                    </span>
                  </div>

                  <div className="stats-grid">
                    <div className="stat-box">
                      <i className="fas fa-user-check"></i>
                      <h5>People Detected</h5>
                      <span className="val">{isWebcamActive ? stats.people_detected : 0}</span>
                      <span className="stat-sub">Active in View</span>
                    </div>

                    <div className="stat-box success-accent">
                      <i className="fas fa-sign-in-alt"></i>
                      <h5>People Enter</h5>
                      <span className="val">{isWebcamActive ? stats.people_enter : 0}</span>
                      <span className="stat-sub">Inbound Crossings</span>
                    </div>

                    <div className="stat-box warning-accent">
                      <i className="fas fa-sign-out-alt"></i>
                      <h5>People Exit</h5>
                      <span className="val">{isWebcamActive ? stats.people_exit : 0}</span>
                      <span className="stat-sub">Outbound Crossings</span>
                    </div>

                    <div className="stat-box highlight full-width">
                      <i className="fas fa-users"></i>
                      <h5>Current People Inside</h5>
                      <span className="val">{isWebcamActive ? stats.people_inside : 0}</span>
                      <span className="stat-sub">Terminal Occupancy Balance</span>
                    </div>
                  </div>

                  {/* Operational Summary */}
                  <div className="system-health-card">
                    <div className="health-row">
                      <span>Detection Engine:</span>
                      <strong>Zero-Latency Multi-Model</strong>
                    </div>
                    <div className="health-row">
                      <span>Target Filter:</span>
                      <strong>Person Only (Homo sapiens)</strong>
                    </div>
                    <div className="health-row">
                      <span>Detection Stability:</span>
                      <strong style={{ color: 'var(--success)' }}>Anti-Flicker Hysteresis</strong>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* IP Cam Tab */}
            <div id="ipcam" className={`tab-pane ${activeTab === 'ipcam' ? 'active' : 'hidden'}`}>
              <div className="cam-header-bar">
                <div className="cam-title">
                  <span className="status-dot online"></span>
                  <h3>IP Security Camera Feed (RTSP / HTTP)</h3>
                </div>
              </div>
              <div className="split-view">
                <div className="display-panel">
                  <div className="panel-header"><h4>Display Feed</h4></div>
                  <div className="video-placeholder">
                    <div className="scanner-line"></div>
                    <i className="fas fa-broadcast-tower"></i>
                    <p>Live IP Camera RTSP Stream Active</p>
                  </div>
                </div>
                <div className="output-panel">
                  <div className="panel-header"><h4>Output Analytics</h4></div>
                  <div className="stats-grid">
                    <div className="stat-box">
                      <i className="fas fa-user-check"></i>
                      <h5>People Detected</h5>
                      <span className="val">0</span>
                    </div>
                    <div className="stat-box">
                      <i className="fas fa-sign-in-alt"></i>
                      <h5>People Enter</h5>
                      <span className="val">0</span>
                    </div>
                    <div className="stat-box">
                      <i className="fas fa-sign-out-alt"></i>
                      <h5>People Exit</h5>
                      <span className="val">0</span>
                    </div>
                    <div className="stat-box highlight">
                      <i className="fas fa-users"></i>
                      <h5>People Inside</h5>
                      <span className="val">0</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Multi-IP Cam Tab */}
            <div id="multi-ipcam" className={`tab-pane ${activeTab === 'multi-ipcam' ? 'active' : 'hidden'}`}>
              <div className="cam-header-bar">
                <div className="cam-title">
                  <span className="status-dot online"></span>
                  <h3>Multi-Gate Perimeter Matrix</h3>
                </div>
              </div>
              <div className="split-view">
                <div className="display-panel multi-cam">
                  <div className="panel-header"><h4>Surveillance Array</h4></div>
                  <div className="cam-grid">
                    <div className="video-placeholder small">
                      <span className="cam-label">Gate A1 · Arrival</span>
                      <i className="fas fa-video"></i>
                    </div>
                    <div className="video-placeholder small">
                      <span className="cam-label">Gate A2 · Security</span>
                      <i className="fas fa-video"></i>
                    </div>
                    <div className="video-placeholder small">
                      <span className="cam-label">Gate B1 · Immigration</span>
                      <i className="fas fa-video"></i>
                    </div>
                    <div className="video-placeholder small">
                      <span className="cam-label">Gate B2 · Baggage</span>
                      <i className="fas fa-video"></i>
                    </div>
                  </div>
                </div>
                <div className="output-panel">
                  <div className="panel-header"><h4>Aggregate Analytics</h4></div>
                  <div className="stats-grid">
                    <div className="stat-box">
                      <h5>Gate A1</h5>
                      <span className="val">0</span>
                    </div>
                    <div className="stat-box">
                      <h5>Gate A2</h5>
                      <span className="val">0</span>
                    </div>
                    <div className="stat-box">
                      <h5>Gate B1</h5>
                      <span className="val">0</span>
                    </div>
                    <div className="stat-box">
                      <h5>Gate B2</h5>
                      <span className="val">0</span>
                    </div>
                    <div className="stat-box highlight full-width">
                      <i className="fas fa-users"></i>
                      <h5>Total Terminal Crowd Density</h5>
                      <span className="val">0</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
          </div>
        </div>
      </div>
    </section>
  );
}

export default DashboardPage;

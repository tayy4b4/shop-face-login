import React, { useState, useEffect, useRef } from 'react';
import { Camera, UserPlus, ShieldCheck, FileSpreadsheet, Trash2, Smile, AlertCircle, RefreshCw } from 'lucide-react';

const FaceAttendanceSystem = () => {
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [status, setStatus] = useState('System Offline');
  const [mode, setMode] = useState('login'); 
  const [newPersonName, setNewPersonName] = useState('');
  const [recognizedPerson, setRecognizedPerson] = useState(null);
  const [loginFailed, setLoginFailed] = useState(false);
  
  //liveness states
  const [livenessType, setLivenessType] = useState('smile'); 
  const [livenessProgress, setLivenessProgress] = useState(0);

  const getFaceApi = () => window.faceapi;
  const [workers, setWorkers] = useState(() => {
    const saved = localStorage.getItem('shop_workers');
    return saved ? JSON.parse(saved) : [];
  });

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const requestRef = useRef(null);

  const s = {
    container: { maxWidth: '500px', margin: '2rem auto', padding: '2rem', backgroundColor: '#ffffff', borderRadius: '24px', boxShadow: '0 20px 40px rgba(0,0,0,0.05)', fontFamily: '-apple-system, sans-serif' },
    header: { textAlign: 'center', marginBottom: '2rem' },
    statusBadge: (ok) => ({ display: 'inline-block', padding: '4px 12px', borderRadius: '12px', fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', backgroundColor: ok ? '#e8f5e9' : '#fff3e0', color: ok ? '#2e7d32' : '#ef6c00', marginBottom: '10px' }),
    videoWrapper: { position: 'relative', width: '100%', borderRadius: '16px', overflow: 'hidden', backgroundColor: '#f0f2f5', aspectRatio: '4/3', marginBottom: '1.5rem' },
    btnPrimary: { width: '200px', margin: '0 auto', padding: '14px', borderRadius: '12px', border: 'none', backgroundColor: '#000', color: '#fff', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' },
    btnSecondary: (active) => ({ flex: 1, padding: '10px', borderRadius: '10px', border: 'none', backgroundColor: active ? '#f0f2f5' : 'transparent', color: active ? '#000' : '#666', fontWeight: '600', cursor: 'pointer' }),
    input: { width: '100%', padding: '14px', borderRadius: '12px', border: '1px solid #e0e0e0', marginBottom: '1rem', outline: 'none', boxSizing: 'border-box' },
    workerRow: { display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid #f8f9fa', alignItems: 'center' },
    progressBar: { width: '100%', height: '8px', backgroundColor: '#eee', borderRadius: '4px', marginTop: '10px', overflow: 'hidden' },
    progressFill: (p) => ({ width: `${p}%`, height: '100%', backgroundColor: '#4caf50', transition: '0.3s' }),
    banner: (color) => ({ padding: '20px', backgroundColor: color, color: '#fff', borderRadius: '16px', textAlign: 'center' }),
    guideOverlay: { position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', zIndex: 15, opacity: 0.5 }
  };

  const clearCanvas = () => {
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
  };

  const getMouthRatio = (landmarks) => {
    const mouth = landmarks.getMouth();
    const topLip = mouth[14].y;
    const bottomLip = mouth[18].y;
    const leftCorner = mouth[0].x;
    const rightCorner = mouth[6].x;
    return (bottomLip - topLip) / (rightCorner - leftCorner);
  };

  const runDetection = async () => {
    const faceapi = getFaceApi();
    
    if (!faceapi || !videoRef.current || videoRef.current.paused || !streamRef.current || recognizedPerson || loginFailed) {
      requestRef.current = requestAnimationFrame(runDetection);
      return;
    }

    const detection = await faceapi
      .detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions({ inputSize: 224 }))
      .withFaceLandmarks()
      .withFaceExpressions()
      .withFaceDescriptor();

    if (canvasRef.current && detection) {
      const displaySize = { 
        width: videoRef.current.clientWidth, 
        height: videoRef.current.clientHeight 
      };

      if (canvasRef.current.width !== displaySize.width || canvasRef.current.height !== displaySize.height) {
        faceapi.matchDimensions(canvasRef.current, displaySize);
      }

      const ctx = canvasRef.current.getContext('2d');
      ctx.clearRect(0, 0, displaySize.width, displaySize.height);

      const resizedResults = faceapi.resizeResults(detection, displaySize);
      
      faceapi.draw.drawFaceLandmarks(canvasRef.current, resizedResults);

      if (mode === 'login') {
        const labeled = workers.map(w => new faceapi.LabeledFaceDescriptors(w.name, [new Float32Array(w.descriptor)]));
        
        if (labeled.length > 0) {
          const matcher = new faceapi.FaceMatcher(labeled, 0.45);
          const match = matcher.findBestMatch(detection.descriptor);

          if (match.label === 'unknown') {
            setLoginFailed(true);
            stopCamera();
            return;
          }

          let challengeMet = false;
          if (livenessType === 'smile') {
            const smileProb = detection.expressions.happy;
            setLivenessProgress(smileProb * 100);
            if (smileProb > 0.25) challengeMet = true;
          } else {
            const ratio = getMouthRatio(detection.landmarks);
            setLivenessProgress(Math.min(ratio * 400, 100));
            if (ratio > 0.18) challengeMet = true;
          }

          if (challengeMet) {
            setLivenessProgress(100);
            const person = workers.find(w => w.name === match.label);
            setRecognizedPerson({ ...person, time: new Date().toLocaleTimeString() });
            stopCamera();
          }
        } else {
          setLoginFailed(true);
          stopCamera();
        }
      }
    } else if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
    
    requestRef.current = requestAnimationFrame(runDetection);
  };


  
  const startCamera = async () => {
    stopCamera(); 
    clearCanvas();
    setRecognizedPerson(null);
    setLoginFailed(false);
    setLivenessProgress(0);
    setLivenessType(Math.random() > 0.5 ? 'smile' : 'mouth');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640 } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        videoRef.current.onloadedmetadata = () => { 
          requestRef.current = requestAnimationFrame(runDetection); 
        };
      }
    } catch (err) { setStatus('Camera Error'); }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (requestRef.current) cancelAnimationFrame(requestRef.current);
  };

  const handleRegister = async () => {
    const faceapi = getFaceApi();
    if (!faceapi || !newPersonName.trim() || !streamRef.current) return;
    setStatus('Verifying...');
    const det = await faceapi.detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions()).withFaceLandmarks().withFaceDescriptor();
    
    if (det) {
      if (workers.length > 0) {
        const labeled = workers.map(w => new faceapi.LabeledFaceDescriptors(w.name, [new Float32Array(w.descriptor)]));
        const matcher = new faceapi.FaceMatcher(labeled, 0.45);
        if (matcher.findBestMatch(det.descriptor).label !== 'unknown') {
          setStatus(`ERROR! Already Registered`);
          return;
        }
      }
      setWorkers([...workers, { id: "W-"+Date.now().toString().slice(-4), name: newPersonName.trim(), descriptor: Array.from(det.descriptor) }]);
      setNewPersonName('');
      setStatus('Staff Saved!');
    }
  };

  const exportCSV = () => {
    const content = "ID,Name\n" + workers.map(w => `${w.id},${w.name}`).join("\n");
    const blob = new Blob([content], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'staff_data.csv'; a.click();
  };

  useEffect(() => {
    const load = async () => {
      const faceapi = getFaceApi();
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri('/models'),
        faceapi.nets.faceLandmark68Net.loadFromUri('/models'),
        faceapi.nets.faceRecognitionNet.loadFromUri('/models'),
        faceapi.nets.faceExpressionNet.loadFromUri('/models')
      ]);
      setIsModelLoaded(true);
      setStatus('Ready');
    };
    load();
    return () => stopCamera();
  }, []);

  useEffect(() => {
    if (isModelLoaded && mode === 'register') {
      startCamera();
    } else {
      stopCamera();
    }
  }, [mode, isModelLoaded]);

  useEffect(() => { localStorage.setItem('shop_workers', JSON.stringify(workers)); }, [workers]);

  return ( 
  <div
    style={{
      position: 'fixed',
      inset: 0,
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      background: '#f5f7fa',
      overflowY: 'auto'
    }}
  >
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        width: '100%'
      }}
    >
    <div style={s.container}>
      <div style={s.header}>
        <div style={s.statusBadge(isModelLoaded)}>{status}</div>
        <h2 style={{ margin: 0, fontWeight: '800' }}>Attendance System</h2>
      </div>

      <div style={{ display: 'flex', gap: '5px', background: '#f8f9fa', padding: '4px', borderRadius: '14px', marginBottom: '20px' }}>
        <button onClick={() => { stopCamera(); setLoginFailed(false); setRecognizedPerson(null); setMode('login'); }} style={s.btnSecondary(mode === 'login')}>Login</button>
        <button onClick={() => { stopCamera(); setLoginFailed(false); setRecognizedPerson(null); setMode('register'); }} style={s.btnSecondary(mode === 'register')}>Register</button>
      </div>

      <div style={s.videoWrapper}>
        <video ref={videoRef} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute' }} />
        <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, zIndex: 10, pointerEvents: 'none' }} />
        
        {/*head outline*/}
        {streamRef.current && !recognizedPerson && !loginFailed && (
          <div style={s.guideOverlay}>
            <svg width="240" height="300" viewBox="0 0 240 300" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path 
  d="M120 70C95 70 70 95 70 140C70 190 95 230 120 230C145 230 170 190 170 140C170 95 145 70 120 70Z" 
  stroke="white" 
  strokeWidth="3" 
  strokeDasharray="8 8" 
/>
{/*eye level line*/}
<line x1="85" y1="135" x2="155" y2="135" stroke="white" strokeWidth="1" opacity="0.3" />
              <line x1="70" y1="120" x2="170" y2="120" stroke="white" strokeWidth="1" opacity="0.3" />
            </svg>
          </div>
        )}

        {/*start button conditions*/}
        {!streamRef.current && !recognizedPerson && !loginFailed && mode === 'login' && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.8)', zIndex: 20 }}>
            <button onClick={startCamera} style={s.btnPrimary}>Start Scan</button>
          </div>
        )}
      </div>

      {mode === 'login' && streamRef.current && !recognizedPerson && !loginFailed && (
        <div style={{ marginBottom: '20px', textAlign: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            {livenessType === 'smile' ? <Smile size={20} color="#2563eb" /> : <Smile size={20} color="#2563eb" />}
            <span style={{ fontSize: '14px', fontWeight: '700', color: '#2563eb' }}>{livenessType === 'smile' ? "Action: Smile!" : "Action: Open Mouth!"}</span>
          </div>
          <div style={s.progressBar}><div style={s.progressFill(livenessProgress)} /></div>
        </div>
      )}

      {mode === 'register' && (
        <div style={{ marginBottom: '1.5rem' }}>
          <input placeholder="Enter Full Name" value={newPersonName} onChange={e => setNewPersonName(e.target.value)} style={s.input} autoFocus />
          {streamRef.current && newPersonName.trim().length > 0 && (
            <button onClick={handleRegister} style={s.btnPrimary}><UserPlus size={18} /> Add To List</button>
          )}
        </div>
      )}

      {(recognizedPerson || loginFailed) && (
        <div style={s.banner(recognizedPerson ? '#000' : '#ef4444')}>
          {recognizedPerson ? <ShieldCheck size={32} style={{ color: '#4caf50', margin: '0 auto' }} /> : <AlertCircle size={32} style={{ color: '#fff', margin: '0 auto' }} />}
          <div style={{ fontSize: '18px', fontWeight: 'bold', marginTop: '10px' }}>{recognizedPerson ? recognizedPerson.name : 'Not Registered!'}</div>
          <button onClick={startCamera} style={{ marginTop: '15px', background: recognizedPerson ? '#333' : '#fff', color: recognizedPerson ? '#fff' : '#ef4444', padding: '10px 20px', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: '700' }}>{recognizedPerson ? 'Next Person' : 'Try Again'}</button>
        </div>
      )}

      <div style={{ marginTop: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <span style={{ fontSize: '12px', color: '#999', fontWeight: '700' }}>STAFF LIST ({workers.length})</span>
          <button onClick={exportCSV} style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}><FileSpreadsheet size={14} /> Export CSV</button>
        </div>
        <div style={{ maxHeight: '160px', overflowY: 'auto' }}>
          {workers.map(w => (
            <div key={w.id} style={s.workerRow}>
              <span style={{fontSize: '14px', fontWeight: '500'}}>{w.name}</span>
              <Trash2 size={16} color="#ff4d4f" onClick={() => setWorkers(workers.filter(i => i.id !== w.id))} style={{cursor:'pointer', opacity: 0.7}} />
            </div>
          ))}
        </div>
      </div>
    </div>
  </div>
  </div>
  );
};

export default FaceAttendanceSystem;
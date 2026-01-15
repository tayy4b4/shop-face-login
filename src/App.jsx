import React, { useState, useEffect, useRef } from 'react';
import { Camera, UserPlus, ShieldCheck, FileSpreadsheet, Trash2, Smile, Zap, AlertCircle, RefreshCw } from 'lucide-react';

const FaceAttendanceSystem = () => {
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [status, setStatus] = useState('System Offline');
  const [mode, setMode] = useState('login'); 
  const [newPersonName, setNewPersonName] = useState('');
  const [recognizedPerson, setRecognizedPerson] = useState(null);
  const [loginFailed, setLoginFailed] = useState(false);
  
  // 🔐 LIVENESS STATES
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
    btnPrimary: { width: '100%', padding: '14px', borderRadius: '12px', border: 'none', backgroundColor: '#000', color: '#fff', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' },
    btnSecondary: (active) => ({ flex: 1, padding: '10px', borderRadius: '10px', border: 'none', backgroundColor: active ? '#f0f2f5' : 'transparent', color: active ? '#000' : '#666', fontWeight: '600', cursor: 'pointer' }),
    input: { width: '100%', padding: '14px', borderRadius: '12px', border: '1px solid #e0e0e0', marginBottom: '1rem', outline: 'none', boxSizing: 'border-box' },
    workerRow: { display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid #f8f9fa', alignItems: 'center' },
    progressBar: { width: '100%', height: '8px', backgroundColor: '#eee', borderRadius: '4px', marginTop: '10px', overflow: 'hidden' },
    progressFill: (p) => ({ width: `${p}%`, height: '100%', backgroundColor: '#4caf50', transition: '0.3s' }),
    banner: (color) => ({ padding: '20px', backgroundColor: color, color: '#fff', borderRadius: '16px', textAlign: 'center' })
  };

  // Logic to clear canvas visually
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
    // Safety check: Don't run if system is in a "Result" state (Success or Fail)
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
      const displaySize = { width: videoRef.current.offsetWidth, height: videoRef.current.offsetHeight };
      faceapi.matchDimensions(canvasRef.current, displaySize);
      const ctx = canvasRef.current.getContext('2d');
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      const resized = faceapi.resizeResults(detection, displaySize);
      faceapi.draw.drawFaceLandmarks(canvasRef.current, resized);

      if (mode === 'login') {
        let challengeMet = false;
        if (livenessType === 'smile') {
          const smileProb = detection.expressions.happy;
          setLivenessProgress(smileProb * 100);
          if (smileProb > 0.4) challengeMet = true; 
        } else {
          const ratio = getMouthRatio(detection.landmarks);
          setLivenessProgress(Math.min(ratio * 400, 100));
          if (ratio > 0.22) challengeMet = true;
        }

        if (challengeMet) {
          setLivenessProgress(100);
          performIdentityCheck(detection.descriptor);
        }
      }
    }
    requestRef.current = requestAnimationFrame(runDetection);
  };

  const performIdentityCheck = (descriptor) => {
    const faceapi = getFaceApi();
    if (workers.length === 0) {
      setLoginFailed(true);
      stopCamera();
      return;
    };
    
    const labeled = workers.map(w => new faceapi.LabeledFaceDescriptors(w.name, [new Float32Array(w.descriptor)]));
    const matcher = new faceapi.FaceMatcher(labeled, 0.45);
    const match = matcher.findBestMatch(descriptor);

    if (match.label !== 'unknown') {
      const person = workers.find(w => w.name === match.label);
      setRecognizedPerson({ ...person, time: new Date().toLocaleTimeString() });
      stopCamera();
    } else {
      setLoginFailed(true);
      stopCamera();
    }
  };

  const startCamera = async () => {
    // 1. Force Clean Start
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
      // ✅ DUPLICATION CHECK PRESERVED
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

  useEffect(() => { localStorage.setItem('shop_workers', JSON.stringify(workers)); }, [workers]);

  return (
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
        
        {!streamRef.current && !recognizedPerson && !loginFailed && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.8)', zIndex: 20 }}>
            <button onClick={startCamera} style={s.btnPrimary}>Start</button>
          </div>
        )}
      </div>

      {mode === 'login' && streamRef.current && !recognizedPerson && !loginFailed && (
        <div style={{ marginBottom: '20px', textAlign: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            {livenessType === 'smile' ? <Smile size={20} color="#2563eb" /> : <Smile size={20} color="#2563eb" />}
            <span style={{ fontSize: '14px', fontWeight: '700', color: '#2563eb' }}>
              {livenessType === 'smile' ? "Action: Smile!" : "Action: Open Mouth!"}
            </span>
          </div>
          <div style={s.progressBar}><div style={s.progressFill(livenessProgress)} /></div>
        </div>
      )}

      {mode === 'register' && (
        <div style={{ marginBottom: '1.5rem' }}>
          <input placeholder="Name" value={newPersonName} onChange={e => setNewPersonName(e.target.value)} style={s.input} />
          {streamRef.current && <button onClick={handleRegister} style={s.btnPrimary}><UserPlus size={18} /> Register worker</button>}
        </div>
      )}

      {recognizedPerson && (
        <div style={s.banner('#000')}>
          <ShieldCheck size={32} style={{ color: '#4caf50', margin: '0 auto' }} />
          <div style={{ fontSize: '18px', fontWeight: 'bold', marginTop: '10px' }}>{recognizedPerson.name}</div>
          <button onClick={startCamera} style={{ marginTop: '15px', background: '#333', color: '#fff', padding: '10px 20px', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: '700' }}>Next Person</button>
        </div>
      )}

      {loginFailed && (
        <div style={s.banner('#ef4444')}>
          <AlertCircle size={32} style={{ color: '#fff', margin: '0 auto' }} />
          <div style={{ fontSize: '18px', fontWeight: 'bold', marginTop: '10px' }}>Not registered!</div>
          <button onClick={startCamera} style={{ marginTop: '15px', background: '#fff', color: '#ef4444', padding: '10px 20px', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '8px', margin: '15px auto 0' }}>
            <RefreshCw size={16} /> try again
          </button>
        </div>
      )}

      <div style={{ marginTop: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <span style={{ fontSize: '12px', color: '#999', fontWeight: '700' }}>STAFF LIST ({workers.length})</span>
          <button onClick={exportCSV} style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <FileSpreadsheet size={14} /> Export CSV
          </button>
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
  );
};

export default FaceAttendanceSystem;
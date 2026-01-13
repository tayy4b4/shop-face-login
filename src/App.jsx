import React, { useState, useEffect, useRef } from 'react';
import { Camera, UserPlus, LogIn, ShieldCheck, Database, FileSpreadsheet, Trash2 } from 'lucide-react';

const FaceAttendanceSystem = () => {
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [status, setStatus] = useState('System Offline');
  const [mode, setMode] = useState('login'); 
  const [newPersonName, setNewPersonName] = useState('');
  const [recognizedPerson, setRecognizedPerson] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const getFaceApi = () => window.faceapi;
  
  const [workers, setWorkers] = useState(() => {
    const saved = localStorage.getItem('shop_workers');
    return saved ? JSON.parse(saved) : [];
  });

  const videoRef = useRef(null);
  const scanIntervalRef = useRef(null);
  const streamRef = useRef(null);

  const s = {
    container: { maxWidth: '500px', margin: '2rem auto', padding: '2rem', backgroundColor: '#ffffff', borderRadius: '24px', boxShadow: '0 20px 40px rgba(0,0,0,0.05)', fontFamily: '-apple-system, sans-serif' },
    header: { textAlign: 'center', marginBottom: '2rem' },
    statusBadge: (ok) => ({ display: 'inline-block', padding: '4px 12px', borderRadius: '12px', fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', backgroundColor: ok ? '#e8f5e9' : '#fff3e0', color: ok ? '#2e7d32' : '#ef6c00', marginBottom: '10px' }),
    videoWrapper: { position: 'relative', width: '100%', borderRadius: '16px', overflow: 'hidden', backgroundColor: '#f0f2f5', aspectRatio: '4/3', marginBottom: '1.5rem' },
    btnPrimary: { width: '100%', padding: '14px', borderRadius: '12px', border: 'none', backgroundColor: '#000', color: '#fff', fontWeight: '600', cursor: 'pointer', transition: '0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' },
    btnSecondary: (active) => ({ flex: 1, padding: '10px', borderRadius: '10px', border: 'none', backgroundColor: active ? '#f0f2f5' : 'transparent', color: active ? '#000' : '#666', fontWeight: '600', cursor: 'pointer' }),
    input: { width: '100%', padding: '14px', borderRadius: '12px', border: '1px solid #e0e0e0', marginBottom: '1rem', outline: 'none', boxSizing: 'border-box' },
    workerRow: { display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid #f8f9fa' }
  };

  //CORE LOGIC
  const processVideoAndGetId = async () => {
    const faceapi = getFaceApi();
    if (!faceapi || !videoRef.current || workers.length === 0) return null;

    try {
      const detection = await faceapi
        .detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions({ inputSize: 160, scoreThreshold: 0.1 }))
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (!detection) return null;

      const labeledDescriptors = workers.map(w => 
        new faceapi.LabeledFaceDescriptors(w.name, [new Float32Array(w.descriptor)])
      );

      const faceMatcher = new faceapi.FaceMatcher(labeledDescriptors, 0.55);
      const match = faceMatcher.findBestMatch(detection.descriptor);

      if (match.label !== 'unknown') {
        const matchedWorker = workers.find(w => w.name === match.label);
        return matchedWorker ? matchedWorker.id : null;
      }
    } catch (err) {
      console.error('Recognition error:', err);
    }
    return null;
  };

  useEffect(() => {
    const loadModels = async () => {
      try {
        const faceapi = getFaceApi();
        if (!faceapi) {
          setStatus('Library not loaded');
          return;
        }

        const MODEL_URL = '/models';
        
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
        ]);
        
        setIsModelLoaded(true);
        setStatus('Ready');
      } catch (err) {
        setStatus('Model Load Error');
        console.error(err);
      }
    };
    loadModels();
  }, []);

  useEffect(() => {
    localStorage.setItem('shop_workers', JSON.stringify(workers));
  }, [workers]);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640 } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
      }
    } catch (err) {
      setStatus('Camera Error');
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    clearInterval(scanIntervalRef.current);
    setIsScanning(false);
  };

  const handleLoginScan = async () => {
    const matchedId = await processVideoAndGetId();
    if (matchedId) {
      const person = workers.find(w => w.id === matchedId);
      setRecognizedPerson({ ...person, time: new Date().toLocaleTimeString() });
      stopCamera();
    }
  };

  const handleRegister = async () => {
  const faceapi = getFaceApi();
  if (!faceapi || !newPersonName.trim()) return;
  
  setStatus('Analyzing face...');
  
  const det = await faceapi
    .detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions({ inputSize: 160, scoreThreshold: 0.1 }))
    .withFaceLandmarks()
    .withFaceDescriptor();
    
  if (det) {
    //DUPLICATION CHECK
    if (workers.length > 0) {
      const labeledDescriptors = workers.map(w => 
        new faceapi.LabeledFaceDescriptors(w.name, [new Float32Array(w.descriptor)])
      );
      const faceMatcher = new faceapi.FaceMatcher(labeledDescriptors, 0.55);
      const match = faceMatcher.findBestMatch(det.descriptor);

      if (match.label !== 'unknown') {
        setStatus(`Already registered as ${match.label}`);
        return;
      }
    }

    const newWorker = { 
      id: "ID-" + Math.floor(1000 + Math.random() * 9000), 
      name: newPersonName.trim(), 
      descriptor: Array.from(det.descriptor) 
    };
    
    setWorkers([...workers, newWorker]);
    setNewPersonName('');
    setStatus('Registered!');
  } else {
    setStatus('No Face Found');
  }
};

  const exportToCSV = () => {
    const headers = "ID,Name\n";
    const rows = workers.map(w => `${w.id},${w.name}`).join("\n");
    const blob = new Blob([headers + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'attendance_data.csv';
    link.click();
  };

  return (
    <div style={s.container}>
      <div style={s.header}>
        <div style={s.statusBadge(isModelLoaded)}>{status}</div>
        <h2 style={{ margin: 0, fontWeight: '800' }}>Attendance System</h2>
      </div>

      <div style={{ display: 'flex', gap: '5px', backgroundColor: '#f8f9fa', padding: '4px', borderRadius: '14px', marginBottom: '20px' }}>
        <button onClick={() => { setMode('login'); stopCamera(); setRecognizedPerson(null); }} style={s.btnSecondary(mode === 'login')}>Login</button>
        <button onClick={() => { setMode('register'); stopCamera(); startCamera(); setRecognizedPerson(null); }} style={s.btnSecondary(mode === 'register')}>Register</button>
      </div>

      <div style={s.videoWrapper}>
        <video ref={videoRef} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        {!streamRef.current && mode === 'login' && !recognizedPerson && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.8)' }}>
            <button onClick={() => { startCamera(); setIsScanning(true); scanIntervalRef.current = setInterval(handleLoginScan, 1000); }} style={{ ...s.btnPrimary, width: 'auto', padding: '12px 24px' }}>
              <Camera size={18} /> Start Login
            </button>
          </div>
        )}
      </div>

      {mode === 'register' && (
        <div>
          <input type="text" placeholder="Worker Name" value={newPersonName} onChange={(e) => setNewPersonName(e.target.value)} style={s.input} />
          <button onClick={handleRegister} style={s.btnPrimary}><UserPlus size={18} /> Add Worker</button>
        </div>
      )}

      {recognizedPerson && (
        <div style={{ padding: '20px', backgroundColor: '#000', color: '#fff', borderRadius: '16px', textAlign: 'center', marginTop: '10px' }}>
          <ShieldCheck size={32} style={{ color: '#4caf50' }} />
          <div>{recognizedPerson.name}</div>
          <div style={{ fontSize: '11px', opacity: 0.6 }}>ID: {recognizedPerson.id}</div>
        </div>
      )}

      <div style={{ marginTop: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <span style={{ fontSize: '13px', color: '#999' }}>Staff ({workers.length})</span>
          <button onClick={exportToCSV} style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', fontSize: '12px' }}><FileSpreadsheet size={14} /> CSV</button>
        </div>
        {workers.map(w => (
          <div key={w.id} style={s.workerRow}>
            <span>{w.name}</span>
            <Trash2 size={16} color="#ccc" style={{ cursor: 'pointer' }} onClick={() => setWorkers(workers.filter(i => i.id !== w.id))} />
          </div>
        ))}
      </div>
    </div>
  );
};

export default FaceAttendanceSystem;
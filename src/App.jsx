import React, { useState, useEffect, useRef } from 'react';
import * as faceapi from 'face-api.js';
import { Camera, UserPlus, LogIn, UserCheck, Trash2, ShieldCheck, Database, FileSpreadsheet } from 'lucide-react';

const FaceAttendanceSystem = () => {
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [status, setStatus] = useState('Initializing...');
  const [mode, setMode] = useState('login'); 
  const [newPersonName, setNewPersonName] = useState('');
  const [recognizedPerson, setRecognizedPerson] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  
  const [workers, setWorkers] = useState(() => {
    const saved = localStorage.getItem('shop_workers');
    return saved ? JSON.parse(saved) : [];
  });

  const videoRef = useRef(null);
  const scanIntervalRef = useRef(null);

  //STYLING:
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

  //PROCESS VIDEO + RETURN ID:
  const processVideoAndGetId = async () => {
    if (!videoRef.current || workers.length === 0) return null;

    const detection = await faceapi
      .detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks()
      .withFaceDescriptor();

    if (!detection) return null;

    //compare against the worker database
    const labeledDescriptors = workers.map(w => 
      new faceapi.LabeledFaceDescriptors(w.name, [new Float32Array(w.descriptor)])
    );

    const faceMatcher = new faceapi.FaceMatcher(labeledDescriptors, 0.55);
    const match = faceMatcher.findBestMatch(detection.descriptor);

    if (match.label !== 'unknown') {
      const matchedWorker = workers.find(w => w.name === match.label);
      return matchedWorker ? matchedWorker.id : null;
    }

    return null;
  };

  //OFFLINE LOADS:
  useEffect(() => {
    const loadModels = async () => {
      try {
        const MODEL_URL = '/models'; 
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
        ]);
        setIsModelLoaded(true);
        setStatus('Ready');
      } catch (err) {
        setStatus('Model Error');
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
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch (err) {
      setStatus('Camera Error');
    }
  };

  const stopCamera = () => {
    if (videoRef.current?.srcObject) {
      videoRef.current.srcObject.getTracks().forEach(t => t.stop());
      videoRef.current.srcObject = null;
    }
    clearInterval(scanIntervalRef.current);
    setIsScanning(false);
  };

  //ACTIONS:
  const handleLoginScan = async () => {
    const matchedId = await processVideoAndGetId();
    
    if (matchedId) {
      const person = workers.find(w => w.id === matchedId);
      setRecognizedPerson({ ...person, time: new Date().toLocaleTimeString() });
      stopCamera();
      setStatus('Success');
    }
  };

  const handleRegister = async () => {
    if (!newPersonName) return;
    setStatus('Analyzing...');
    const det = await faceapi.detectSingleFace(videoRef.current, new faceapi.TinyFaceDetectorOptions()).withFaceLandmarks().withFaceDescriptor();
    if (det) {
      const newWorker = { 
        id: "ID-" + Math.floor(1000 + Math.random() * 9000), //this is the randomized id part!
        name: newPersonName, 
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
    if (workers.length === 0) return;
    const headers = "ID,Name\n";
    const rows = workers.map(w => `${w.id},${w.name}`).join("\n");
    const blob = new Blob([headers + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Shop_Staff_${new Date().toLocaleDateString()}.csv`;
    link.click();
  };

  return (
    <div style={s.container}>
      <div style={s.header}>
        <div style={s.statusBadge(isModelLoaded)}>{status}</div>
        <h2 style={{ margin: 0, fontWeight: '800', letterSpacing: '-0.5px' }}>Face Login System</h2>
      </div>

      <div style={{ display: 'flex', gap: '5px', backgroundColor: '#f8f9fa', padding: '4px', borderRadius: '14px', marginBottom: '20px' }}>
        <button onClick={() => { setMode('login'); stopCamera(); setRecognizedPerson(null); }} style={s.btnSecondary(mode === 'login')}>Login</button>
        <button onClick={() => { setMode('register'); stopCamera(); startCamera(); setRecognizedPerson(null); }} style={s.btnSecondary(mode === 'register')}>Register</button>
      </div>

      <div style={s.videoWrapper}>
        <video ref={videoRef} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        {!isScanning && mode === 'login' && !recognizedPerson && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.8)', backdropFilter: 'blur(4px)' }}>
            <button onClick={() => { startCamera(); setIsScanning(true); setRecognizedPerson(null); scanIntervalRef.current = setInterval(handleLoginScan, 1000); }} style={{ ...s.btnPrimary, width: 'auto', padding: '12px 24px' }}>
              <LogIn size={18} /> Start Recognition
            </button>
          </div>
        )}
      </div>

      {mode === 'register' && (
        <div>
          <input type="text" placeholder="Full Name" value={newPersonName} onChange={(e) => setNewPersonName(e.target.value)} style={s.input} />
          <button onClick={handleRegister} style={s.btnPrimary}><UserPlus size={18} /> Add to Database</button>
        </div>
      )}

      {recognizedPerson && (
        <div style={{ padding: '20px', backgroundColor: '#000', color: '#fff', borderRadius: '16px', textAlign: 'center', marginTop: '10px' }}>
          <ShieldCheck size={32} style={{ marginBottom: '8px', color: '#4caf50' }} />
          <div style={{ fontSize: '14px', opacity: 0.8 }}>Access Granted</div>
          <div style={{ fontSize: '20px', fontWeight: '700' }}>{recognizedPerson.name}</div>
          <div style={{ fontSize: '11px', opacity: 0.6 }}>Internal ID: {recognizedPerson.id}</div>
        </div>
      )}

      <div style={{ marginTop: '2.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#999', fontSize: '13px' }}>
            <Database size={14} /> <span>Staff ({workers.length})</span>
          </div>
          <button onClick={exportToCSV} style={{ display: 'flex', alignItems: 'center', gap: '5px', background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>
            <FileSpreadsheet size={14} /> Export CSV
          </button>
        </div>
        {workers.map(w => (
          <div key={w.id} style={s.workerRow}>
            <div>
               <div style={{ fontWeight: '600', color: '#333', fontSize: '14px' }}>{w.name}</div>
               <div style={{ fontSize: '11px', color: '#999' }}>{w.id}</div>
            </div>
            <Trash2 size={16} color="#ccc" style={{ cursor: 'pointer', marginTop: '5px' }} onClick={() => setWorkers(workers.filter(i => i.id !== w.id))} />
          </div>
        ))}
      </div>
    </div>
  );
};

export default FaceAttendanceSystem;
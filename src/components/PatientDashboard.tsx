import React, { useState, useEffect, useRef } from 'react';
import { db, auth } from '../firebase';
import { 
  collection, 
  onSnapshot, 
  orderBy, 
  query, 
  doc, 
  updateDoc, 
  addDoc,
  getDocs,
  setDoc,
  where
} from 'firebase/firestore';
import { 
  User, 
  Calendar, 
  Upload, 
  Loader2, 
  Activity, 
  ChevronRight, 
  AlertCircle, 
  CheckCircle,
  Clock, 
  Share2,
  Building2,
  History,
  TrendingUp
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { UserProfile, Hospital, Scan, Detection } from '../types';

interface PatientDashboardProps {
  user: any;
  userProfile: UserProfile;
  onLogout: () => void;
}

export default function PatientDashboard({ user, userProfile, onLogout }: PatientDashboardProps) {
  const [scans, setScans] = useState<Scan[]>([]);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedScan, setSelectedScan] = useState<Scan | null>(null);

  // Upload/analysis states
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // Sharing states
  const [sharingHospitalId, setSharingHospitalId] = useState('');
  const [shareLoading, setShareLoading] = useState(false);
  const [currentShareRequest, setCurrentShareRequest] = useState<string | null>(null);

  // Drag and drop
  const [dragActive, setDragActive] = useState(false);

  // Canvas overlays
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    // 1. Fetch Patient's scans
    const qScans = query(
      collection(db, 'patients', user.uid, 'scans'),
      orderBy('timestamp', 'desc')
    );
    const unsubScans = onSnapshot(qScans, (snap) => {
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Scan[];
      setScans(data);
    }, (err) => console.error("Snapshot error:", err));

    // 2. Fetch Active Hospitals (to request secondary clinical review)
    const qHospitals = query(collection(db, 'hospitals'), where('status', '==', 'active'));
    onSnapshot(qHospitals, (snap) => {
      const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Hospital[];
      setHospitals(data);
    }, (err) => console.error("Snapshot error:", err));

    // 3. Fetch patient's current sharing status
    const unsubPatientShare = onSnapshot(doc(db, 'patients', user.uid), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setCurrentShareRequest(data.reviewRequestedHospitalId || null);
      }
    }, (err) => console.error("Snapshot error:", err));

    setLoading(false);

    return () => {
      unsubScans();
      unsubPatientShare();
    };
  }, [user.uid]);

  // Handle canvas overlays on selected scan modal
  useEffect(() => {
    if (!selectedScan || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.referrerPolicy = "no-referrer";
    img.src = `data:image/jpeg;base64,${selectedScan.imageUrl}`;
    img.onload = () => {
      canvas.width = img.naturalWidth || 600;
      canvas.height = img.naturalHeight || 600;
      ctx.drawImage(img, 0, 0);

      // Draw bounding boxes
      selectedScan.detections?.forEach((det) => {
        const [ymin, xmin, ymax, xmax] = det.box_2d;
        
        // Denormalize boxes (scaled 0-1000)
        const x = (xmin / 1000) * canvas.width;
        const y = (ymin / 1000) * canvas.height;
        const w = ((xmax - xmin) / 1000) * canvas.width;
        const h = ((ymax - ymin) / 1000) * canvas.height;

        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = Math.max(3, canvas.width * 0.005);
        ctx.strokeRect(x, y, w, h);

        // Draw label text
        ctx.fillStyle = '#ef4444';
        const fontSize = Math.max(12, canvas.width * 0.025);
        ctx.font = `bold ${fontSize}px sans-serif`;
        const textLabel = `${det.label} (${Math.round(det.confidence * 100)}%)`;
        const textWidth = ctx.measureText(textLabel).width;
        
        ctx.fillRect(x, y - fontSize - 6, textWidth + 12, fontSize + 8);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(textLabel, x + 6, y - 6);
      }, (err) => console.error("Snapshot error:", err));
    };
  }, [selectedScan]);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const handleUploadAndAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return;

    setAnalyzing(true);
    setAnalysisError(null);

    try {
      const formData = new FormData();
      formData.append('image', selectedFile);

      const response = await fetch('/api/analyze', {
        method: 'POST',
        body: formData
      }, (err) => console.error("Snapshot error:", err));

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Analysis failed");
      }

      const result = await response.json();
      const analysisData = result.analysis;
      const base64Image = result.processedImage;

      // Create scan record in patient subcollection
      const scanId = 'scan_' + Math.random().toString(36).substring(2, 11);
      const newScan: Omit<Scan, 'id'> = {
        patientId: user.uid,
        patientName: userProfile.name,
        imageUrl: base64Image,
        detections: analysisData.detections || [],
        summary: analysisData.summary || "Scan uploaded and stored.",
        recommendation: analysisData.recommendation || "Consult with your healthcare practitioner.",
        clinicianId: 'self',
        timestamp: new Date().toISOString()
      };

      await setDoc(doc(db, 'patients', user.uid, 'scans', scanId), newScan);

      // Log activity
      await addDoc(collection(db, 'audit_logs'), {
        hospitalId: 'personal',
        userId: user.uid,
        userName: userProfile.name,
        action: 'PATIENT_UPLOAD_SCAN',
        details: `Patient "${userProfile.name}" self-uploaded a scan for AI analysis. Summary: "${analysisData.summary.substring(0, 60)}..."`,
        timestamp: new Date().toISOString()
      }, (err) => console.error("Snapshot error:", err));

      // Reset Form and view latest scan
      setSelectedFile(null);
      setPreviewUrl(null);
      setSelectedScan({ id: scanId, ...newScan } as Scan);

    } catch (err: any) {
      setAnalysisError(err.message || "An unexpected error occurred during scan parsing.");
    } finally {
      setAnalyzing(false);
    }
  };

  const handleRequestReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sharingHospitalId) return;

    setShareLoading(true);
    try {
      const selectedHosp = hospitals.find(h => h.id === sharingHospitalId);
      if (!selectedHosp) return;

      // Update Patient doc with sharing request
      await updateDoc(doc(db, 'patients', user.uid), {
        reviewRequestedHospitalId: sharingHospitalId
      }, (err) => console.error("Snapshot error:", err));

      // Log sharing activity
      await addDoc(collection(db, 'audit_logs'), {
        hospitalId: sharingHospitalId,
        userId: user.uid,
        userName: userProfile.name,
        action: 'PATIENT_REQUEST_REVIEW',
        details: `Patient "${userProfile.name}" shared profile records with "${selectedHosp.name}" for diagnostic review.`,
        timestamp: new Date().toISOString()
      }, (err) => console.error("Snapshot error:", err));

      setSharingHospitalId('');
    } catch (err) {
      console.error(err);
    } finally {
      setShareLoading(false);
    }
  };

  const handleCancelReview = async () => {
    setShareLoading(true);
    try {
      await updateDoc(doc(db, 'patients', user.uid), {
        reviewRequestedHospitalId: null
      }, (err) => console.error("Snapshot error:", err));

      await addDoc(collection(db, 'audit_logs'), {
        hospitalId: 'personal',
        userId: user.uid,
        userName: userProfile.name,
        action: 'PATIENT_CANCEL_REVIEW',
        details: `Patient "${userProfile.name}" revoked sharing permissions.`,
        timestamp: new Date().toISOString()
      }, (err) => console.error("Snapshot error:", err));
    } catch (err) {
      console.error(err);
    } finally {
      setShareLoading(false);
    }
  };

  const sharedHospitalName = hospitals.find(h => h.id === currentShareRequest)?.name;

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-800 font-sans flex flex-col">
      {/* Header */}
      <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-[#2563eb] rounded-lg flex items-center justify-center text-white font-bold text-lg">
            φ
          </div>
          <h1 className="font-bold text-lg text-[#2563eb]">FibroScan AI Patient Portal</h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-sm font-bold">{userProfile.name}</div>
            <div className="text-[10px] text-emerald-600 font-bold uppercase tracking-wider">Patient Portal</div>
          </div>
          <button 
            onClick={onLogout}
            className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-1.5 rounded-lg font-bold transition-all"
          >
            Sign Out
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 p-6 max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Columns - Upload & Share */}
        <div className="space-y-6 lg:col-span-1">
          {/* Patient Profile info */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center">
                <User className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-bold text-sm text-slate-800">{userProfile.name}</h2>
                <p className="text-[10px] text-slate-500">{userProfile.email}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 border-t pt-3 text-xs">
              <div>
                <p className="text-[10px] text-slate-400 font-bold uppercase">Age / DOB</p>
                <p className="font-semibold">{userProfile.dob ? `${new Date().getFullYear() - new Date(userProfile.dob).getFullYear()} yrs` : 'N/A'}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-400 font-bold uppercase">Gender</p>
                <p className="font-semibold">{userProfile.gender || 'Female'}</p>
              </div>
            </div>
          </div>

          {/* Upload Scan Panel */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
            <div>
              <h3 className="font-bold text-sm text-slate-800">Analyze Ultrasound Scan</h3>
              <p className="text-xs text-slate-500">HIPAA compliant pelvic/transvaginal AI analyzer</p>
            </div>

            {analysisError && (
              <div className="bg-red-50 border border-red-100 p-3 rounded-lg text-xs text-red-600 font-medium">
                {analysisError}
              </div>
            )}

            <form onSubmit={handleUploadAndAnalyze} className="space-y-4">
              <div 
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
                  dragActive ? 'border-blue-500 bg-blue-50/20' : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <input 
                  type="file" 
                  accept="image/*" 
                  onChange={handleFileChange}
                  className="hidden" 
                  id="scan-upload-input" 
                />
                <label htmlFor="scan-upload-input" className="cursor-pointer space-y-2 block">
                  {previewUrl ? (
                    <img src={previewUrl} alt="Preview" className="max-h-40 mx-auto rounded-lg object-contain" />
                  ) : (
                    <>
                      <Upload className="w-8 h-8 text-slate-400 mx-auto" />
                      <p className="text-xs font-bold text-slate-700">Drag & drop pelvic scan here</p>
                      <p className="text-[10px] text-slate-400">or click to browse filesystem</p>
                    </>
                  )}
                </label>
              </div>

              {selectedFile && (
                <button
                  type="submit"
                  disabled={analyzing}
                  className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-bold text-xs hover:opacity-90 transition-all flex items-center justify-center gap-2"
                >
                  {analyzing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Evaluating with FibroScan AI...
                    </>
                  ) : (
                    'Run AI Diagnostic'
                  )}
                </button>
              )}
            </form>
          </div>

          {/* Secure Record Sharing / Secondary review */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center gap-2 text-indigo-600">
              <Share2 className="w-5 h-5" />
              <h3 className="font-bold text-sm text-slate-800">Clinical Review Portal</h3>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              Securely share your ultrasound scan analysis with a certified hospital clinic for expert human evaluation and clinical consultation.
            </p>

            {currentShareRequest ? (
              <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-xl space-y-3">
                <div className="flex items-start gap-2.5">
                  <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-bold text-emerald-800">Records Shared Successfully</p>
                    <p className="text-[10px] text-emerald-600 font-medium">Shared with: <span className="font-bold underline">{sharedHospitalName}</span></p>
                  </div>
                </div>
                <button
                  onClick={handleCancelReview}
                  disabled={shareLoading}
                  className="w-full bg-white border border-red-200 text-red-600 py-1.5 rounded-lg text-[10px] font-bold hover:bg-red-50 transition-all"
                >
                  {shareLoading ? 'Revoking...' : 'Revoke Sharing Authorization'}
                </button>
              </div>
            ) : (
              <form onSubmit={handleRequestReview} className="space-y-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Select Target Hospital</label>
                  <select
                    value={sharingHospitalId}
                    onChange={(e) => setSharingHospitalId(e.target.value)}
                    required
                    className="w-full px-3 py-2 border rounded-lg text-xs outline-none"
                  >
                    <option value="">-- Choose clinical facility --</option>
                    {hospitals.map(h => (
                      <option key={h.id} value={h.id}>{h.name} ({h.cityState})</option>
                    ))}
                  </select>
                </div>
                <button
                  type="submit"
                  disabled={shareLoading || !sharingHospitalId}
                  className="w-full bg-[#2563eb] text-white py-2 rounded-lg text-xs font-bold hover:opacity-95 transition-all flex items-center justify-center gap-1.5"
                >
                  {shareLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Authorize & Request Review'}
                </button>
              </form>
            )}
          </div>
        </div>

        {/* Right Columns - Historical timeline */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex justify-between items-center border-b pb-3">
              <div>
                <h3 className="font-bold text-sm text-slate-800">Ultrasound Timeline & Scan History</h3>
                <p className="text-xs text-slate-500">Track and monitor your historical AI diagnostics</p>
              </div>
              <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                <TrendingUp className="w-3.5 h-3.5" />
                {scans.length} Scans
              </div>
            </div>

            {scans.length === 0 ? (
              <div className="text-center py-24 space-y-3">
                <History className="w-12 h-12 text-slate-200 mx-auto" />
                <p className="font-medium text-slate-600 text-sm">No diagnostic records found</p>
                <p className="text-xs text-slate-400">Use the analyzer on the left to run your first evaluation.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {scans.map((scan) => (
                  <div 
                    key={scan.id} 
                    className="border rounded-xl overflow-hidden hover:border-blue-300 hover:shadow transition-all bg-slate-50/50 flex flex-col"
                  >
                    <div className="aspect-[4/3] bg-black relative shrink-0">
                      <img src={`data:image/jpeg;base64,${scan.imageUrl}`} alt="Scan" className="w-full h-full object-cover" />
                      <div className="absolute top-2 left-2 bg-black/60 backdrop-blur px-2 py-0.5 rounded text-[8px] font-bold text-white uppercase tracking-wider">
                        {new Date(scan.timestamp).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                      <div className="space-y-1.5">
                        <div className="flex justify-between items-center">
                          <p className="text-[10px] font-mono font-bold text-slate-400 uppercase">AI Diagnosis</p>
                          <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded">
                            {scan.detections.length > 0 ? `${scan.detections.length} Masses` : 'Clear'}
                          </span>
                        </div>
                        <p className="text-xs text-slate-700 leading-relaxed italic line-clamp-2">"{scan.summary}"</p>
                      </div>
                      <button
                        onClick={() => setSelectedScan(scan)}
                        className="w-full text-center py-1.5 border border-blue-100 hover:bg-blue-50/50 text-blue-600 font-bold text-xs rounded-lg transition-all"
                      >
                        View Interactive Report
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* INTERACTIVE SCAN MODAL */}
      <AnimatePresence>
        {selectedScan && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl"
            >
              <div className="p-5 border-b bg-slate-50 flex justify-between items-center">
                <div>
                  <h3 className="font-bold text-base">Ultrasound Diagnostic Report</h3>
                  <p className="text-xs text-slate-500">Analysis completed: {new Date(selectedScan.timestamp).toLocaleString()}</p>
                </div>
                <button 
                  onClick={() => setSelectedScan(null)}
                  className="p-1.5 hover:bg-slate-200 rounded-full text-slate-500"
                >
                  ✕
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Canvas image overlay */}
                <div className="space-y-2">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Interactive Canvas Overlay</p>
                  <div className="aspect-square bg-black rounded-xl overflow-hidden relative border flex items-center justify-center">
                    <canvas ref={canvasRef} className="max-w-full max-h-full object-contain" />
                  </div>
                </div>

                {/* Analysis info */}
                <div className="space-y-4">
                  <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl">
                    <h4 className="text-xs font-bold text-blue-800 uppercase tracking-wide mb-1.5">AI Clinical Findings</h4>
                    <p className="text-xs text-slate-700 leading-relaxed italic">"{selectedScan.summary}"</p>
                  </div>

                  <div className="bg-amber-50 border border-amber-100 p-4 rounded-xl">
                    <h4 className="text-xs font-bold text-amber-800 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                      <AlertCircle className="w-4 h-4 text-amber-500" />
                      Clinical Recommendations
                    </h4>
                    <p className="text-xs text-amber-900 leading-relaxed font-semibold">{selectedScan.recommendation}</p>
                  </div>

                  {selectedScan.detections && selectedScan.detections.length > 0 ? (
                    <div className="border border-slate-200 p-4 rounded-xl space-y-2">
                      <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide">Detected Anomalies</h4>
                      <div className="divide-y text-xs">
                        {selectedScan.detections.map((det, idx) => (
                          <div key={idx} className="py-2 flex justify-between items-center">
                            <span className="font-bold text-red-600">{det.label}</span>
                            <span className="bg-red-50 border border-red-100 px-1.5 py-0.5 rounded text-[10px] font-black text-red-700">
                              Confidence: {Math.round(det.confidence * 100)}%
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="border border-emerald-200 bg-emerald-50/50 p-4 rounded-xl text-center">
                      <p className="text-xs font-bold text-emerald-800">No uterine fibroids or abnormal masses detected by AI.</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="p-4 border-t bg-slate-50 text-center text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                Confidential Personal Medical Record • For educational and diagnostic support reference only
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

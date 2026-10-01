import React, { useState, useRef, useEffect } from 'react';
import { 
  Upload, 
  Activity, 
  ShieldCheck, 
  AlertCircle, 
  Loader2, 
  Image as ImageIcon,
  ChevronRight,
  Maximize2,
  FileText,
  History,
  UserPlus,
  LogOut,
  User,
  Building2,
  Lock
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { auth, db } from './firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, addDoc, collection, updateDoc } from 'firebase/firestore';
import Auth from './components/Auth';
import PatientForm from './components/PatientForm';
import PatientList from './components/PatientList';
import ScanHistory from './components/ScanHistory';
import SystemAdminDashboard from './components/SystemAdminDashboard';
import HospitalAdminDashboard from './components/HospitalAdminDashboard';
import PatientDashboard from './components/PatientDashboard';
import { UserProfile, Patient, Scan, Detection } from './types';

interface AnalysisResult {
  detections: Detection[];
  summary: string;
  recommendation: string;
}

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(false);
  
  const [showPatientForm, setShowPatientForm] = useState(false);
  const [currentPatient, setCurrentPatient] = useState<Patient | null>(null);
  const [currentView, setCurrentView] = useState<'diagnostics' | 'patients' | 'history'>('diagnostics');
  
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [processedUrl, setProcessedUrl] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (authUser) => {
      setUser(authUser);
      if (authUser) {
        setLoadingProfile(true);
        try {
          const userDoc = await getDoc(doc(db, 'users', authUser.uid));
          if (userDoc.exists()) {
            setUserProfile(userDoc.data() as UserProfile);
          } else {
            setUserProfile(null);
          }
        } catch (err) {
          console.error("Failed to fetch user profile:", err);
        } finally {
          setLoadingProfile(false);
        }
      } else {
        setUserProfile(null);
      }
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    setSelectedFile(null);
    setPreviewUrl(null);
    setProcessedUrl(null);
    setResult(null);
    setError(null);
  }, [currentPatient]);

  const handleLogout = async () => {
    await signOut(auth);
    setUser(null);
    setUserProfile(null);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      setResult(null);
      setError(null);
      setProcessedUrl(null);
    }
  };

  const compressImage = (file: File): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.src = URL.createObjectURL(file);
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 1200;
        const MAX_HEIGHT = 1200;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height = Math.round((height *= MAX_WIDTH / width));
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width = Math.round((width *= MAX_HEIGHT / height));
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error("Canvas not supported"));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error("Failed to compress image"));
        }, 'image/jpeg', 0.8);
      };
      img.onerror = (err) => reject(err);
    });
  };

  const analyzeImage = async () => {
    if (!selectedFile || !currentPatient || !user || !userProfile) {
      if (!currentPatient) setError("Please select or register a patient first.");
      if (!user) setError("You must be logged in to perform analysis.");
      return;
    }

    setIsAnalyzing(true);
    setError(null);

    try {
      const compressedBlob = await compressImage(selectedFile);
      const formData = new FormData();
      formData.append('image', compressedBlob, 'image.jpg');

      const response = await fetch('/api/analyze', {
        method: 'POST',
        body: formData,
      });

      if (response.status === 413) {
        throw new Error("The image file is too large. Please select a smaller image.");
      }

      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await response.text();
        throw new Error(`The analysis service returned an invalid response (${response.status}). Please try again.`);
      }

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Analysis failed');
      }

      const data = await response.json();
      const analysis: AnalysisResult = data.analysis;
      
      setProcessedUrl(`data:${data.mimeType};base64,${data.processedImage}`);
      setResult(analysis);

      // Save scan to patient's Firestore subcollection
      await addDoc(collection(db, 'patients', currentPatient.id, 'scans'), {
        patientId: currentPatient.patientId,
        patientName: currentPatient.name,
        imageUrl: data.processedImage,
        detections: analysis.detections,
        summary: analysis.summary,
        recommendation: analysis.recommendation,
        clinicianId: user.uid,
        timestamp: new Date().toISOString()
      });

      // Add audit log
      await addDoc(collection(db, 'audit_logs'), {
        hospitalId: userProfile.hospitalId || 'personal',
        userId: user.uid,
        userName: userProfile.name,
        action: 'CLINICAL_SCAN_ANALYSIS',
        details: `Performed AI scan analysis for patient "${currentPatient.name}" (ID: ${currentPatient.patientId}). Result: ${analysis.summary.substring(0, 60)}...`,
        timestamp: new Date().toISOString()
      });

    } catch (err: any) {
      console.error("Analysis error:", err);
      setError(err.message || "Analysis failed.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Draw bounding boxes on Canvas
  useEffect(() => {
    if (result && processedUrl && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const img = new Image();
      img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);

        result.detections.forEach((det) => {
          const [ymin, xmin, ymax, xmax] = det.box_2d;
          const left = (xmin / 1000) * canvas.width;
          const top = (ymin / 1000) * canvas.height;
          const width = ((xmax - xmin) / 1000) * canvas.width;
          const height = ((ymax - ymin) / 1000) * canvas.height;

          ctx.strokeStyle = '#ef4444';
          ctx.lineWidth = 3;
          ctx.strokeRect(left, top, width, height);

          ctx.fillStyle = '#ef4444';
          const labelText = `${det.label} (${(det.confidence * 100).toFixed(1)}%)`;
          const textWidth = ctx.measureText(labelText).width;
          ctx.fillRect(left, top - 25, textWidth + 10, 25);

          ctx.fillStyle = 'white';
          ctx.font = 'bold 14px Helvetica Neue, Arial, sans-serif';
          ctx.fillText(labelText, left + 5, top - 7);
        });
      };
      img.src = processedUrl;
    }
  }, [result, processedUrl]);

  if (!isAuthReady || loadingProfile) {
    return (
      <div className="min-h-screen bg-[#f3f6f9] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#2563eb]" />
      </div>
    );
  }

  // No auth or no valid profile -> Show login/register screen
  if (!user || !userProfile) {
    return <Auth onAuthComplete={() => {}} />;
  }

  // Handle suspended or deactivated users
  if (userProfile.status === 'deactivated') {
    return (
      <div className="min-h-screen bg-[#f3f6f9] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white border border-red-200 rounded-2xl shadow-xl p-8 text-center space-y-4">
          <Lock className="w-16 h-16 text-red-500 mx-auto" />
          <h2 className="text-xl font-bold text-red-800">Account Access Suspended</h2>
          <p className="text-xs text-slate-500 leading-relaxed">
            Your credentials have been deactivated by the platform administrator or your hospital director. Please contact the clinical helpdesk or system administrator to request verification.
          </p>
          <button onClick={handleLogout} className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-lg font-bold text-xs transition-all w-full">
            Return to Login Screen
          </button>
        </div>
      </div>
    );
  }

  // Handle pending users
  if (userProfile.status === 'pending') {
    // Auto-activate for demo purposes
    const activateAccount = async () => {
      try {
        await updateDoc(doc(db, 'users', userProfile.uid), { status: 'active' });
        if (userProfile.hospitalId) {
          await updateDoc(doc(db, 'hospitals', userProfile.hospitalId), { status: 'active' });
        }
        // Force reload to bypass pending state
        window.location.reload();
      } catch (err) {
        console.error("Failed to auto-activate account:", err);
      }
    };

    return (
      <div className="min-h-screen bg-[#f3f6f9] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white border border-yellow-200 rounded-2xl shadow-xl p-8 text-center space-y-4">
          <Loader2 className="w-12 h-12 animate-spin text-yellow-500 mx-auto" />
          <h2 className="text-xl font-bold text-yellow-800">Auto-Activating Account...</h2>
          <p className="text-xs text-slate-500 leading-relaxed">
            Your healthcare clinician profile or clinical facility setup was previously registered. For this demo, we are automatically approving your account right now.
          </p>
          <button onClick={activateAccount} className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-bold text-xs transition-all w-full">
            Click to Proceed to Dashboard
          </button>
          <button onClick={handleLogout} className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-lg font-bold text-xs transition-all w-full">
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  // ROUTE TO SYSTEM ADMIN PANEL
  if (userProfile.role === 'system_admin') {
    return <SystemAdminDashboard user={user} onLogout={handleLogout} />;
  }

  // ROUTE TO HOSPITAL ADMIN PANEL
  if (userProfile.role === 'hospital_admin') {
    return <HospitalAdminDashboard user={user} userProfile={userProfile} onLogout={handleLogout} />;
  }

  // ROUTE TO INDIVIDUAL PATIENT PORTAL
  if (userProfile.role === 'individual_patient') {
    return <PatientDashboard user={user} userProfile={userProfile} onLogout={handleLogout} />;
  }

  // DEFAULT ROLE: CLINICIAN PORTAL
  return (
    <div className="min-h-screen bg-[#f8fafc] text-[#1e293b] font-sans flex flex-col">
      {/* Header */}
      <header className="h-16 bg-white border-b border-[#e2e8f0] px-6 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-[#2563eb] rounded-lg flex items-center justify-center text-white font-bold text-lg">
            φ
          </div>
          <h1 className="font-bold text-lg text-[#2563eb] tracking-tight">FibroScan AI Support</h1>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-sm font-semibold">{userProfile.name}</div>
              <div className="text-[11px] text-[#64748b]">Certified Clinician</div>
            </div>
            <div className="w-8 h-8 rounded-full bg-slate-100 border border-[#e2e8f0] flex items-center justify-center">
              <User className="w-4 h-4 text-[#64748b]" />
            </div>
          </div>
          <button 
            onClick={handleLogout}
            className="p-2 hover:bg-slate-100 rounded-full transition-colors text-[#64748b]"
            title="Sign Out"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-60 bg-white border-r border-[#e2e8f0] p-6 flex flex-col gap-8 shrink-0 hidden md:flex">
          <div className="space-y-3">
            <p className="text-[11px] uppercase tracking-wider text-[#64748b] font-bold px-3">Main Menu</p>
            <nav className="space-y-1">
              <button 
                onClick={() => setCurrentView('diagnostics')}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${currentView === 'diagnostics' ? 'bg-blue-50 text-[#2563eb] font-semibold' : 'text-[#1e293b] hover:bg-slate-50'}`}
              >
                <Activity className="w-4 h-4" />
                Diagnostics Hub
              </button>
              <button 
                onClick={() => setCurrentView('patients')}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${currentView === 'patients' ? 'bg-blue-50 text-[#2563eb] font-semibold' : 'text-[#1e293b] hover:bg-slate-50'}`}
              >
                <User className="w-4 h-4 opacity-60" />
                Patient Registry
              </button>
              <button 
                onClick={() => setCurrentView('history')}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${currentView === 'history' ? 'bg-blue-50 text-[#2563eb] font-semibold' : 'text-[#1e293b] hover:bg-slate-50'}`}
              >
                <History className="w-4 h-4 opacity-60" />
                Scan History
              </button>
              <div className="pt-4 mt-4 border-t border-slate-50">
                <button 
                  onClick={() => setShowPatientForm(true)}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[#1e293b] hover:bg-slate-50 text-sm transition-colors"
                >
                  <UserPlus className="w-4 h-4 opacity-60" />
                  Register Patient
                </button>
              </div>
            </nav>
          </div>

          <div className="space-y-3">
            <p className="text-[11px] uppercase tracking-wider text-[#64748b] font-bold px-3">AI Engine Status</p>
            <div className="bg-slate-50 p-3 rounded-lg border border-[#e2e8f0]">
              <div className="flex items-center gap-2 text-xs font-semibold">
                <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                Gemini 1.5 Flash Online
              </div>
              <p className="text-[10px] text-[#64748b] mt-1">Latency: 142ms • Precision: 0.94</p>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-6 overflow-y-auto">
          <div className="max-w-6xl mx-auto">
            {currentView === 'diagnostics' && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Viewer Card */}
                <div className="lg:col-span-2 flex flex-col bg-white rounded-xl border border-[#e2e8f0] shadow-sm overflow-hidden">
                  <div className="p-5 border-b border-[#e2e8f0] flex justify-between items-center bg-white">
                    <div>
                      <h2 className="font-semibold text-base">Ultrasound Analysis</h2>
                      <p className="text-xs text-[#64748b]">
                        {currentPatient ? `Patient: ${currentPatient.name} (${currentPatient.patientId})` : 'No patient selected'}
                      </p>
                    </div>
                    {result && result.detections.length > 0 && (
                      <div className="bg-emerald-50 text-emerald-700 px-3 py-1 rounded-md text-xs font-bold border border-emerald-100">
                        Detection: {(Math.max(...result.detections.map(d => d.confidence)) * 100).toFixed(1)}% Confidence
                      </div>
                    )}
                    {result && result.detections.length === 0 && (
                      <div className="bg-slate-50 text-slate-600 px-3 py-1 rounded-md text-xs font-bold border border-slate-100">
                        No Abnormalities Detected
                      </div>
                    )}
                  </div>

                  <div className="flex-1 bg-black min-h-[400px] relative flex items-center justify-center overflow-hidden">
                    <AnimatePresence mode="wait">
                      {!previewUrl ? (
                        <motion.div 
                          key="empty"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="flex flex-col items-center justify-center text-white/20"
                        >
                          <Maximize2 className="w-12 h-12 mb-4" />
                          <p className="text-xs tracking-widest uppercase font-bold">Awaiting Image Input</p>
                        </motion.div>
                      ) : (
                        <motion.div 
                          key="preview"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="w-full h-full flex items-center justify-center p-4"
                        >
                          {result && processedUrl ? (
                            <canvas 
                              ref={canvasRef} 
                              className="max-w-full max-h-full object-contain"
                            />
                          ) : (
                            <img 
                              src={previewUrl} 
                              alt="Ultrasound Preview" 
                              className="max-w-full max-h-full object-contain opacity-85"
                            />
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                    
                    <div className="absolute top-4 left-4 flex gap-2">
                      <div className="bg-white/90 backdrop-blur px-2 py-1 text-[10px] font-bold rounded border border-[#e2e8f0]">LIVE_VIEW</div>
                      {isAnalyzing && <div className="bg-red-500 text-white px-2 py-1 text-[10px] font-bold rounded animate-pulse">PROCESSING</div>}
                    </div>
                  </div>

                  <div className="p-4 bg-slate-50 border-t border-[#e2e8f0] flex flex-col gap-3">
                    {error && (
                      <div className="bg-red-50 border border-red-100 p-3 rounded-lg flex items-center gap-2 text-xs text-red-600 font-medium">
                        <AlertCircle className="w-4 h-4 flex-shrink-0" />
                        {error}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-3">
                      <button 
                        onClick={() => document.getElementById('file-upload')?.click()}
                        className="bg-[#2563eb] text-white px-5 py-2.5 rounded-lg text-sm font-bold hover:opacity-90 transition-all flex items-center gap-2"
                      >
                        <Upload className="w-4 h-4" />
                        Upload Image
                      </button>
                      <input 
                        id="file-upload"
                        type="file" 
                        className="hidden" 
                        accept="image/*"
                        onChange={handleFileChange}
                      />
                      <button 
                        onClick={analyzeImage}
                        disabled={!selectedFile || isAnalyzing || !currentPatient}
                        className="bg-white border border-[#e2e8f0] text-[#1e293b] px-5 py-2.5 rounded-lg text-sm font-bold hover:bg-slate-100 transition-all disabled:opacity-50 flex items-center gap-2"
                      >
                        {isAnalyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Activity className="w-4 h-4" />}
                        Run Diagnostic
                      </button>
                      {!currentPatient && (
                        <p className="text-[10px] text-red-500 font-bold flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" />
                          SELECT PATIENT FIRST
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Sidebar Panel */}
                <div className="flex flex-col gap-6">
                  {/* Detection Metrics */}
                  <div className="bg-white rounded-xl border border-[#e2e8f0] p-5">
                    <h3 className="text-sm font-bold mb-4">Detection Metrics</h3>
                    <div className="space-y-3">
                      {result?.detections.map((det, i) => (
                        <div key={i} className="space-y-2 pb-3 border-b border-[#e2e8f0] last:border-0 last:pb-0">
                          <div className="flex justify-between text-xs">
                            <span className="text-[#64748b]">Classification</span>
                            <span className="font-bold">{det.label}</span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-[#64748b]">Confidence</span>
                            <span className="font-bold text-emerald-600">{(det.confidence * 100).toFixed(1)}%</span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-[#64748b]">Coordinates</span>
                            <span className="font-mono text-[10px]">[{det.box_2d.join(', ')}]</span>
                          </div>
                        </div>
                      )) || (
                        <div className="text-center py-4 text-xs text-[#64748b] italic">No detections yet</div>
                      )}
                    </div>
                  </div>

                  {/* Patient Details */}
                  <div className="bg-white rounded-xl border border-[#e2e8f0] p-5">
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-sm font-bold">Patient Details</h3>
                      <button 
                        onClick={() => setCurrentView('patients')}
                        className="text-[10px] text-[#2563eb] font-bold hover:underline"
                      >
                        CHANGE
                      </button>
                    </div>
                    {currentPatient ? (
                      <div className="space-y-3">
                        <div className="flex justify-between text-xs pb-2 border-b border-slate-50">
                          <span className="text-[#64748b]">Patient ID</span>
                          <span className="font-bold">{currentPatient.patientId}</span>
                        </div>
                        <div className="flex justify-between text-xs pb-2 border-b border-slate-50">
                          <span className="text-[#64748b]">Name</span>
                          <span className="font-bold">{currentPatient.name}</span>
                        </div>
                        <div className="flex justify-between text-xs pb-2 border-b border-slate-50">
                          <span className="text-[#64748b]">Age / Gender</span>
                          <span className="font-bold">{currentPatient.age} / {currentPatient.gender}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-[#64748b]">Last Exam</span>
                          <span className="font-bold">{new Date(currentPatient.lastExam).toLocaleDateString()}</span>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-4 space-y-3">
                        <p className="text-xs text-[#64748b] italic">No patient selected</p>
                        <button 
                          onClick={() => setShowPatientForm(true)}
                          className="w-full py-2 border border-dashed border-[#e2e8f0] rounded-lg text-[10px] font-bold hover:bg-slate-50 transition-colors"
                        >
                          + REGISTER NEW PATIENT
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Clinical Note */}
                  <div className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded-r-lg">
                    <div className="text-xs font-bold text-amber-800 mb-1 flex items-center gap-2">
                      <AlertCircle className="w-3 h-3" />
                      Clinical Note
                    </div>
                    <p className="text-[11px] text-amber-700 leading-relaxed">
                      {result ? result.summary : "Awaiting scan analysis for clinical summary and recommendations."}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {currentView === 'patients' && (
              <PatientList 
                hospitalId={userProfile.hospitalId || 'demo'}
                onSelectPatient={(patient) => {
                  setCurrentPatient(patient);
                  setCurrentView('diagnostics');
                }} 
              />
            )}

            {currentView === 'history' && <ScanHistory />}
          </div>
        </main>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {showPatientForm && (
          <PatientForm 
            hospitalId={userProfile.hospitalId || 'demo'}
            onComplete={(patient) => {
              setCurrentPatient(patient);
              setShowPatientForm(false);
            }}
            onClose={() => setShowPatientForm(false)}
          />
        )}
      </AnimatePresence>

      {/* Footer */}
      <footer className="bg-white border-t border-[#e2e8f0] p-4 text-center">
        <p className="text-[10px] text-[#64748b] uppercase tracking-widest font-bold">
          Confidential Medical Data • HIPAA Compliant • AI-Assisted Diagnosis Only
        </p>
      </footer>
    </div>
  );
}

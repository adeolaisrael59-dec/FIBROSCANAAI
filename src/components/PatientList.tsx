import React, { useState, useEffect } from 'react';
import { db, auth } from '../firebase';
import { collection, query, getDocs, orderBy, where, limit, onSnapshot } from 'firebase/firestore';
import { Users, Search, ChevronRight, Loader2, Calendar, User, History, X, AlertCircle, Image as ImageIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface Patient {
  id: string;
  patientId: string;
  name: string;
  age: number;
  gender: string;
  lastExam: string;
  latestScan?: Scan;
  isReviewRequest?: boolean;
}

interface Scan {
  id: string;
  summary: string;
  recommendation: string;
  timestamp: string;
  imageUrl?: string;
}

interface PatientListProps {
  hospitalId: string;
  onSelectPatient: (patient: Patient) => void;
}

export default function PatientList({ hospitalId, onSelectPatient }: PatientListProps) {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPatientHistory, setSelectedPatientHistory] = useState<Patient | null>(null);
  const [patientScans, setPatientScans] = useState<Scan[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    if (!auth.currentUser || !hospitalId) return;

    // 1. Query for hospital-owned patients
    const q1 = query(
      collection(db, 'patients'), 
      where('hospitalId', '==', hospitalId),
      orderBy('createdAt', 'desc')
    );

    const unsubPatients = onSnapshot(q1, async (querySnapshot) => {
      try {
        const hospitalPatients = await Promise.all(querySnapshot.docs.map(async (docSnapshot) => {
          const data = docSnapshot.data();
          
          const scansQ = query(
            collection(db, 'patients', docSnapshot.id, 'scans'),
            orderBy('timestamp', 'desc'),
            limit(1)
          );
          const scanSnapshot = await getDocs(scansQ);
          const latestScan = !scanSnapshot.empty ? {
            id: scanSnapshot.docs[0].id,
            ...scanSnapshot.docs[0].data()
          } as Scan : undefined;

          return {
            id: docSnapshot.id,
            ...data,
            latestScan,
            isReviewRequest: false
          } as Patient;
        }));

        // 2. Query for incoming clinical review requests (patient records shared by individuals)
        const q2 = query(
          collection(db, 'patients'),
          where('reviewRequestedHospitalId', '==', hospitalId)
        );
        const reviewSnapshot = await getDocs(q2);
        const reviewRequests = await Promise.all(reviewSnapshot.docs.map(async (docSnapshot) => {
          const data = docSnapshot.data();
          const scansQ = query(
            collection(db, 'patients', docSnapshot.id, 'scans'),
            orderBy('timestamp', 'desc'),
            limit(1)
          );
          const scanSnapshot = await getDocs(scansQ);
          const latestScan = !scanSnapshot.empty ? {
            id: scanSnapshot.docs[0].id,
            ...scanSnapshot.docs[0].data()
          } as Scan : undefined;

          return {
            id: docSnapshot.id,
            ...data,
            latestScan,
            isReviewRequest: true
          } as Patient;
        }));

        // Merge both lists cleanly removing duplicates
        const merged = [...hospitalPatients];
        reviewRequests.forEach(req => {
          if (!merged.some(p => p.id === req.id)) {
            merged.push(req);
          }
        }, (err) => console.error("Snapshot error:", err));

        setPatients(merged);
      } catch (error) {
        console.error("Error processing patient registry:", error);
      } finally {
        setLoading(false);
      }
    }, (err) => console.error("Snapshot error:", err));

    return () => unsubPatients();
  }, [hospitalId]);

  const fetchPatientHistory = async (patient: Patient) => {
    setSelectedPatientHistory(patient);
    setLoadingHistory(true);
    try {
      const q = query(collection(db, 'patients', patient.id, 'scans'), orderBy('timestamp', 'desc'));
      const querySnapshot = await getDocs(q);
      const scans = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Scan[];
      setPatientScans(scans);
    } catch (error) {
      console.error("Error fetching patient history:", error);
    } finally {
      setLoadingHistory(false);
    }
  };

  const filteredPatients = patients.filter(p => 
    (p.name || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
    (p.patientId || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-[#1e293b]">Hospital Patient Registry</h2>
          <p className="text-sm text-[#64748b]">Review and select patients for diagnostics or review requests</p>
        </div>
        <div className="relative max-w-xs w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#64748b]" />
          <input 
            type="text"
            placeholder="Search by name or ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white border border-[#e2e8f0] rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#2563eb]"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-[#64748b]">
          <Loader2 className="w-8 h-8 animate-spin mb-2" />
          <p className="text-sm">Retrieving registry details...</p>
        </div>
      ) : filteredPatients.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-[#e2e8f0] p-12 text-center">
          <Users className="w-12 h-12 text-[#e2e8f0] mx-auto mb-4" />
          <p className="text-[#64748b] font-medium">No patient records found</p>
          <p className="text-xs text-[#64748b] mt-1 font-bold">Register a patient to get started</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredPatients.map((patient) => (
            <motion.div 
              key={patient.id}
              whileHover={{ y: -2 }}
              className="bg-white p-5 rounded-xl border border-[#e2e8f0] shadow-sm hover:shadow-md transition-all group relative"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="w-10 h-10 bg-slate-50 rounded-lg flex items-center justify-center border border-[#e2e8f0]">
                  <User className="w-5 h-5 text-[#64748b]" />
                </div>
                <div className="flex gap-1">
                  {patient.isReviewRequest && (
                    <span className="text-[8px] bg-indigo-50 border border-indigo-200 text-indigo-700 px-1.5 py-1 rounded font-black uppercase">
                      Review Request
                    </span>
                  )}
                  <button 
                    onClick={() => fetchPatientHistory(patient)}
                    className="p-2 hover:bg-slate-100 rounded-full text-[#64748b] hover:text-[#2563eb] transition-colors"
                    title="View History"
                  >
                    <History className="w-4 h-4" />
                  </button>
                </div>
              </div>
              
              <div onClick={() => onSelectPatient(patient)} className="cursor-pointer space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-[10px] font-bold text-[#64748b] bg-slate-100 px-2 py-1 rounded uppercase tracking-wider inline-block">
                    {patient.patientId}
                  </div>
                  <div className="text-[10px] font-medium text-[#64748b]">
                    {patient.age} yrs • {patient.gender}
                  </div>
                </div>
                
                <h3 className="font-bold text-[#1e293b] group-hover:text-[#2563eb] transition-colors">{patient.name}</h3>
                
                {patient.latestScan ? (
                  <div className="bg-slate-50 rounded-lg p-3 border border-slate-100 space-y-2">
                    <div className="flex gap-3">
                      <div className="w-12 h-12 bg-black rounded border border-slate-200 overflow-hidden flex-shrink-0">
                        {patient.latestScan.imageUrl ? (
                          <img 
                            src={`data:image/jpeg;base64,${patient.latestScan.imageUrl}`} 
                            alt="Latest Scan" 
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-white/20">
                            <ImageIcon className="w-4 h-4" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[9px] font-bold text-[#2563eb] uppercase tracking-tighter mb-0.5">LATEST DIAGNOSIS</div>
                        <p className="text-[11px] text-[#1e293b] line-clamp-2 leading-tight italic">
                          "{patient.latestScan.summary}"
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-slate-50 rounded-lg p-3 border border-dashed border-slate-200 text-center">
                    <p className="text-[10px] text-[#64748b] font-medium italic">No scans recorded yet</p>
                  </div>
                )}
              </div>

              <div className="mt-4 pt-4 border-t border-slate-50 flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-[11px] text-[#64748b]">
                  <Calendar className="w-3 h-3" />
                  Last Exam: {new Date(patient.lastExam).toLocaleDateString()}
                </div>
                <button 
                  onClick={() => onSelectPatient(patient)}
                  className="text-[10px] font-bold text-[#2563eb] flex items-center gap-1"
                >
                  SELECT
                  <ChevronRight className="w-3 h-3" />
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Patient History Modal */}
      <AnimatePresence>
        {selectedPatientHistory && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl"
            >
              <div className="p-6 border-b border-[#e2e8f0] flex justify-between items-center bg-slate-50">
                <div>
                  <h2 className="font-bold text-lg text-[#1e293b]">Scan History: {selectedPatientHistory.name}</h2>
                  <p className="text-xs text-[#64748b]">Patient ID: {selectedPatientHistory.patientId}</p>
                </div>
                <button 
                  onClick={() => setSelectedPatientHistory(null)}
                  className="p-2 hover:bg-slate-200 rounded-full transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6">
                {loadingHistory ? (
                  <div className="flex flex-col items-center justify-center py-20">
                    <Loader2 className="w-8 h-8 animate-spin text-[#2563eb] mb-2" />
                    <p className="text-sm text-[#64748b]">Loading patient history...</p>
                  </div>
                ) : patientScans.length === 0 ? (
                  <div className="text-center py-20">
                    <History className="w-12 h-12 text-[#e2e8f0] mx-auto mb-4" />
                    <p className="text-[#64748b] font-medium">No scan history for this patient</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {patientScans.map((scan) => (
                      <div key={scan.id} className="border border-[#e2e8f0] rounded-xl p-4 flex gap-4 bg-slate-50/50">
                        <div className="w-24 h-24 bg-black rounded-lg overflow-hidden flex-shrink-0">
                          {scan.imageUrl ? (
                            <img 
                              src={`data:image/jpeg;base64,${scan.imageUrl}`} 
                              alt="Scan" 
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-white/20">
                              <ImageIcon className="w-6 h-6" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 space-y-2">
                          <div className="flex justify-between items-start">
                            <p className="text-[10px] font-bold text-[#64748b] uppercase tracking-wider">
                              {new Date(scan.timestamp).toLocaleString()}
                            </p>
                            <div className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-600">
                              <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                              ANALYZED
                            </div>
                          </div>
                          <div className="bg-white p-3 rounded-lg border border-slate-100">
                            <p className="text-xs text-[#1e293b] leading-relaxed italic">
                              "{scan.summary}"
                            </p>
                          </div>
                          <div className="flex items-center gap-2 text-[11px] text-amber-700 font-medium">
                            <AlertCircle className="w-3 h-3" />
                            Rec: {scan.recommendation}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

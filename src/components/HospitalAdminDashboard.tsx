import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  doc, 
  updateDoc, 
  onSnapshot, 
  orderBy, 
  limit, 
  addDoc 
} from 'firebase/firestore';
import { 
  Building2, 
  Stethoscope, 
  Users, 
  FileText, 
  ClipboardCheck, 
  Search, 
  Loader2, 
  UserCheck, 
  UserMinus, 
  Share2, 
  Calendar, 
  CheckCircle,
  AlertCircle,
  Eye,
  ArrowUpDown
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Hospital, UserProfile, Patient, AuditLog, Scan } from '../types';

interface HospitalAdminDashboardProps {
  user: any;
  userProfile: UserProfile;
  onLogout: () => void;
}

export default function HospitalAdminDashboard({ user, userProfile, onLogout }: HospitalAdminDashboardProps) {
  const [activeTab, setActiveTab] = useState<'profile' | 'clinicians' | 'patients' | 'audit_logs'>('clinicians');
  const [hospital, setHospital] = useState<Hospital | null>(null);
  const [clinicians, setClinicians] = useState<UserProfile[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Scans for clinical review
  const [selectedPatientScans, setSelectedPatientScans] = useState<Scan[]>([]);
  const [viewingPatient, setViewingPatient] = useState<Patient | null>(null);
  const [loadingScans, setLoadingScans] = useState(false);

  // Transfer clinician state
  const [transferPatient, setTransferPatient] = useState<Patient | null>(null);
  const [selectedNewClinician, setSelectedNewClinician] = useState<string>('');

  useEffect(() => {
    if (!userProfile.hospitalId) return;

    // 1. Fetch Hospital Info
    const unsubHosp = onSnapshot(doc(db, 'hospitals', userProfile.hospitalId), (docSnap) => {
      if (docSnap.exists()) {
        setHospital({ id: docSnap.id, ...docSnap.data() } as Hospital);
      }
    }, (err) => console.error("Snapshot error:", err));

    // 2. Listen to Clinicians in this hospital
    const qClinicians = query(
      collection(db, 'users'), 
      where('hospitalId', '==', userProfile.hospitalId),
      where('role', '==', 'clinician')
    );
    const unsubClinicians = onSnapshot(qClinicians, (snap) => {
      const data = snap.docs.map(d => ({ uid: d.id, ...d.data() })) as UserProfile[];
      setClinicians(data);
    }, (err) => console.error("Snapshot error:", err));

    // 3. Listen to Patients in this hospital
    const qPatients = query(
      collection(db, 'patients'),
      where('hospitalId', '==', userProfile.hospitalId),
      orderBy('createdAt', 'desc')
    );
    const unsubPatients = onSnapshot(qPatients, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() })) as Patient[];
      setPatients(data);
    }, (err) => console.error("Snapshot error:", err));

    // 4. Listen to Audit Logs for this hospital
    const qLogs = query(
      collection(db, 'audit_logs'),
      where('hospitalId', '==', userProfile.hospitalId),
      orderBy('timestamp', 'desc'),
      limit(50)
    );
    const unsubLogs = onSnapshot(qLogs, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() })) as AuditLog[];
      setAuditLogs(data);
    }, (err) => console.error("Snapshot error:", err));

    setLoading(false);

    return () => {
      unsubHosp();
      unsubClinicians();
      unsubPatients();
      unsubLogs();
    };
  }, [userProfile.hospitalId]);

  const logHospitalAction = async (action: string, details: string) => {
    try {
      await addDoc(collection(db, 'audit_logs'), {
        hospitalId: userProfile.hospitalId,
        userId: user.uid,
        userName: userProfile.name,
        action,
        details,
        timestamp: new Date().toISOString()
      }, (err) => console.error("Snapshot error:", err));
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpdateClinicianStatus = async (clinicianUid: string, clinicianName: string, newStatus: 'active' | 'deactivated') => {
    setActionLoading(clinicianUid);
    try {
      await updateDoc(doc(db, 'users', clinicianUid), { status: newStatus });
      
      const logAction = newStatus === 'active' ? 'APPROVE_CLINICIAN' : 'DEACTIVATE_CLINICIAN';
      await logHospitalAction(
        logAction, 
        `Clinician "${clinicianName}" status changed to: ${newStatus} by Hospital Admin.`
      );
    } catch (err) {
      console.error("Failed to update status:", err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleFetchScans = async (patient: Patient) => {
    setViewingPatient(patient);
    setLoadingScans(true);
    try {
      const q = query(collection(db, 'patients', patient.id, 'scans'), orderBy('timestamp', 'desc'));
      const qSnap = await getDocs(q);
      const data = qSnap.docs.map(d => ({ id: d.id, ...d.data() })) as Scan[];
      setSelectedPatientScans(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingScans(false);
    }
  };

  const handleTransferPatient = async () => {
    if (!transferPatient || !selectedNewClinician) return;
    setActionLoading(transferPatient.id);
    try {
      const targetClinician = clinicians.find(c => c.uid === selectedNewClinician);
      if (!targetClinician) return;

      // Update patient createdBy to represent new clinical owner
      await updateDoc(doc(db, 'patients', transferPatient.id), {
        createdBy: selectedNewClinician
      }, (err) => console.error("Snapshot error:", err));

      await logHospitalAction(
        'REASSIGN_PATIENT',
        `Patient "${transferPatient.name}" (${transferPatient.patientId}) was reassigned to Clinician "${targetClinician.name}".`
      );

      setTransferPatient(null);
      setSelectedNewClinician('');
    } catch (err) {
      console.error("Reassign failed:", err);
    } finally {
      setActionLoading(null);
    }
  };

  const filteredClinicians = clinicians.filter(c => 
    (c.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (c.email || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredPatients = patients.filter(p => 
    (p.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.patientId || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.phone && p.phone.includes(searchTerm))
  );

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-800 font-sans flex flex-col">
      {/* Header */}
      <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-[#2563eb] rounded-lg flex items-center justify-center text-white font-bold text-lg">
            φ
          </div>
          <h1 className="font-bold text-lg text-[#2563eb]">
            {hospital ? hospital.name : 'Clinic Portal'} Admin
          </h1>
        </div>
        <div className="flex items-center gap-4">
          {hospital && (
            <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 text-[10px] font-black px-2.5 py-1 rounded-md tracking-wider font-mono">
              JOIN CODE: {hospital.joinCode}
            </div>
          )}
          <div className="text-right">
            <div className="text-sm font-bold">{userProfile.name}</div>
            <div className="text-[10px] text-slate-500">Hospital Administrator</div>
          </div>
          <button 
            onClick={onLogout}
            className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-1.5 rounded-lg font-bold transition-all"
          >
            Sign Out
          </button>
        </div>
      </header>

      {/* Main Workspace */}
      <main className="flex-1 p-6 max-w-7xl mx-auto w-full space-y-6">
        {hospital?.status === 'pending' ? (
          <div className="bg-amber-50 border border-amber-200 p-8 rounded-2xl max-w-2xl mx-auto text-center space-y-4">
            <AlertCircle className="w-16 h-16 text-amber-500 mx-auto" />
            <h2 className="text-xl font-bold text-amber-800">Hospital Pending Platform Verification</h2>
            <p className="text-sm text-amber-700 leading-relaxed">
              St. Jude Research Hospital or your specific clinical facility is registered, but requires verification from the platform owner before clinical diagnostics and staff roles can be activated. Please check back shortly or coordinate with the System Administrator.
            </p>
          </div>
        ) : (
          <>
            {/* Top Cards info */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
                <div className="p-3 bg-blue-50 text-blue-600 rounded-lg"><Stethoscope className="w-6 h-6" /></div>
                <div>
                  <div className="text-2xl font-black">{clinicians.length}</div>
                  <div className="text-xs text-slate-500 font-bold uppercase tracking-wider">Hospital Clinicians</div>
                </div>
              </div>
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
                <div className="p-3 bg-indigo-50 text-indigo-600 rounded-lg"><Users className="w-6 h-6" /></div>
                <div>
                  <div className="text-2xl font-black">{patients.length}</div>
                  <div className="text-xs text-slate-500 font-bold uppercase tracking-wider">Total Patients</div>
                </div>
              </div>
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
                <div className="p-3 bg-amber-50 text-amber-600 rounded-lg"><Building2 className="w-6 h-6" /></div>
                <div>
                  <div className="text-xs font-black text-slate-700">{hospital?.cityState}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">{hospital?.address}</div>
                </div>
              </div>
            </div>

            {/* Workplace Panel */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col min-h-[500px]">
              <div className="border-b border-slate-200 bg-slate-50/50 p-4 flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="flex gap-2">
                  {[
                    { id: 'clinicians', label: 'Manage Clinicians', icon: Stethoscope },
                    { id: 'patients', label: 'Patient Registry', icon: Users },
                    { id: 'audit_logs', label: 'Clinical Activity Logs', icon: FileText },
                    { id: 'profile', label: 'Hospital Profile', icon: Building2 },
                  ].map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => { setActiveTab(tab.id as any); setSearchTerm(''); }}
                      className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-all ${
                        activeTab === tab.id ? 'bg-[#2563eb] text-white' : 'text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      <tab.icon className="w-3.5 h-3.5" />
                      {tab.label}
                    </button>
                  ))}
                </div>

                <div className="relative w-full max-w-xs">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder={`Search ${activeTab}...`}
                    className="w-full pl-9 pr-4 py-1.5 bg-white border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="p-6 flex-1">
                {loading ? (
                  <div className="flex flex-col items-center justify-center py-20">
                    <Loader2 className="w-8 h-8 animate-spin text-blue-600 mb-2" />
                    <p className="text-sm text-slate-500 font-bold">Retrieving records...</p>
                  </div>
                ) : (
                  <>
                    {/* TAB: CLINICIANS */}
                    {activeTab === 'clinicians' && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="border-b border-slate-200 text-xs text-slate-500 font-bold uppercase tracking-wider">
                              <th className="pb-3">Clinician Name</th>
                              <th className="pb-3">Email Address</th>
                              <th className="pb-3">Registered Since</th>
                              <th className="pb-3">Current Status</th>
                              <th className="pb-3 text-right">Access Controls</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 text-xs">
                            {filteredClinicians.map(c => (
                              <tr key={c.uid} className="hover:bg-slate-50/50">
                                <td className="py-4 font-bold text-slate-800">{c.name}</td>
                                <td className="py-4">{c.email}</td>
                                <td className="py-4 text-slate-500">{new Date(c.createdAt).toLocaleDateString()}</td>
                                <td className="py-4">
                                  <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                                    c.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                                  }`}>
                                    <span className={`w-1 h-1 rounded-full ${c.status === 'active' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                                    {c.status}
                                  </span>
                                </td>
                                <td className="py-4 text-right">
                                  {c.status === 'pending' ? (
                                    <button
                                      disabled={actionLoading === c.uid}
                                      onClick={() => handleUpdateClinicianStatus(c.uid, c.name, 'active')}
                                      className="bg-emerald-500 text-white hover:opacity-95 px-3 py-1 rounded font-bold transition-all disabled:opacity-50"
                                    >
                                      Approve
                                    </button>
                                  ) : c.status === 'active' ? (
                                    <button
                                      disabled={actionLoading === c.uid}
                                      onClick={() => handleUpdateClinicianStatus(c.uid, c.name, 'deactivated')}
                                      className="bg-white border border-red-200 text-red-600 hover:bg-red-50 px-3 py-1 rounded font-bold transition-all disabled:opacity-50"
                                    >
                                      Deactivate
                                    </button>
                                  ) : (
                                    <button
                                      disabled={actionLoading === c.uid}
                                      onClick={() => handleUpdateClinicianStatus(c.uid, c.name, 'active')}
                                      className="bg-blue-500 text-white hover:opacity-95 px-3 py-1 rounded font-bold transition-all disabled:opacity-50"
                                    >
                                      Reactivate
                                    </button>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* TAB: PATIENTS */}
                    {activeTab === 'patients' && (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="border-b border-slate-200 text-xs text-slate-500 font-bold uppercase tracking-wider">
                              <th className="pb-3">Patient ID</th>
                              <th className="pb-3">Full Name</th>
                              <th className="pb-3">Gender / Age</th>
                              <th className="pb-3">Attending Clinician</th>
                              <th className="pb-3">Last Exam Date</th>
                              <th className="pb-3 text-right">Clinical Reviews</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 text-xs">
                            {filteredPatients.map(p => {
                              const attending = clinicians.find(c => c.uid === p.createdBy);
                              return (
                                <tr key={p.id} className="hover:bg-slate-50/50">
                                  <td className="py-4 font-mono font-bold text-blue-600">{p.patientId}</td>
                                  <td className="py-4 font-bold text-slate-800">{p.name}</td>
                                  <td className="py-4">{p.gender} • {p.age} yrs</td>
                                  <td className="py-4 font-semibold text-slate-600">
                                    {attending ? attending.name : 'Reassign Required'}
                                  </td>
                                  <td className="py-4 text-slate-500">{new Date(p.lastExam).toLocaleDateString()}</td>
                                  <td className="py-4 text-right flex justify-end gap-2">
                                    <button
                                      onClick={() => handleFetchScans(p)}
                                      className="bg-blue-50 border border-blue-100 text-blue-600 hover:bg-blue-100 px-2.5 py-1 rounded-md font-bold transition-all flex items-center gap-1"
                                    >
                                      <Eye className="w-3.5 h-3.5" />
                                      Scans
                                    </button>
                                    <button
                                      onClick={() => setTransferPatient(p)}
                                      className="bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100 px-2.5 py-1 rounded-md font-bold transition-all flex items-center gap-1"
                                    >
                                      <ArrowUpDown className="w-3.5 h-3.5" />
                                      Transfer
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* TAB: AUDIT LOGS */}
                    {activeTab === 'audit_logs' && (
                      <div className="space-y-4">
                        <div className="bg-blue-50 border border-blue-200 p-3 rounded-lg text-xs text-blue-800 flex items-center gap-2 font-medium">
                          <AlertCircle className="w-4 h-4 flex-shrink-0" />
                          This log records critical actions performed in this facility for HIPAA compliance audits.
                        </div>
                        <div className="border border-slate-200 rounded-lg overflow-hidden bg-slate-50">
                          <div className="max-h-[350px] overflow-y-auto">
                            <table className="w-full text-left text-xs">
                              <thead className="bg-slate-100 text-slate-500 font-bold uppercase sticky top-0">
                                <tr>
                                  <th className="p-3">Time</th>
                                  <th className="p-3">Staff Member</th>
                                  <th className="p-3">Event Action</th>
                                  <th className="p-3">Audit Details</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-200 bg-white">
                                {auditLogs.map(log => (
                                  <tr key={log.id} className="hover:bg-slate-50/50">
                                    <td className="p-3 text-slate-500 font-mono text-[10px] whitespace-nowrap">
                                      {new Date(log.timestamp).toLocaleString()}
                                    </td>
                                    <td className="p-3 font-semibold text-slate-700">{log.userName}</td>
                                    <td className="p-3 font-mono font-bold text-[10px] text-blue-600 uppercase">{log.action}</td>
                                    <td className="p-3 text-slate-600 italic leading-relaxed">{log.details}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* TAB: PROFILE */}
                    {activeTab === 'profile' && hospital && (
                      <div className="bg-slate-50 p-6 rounded-xl border border-slate-200/60 grid grid-cols-2 gap-6">
                        <div className="space-y-4">
                          <h3 className="font-bold text-sm text-slate-800 border-b pb-2">Institutional Details</h3>
                          <div className="space-y-2">
                            <p className="text-xs text-slate-500 font-bold uppercase">Clinic Name</p>
                            <p className="text-sm font-bold text-slate-700">{hospital.name}</p>
                          </div>
                          <div className="space-y-2">
                            <p className="text-xs text-slate-500 font-bold uppercase">Medical License</p>
                            <p className="text-sm font-mono font-bold text-indigo-600">{hospital.medicalLicense}</p>
                          </div>
                          <div className="space-y-2">
                            <p className="text-xs text-slate-500 font-bold uppercase">Clinic Coordinates</p>
                            <p className="text-sm font-semibold text-slate-600">{hospital.address}, {hospital.cityState}</p>
                          </div>
                        </div>
                        <div className="space-y-4">
                          <h3 className="font-bold text-sm text-slate-800 border-b pb-2">Communications & Invite</h3>
                          <div className="space-y-2">
                            <p className="text-xs text-slate-500 font-bold uppercase">Institutional Contact</p>
                            <p className="text-sm font-semibold text-slate-600">Email: {hospital.email} <br />Phone: {hospital.phone}</p>
                          </div>
                          <div className="space-y-2">
                            <p className="text-xs text-slate-500 font-bold uppercase">Clinician Joining Code</p>
                            <p className="text-xl font-mono font-black text-[#2563eb] bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-lg inline-block tracking-widest">
                              {hospital.joinCode}
                            </p>
                            <p className="text-[10px] text-slate-500">Provide this code to physicians/radiologists so they can join your staff portal during registration.</p>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </main>

      {/* MODAL: VIEW PATIENT SCANS */}
      <AnimatePresence>
        {viewingPatient && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl border"
            >
              <div className="p-5 border-b flex justify-between items-center bg-slate-50">
                <div>
                  <h3 className="font-bold text-base">Diagnostic Scans: {viewingPatient.name}</h3>
                  <p className="text-xs text-slate-500">Patient ID: {viewingPatient.patientId}</p>
                </div>
                <button 
                  onClick={() => { setViewingPatient(null); setSelectedPatientScans([]); }}
                  className="p-1.5 hover:bg-slate-200 rounded-full transition-colors text-slate-600"
                >
                  ✕
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6">
                {loadingScans ? (
                  <div className="flex flex-col items-center justify-center py-20">
                    <Loader2 className="w-8 h-8 animate-spin text-blue-600 mb-2" />
                    <p className="text-sm text-slate-500">Retrieving diagnostic scans...</p>
                  </div>
                ) : selectedPatientScans.length === 0 ? (
                  <div className="text-center py-20 space-y-2">
                    <AlertCircle className="w-12 h-12 text-slate-300 mx-auto" />
                    <p className="font-bold text-slate-600">No diagnostic reports uploaded yet.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {selectedPatientScans.map((scan) => (
                      <div key={scan.id} className="border rounded-xl p-4 flex flex-col md:flex-row gap-4 bg-slate-50/50">
                        <div className="w-24 h-24 bg-black rounded-lg overflow-hidden shrink-0">
                          <img src={`data:image/jpeg;base64,${scan.imageUrl}`} alt="Ultrasound" className="w-full h-full object-cover" />
                        </div>
                        <div className="flex-1 space-y-2">
                          <div className="flex justify-between items-start">
                            <p className="text-[10px] font-bold text-slate-500">
                              Uploaded: {new Date(scan.timestamp).toLocaleString()}
                            </p>
                            <span className="text-[10px] bg-blue-50 text-blue-600 border border-blue-100 font-bold px-2 py-0.5 rounded">
                              AI Confirmed
                            </span>
                          </div>
                          <div className="bg-white p-3 border rounded-lg text-xs leading-relaxed italic text-slate-700">
                            "{scan.summary}"
                          </div>
                          <div className="text-xs text-amber-700 font-bold bg-amber-50 p-2 rounded border border-amber-100 flex items-center gap-1.5">
                            <AlertCircle className="w-3.5 h-3.5" />
                            Clinical Rec: {scan.recommendation}
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

      {/* MODAL: TRANSFER PATIENT */}
      <AnimatePresence>
        {transferPatient && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl border"
            >
              <div className="p-5 border-b bg-slate-50 flex justify-between items-center">
                <h3 className="font-bold">Reassign Attending Clinician</h3>
                <button onClick={() => setTransferPatient(null)} className="p-1 hover:bg-slate-200 rounded-full">✕</button>
              </div>
              <div className="p-6 space-y-4">
                <p className="text-xs text-slate-600 leading-relaxed">
                  Transfer patient <span className="font-bold">"{transferPatient.name}"</span> ({transferPatient.patientId}) to another certified doctor or sonographer within your facility.
                </p>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Select Clinician</label>
                  <select 
                    value={selectedNewClinician}
                    onChange={(e) => setSelectedNewClinician(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg text-xs focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">-- Choose attending staff --</option>
                    {clinicians.filter(c => c.status === 'active').map(c => (
                      <option key={c.uid} value={c.uid}>{c.name} ({c.email})</option>
                    ))}
                  </select>
                </div>

                <div className="flex gap-3 pt-2">
                  <button onClick={() => setTransferPatient(null)} className="w-1/2 py-2 border rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-50">Cancel</button>
                  <button 
                    onClick={handleTransferPatient}
                    disabled={!selectedNewClinician || actionLoading === transferPatient.id}
                    className="w-1/2 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:opacity-90 disabled:opacity-50"
                  >
                    Reassign Owner
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

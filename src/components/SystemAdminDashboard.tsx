import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { 
  collection, 
  query, 
  getDocs, 
  doc, 
  updateDoc, 
  onSnapshot, 
  orderBy, 
  limit, 
  collectionGroup,
  where,
  addDoc
} from 'firebase/firestore';
import { 
  Building2, 
  Stethoscope, 
  Users, 
  Activity, 
  ShieldCheck, 
  AlertCircle, 
  Loader2, 
  Search, 
  CheckCircle, 
  XCircle, 
  Clock, 
  FileSpreadsheet 
} from 'lucide-react';
import { motion } from 'motion/react';
import { Hospital, UserProfile, AuditLog } from '../types';

interface SystemAdminDashboardProps {
  user: any;
  onLogout: () => void;
}

export default function SystemAdminDashboard({ user, onLogout }: SystemAdminDashboardProps) {
  const [activeTab, setActiveTab] = useState<'hospitals' | 'clinicians' | 'patients' | 'audit_logs'>('hospitals');
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [clinicians, setClinicians] = useState<UserProfile[]>([]);
  const [patients, setPatients] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [stats, setStats] = useState({
    hospitals: 0,
    clinicians: 0,
    patients: 0,
    scans: 0
  });

  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    // 1. Listen to Hospitals
    const unsubHospitals = onSnapshot(collection(db, 'hospitals'), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Hospital[];
      setHospitals(data);
    }, (error) => {
      console.error("Failed to fetch hospitals:", error);
    });

    // 2. Listen to All Users (to filter Clinicians and Patients)
    const unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      const usersData = snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() })) as UserProfile[];
      
      const cliniciansList = usersData.filter(u => u.role === 'clinician');
      const patientsList = usersData.filter(u => u.role === 'individual_patient');
      
      setClinicians(cliniciansList);
    }, (error) => {
      console.error("Failed to fetch users:", error);
    });

    // 3. Listen to Patients records (all patients across the platform)
    const unsubPatients = onSnapshot(collection(db, 'patients'), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setPatients(data);
    }, (error) => {
      console.error("Failed to fetch patients:", error);
    });

    // 4. Listen to Audit Logs
    const unsubLogs = onSnapshot(
      query(collection(db, 'audit_logs'), orderBy('timestamp', 'desc'), limit(50)),
      (snapshot) => {
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as AuditLog[];
        setAuditLogs(data);
      },
      (error) => {
        console.error("Failed to fetch audit logs:", error);
      }
    );

    // 5. Fetch Scans count
    const fetchScanCount = async () => {
      try {
        const scansQuery = query(collectionGroup(db, 'scans'));
        const scansSnapshot = await getDocs(scansQuery);
        setStats(prev => ({ ...prev, scans: scansSnapshot.size }));
      } catch (err) {
        console.error("Failed to fetch scan count:", err);
      }
    };
    fetchScanCount();

    setLoading(false);

    return () => {
      unsubHospitals();
      unsubUsers();
      unsubPatients();
      unsubLogs();
    };
  }, []);

  useEffect(() => {
    setStats(prev => ({
      ...prev,
      hospitals: hospitals.length,
      clinicians: clinicians.length,
      patients: patients.length
    }));
  }, [hospitals, clinicians, patients]);

  const logSystemAction = async (action: string, details: string) => {
    try {
      await addDoc(collection(db, 'audit_logs'), {
        hospitalId: 'system',
        userId: user.uid,
        userName: 'Platform Administrator',
        action,
        details,
        timestamp: new Date().toISOString()
      });
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpdateHospitalStatus = async (hospitalId: string, adminEmail: string, newStatus: 'active' | 'deactivated') => {
    setActionLoading(hospitalId);
    try {
      // 1. Update Hospital Status
      await updateDoc(doc(db, 'hospitals', hospitalId), { status: newStatus });

      // 2. Query and Update Admin User profile status
      const adminQuery = query(collection(db, 'users'), where('email', '==', adminEmail));
      const adminSnapshot = await getDocs(adminQuery);
      if (!adminSnapshot.empty) {
        const adminDocId = adminSnapshot.docs[0].id;
        await updateDoc(doc(db, 'users', adminDocId), { status: newStatus });
      }

      // Log system audit trail
      const actionName = newStatus === 'active' ? 'APPROVE_HOSPITAL' : 'SUSPEND_HOSPITAL';
      const detailStr = `Hospital ID: ${hospitalId} was marked as ${newStatus} by platform administrator.`;
      await logSystemAction(actionName, detailStr);

    } catch (err) {
      console.error("Failed to update status:", err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleUpdateUserStatus = async (userUid: string, role: string, currentStatus: string) => {
    setActionLoading(userUid);
    const newStatus = currentStatus === 'active' ? 'deactivated' : 'active';
    try {
      await updateDoc(doc(db, 'users', userUid), { status: newStatus });
      
      const actionName = newStatus === 'active' ? 'ACTIVATE_USER' : 'DEACTIVATE_USER';
      const detailStr = `User UID: ${userUid} (${role}) status set to ${newStatus}.`;
      await logSystemAction(actionName, detailStr);
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading(null);
    }
  };

  const filteredHospitals = hospitals.filter(h => 
    (h.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (h.adminEmail || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (h.medicalLicense || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredClinicians = clinicians.filter(c => 
    (c.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (c.email || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredPatients = patients.filter(p => 
    (p.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.patientId || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-800 font-sans flex flex-col">
      {/* Top Banner */}
      <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-[#2563eb] rounded-lg flex items-center justify-center text-white font-bold text-lg">
            φ
          </div>
          <h1 className="font-bold text-lg text-[#2563eb]">FibroScan AI Platform Control Panel</h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-sm font-bold">Platform Admin Portal</div>
            <div className="text-[10px] text-slate-500">{user.email}</div>
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
      <main className="flex-1 p-6 max-w-7xl mx-auto w-full space-y-6">
        {/* Stats Dashboard */}
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
            <div className="p-3 bg-blue-50 text-blue-600 rounded-lg"><Building2 className="w-6 h-6" /></div>
            <div>
              <div className="text-2xl font-black">{stats.hospitals}</div>
              <div className="text-xs text-slate-500 font-bold uppercase tracking-wider">Hospitals</div>
            </div>
          </div>
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
            <div className="p-3 bg-emerald-50 text-emerald-600 rounded-lg"><Stethoscope className="w-6 h-6" /></div>
            <div>
              <div className="text-2xl font-black">{stats.clinicians}</div>
              <div className="text-xs text-slate-500 font-bold uppercase tracking-wider">Clinicians</div>
            </div>
          </div>
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
            <div className="p-3 bg-indigo-50 text-indigo-600 rounded-lg"><Users className="w-6 h-6" /></div>
            <div>
              <div className="text-2xl font-black">{stats.patients}</div>
              <div className="text-xs text-slate-500 font-bold uppercase tracking-wider">Patients</div>
            </div>
          </div>
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
            <div className="p-3 bg-amber-50 text-amber-600 rounded-lg"><Activity className="w-6 h-6" /></div>
            <div>
              <div className="text-2xl font-black">{stats.scans}</div>
              <div className="text-xs text-slate-500 font-bold uppercase tracking-wider">AI Analyses</div>
            </div>
          </div>
        </div>

        {/* Workspace and navigation */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col min-h-[500px]">
          {/* Header & Tabs */}
          <div className="border-b border-slate-200 bg-slate-50/50 p-4 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex gap-2">
              {[
                { id: 'hospitals', label: 'Hospitals & Clinics', icon: Building2 },
                { id: 'clinicians', label: 'Registered Clinicians', icon: Stethoscope },
                { id: 'patients', label: 'Patient Database', icon: Users },
                { id: 'audit_logs', label: 'Audit Trail Logs', icon: FileSpreadsheet },
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
                <p className="text-sm text-slate-500 font-bold">Synchronizing Platform Data...</p>
              </div>
            ) : (
              <>
                {/* TAB: HOSPITALS */}
                {activeTab === 'hospitals' && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 text-xs text-slate-500 font-bold uppercase tracking-wider">
                          <th className="pb-3">Facility</th>
                          <th className="pb-3">Contact</th>
                          <th className="pb-3">License Number</th>
                          <th className="pb-3">Admin</th>
                          <th className="pb-3">Join Code</th>
                          <th className="pb-3">Status</th>
                          <th className="pb-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs">
                        {filteredHospitals.map(hospital => (
                          <tr key={hospital.id} className="hover:bg-slate-50/50">
                            <td className="py-4">
                              <p className="font-bold text-slate-800">{hospital.name}</p>
                              <p className="text-[10px] text-slate-500">{hospital.address}, {hospital.cityState}</p>
                            </td>
                            <td className="py-4">
                              <p className="font-medium">{hospital.email}</p>
                              <p className="text-[10px] text-slate-500">{hospital.phone}</p>
                            </td>
                            <td className="py-4 font-mono font-bold text-indigo-600">{hospital.medicalLicense}</td>
                            <td className="py-4">
                              <p className="font-bold text-slate-700">{hospital.adminName}</p>
                              <p className="text-[10px] text-slate-400">{hospital.adminEmail}</p>
                            </td>
                            <td className="py-4 font-mono font-black tracking-widest text-slate-600">
                              <span className="bg-slate-100 border border-slate-200 px-2 py-0.5 rounded">{hospital.joinCode}</span>
                            </td>
                            <td className="py-4">
                              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase ${
                                hospital.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                              }`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${hospital.status === 'active' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                                {hospital.status}
                              </span>
                            </td>
                            <td className="py-4 text-right">
                              {hospital.status === 'pending' || hospital.status === 'deactivated' ? (
                                <button
                                  disabled={actionLoading === hospital.id}
                                  onClick={() => handleUpdateHospitalStatus(hospital.id, hospital.adminEmail, 'active')}
                                  className="bg-emerald-500 hover:opacity-90 text-white px-3 py-1.5 rounded-md font-bold transition-all disabled:opacity-50"
                                >
                                  {actionLoading === hospital.id ? 'Updating...' : 'Approve'}
                                </button>
                              ) : (
                                <button
                                  disabled={actionLoading === hospital.id}
                                  onClick={() => handleUpdateHospitalStatus(hospital.id, hospital.adminEmail, 'deactivated')}
                                  className="bg-red-50 text-red-600 hover:bg-red-100 px-3 py-1.5 rounded-md font-bold transition-all disabled:opacity-50"
                                >
                                  {actionLoading === hospital.id ? 'Updating...' : 'Suspend'}
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* TAB: CLINICIANS */}
                {activeTab === 'clinicians' && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 text-xs text-slate-500 font-bold uppercase tracking-wider">
                          <th className="pb-3">Clinician Name</th>
                          <th className="pb-3">Email Address</th>
                          <th className="pb-3">Associated Hospital ID</th>
                          <th className="pb-3">Registration Date</th>
                          <th className="pb-3">Access Status</th>
                          <th className="pb-3 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs">
                        {filteredClinicians.map(clinician => (
                          <tr key={clinician.uid} className="hover:bg-slate-50/50">
                            <td className="py-4 font-bold text-slate-800">{clinician.name}</td>
                            <td className="py-4">{clinician.email}</td>
                            <td className="py-4 font-mono font-bold text-slate-500">{clinician.hospitalId || 'N/A'}</td>
                            <td className="py-4 text-slate-500">{new Date(clinician.createdAt).toLocaleDateString()}</td>
                            <td className="py-4">
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                clinician.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                              }`}>
                                {clinician.status}
                              </span>
                            </td>
                            <td className="py-4 text-right">
                              <button
                                disabled={actionLoading === clinician.uid}
                                onClick={() => handleUpdateUserStatus(clinician.uid, 'clinician', clinician.status)}
                                className={`px-2.5 py-1.5 rounded text-[10px] font-bold border transition-all ${
                                  clinician.status === 'active' ? 'bg-white border-red-200 text-red-600 hover:bg-red-50' : 'bg-blue-500 border-transparent text-white hover:opacity-90'
                                }`}
                              >
                                {clinician.status === 'active' ? 'Block Access' : 'Restore Access'}
                              </button>
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
                          <th className="pb-3">Hospital Reference</th>
                          <th className="pb-3">Created Date</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs">
                        {filteredPatients.map(patient => (
                          <tr key={patient.id} className="hover:bg-slate-50/50">
                            <td className="py-4 font-mono font-bold text-blue-600">{patient.patientId}</td>
                            <td className="py-4 font-bold text-slate-800">{patient.name}</td>
                            <td className="py-4">{patient.gender} • {patient.age} yrs</td>
                            <td className="py-4 font-bold text-indigo-600">
                              {patient.hospitalId === 'personal' ? 'Personal Account' : `Hospital: ${patient.hospitalId}`}
                            </td>
                            <td className="py-4 text-slate-500">{new Date(patient.createdAt).toLocaleDateString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* TAB: AUDIT LOGS */}
                {activeTab === 'audit_logs' && (
                  <div className="space-y-4">
                    <div className="bg-amber-50 border border-amber-200 p-3 rounded-lg text-xs text-amber-800 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 flex-shrink-0" />
                      Platform audit logs capture all clinical actions, including clinician setups, patient modifications, and diagnostic updates.
                    </div>
                    <div className="border border-slate-200 rounded-lg overflow-hidden bg-slate-50">
                      <div className="max-h-[400px] overflow-y-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-100 text-slate-500 font-bold uppercase sticky top-0">
                            <tr>
                              <th className="p-3">Timestamp</th>
                              <th className="p-3">Actor</th>
                              <th className="p-3">Clinic ID</th>
                              <th className="p-3">Action Type</th>
                              <th className="p-3">Audit Details</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200">
                            {auditLogs.map(log => (
                              <tr key={log.id} className="hover:bg-white bg-white/60">
                                <td className="p-3 text-slate-500 font-mono text-[10px] whitespace-nowrap">
                                  {new Date(log.timestamp).toLocaleString()}
                                </td>
                                <td className="p-3 font-semibold text-slate-700">{log.userName}</td>
                                <td className="p-3 font-mono text-indigo-600">{log.hospitalId}</td>
                                <td className="p-3 font-mono font-bold text-xs"><span className="bg-slate-100 border px-1.5 py-0.5 rounded">{log.action}</span></td>
                                <td className="p-3 text-slate-600 italic leading-relaxed">{log.details}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

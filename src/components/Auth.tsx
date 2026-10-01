import React, { useState } from 'react';
import { auth, db } from '../firebase';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  signOut
} from 'firebase/auth';
import { doc, setDoc, getDoc, collection, addDoc, query, where, getDocs } from 'firebase/firestore';
import { 
  Activity, 
  Mail, 
  Lock, 
  Loader2, 
  Building2, 
  Stethoscope, 
  User, 
  ShieldCheck, 
  Phone, 
  MapPin, 
  Calendar, 
  FileCheck,
  ChevronLeft
} from 'lucide-react';
import { motion } from 'motion/react';

interface AuthProps {
  onAuthComplete: () => void;
}

export default function Auth({ onAuthComplete }: AuthProps) {
  const [view, setView] = useState<'login' | 'role-select' | 'register-hospital' | 'register-clinician' | 'register-patient' | 'register-system-admin'>('login');
  
  // Login form states
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  
  // System Admin Registration states
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminSetupCode, setAdminSetupCode] = useState('');

  
  // Registration shared states
  const [regPassword, setRegPassword] = useState('');
  
  // Hospital states
  const [hospName, setHospName] = useState('');
  const [hospEmail, setHospEmail] = useState('');
  const [hospPhone, setHospPhone] = useState('');
  const [hospAddress, setHospAddress] = useState('');
  const [hospCityState, setHospCityState] = useState('');
  const [hospLicense, setHospLicense] = useState('');
  const [hospAdminName, setHospAdminName] = useState('');
  const [hospAdminEmail, setHospAdminEmail] = useState('');

  // Clinician states
  const [clinicianName, setClinicianName] = useState('');
  const [clinicianEmail, setClinicianEmail] = useState('');
  const [clinicianJoinCode, setClinicianJoinCode] = useState('');

  // Patient states
  const [patientName, setPatientName] = useState('');
  const [patientEmail, setPatientEmail] = useState('');
  const [patientPhone, setPatientPhone] = useState('');
  const [patientDob, setPatientDob] = useState('');
  const [patientGender, setPatientGender] = useState('Female');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const calculateAge = (dobString: string): number => {
    if (!dobString) return 0;
    const today = new Date();
    const birthDate = new Date(dobString);
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  const logActivity = async (hospitalId: string, userId: string, userName: string, action: string, details: string) => {
    try {
      await addDoc(collection(db, 'audit_logs'), {
        hospitalId,
        userId,
        userName,
        action,
        details,
        timestamp: new Date().toISOString()
      });
    } catch (e) {
      console.error("Failed to log activity:", e);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const userCredential = await signInWithEmailAndPassword(auth, loginEmail, loginPassword);
      const user = userCredential.user;

      // Check status
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      if (userDoc.exists()) {
        const userData = userDoc.data();
        if (userData.status === 'deactivated') {
          await signOut(auth);
          throw new Error("This account has been deactivated. Please contact your Hospital or Clinic Administrator.");
        }
        
        // Update last login
        await setDoc(doc(db, 'users', user.uid), {
          lastLoginAt: new Date().toISOString()
        }, { merge: true });

        // Log login activity
        await logActivity(
          userData.hospitalId || 'personal',
          user.uid,
          userData.name || user.email || 'User',
          'USER_LOGIN',
          `Logged in successfully as role: ${userData.role}`
        );
      }
      onAuthComplete();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleHospitalRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // 1. Create auth user for administrator
      const userCredential = await createUserWithEmailAndPassword(auth, hospAdminEmail, regPassword);
      const user = userCredential.user;

      // 2. Generate hospital ID and unique clinician join code
      const hospitalId = 'hosp_' + Math.random().toString(36).substring(2, 11);
      const joinCode = 'HOSP-' + Math.random().toString(36).substring(2, 6).toUpperCase();

      // 3. Create hospital document (auto-approved for testing/demo)
      await setDoc(doc(db, 'hospitals', hospitalId), {
        id: hospitalId,
        name: hospName,
        email: hospEmail,
        phone: hospPhone,
        address: hospAddress,
        cityState: hospCityState,
        medicalLicense: hospLicense,
        adminName: hospAdminName,
        adminEmail: hospAdminEmail,
        joinCode: joinCode,
        status: 'active', 
        createdAt: new Date().toISOString()
      });

      // 4. Create user profile
      await setDoc(doc(db, 'users', user.uid), {
        uid: user.uid,
        email: hospAdminEmail,
        name: hospAdminName,
        role: 'hospital_admin',
        hospitalId,
        status: 'active', 
        phone: hospPhone,
        createdAt: new Date().toISOString(),
        lastLoginAt: new Date().toISOString()
      });

      // 5. Log audit trail
      await logActivity(
        hospitalId,
        user.uid,
        hospAdminName,
        'HOSPITAL_REGISTRATION',
        `Hospital "${hospName}" registered by administrator "${hospAdminName}". License: ${hospLicense}. Status: Auto-Approved.`
      );

      setSuccess("Hospital registration submitted successfully! Your account has been automatically approved for this demo.");
      setView('login');
      // Reset fields
      setHospName('');
      setHospEmail('');
      setHospPhone('');
      setHospAddress('');
      setHospCityState('');
      setHospLicense('');
      setHospAdminName('');
      setHospAdminEmail('');
      setRegPassword('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleClinicianRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // 1. Validate join code
      const hospQuery = query(collection(db, 'hospitals'), where('joinCode', '==', clinicianJoinCode.trim().toUpperCase()));
      const hospSnapshot = await getDocs(hospQuery);

      if (hospSnapshot.empty) {
        throw new Error("Invalid Hospital Join Code. Please verify with your Hospital or Clinic Administrator.");
      }

      const hospitalDoc = hospSnapshot.docs[0];
      const hospitalData = hospitalDoc.data();
      const hospitalId = hospitalDoc.id;

      if (hospitalData.status !== 'active') {
        throw new Error("The associated hospital account is currently inactive or pending review. Clinicians cannot register at this time.");
      }

      // 2. Create auth user
      const userCredential = await createUserWithEmailAndPassword(auth, clinicianEmail, regPassword);
      const user = userCredential.user;

      // 3. Create clinician user document
      await setDoc(doc(db, 'users', user.uid), {
        uid: user.uid,
        email: clinicianEmail,
        name: clinicianName,
        role: 'clinician',
        hospitalId,
        status: 'active', 
        createdAt: new Date().toISOString(),
        lastLoginAt: new Date().toISOString()
      });

      // 4. Log audit log
      await logActivity(
        hospitalId,
        user.uid,
        clinicianName,
        'CLINICIAN_REGISTRATION',
        `Clinician "${clinicianName}" registered and linked to "${hospitalData.name}". Status: Auto-Approved.`
      );

      setSuccess(`Account registered successfully under "${hospitalData.name}"! Your access has been automatically approved for this demo.`);
      setView('login');
      setClinicianName('');
      setClinicianEmail('');
      setClinicianJoinCode('');
      setRegPassword('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSystemAdminRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      // Secret code check to prevent unauthorized admin creation
      if (adminSetupCode !== 'PLATFORM-ADMIN-2026') {
        throw new Error("Invalid Setup Key. System Administrator provisioning is restricted.");
      }

      // Create auth user
      const userCredential = await createUserWithEmailAndPassword(auth, adminEmail, regPassword);
      const user = userCredential.user;

      // Create system admin profile
      await setDoc(doc(db, 'users', user.uid), {
        uid: user.uid,
        email: adminEmail,
        name: adminName,
        role: 'system_admin',
        status: 'active',
        createdAt: new Date().toISOString(),
        lastLoginAt: new Date().toISOString()
      });

      await logActivity(
        'system',
        user.uid,
        adminName,
        'SYSTEM_ADMIN_REGISTRATION',
        `New Global Platform Administrator registered: "${adminName}".`
      );

      setSuccess("Platform Administrator registered successfully! You can now log in.");
      setView('login');
      setAdminName('');
      setAdminEmail('');
      setAdminSetupCode('');
      setRegPassword('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePatientRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // 1. Create auth user
      const userCredential = await createUserWithEmailAndPassword(auth, patientEmail, regPassword);
      const user = userCredential.user;

      // 2. Create patient user profile
      await setDoc(doc(db, 'users', user.uid), {
        uid: user.uid,
        email: patientEmail,
        name: patientName,
        role: 'individual_patient',
        hospitalId: 'personal',
        status: 'active', // Patients are active immediately
        phone: patientPhone,
        dob: patientDob,
        gender: patientGender,
        createdAt: new Date().toISOString(),
        lastLoginAt: new Date().toISOString()
      });

      // 3. Create core patient record in patients collection so diagnostics works
      await setDoc(doc(db, 'patients', user.uid), {
        id: user.uid,
        patientId: 'PAT-' + Math.random().toString(36).substring(2, 8).toUpperCase(),
        hospitalId: 'personal',
        name: patientName,
        email: patientEmail,
        phone: patientPhone,
        age: calculateAge(patientDob),
        gender: patientGender,
        createdBy: user.uid,
        createdAt: new Date().toISOString(),
        lastExam: new Date().toISOString()
      });

      // 4. Log activity
      await logActivity(
        'personal',
        user.uid,
        patientName,
        'PATIENT_REGISTRATION',
        `Individual patient account registered directly: "${patientName}".`
      );

      setSuccess("Account registered successfully! You can now log in to access your Patient Dashboard.");
      setView('login');
      setPatientName('');
      setPatientEmail('');
      setPatientPhone('');
      setPatientDob('');
      setRegPassword('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loginDemoUser = async (email: string, pass: string, role: string) => {
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      await signInWithEmailAndPassword(auth, email, pass);
      onAuthComplete();
    } catch (err: any) {
      // If demo user does not exist, auto-provision it dynamically!
      if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
        try {
          const userCred = await createUserWithEmailAndPassword(auth, email, pass);
          const user = userCred.user;

          if (role === 'system_admin') {
            await setDoc(doc(db, 'users', user.uid), {
              uid: user.uid,
              email,
              name: "Global Platform Administrator",
              role: 'system_admin',
              status: 'active',
              createdAt: new Date().toISOString(),
              lastLoginAt: new Date().toISOString()
            });
            await logActivity('system', user.uid, 'Global Platform Administrator', 'DEMO_ADMIN_PROVISIONED', 'Demo System Admin created');
          } else if (role === 'hospital_admin') {
            const hospitalId = 'hosp_demo';
            await setDoc(doc(db, 'hospitals', hospitalId), {
              id: hospitalId,
              name: 'St. Jude Research Hospital',
              email: 'stjude@hospital.com',
              phone: '+1 555-0199',
              address: '123 Healthcare Ave',
              cityState: 'Boston, MA',
              medicalLicense: 'LC-DEMO-77',
              adminName: 'Dr. Sarah Connor',
              adminEmail: email,
              joinCode: 'DEMO77',
              status: 'active',
              createdAt: new Date().toISOString()
            });

            await setDoc(doc(db, 'users', user.uid), {
              uid: user.uid,
              email,
              name: 'Dr. Sarah Connor',
              role: 'hospital_admin',
              hospitalId,
              status: 'active',
              createdAt: new Date().toISOString(),
              lastLoginAt: new Date().toISOString()
            });
            await logActivity(hospitalId, user.uid, 'Dr. Sarah Connor', 'DEMO_HOSPITAL_PROVISIONED', 'Demo Hospital Admin and Hospital Profile created');
          } else if (role === 'clinician') {
            const hospitalId = 'hosp_demo';
            
            // Ensure hospital exists
            const hospCheck = await getDoc(doc(db, 'hospitals', hospitalId));
            if (!hospCheck.exists()) {
              await setDoc(doc(db, 'hospitals', hospitalId), {
                id: hospitalId,
                name: 'St. Jude Research Hospital',
                email: 'stjude@hospital.com',
                phone: '+1 555-0199',
                address: '123 Healthcare Ave',
                cityState: 'Boston, MA',
                medicalLicense: 'LC-DEMO-77',
                adminName: 'Dr. Sarah Connor',
                adminEmail: 'hospital@fibroscan.ai',
                joinCode: 'DEMO77',
                status: 'active',
                createdAt: new Date().toISOString()
              });
            }

            await setDoc(doc(db, 'users', user.uid), {
              uid: user.uid,
              email,
              name: 'Dr. Alex Karev',
              role: 'clinician',
              hospitalId,
              status: 'active',
              createdAt: new Date().toISOString(),
              lastLoginAt: new Date().toISOString()
            });
            await logActivity(hospitalId, user.uid, 'Dr. Alex Karev', 'DEMO_CLINICIAN_PROVISIONED', 'Demo Clinician profile created');
          } else if (role === 'individual_patient') {
            await setDoc(doc(db, 'users', user.uid), {
              uid: user.uid,
              email,
              name: 'Emma Watson',
              role: 'individual_patient',
              hospitalId: 'personal',
              status: 'active',
              phone: '555-123-4567',
              dob: '1990-04-15',
              gender: 'Female',
              createdAt: new Date().toISOString(),
              lastLoginAt: new Date().toISOString()
            });

            await setDoc(doc(db, 'patients', user.uid), {
              id: user.uid,
              patientId: 'PAT-EMMA',
              hospitalId: 'personal',
              name: 'Emma Watson',
              email,
              phone: '555-123-4567',
              age: 36,
              gender: 'Female',
              createdBy: user.uid,
              createdAt: new Date().toISOString(),
              lastExam: new Date().toISOString()
            });
            await logActivity('personal', user.uid, 'Emma Watson', 'DEMO_PATIENT_PROVISIONED', 'Demo Patient profile and record created');
          }

          // Complete login now
          onAuthComplete();
        } catch (innerErr: any) {
          setError(innerErr.message);
        }
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f3f6f9] flex items-center justify-center p-6">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-xl w-full bg-white rounded-2xl border border-[#e2e8f0] shadow-xl p-8 space-y-6"
      >
        <div className="text-center space-y-2">
          <div className="w-12 h-12 bg-[#2563eb] rounded-xl flex items-center justify-center text-white font-bold text-2xl mx-auto">
            φ
          </div>
          <h1 className="text-2xl font-bold text-[#1e293b]">FibroScan AI Support</h1>
          <p className="text-sm text-[#64748b]">Multi-Role Healthcare Management & Diagnostic Hub</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-100 p-3 rounded-lg text-xs text-red-600 font-medium">
            {error}
          </div>
        )}

        {success && (
          <div className="bg-emerald-50 border border-emerald-100 p-3 rounded-lg text-xs text-emerald-700 font-medium">
            {success}
          </div>
        )}

        {/* VIEW: LOGIN */}
        {view === 'login' && (
          <div className="space-y-6">
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-[#64748b] uppercase tracking-wider">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#64748b]" />
                  <input 
                    type="email" 
                    required
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-[#f8fafc] border border-[#e2e8f0] rounded-lg text-sm focus:ring-2 focus:ring-[#2563eb] outline-none transition-all"
                    placeholder="doctor@hospital.com"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-[#64748b] uppercase tracking-wider">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#64748b]" />
                  <input 
                    type="password" 
                    required
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-[#f8fafc] border border-[#e2e8f0] rounded-lg text-sm focus:ring-2 focus:ring-[#2563eb] outline-none transition-all"
                    placeholder="••••••••"
                  />
                </div>
              </div>

              <button 
                type="submit"
                disabled={loading}
                className="w-full bg-[#2563eb] text-white py-3 rounded-lg font-bold text-sm hover:opacity-90 transition-all flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Sign In'}
              </button>
            </form>

            <div className="relative">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-[#e2e8f0]"></div></div>
              <div className="relative flex justify-center text-xs uppercase"><span className="bg-white px-2 text-[#64748b]">Try Quick Demo Login</span></div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button 
                onClick={() => loginDemoUser('admin@fibroscan.ai', 'AdminPass123', 'system_admin')}
                className="py-2.5 px-3 bg-slate-50 border border-slate-200 hover:bg-slate-100 rounded-lg text-xs font-semibold text-slate-700 transition-all flex items-center gap-1.5 justify-center"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
                Sys Admin
              </button>
              <button 
                onClick={() => loginDemoUser('hospital@fibroscan.ai', 'HospitalPass123', 'hospital_admin')}
                className="py-2.5 px-3 bg-slate-50 border border-slate-200 hover:bg-slate-100 rounded-lg text-xs font-semibold text-slate-700 transition-all flex items-center gap-1.5 justify-center"
              >
                <Building2 className="w-3.5 h-3.5 text-blue-600" />
                Hosp Admin
              </button>
              <button 
                onClick={() => loginDemoUser('clinician@fibroscan.ai', 'ClinicianPass123', 'clinician')}
                className="py-2.5 px-3 bg-slate-50 border border-slate-200 hover:bg-slate-100 rounded-lg text-xs font-semibold text-slate-700 transition-all flex items-center gap-1.5 justify-center"
              >
                <Stethoscope className="w-3.5 h-3.5 text-blue-600" />
                Clinician
              </button>
              <button 
                onClick={() => loginDemoUser('patient@fibroscan.ai', 'PatientPass123', 'individual_patient')}
                className="py-2.5 px-3 bg-slate-50 border border-slate-200 hover:bg-slate-100 rounded-lg text-xs font-semibold text-slate-700 transition-all flex items-center gap-1.5 justify-center"
              >
                <User className="w-3.5 h-3.5 text-blue-600" />
                Indiv Patient
              </button>
            </div>

            <p className="text-center text-sm text-[#64748b]">
              Don't have an account?{' '}
              <button 
                onClick={() => setView('role-select')}
                className="text-[#2563eb] font-bold hover:underline"
              >
                Sign Up
              </button>
            </p>
          </div>
        )}

        {/* VIEW: ROLE SELECT */}
        {view === 'role-select' && (
          <div className="space-y-6">
            <div className="flex items-center gap-1">
              <button onClick={() => setView('login')} className="p-1 hover:bg-slate-100 rounded-full transition-colors">
                <ChevronLeft className="w-5 h-5 text-slate-500" />
              </button>
              <h2 className="text-lg font-bold text-[#1e293b]">Choose Registration Type</h2>
            </div>

            <div className="grid grid-cols-1 gap-4">
              <button 
                onClick={() => setView('register-hospital')}
                className="w-full text-left p-5 border border-[#e2e8f0] hover:border-[#2563eb] hover:bg-blue-50/30 rounded-xl transition-all flex items-start gap-4 group"
              >
                <div className="w-12 h-12 bg-blue-100 text-[#2563eb] rounded-lg flex items-center justify-center shrink-0">
                  <Building2 className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-[#1e293b] group-hover:text-[#2563eb] transition-colors">Register as a Hospital or Clinic</h3>
                  <p className="text-xs text-[#64748b] mt-1 leading-relaxed">
                    Create an institutional account to manage departments, staff clinicians, assign roles, and store institutional patient files securely.
                  </p>
                </div>
              </button>

              <button 
                onClick={() => setView('register-clinician')}
                className="w-full text-left p-5 border border-[#e2e8f0] hover:border-[#2563eb] hover:bg-blue-50/30 rounded-xl transition-all flex items-start gap-4 group"
              >
                <div className="w-12 h-12 bg-blue-100 text-[#2563eb] rounded-lg flex items-center justify-center shrink-0">
                  <Stethoscope className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-[#1e293b] group-hover:text-[#2563eb] transition-colors">Join a Hospital as a Clinician</h3>
                  <p className="text-xs text-[#64748b] mt-1 leading-relaxed">
                    Associate your personal clinician profile with a registered healthcare facility using a secure joining code provided by your admin.
                  </p>
                </div>
              </button>

              <button 
                onClick={() => setView('register-patient')}
                className="w-full text-left p-5 border border-[#e2e8f0] hover:border-[#2563eb] hover:bg-blue-50/30 rounded-xl transition-all flex items-start gap-4 group"
              >
                <div className="w-12 h-12 bg-blue-100 text-[#2563eb] rounded-lg flex items-center justify-center shrink-0">
                  <User className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-[#1e293b] group-hover:text-[#2563eb] transition-colors">Register as an Individual Patient</h3>
                  <p className="text-xs text-[#64748b] mt-1 leading-relaxed">
                    Create a secure personal portal. Self-upload pelvic/transvaginal scans, view AI bounding boxes, track history, and request clinical reviews.
                  </p>
                </div>
              </button>
            </div>

            <p className="text-center text-sm text-[#64748b] pt-2">
              Already have an account?{' '}
              <button 
                onClick={() => setView('login')}
                className="text-[#2563eb] font-bold hover:underline"
              >
                Sign In
              </button>
            </p>

            <p className="text-center text-xs text-slate-400 pt-4 border-t border-slate-100">
              Platform Administrator?{' '}
              <button 
                onClick={() => setView('register-system-admin')}
                className="text-slate-500 font-medium hover:text-slate-800 transition-colors underline"
              >
                Admin Setup
              </button>
            </p>
          </div>
        )}

        {/* VIEW: REGISTER SYSTEM ADMIN */}
        {view === 'register-system-admin' && (
          <div className="space-y-6">
            <div className="flex items-center gap-1">
              <button onClick={() => setView('role-select')} className="p-1 hover:bg-slate-100 rounded-full transition-colors">
                <ChevronLeft className="w-5 h-5 text-slate-500" />
              </button>
              <div>
                <h2 className="text-lg font-bold text-[#1e293b]">Platform Administrator Setup</h2>
                <p className="text-xs text-[#64748b]">Restricted provisioning area</p>
              </div>
            </div>

            <form onSubmit={handleSystemAdminRegister} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#334155] mb-1">Admin Full Name <span className="text-red-500">*</span></label>
                <input
                  required
                  type="text"
                  value={adminName}
                  onChange={(e) => setAdminName(e.target.value)}
                  className="w-full p-2.5 bg-[#f8fafc] border border-[#e2e8f0] rounded-xl text-sm focus:ring-2 focus:ring-[#2563eb] focus:border-[#2563eb] outline-none transition-all"
                  placeholder="e.g. System Administrator"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#334155] mb-1">Admin Email Address <span className="text-red-500">*</span></label>
                <input
                  required
                  type="email"
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  className="w-full p-2.5 bg-[#f8fafc] border border-[#e2e8f0] rounded-xl text-sm focus:ring-2 focus:ring-[#2563eb] focus:border-[#2563eb] outline-none transition-all"
                  placeholder="admin@fibroscan.ai"
                />
              </div>
              
              <div>
                <label className="block text-xs font-bold text-[#334155] mb-1">Platform Setup Key <span className="text-red-500">*</span></label>
                <input
                  required
                  type="password"
                  value={adminSetupCode}
                  onChange={(e) => setAdminSetupCode(e.target.value)}
                  className="w-full p-2.5 bg-[#f8fafc] border border-[#e2e8f0] rounded-xl text-sm focus:ring-2 focus:ring-[#2563eb] focus:border-[#2563eb] outline-none transition-all"
                  placeholder="Enter Secret Key"
                />
                <p className="text-[10px] text-slate-500 mt-1">Hint: PLATFORM-ADMIN-2026</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#334155] mb-1">Secure Password <span className="text-red-500">*</span></label>
                <input
                  required
                  type="password"
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  className="w-full p-2.5 bg-[#f8fafc] border border-[#e2e8f0] rounded-xl text-sm focus:ring-2 focus:ring-[#2563eb] focus:border-[#2563eb] outline-none transition-all"
                  placeholder="Create a strong password"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-xl text-sm transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-2"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Provision Admin Account'}
              </button>
            </form>
          </div>
        )}

        {/* VIEW: REGISTER HOSPITAL */}
        {view === 'register-hospital' && (
          <div className="space-y-6">
            <div className="flex items-center gap-1">
              <button onClick={() => setView('role-select')} className="p-1 hover:bg-slate-100 rounded-full transition-colors">
                <ChevronLeft className="w-5 h-5 text-slate-500" />
              </button>
              <div>
                <h2 className="text-lg font-bold text-[#1e293b]">Hospital or Clinic Registration</h2>
                <p className="text-xs text-[#64748b]">Set up your clinic and initial admin credentials</p>
              </div>
            </div>

            <form onSubmit={handleHospitalRegister} className="space-y-4">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/60 space-y-3">
                <p className="text-xs font-bold text-slate-700 uppercase tracking-wide">Hospital Profile</p>
                
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-[#64748b] uppercase">Clinic Name</label>
                    <input type="text" required value={hospName} onChange={(e) => setHospName(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-xs" placeholder="General Clinic" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-[#64748b] uppercase">Medical License #</label>
                    <input type="text" required value={hospLicense} onChange={(e) => setHospLicense(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-xs" placeholder="LIC-99381" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-[#64748b] uppercase">Clinic Email</label>
                    <input type="email" required value={hospEmail} onChange={(e) => setHospEmail(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-xs" placeholder="info@clinic.com" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-[#64748b] uppercase">Clinic Phone</label>
                    <input type="text" required value={hospPhone} onChange={(e) => setHospPhone(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-xs" placeholder="+1 (555) 123-45" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-[#64748b] uppercase">Address</label>
                    <input type="text" required value={hospAddress} onChange={(e) => setHospAddress(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-xs" placeholder="100 Medical Plaza" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-[#64748b] uppercase">City, State</label>
                    <input type="text" required value={hospCityState} onChange={(e) => setHospCityState(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-xs" placeholder="New York, NY" />
                  </div>
                </div>
              </div>

              <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100/60 space-y-3">
                <p className="text-xs font-bold text-blue-800 uppercase tracking-wide">Administrator Credentials</p>
                
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-blue-700 uppercase">Admin Name</label>
                    <input type="text" required value={hospAdminName} onChange={(e) => setHospAdminName(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-xs" placeholder="Dr. Sarah Connor" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-blue-700 uppercase">Admin Personal Email</label>
                    <input type="email" required value={hospAdminEmail} onChange={(e) => setHospAdminEmail(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-xs" placeholder="admin@clinic.com" />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-blue-700 uppercase">Password</label>
                  <input type="password" required value={regPassword} onChange={(e) => setRegPassword(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-xs" placeholder="••••••••" />
                </div>
              </div>

              <button type="submit" disabled={loading} className="w-full bg-[#2563eb] text-white py-3 rounded-lg font-bold text-sm hover:opacity-90 transition-all flex items-center justify-center gap-2">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Register Hospital'}
              </button>
            </form>
          </div>
        )}

        {/* VIEW: REGISTER CLINICIAN */}
        {view === 'register-clinician' && (
          <div className="space-y-6">
            <div className="flex items-center gap-1">
              <button onClick={() => setView('role-select')} className="p-1 hover:bg-slate-100 rounded-full transition-colors">
                <ChevronLeft className="w-5 h-5 text-slate-500" />
              </button>
              <div>
                <h2 className="text-lg font-bold text-[#1e293b]">Clinician Registration</h2>
                <p className="text-xs text-[#64748b]">Associate with your facility to access logs & tools</p>
              </div>
            </div>

            <form onSubmit={handleClinicianRegister} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-[#64748b] uppercase tracking-wider">Hospital Registration / Join Code</label>
                <input 
                  type="text" 
                  required 
                  value={clinicianJoinCode} 
                  onChange={(e) => setClinicianJoinCode(e.target.value)} 
                  className="w-full px-4 py-2.5 bg-yellow-50 border border-yellow-300 rounded-lg text-sm font-semibold tracking-wider text-yellow-800 placeholder-yellow-600/60 focus:ring-2 focus:ring-[#2563eb] outline-none" 
                  placeholder="HOSP-XXXX" 
                />
                <p className="text-[10px] text-amber-600 font-medium">Request this 6-character code from your Hospital Admin to join your facility.</p>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-[#64748b] uppercase tracking-wider">Full Name</label>
                <input type="text" required value={clinicianName} onChange={(e) => setClinicianName(e.target.value)} className="w-full px-4 py-2.5 bg-[#f8fafc] border border-[#e2e8f0] rounded-lg text-sm" placeholder="Dr. Alex Karev" />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-[#64748b] uppercase tracking-wider">Professional Email</label>
                <input type="email" required value={clinicianEmail} onChange={(e) => setClinicianEmail(e.target.value)} className="w-full px-4 py-2.5 bg-[#f8fafc] border border-[#e2e8f0] rounded-lg text-sm" placeholder="karev@hospital.com" />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-[#64748b] uppercase tracking-wider">Password</label>
                <input type="password" required value={regPassword} onChange={(e) => setRegPassword(e.target.value)} className="w-full px-4 py-2.5 bg-[#f8fafc] border border-[#e2e8f0] rounded-lg text-sm" placeholder="••••••••" />
              </div>

              <button type="submit" disabled={loading} className="w-full bg-[#2563eb] text-white py-3 rounded-lg font-bold text-sm hover:opacity-90 transition-all flex items-center justify-center gap-2">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Register Clinician'}
              </button>
            </form>
          </div>
        )}

        {/* VIEW: REGISTER PATIENT */}
        {view === 'register-patient' && (
          <div className="space-y-6">
            <div className="flex items-center gap-1">
              <button onClick={() => setView('role-select')} className="p-1 hover:bg-slate-100 rounded-full transition-colors">
                <ChevronLeft className="w-5 h-5 text-slate-500" />
              </button>
              <div>
                <h2 className="text-lg font-bold text-[#1e293b]">Individual Patient Registration</h2>
                <p className="text-xs text-[#64748b]">Set up your personal, HIPAA-secure diagnostics profile</p>
              </div>
            </div>

            <form onSubmit={handlePatientRegister} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-[#64748b] uppercase tracking-wider">Full Name</label>
                <input type="text" required value={patientName} onChange={(e) => setPatientName(e.target.value)} className="w-full px-4 py-2.5 bg-[#f8fafc] border border-[#e2e8f0] rounded-lg text-sm" placeholder="Emma Watson" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-[#64748b] uppercase tracking-wider">Phone Number</label>
                  <input type="text" required value={patientPhone} onChange={(e) => setPatientPhone(e.target.value)} className="w-full px-4 py-2.5 bg-[#f8fafc] border border-[#e2e8f0] rounded-lg text-sm" placeholder="555-123-4567" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-[#64748b] uppercase tracking-wider">Date of Birth</label>
                  <input type="date" required value={patientDob} onChange={(e) => setPatientDob(e.target.value)} className="w-full px-4 py-2.5 bg-[#f8fafc] border border-[#e2e8f0] rounded-lg text-sm" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-[#64748b] uppercase tracking-wider">Gender</label>
                  <select value={patientGender} onChange={(e) => setPatientGender(e.target.value)} className="w-full px-4 py-2.5 bg-[#f8fafc] border border-[#e2e8f0] rounded-lg text-sm outline-none">
                    <option>Female</option>
                    <option>Male</option>
                    <option>Other</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-[#64748b] uppercase tracking-wider">Email Address</label>
                  <input type="email" required value={patientEmail} onChange={(e) => setPatientEmail(e.target.value)} className="w-full px-4 py-2.5 bg-[#f8fafc] border border-[#e2e8f0] rounded-lg text-sm" placeholder="emma@gmail.com" />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-[#64748b] uppercase tracking-wider">Password</label>
                <input type="password" required value={regPassword} onChange={(e) => setRegPassword(e.target.value)} className="w-full px-4 py-2.5 bg-[#f8fafc] border border-[#e2e8f0] rounded-lg text-sm" placeholder="••••••••" />
              </div>

              <button type="submit" disabled={loading} className="w-full bg-[#2563eb] text-white py-3 rounded-lg font-bold text-sm hover:opacity-90 transition-all flex items-center justify-center gap-2">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create Patient Account'}
              </button>
            </form>
          </div>
        )}
      </motion.div>
    </div>
  );
}

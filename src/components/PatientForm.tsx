import React, { useState } from 'react';
import { db, auth } from '../firebase';
import { collection, addDoc } from 'firebase/firestore';
import { UserPlus, Loader2, X } from 'lucide-react';
import { motion } from 'motion/react';

interface PatientFormProps {
  hospitalId: string;
  onComplete: (patient: any) => void;
  onClose: () => void;
}

export default function PatientForm({ hospitalId, onComplete, onClose }: PatientFormProps) {
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState('Female');
  const [patientId, setPatientId] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;

    setLoading(true);
    try {
      const patientData = {
        patientId,
        name,
        age: parseInt(age),
        gender,
        hospitalId, // Isolate by hospital ID
        createdBy: auth.currentUser.uid,
        createdAt: new Date().toISOString(),
        lastExam: new Date().toISOString()
      };

      const docRef = await addDoc(collection(db, 'patients'), patientData);
      
      // Save Audit trail
      await addDoc(collection(db, 'audit_logs'), {
        hospitalId,
        userId: auth.currentUser.uid,
        userName: auth.currentUser.email || 'Clinician',
        action: 'PATIENT_REGISTRATION',
        details: `Registered new patient "${name}" (MRN: ${patientId}).`,
        timestamp: new Date().toISOString()
      });

      onComplete({ ...patientData, id: docRef.id });
    } catch (error) {
      console.error("Error adding patient:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-6 z-50">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-md w-full bg-white rounded-2xl border border-[#e2e8f0] shadow-2xl overflow-hidden"
      >
        <div className="p-6 border-b border-[#e2e8f0] flex justify-between items-center bg-slate-50">
          <div className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-[#2563eb]" />
            <h2 className="font-bold text-[#1e293b]">New Patient Registration</h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-slate-200 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-bold text-[#64748b] uppercase tracking-wider">Patient ID / MRN</label>
            <input 
              required
              value={patientId}
              onChange={(e) => setPatientId(e.target.value)}
              className="w-full px-4 py-2 bg-[#f8fafc] border border-[#e2e8f0] rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#2563eb]"
              placeholder="e.g. P-22940"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-[#64748b] uppercase tracking-wider">Full Name</label>
            <input 
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2 bg-[#f8fafc] border border-[#e2e8f0] rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#2563eb]"
              placeholder="Jane Doe"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs font-bold text-[#64748b] uppercase tracking-wider">Age</label>
              <input 
                required
                type="number"
                value={age}
                onChange={(e) => setAge(e.target.value)}
                className="w-full px-4 py-2 bg-[#f8fafc] border border-[#e2e8f0] rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#2563eb]"
                placeholder="34"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-bold text-[#64748b] uppercase tracking-wider">Gender</label>
              <select 
                value={gender}
                onChange={(e) => setGender(e.target.value)}
                className="w-full px-4 py-2 bg-[#f8fafc] border border-[#e2e8f0] rounded-lg text-sm outline-none focus:ring-2 focus:ring-[#2563eb]"
              >
                <option>Female</option>
                <option>Male</option>
                <option>Other</option>
              </select>
            </div>
          </div>

          <button 
            type="submit"
            disabled={loading}
            className="w-full bg-[#2563eb] text-white py-3 rounded-lg font-bold text-sm hover:opacity-90 transition-all flex items-center justify-center gap-2 mt-4"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Register Patient'}
          </button>
        </form>
      </motion.div>
    </div>
  );
}

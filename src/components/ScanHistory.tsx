import React, { useState, useEffect } from 'react';
import { db, auth } from '../firebase';
import { collectionGroup, query, getDocs, orderBy, limit, where, onSnapshot } from 'firebase/firestore';
import { History, Calendar, User, ChevronRight, Loader2, AlertCircle, Image as ImageIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface Scan {
  id: string;
  patientId: string;
  patientName?: string;
  imageUrl?: string;
  summary: string;
  recommendation: string;
  timestamp: string;
  clinicianId: string;
  detections: any[];
}

export default function ScanHistory() {
  const [scans, setScans] = useState<Scan[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedScan, setSelectedScan] = useState<Scan | null>(null);

  useEffect(() => {
    if (!auth.currentUser) return;

    const q = query(
      collectionGroup(db, 'scans'), 
      where('clinicianId', '==', auth.currentUser.uid),
      orderBy('timestamp', 'desc'), 
      limit(20)
    );

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const scanData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Scan[];
      setScans(scanData);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching scans:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-xl font-bold text-[#1e293b]">Diagnostic History</h2>
          <p className="text-sm text-[#64748b]">Review recent AI analysis reports across all patients</p>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-[#64748b]">
          <Loader2 className="w-8 h-8 animate-spin mb-2" />
          <p className="text-sm">Retrieving history...</p>
        </div>
      ) : scans.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-[#e2e8f0] p-12 text-center">
          <History className="w-12 h-12 text-[#e2e8f0] mx-auto mb-4" />
          <p className="text-[#64748b] font-medium">No scan history found</p>
          <p className="text-xs text-[#64748b] mt-1">Completed analyses will appear here</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {scans.map((scan) => (
            <motion.div 
              key={scan.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-xl border border-[#e2e8f0] overflow-hidden shadow-sm hover:shadow-md transition-all flex flex-col md:flex-row"
            >
              {/* Scan Preview */}
              <div className="w-full md:w-48 h-48 bg-black flex-shrink-0 relative group">
                {scan.imageUrl ? (
                  <img 
                    src={`data:image/jpeg;base64,${scan.imageUrl}`} 
                    alt="Scan" 
                    className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-white/20">
                    <ImageIcon className="w-8 h-8" />
                  </div>
                )}
                <div className="absolute top-2 left-2 bg-black/60 backdrop-blur px-1.5 py-0.5 rounded text-[9px] font-bold text-white uppercase tracking-tighter">
                  SCAN_DATA
                </div>
              </div>

              {/* Scan Details */}
              <div className="flex-1 p-5 flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h3 className="font-bold text-[#1e293b]">{scan.patientName || 'Unknown Patient'}</h3>
                      <p className="text-[10px] font-bold text-[#2563eb] uppercase tracking-wider">{scan.patientId}</p>
                    </div>
                    <div className="text-right">
                      <div className="text-[11px] font-medium text-[#1e293b]">{new Date(scan.timestamp).toLocaleDateString()}</div>
                      <div className="text-[10px] text-[#64748b]">{new Date(scan.timestamp).toLocaleTimeString()}</div>
                    </div>
                  </div>
                  
                  <div className="bg-slate-50 rounded-lg p-3 border border-slate-100 mb-3">
                    <div className="text-[10px] font-bold text-[#64748b] uppercase mb-1 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3 text-amber-500" />
                      Clinical Summary
                    </div>
                    <p className="text-xs text-[#1e293b] line-clamp-2 leading-relaxed italic">
                      "{scan.summary}"
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between mt-2">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-600">
                    <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                    AI ANALYSIS COMPLETE
                  </div>
                  <button 
                    onClick={() => setSelectedScan(scan)}
                    className="text-xs font-bold text-[#2563eb] hover:underline flex items-center gap-1"
                  >
                    View Full Report
                    <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Full Report Modal */}
      <AnimatePresence>
        {selectedScan && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl"
            >
              <div className="p-6 border-b border-[#e2e8f0] flex justify-between items-center bg-slate-50">
                <div>
                  <h2 className="font-bold text-lg text-[#1e293b]">Diagnostic Report</h2>
                  <p className="text-xs text-[#64748b]">Generated on {new Date(selectedScan.timestamp).toLocaleString()}</p>
                </div>
                <button 
                  onClick={() => setSelectedScan(null)}
                  className="p-2 hover:bg-slate-200 rounded-full transition-colors"
                >
                  <ChevronRight className="w-5 h-5 rotate-90" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="aspect-square bg-black rounded-xl overflow-hidden relative">
                    {selectedScan.imageUrl && (
                      <img 
                        src={`data:image/jpeg;base64,${selectedScan.imageUrl}`} 
                        alt="Scan" 
                        className="w-full h-full object-contain"
                      />
                    )}
                  </div>
                  <div className="space-y-4">
                    <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                      <h4 className="text-[11px] font-bold text-blue-700 uppercase mb-2">Patient Information</h4>
                      <div className="space-y-1">
                        <p className="text-sm font-bold text-[#1e293b]">{selectedScan.patientName}</p>
                        <p className="text-xs text-blue-600 font-medium">ID: {selectedScan.patientId}</p>
                      </div>
                    </div>
                    <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-100">
                      <h4 className="text-[11px] font-bold text-emerald-700 uppercase mb-2">AI Findings</h4>
                      <p className="text-xs text-emerald-800 leading-relaxed">
                        {selectedScan.summary}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-amber-50 p-5 rounded-xl border border-amber-100">
                  <h4 className="text-[11px] font-bold text-amber-700 uppercase mb-2 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    Recommendations
                  </h4>
                  <p className="text-sm text-amber-900 leading-relaxed">
                    {selectedScan.recommendation}
                  </p>
                </div>
              </div>

              <div className="p-4 bg-slate-50 border-t border-[#e2e8f0] text-center">
                <p className="text-[10px] text-[#64748b] font-bold uppercase tracking-widest">
                  Confidential Medical Record • AI-Assisted Analysis
                </p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

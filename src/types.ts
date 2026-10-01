export type UserRole = 'system_admin' | 'hospital_admin' | 'clinician' | 'individual_patient';

export interface UserProfile {
  uid: string;
  email: string;
  name: string;
  role: UserRole;
  hospitalId?: string;
  status: 'active' | 'pending' | 'deactivated';
  phone?: string;
  dob?: string;
  gender?: string;
  createdAt: string;
  lastLoginAt: string;
}

export interface Hospital {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  cityState: string;
  medicalLicense: string;
  adminName: string;
  adminEmail: string;
  joinCode: string;
  status: 'active' | 'pending' | 'deactivated';
  createdAt: string;
}

export interface Patient {
  id: string;
  patientId: string;
  hospitalId: string; // ID of hospital, or 'personal'
  name: string;
  email?: string;
  phone?: string;
  age: number;
  gender: string;
  createdBy: string;
  createdAt: string;
  lastExam: string;
  reviewRequestedHospitalId?: string;
}

export interface Detection {
  box_2d: [number, number, number, number];
  label: string;
  confidence: number;
}

export interface Scan {
  id: string;
  patientId: string;
  patientName?: string;
  imageUrl: string;
  detections: Detection[];
  summary: string;
  recommendation: string;
  clinicianId: string;
  timestamp: string;
  createdAt?: string;
}

export interface AuditLog {
  id: string;
  hospitalId: string;
  userId: string;
  userName: string;
  action: string;
  details: string;
  patientId?: string;
  timestamp: string;
}

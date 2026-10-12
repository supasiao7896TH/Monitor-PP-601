/**
 * Firebase Web config — วางค่าจาก Firebase Console → Project settings → Your apps → Web app
 * (ค่านี้ไม่ใช่ความลับ ใส่ใน repo ได้ — ความปลอดภัยอยู่ที่ firestore.rules)
 *
 * ถ้ายังเป็น placeholder (YOUR_...) แอปจะทำงาน "โหมดทดลองในเครื่อง" (เก็บใน localStorage ไม่ sync)
 */
export const firebaseConfig = {
  apiKey: 'YOUR_API_KEY',
  authDomain: 'YOUR_PROJECT_ID.firebaseapp.com',
  projectId: 'YOUR_PROJECT_ID',
  storageBucket: 'YOUR_PROJECT_ID.firebasestorage.app',
  messagingSenderId: 'YOUR_SENDER_ID',
  appId: 'YOUR_APP_ID',
};

export const isFirebaseConfigured = !Object.values(firebaseConfig).some((v) => String(v).startsWith('YOUR_'));

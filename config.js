// Firebase web config. These values are public by design: access is enforced by firestore.rules.
export const firebaseConfig = {
  apiKey: "AIzaSyACkwcpQF0lq87Fn8KeVRkvT3wtncJU0Hw",
  authDomain: "wiut-mob-tracker.firebaseapp.com",
  projectId: "wiut-mob-tracker",
  storageBucket: "wiut-mob-tracker.firebasestorage.app",
  messagingSenderId: "652162468791",
  appId: "1:652162468791:web:ff7ca5160eca3beead7632"
};

// SHA-256 of the group admin's email (lowercase), so the address is not in the public code.
// Make it with: printf '%s' 'you@example.com' | shasum -a 256
// The email itself must match isAdmin() in firestore.rules.
export const ADMIN_EMAIL_SHA256 = "83dabc5638fa8ba8a6f2562da0ba2612749b9222641b80d75c9d9e432f582a7a";

export const COURSE = {
  code: "7MNST021C",
  title: "Management and Organisational Behaviour",
  task: "Group analytical report: AI at Work, organisational readiness in Uzbekistan",
  organisation: "Frutaseca, dried fruit exporter, Tashkent",
  lecturer: "Dr. Athar Hameed Butt",
  deadline: "2026-11-04T23:59:59+05:00",
  wordTarget: 3000
};

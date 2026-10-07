// Firebase web config. These values are public by design: access is enforced by firestore.rules.
export const firebaseConfig = {
  apiKey: "AIzaSyACkwcpQF0lq87Fn8KeVRkvT3wtncJU0Hw",
  authDomain: "wiut-mob-tracker.firebaseapp.com",
  projectId: "wiut-mob-tracker",
  storageBucket: "wiut-mob-tracker.firebasestorage.app",
  messagingSenderId: "652162468791",
  appId: "1:652162468791:web:ff7ca5160eca3beead7632"
};

// The group admin (personal email). Must match ADMIN_EMAIL in firestore.rules, lowercase.
export const ADMIN_EMAIL = "shokhmaraim@gmail.com";

export const COURSE = {
  code: "7MNST021C",
  title: "Management and Organisational Behaviour",
  task: "Group analytical report: AI at Work, organisational readiness in Uzbekistan",
  lecturer: "Dr. Athar Hameed Butt",
  deadline: "2026-11-04T23:59:59+05:00",
  wordTarget: 3000
};

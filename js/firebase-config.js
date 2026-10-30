// Firebase Web config. Это публичная конфигурация клиентского SDK;
// безопасность обеспечивается Firebase Security Rules, а не сокрытием apiKey.
const firebaseConfig = {
    apiKey: "AIzaSyDNVKW2mVWQm3r1QJbtEv5JiK342Jtldcg",
    authDomain: "edavarnya-app.firebaseapp.com",
    projectId: "edavarnya-app",
    storageBucket: "edavarnya-app.firebasestorage.app",
    messagingSenderId: "1097287328119",
    appId: "1:1097287328119:web:19b212c9b89c161edcc172",
    measurementId: "G-SFGXKS66SQ"
};

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore();

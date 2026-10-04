// Proyecto Firebase "distribuidora-carols" (el mismo de la app y del ERP).
// La web de clientas SIEMPRE trabaja con sesión: sin usuario no se lee ni se escribe nada.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-database.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyCgIOm9B_2BkSoRwJCQaJgrt8mUTj-OnSM",
  authDomain: "distribuidora-carols.firebaseapp.com",
  databaseURL: "https://distribuidora-carols-default-rtdb.firebaseio.com",
  projectId: "distribuidora-carols",
  storageBucket: "distribuidora-carols.firebasestorage.app",
  messagingSenderId: "896145385150",
  appId: "1:896145385150:web:b192f99990609bcd7b20ef",
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app);
export const storage = getStorage(app);

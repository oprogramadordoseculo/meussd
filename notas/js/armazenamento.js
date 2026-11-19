import { firebaseConfig } from "./config.js";

const VERSAO_FIREBASE = "10.12.2";

export function firebaseConfigurado() {
  return Boolean(firebaseConfig?.apiKey && !firebaseConfig.apiKey.startsWith("COLE") && firebaseConfig.projectId);
}

export async function criarArmazenamento() {
  return firebaseConfigurado() ? armazenamentoFirebase() : armazenamentoLocal();
}

async function armazenamentoFirebase() {
  const base = `https://www.gstatic.com/firebasejs/${VERSAO_FIREBASE}/`;
  const [{ initializeApp }, A, F] = await Promise.all([
    import(base + "firebase-app.js"),
    import(base + "firebase-auth.js"),
    import(base + "firebase-firestore.js"),
  ]);
  const app = initializeApp(firebaseConfig);
  const auth = A.getAuth(app);
  await A.setPersistence(auth, A.browserLocalPersistence).catch(() => {});
  let db;
  try {
    db = F.initializeFirestore(app, {
      localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }),
    });
  } catch {
    db = F.getFirestore(app);
  }
  A.getRedirectResult(auth).catch(() => {});

  const colecao = uid => F.collection(db, "usuarios", uid, "notas");
  const usuario = u => u && { uid: u.uid, nome: u.displayName || u.email, email: u.email, foto: u.photoURL };

  return {
    tipo: "nuvem",
    aoMudarUsuario: cb => A.onAuthStateChanged(auth, u => cb(usuario(u))),
    async entrarGoogle() {
      const provedor = new A.GoogleAuthProvider();
      provedor.setCustomParameters({ prompt: "select_account" });
      try {
        await A.signInWithPopup(auth, provedor);
      } catch (e) {
        if (["auth/popup-blocked", "auth/operation-not-supported-in-this-environment", "auth/cancelled-popup-request"].includes(e.code)) {
          await A.signInWithRedirect(auth, provedor);
        } else throw e;
      }
    },
    entrarEmail: (email, senha) => A.signInWithEmailAndPassword(auth, email, senha),
    criarConta: (email, senha) => A.createUserWithEmailAndPassword(auth, email, senha),
    redefinirSenha: email => A.sendPasswordResetEmail(auth, email),
    sair: () => A.signOut(auth),
    novoId: uid => F.doc(colecao(uid)).id,
    assinarNotas(uid, cb, erro) {
      return F.onSnapshot(colecao(uid), { includeMetadataChanges: true }, snap => {
        cb(snap.docs.map(d => ({ id: d.id, ...d.data() })),
           { pendente: snap.metadata.hasPendingWrites, doCache: snap.metadata.fromCache });
      }, erro);
    },
    salvar: (uid, id, dados) => F.setDoc(F.doc(db, "usuarios", uid, "notas", id), dados, { merge: true }),
    apagar: (uid, id) => F.deleteDoc(F.doc(db, "usuarios", uid, "notas", id)),
  };
}

function armazenamentoLocal() {
  const CHAVE = "minhasnotas.local";
  const ouvintes = new Set();
  let notas = {};
  try { notas = JSON.parse(localStorage.getItem(CHAVE)) || {}; } catch {}

  const gravar = () => {
    try { localStorage.setItem(CHAVE, JSON.stringify(notas)); } catch {}
    const lista = Object.entries(notas).map(([id, n]) => ({ id, ...n }));
    ouvintes.forEach(cb => cb(lista, { pendente: false, doCache: false }));
  };
  window.addEventListener("storage", e => {
    if (e.key !== CHAVE) return;
    try { notas = JSON.parse(e.newValue) || {}; } catch {}
    gravar();
  });
  const usuario = { uid: "local", nome: "Este aparelho (modo local)", email: "" };

  return {
    tipo: "local",
    aoMudarUsuario: cb => { setTimeout(() => cb(usuario)); return () => {}; },
    entrarGoogle: async () => {}, entrarEmail: async () => {}, criarConta: async () => {},
    redefinirSenha: async () => {}, sair: async () => {},
    novoId: () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    assinarNotas(uid, cb) {
      ouvintes.add(cb);
      setTimeout(() => cb(Object.entries(notas).map(([id, n]) => ({ id, ...n })), { pendente: false, doCache: false }));
      return () => ouvintes.delete(cb);
    },
    async salvar(uid, id, dados) { notas[id] = { ...(notas[id] || {}), ...dados }; gravar(); },
    async apagar(uid, id) { delete notas[id]; gravar(); },
  };
}

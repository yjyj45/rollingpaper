import { firebaseConfig } from './config.js';
const SDK = 'https://www.gstatic.com/firebasejs/10.14.1/';
const local = ['localhost', '127.0.0.1'].includes(location.hostname);

export async function openStore(teacher = false) {
  if (firebaseConfig) return firebase(teacher);
  if (local) return demo();
  throw new Error('아직 저장 기능이 연결되지 않았어요. 선생님께 알려 주세요.');
}
const msgId = (to, from) => `${to}_${from}`;

async function firebase(teacher) {
  const [{ initializeApp }, F] = await Promise.all([
    import(SDK + 'firebase-app.js'), import(SDK + 'firebase-firestore.js')]);
  const app = initializeApp(firebaseConfig), db = F.getFirestore(app);
  const all = async c => (await F.getDocs(F.collection(db, c))).docs.map(d => ({ id: d.id, ...d.data() }));
  const s = {
    demo: false,
    async getConfig() { const d = await F.getDoc(F.doc(db, 'config/main')); return d.exists() ? d.data() : null; },
    submit: (to, from, text) => F.setDoc(F.doc(db, 'messages', msgId(to, from)),
      { to, from, text, hidden: false, createdAt: F.serverTimestamp() }),
    saveConfig: c => F.setDoc(F.doc(db, 'config/main'), c),
    messages: () => all('messages'),
    placements: () => all('placements'),
    update: (id, p) => F.updateDoc(F.doc(db, 'messages', id), p),
    remove: id => F.deleteDoc(F.doc(db, 'messages', id)),
    saveSeed: (id, seed) => F.setDoc(F.doc(db, 'placements', id), { seed }),
    async wipe() {
      for (const c of ['messages', 'placements']) {
        const docs = (await F.getDocs(F.collection(db, c))).docs;
        for (let i = 0; i < docs.length; i += 400) {
          const b = F.writeBatch(db);
          docs.slice(i, i + 400).forEach(d => b.delete(d.ref));
          await b.commit();
        }
      }
      await F.deleteDoc(F.doc(db, 'config/main'));
    },
    onUser() {}, login() {}, logout() {}
  };
  if (teacher) {
    const A = await import(SDK + 'firebase-auth.js'), auth = A.getAuth(app);
    s.onUser = f => A.onAuthStateChanged(auth, f);
    s.login = () => A.signInWithPopup(auth, new A.GoogleAuthProvider());
    s.logout = () => A.signOut(auth);
  }
  return s;
}

// 내 컴퓨터(localhost)에서만 쓰는 시험 모드. 이 브라우저에만 저장됩니다.
function demo() {
  const K = 'rp-demo', R = () => JSON.parse(localStorage.getItem(K) || '{"config":null,"messages":{},"placements":{}}');
  const W = f => { const d = R(); f(d); localStorage.setItem(K, JSON.stringify(d)); };
  return {
    demo: true,
    getConfig: async () => R().config,
    async submit(to, from, text) {
      const d = R(), id = msgId(to, from);
      if (!d.config?.open || d.messages[id]) throw Object.assign(new Error(), { code: 'permission-denied' });
      W(x => { x.messages[id] = { to, from, text, hidden: false }; });
    },
    saveConfig: async c => W(d => { d.config = c; }),
    messages: async () => Object.entries(R().messages).map(([id, m]) => ({ id, ...m })),
    placements: async () => Object.entries(R().placements).map(([id, p]) => ({ id, ...p })),
    update: async (id, p) => W(d => { Object.assign(d.messages[id], p); }),
    remove: async id => W(d => { delete d.messages[id]; }),
    saveSeed: async (id, seed) => W(d => { d.placements[id] = { seed }; }),
    wipe: async () => localStorage.removeItem(K),
    onUser: f => f({ email: '시험 모드' }), login() {}, logout() {}
  };
}

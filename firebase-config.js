import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js';

import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence
} from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js';

import {
  getFirestore,
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  getDocs,
  writeBatch,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js';

/*
  DÁN CẤU HÌNH FIREBASE CỦA BẠN VÀO PHẦN firebaseConfig BÊN DƯỚI.

  Vào:
  Firebase Console
  → Project settings
  → General
  → Your apps
  → SDK setup and configuration
  → Config

  firebaseConfig không phải mật khẩu Gmail.
  Không dán OAuth Client Secret vào file này.
*/

const firebaseConfig = {
  apiKey: "AIzaSyAIx4s7YPp7xeKpVvJCycd4vzlazmUjv0c",
  authDomain: "dinolink-d6e07.firebaseapp.com",
  projectId: "dinolink-d6e07",
  storageBucket: "dinolink-d6e07.firebasestorage.app",
  messagingSenderId: "990586730629",
  appId: "1:990586730629:web:8d2358378bf3de957351ec"
};

/*
  Kiểm tra xem bạn đã thay cấu hình Firebase thật chưa.
*/

const requiredKeys = [
  'apiKey',
  'authDomain',
  'projectId',
  'messagingSenderId',
  'appId'
];

const configured = requiredKeys.every((key) => {
  const value = String(firebaseConfig[key] || '');

  return value && !value.includes('DAN_');
});

/*
  Thông báo trạng thái cấu hình cho file index.html.
*/

window.handleDinoAuthSetup?.(configured);
window.handleDinoFirestoreSetup?.(configured);

/*
  Chuyển lỗi đăng nhập Firebase sang thông báo tiếng Việt.
*/

window.dinoAuthErrorMessage = (error) => {
  const code = error?.code || error?.message || '';

  const messages = {
    'auth/unauthorized-domain':
      'Tên miền GitHub Pages chưa được thêm vào Authorized domains của Firebase.',

    'auth/popup-blocked':
      'Trình duyệt đã chặn cửa sổ đăng nhập. Hãy cho phép pop-up rồi thử lại.',

    'auth/popup-closed-by-user':
      'Bạn đã đóng cửa sổ đăng nhập Google.',

    'auth/cancelled-popup-request':
      'Một cửa sổ đăng nhập khác đang mở.',

    'auth/network-request-failed':
      'Không thể kết nối Google. Hãy kiểm tra Internet rồi thử lại.',

    'firebase/not-configured':
      'Firebase chưa được cấu hình. Hãy mở file firebase-config.js.'
  };

  return (
    messages[code] ||
    'Đăng nhập Google chưa thành công. Vui lòng thử lại.'
  );
};

/*
  Chuyển lỗi Firestore sang thông báo tiếng Việt.
*/

window.dinoFirestoreErrorMessage = (error) => {
  const code = error?.code || error?.message || '';

  const messages = {
    'permission-denied':
      'Firestore đang từ chối truy cập. Hãy kiểm tra và xuất bản Security Rules.',

    'failed-precondition':
      'Cloud Firestore chưa được tạo hoặc đang thiếu cấu hình cần thiết.',

    unavailable:
      'Cloud Firestore tạm thời không kết nối được. Dữ liệu sẽ thử đồng bộ lại khi có mạng.',

    'firebase/not-configured':
      'Firebase chưa được cấu hình.'
  };

  return (
    messages[code] ||
    'Không thể đồng bộ lịch sử với Cloud Firestore.'
  );
};

/*
  Nếu chưa dán cấu hình Firebase thì khóa chức năng đăng nhập.
*/

if (!configured) {
  window.dinoGoogleLogin = async () => {
    const error = new Error('firebase/not-configured');

    error.code = 'firebase/not-configured';

    throw error;
  };

  window.dinoGoogleLogout = async () => {};
} else {
  /*
    Khởi tạo Firebase.
  */

  const app = initializeApp(firebaseConfig);

  const auth = getAuth(app);

  const db = getFirestore(app);

  const provider = new GoogleAuthProvider();

  /*
    Sử dụng ngôn ngữ trình duyệt.
  */

  auth.useDeviceLanguage();

  /*
    Mỗi lần bấm đăng nhập sẽ cho chọn tài khoản Google.
  */

  provider.setCustomParameters({
    prompt: 'select_account'
  });

  /*
    Giữ trạng thái đăng nhập khi đóng và mở lại trình duyệt.
  */

  await setPersistence(auth, browserLocalPersistence);

  /*
    Loại bỏ các dữ liệu không phù hợp trước khi lưu lên Firestore.
  */

  const clean = (value) => {
    return JSON.parse(JSON.stringify(value));
  };

  /*
    Đường dẫn lịch sử của từng người dùng:
    users/{uid}/history/{historyId}
  */

  const historyRef = (uid) => {
    return collection(db, 'users', uid, 'history');
  };

  const historyDoc = (uid, id) => {
    return doc(db, 'users', uid, 'history', id);
  };

  /*
    Đăng nhập bằng Google.
  */

  window.dinoGoogleLogin = async () => {
    const result = await signInWithPopup(auth, provider);

    return result.user;
  };

  /*
    Đăng xuất Google.
  */

  window.dinoGoogleLogout = async () => {
    return signOut(auth);
  };

  /*
    Lưu thông tin người dùng.
  */

  window.dinoSaveUserProfile = async (uid, profile) => {
    await setDoc(
      doc(db, 'users', uid),
      {
        uid,
        ...clean(profile),
        updatedAt: serverTimestamp()
      },
      {
        merge: true
      }
    );
  };

  /*
    Theo dõi lịch sử theo thời gian thực.
    Khi mở DinoLink trên thiết bị khác bằng cùng Gmail,
    dữ liệu sẽ tự tải về.
  */

  window.dinoListenHistory = (uid, onRows, onError) => {
    const historyQuery = query(
      historyRef(uid),
      orderBy('time', 'desc')
    );

    return onSnapshot(
      historyQuery,

      (snapshot) => {
        const rows = snapshot.docs.map((item) => ({
          id: item.id,
          ...item.data()
        }));

        onRows(rows);
      },

      onError
    );
  };

  /*
    Lưu một link vào lịch sử.
  */

  window.dinoSaveHistoryItem = async (uid, item) => {
    const data = clean(item);

    await setDoc(
      historyDoc(uid, data.id),
      {
        ...data,
        id: data.id,
        userUid: uid,
        updatedAt: serverTimestamp()
      },
      {
        merge: true
      }
    );
  };

  /*
    Cập nhật một lịch sử.
    Ví dụ: người dùng đã bấm nút Mua ngay.
  */

  window.dinoUpdateHistoryItem = async (
    uid,
    id,
    changes
  ) => {
    await updateDoc(
      historyDoc(uid, id),
      {
        ...clean(changes),
        updatedAt: serverTimestamp()
      }
    );
  };

  /*
    Xóa một lịch sử.
  */

  window.dinoDeleteHistoryItem = async (uid, id) => {
    await deleteDoc(historyDoc(uid, id));
  };

  /*
    Chuyển lịch sử cũ trong localStorage lên Firestore
    khi người dùng đăng nhập lần đầu.
  */

  window.dinoMigrateHistory = async (uid, rows) => {
    const validRows = rows.filter((row) => row?.id);

    const uniqueRows = Array.from(
      new Map(
        validRows.map((row) => [row.id, row])
      ).values()
    );

    /*
      Firestore giới hạn số thao tác trong một batch.
      Chia thành từng nhóm 400 bản ghi.
    */

    for (
      let start = 0;
      start < uniqueRows.length;
      start += 400
    ) {
      const batch = writeBatch(db);

      uniqueRows
        .slice(start, start + 400)
        .forEach((item) => {
          const data = clean(item);

          batch.set(
            historyDoc(uid, data.id),
            {
              ...data,
              id: data.id,
              userUid: uid,
              updatedAt: serverTimestamp()
            },
            {
              merge: true
            }
          );
        });

      await batch.commit();
    }
  };

  /*
    Xóa toàn bộ lịch sử của tài khoản.
  */

  window.dinoClearHistory = async (uid) => {
    const snapshot = await getDocs(historyRef(uid));

    const documents = snapshot.docs;

    for (
      let start = 0;
      start < documents.length;
      start += 400
    ) {
      const batch = writeBatch(db);

      documents
        .slice(start, start + 400)
        .forEach((item) => {
          batch.delete(item.ref);
        });

      await batch.commit();
    }
  };

  /*
    Theo dõi trạng thái đăng nhập.
    Khi đăng nhập hoặc đăng xuất, index.html sẽ được thông báo.
  */

  onAuthStateChanged(auth, (user) => {
    window.handleDinoAuthState?.(user);
  });
}

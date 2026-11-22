import { initializeApp } from "firebase/app";
import {
  connectAuthEmulator,
  getAuth,
  GoogleAuthProvider,
  inMemoryPersistence,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from "firebase/auth";

let authReady;

export async function withFirebaseIdentity(role, credentials, exchange) {
  authReady ??= (async () => {
    const config = import.meta.env.VITE_FIREBASE_CONFIG;
    const local = ["127.0.0.1", "localhost"].includes(location.hostname);
    if (!config && !local) throw Error("Firebase sign-in is not configured.");
    const auth = getAuth(
      initializeApp(
        config
          ? JSON.parse(config)
          : {
              apiKey: "demo-niyam-local",
              projectId: "demo-niyam-local",
              authDomain: location.host,
            },
      ),
    );
    if (local)
      connectAuthEmulator(auth, "http://127.0.0.1:9099", {
        disableWarnings: true,
      });
    await setPersistence(auth, inMemoryPersistence);
    return auth;
  })();
  const auth = await authReady;
  try {
    const result =
      role === "admin"
        ? await signInWithEmailAndPassword(
            auth,
            credentials.email,
            credentials.password,
          )
        : await signInWithPopup(auth, new GoogleAuthProvider());
    return await exchange({ idToken: await result.user.getIdToken(), role });
  } catch (error) {
    if (error.code === "auth/popup-closed-by-user")
      throw Error("The Google sign-in window was closed.");
    if (error.code?.startsWith("auth/"))
      throw Error(
        role === "admin"
          ? "Check the administrator email and password."
          : "Google sign-in could not be completed.",
      );
    throw error;
  } finally {
    await signOut(auth).catch(() => {});
  }
}

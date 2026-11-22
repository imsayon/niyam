import { createHash } from "node:crypto";
import { z } from "zod";
import { requireRole } from "./accounts.js";
import { HttpError } from "./store.js";
import { departmentId } from "./firebase-store.js";

export const firebaseAdminEmail = "admin.ise.niyam@dsce.edu.in";
const sessionAge = 5 * 24 * 60 * 60 * 1000;
const hash = (value) => createHash("sha256").update(value).digest("hex");
const emailAddress = (value) => value?.trim().toLowerCase() || "";

function validMember(member, uid, role, address, rosterId) {
  return (
    member?.uid === uid &&
    member.role === role &&
    member.department === departmentId &&
    member.status === "active" &&
    emailAddress(member.email) === address &&
    (role === "admin" || member.rosterId === rosterId)
  );
}

function accountFrom(member, uid) {
  return {
    id: uid,
    name: member.name || member.email,
    email: member.email,
    role: member.role,
    status: member.status,
    rosterId: member.rosterId || null,
    roster_id: member.rosterId || null,
    department: departmentId,
    passwordLogin: false,
    verified: true,
    memberId: member.id || member.memberId,
  };
}

export function firebaseAuthApi(app, store, auth, identity = {}) {
  const adapter = {
    verifyIdToken: identity.verifyIdToken || auth.verifyIdToken.bind(auth),
    verifySessionCookie:
      identity.verifySessionCookie || auth.verifySessionCookie.bind(auth),
    createSessionCookie:
      identity.createSessionCookie || auth.createSessionCookie.bind(auth),
    getUser: identity.getUser || auth.getUser.bind(auth),
    updateUser: identity.updateUser || auth.updateUser.bind(auth),
  };
  const limit = new Map();
  const hostingOrigins = new Set(
    process.env.FUNCTIONS_EMULATOR === "true"
      ? ["http://127.0.0.1:5000", "http://localhost:5000"]
      : [],
  );
  if (process.env.PUBLIC_ORIGIN) hostingOrigins.add(process.env.PUBLIC_ORIGIN);
  const cookieOptions = (secure) => ({
    httpOnly: true,
    sameSite: "strict",
    secure,
    path: "/",
  });

  app.use("/api", async (req, res, next) => {
    res.set("Cache-Control", "private, no-store");
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      const origin = req.get("origin");
      const allowed = req.protocol + "://" + req.get("host");
      if (
        req.get("sec-fetch-site") === "cross-site" ||
        (origin &&
          origin !== allowed &&
          origin !== process.env.DEV_ORIGIN &&
          !hostingOrigins.has(origin))
      )
        throw new HttpError(403, "This request must come from Niyam.");
    }
    const value = req.cookies?.__session;
    if (!value || value.length > 5000) return next();
    let decoded;
    try {
      decoded = await adapter.verifySessionCookie(value, true);
    } catch {
      return next();
    }
    const sessionRef = store.sessionRef(value);
    const [sessionSnapshot, user] = await Promise.all([
      sessionRef.get(),
      adapter.getUser(decoded.uid).catch(() => null),
    ]);
    if (!user) return next();
    const session = sessionSnapshot.data();
    const address = emailAddress(user.email);
    if (
      !session ||
      session.uid !== decoded.uid ||
      session.department !== departmentId ||
      session.expiresAt <= Date.now() ||
      user.disabled ||
      !address ||
      address !== emailAddress(session.email)
    )
      return next();
    if (session.role !== "admin") {
      if (
        !user.emailVerified ||
        !decoded.email_verified ||
        decoded.firebase?.sign_in_provider !== "google.com"
      )
        return next();
      const roster = await store.findRoster(session.role, address);
      if (roster.length !== 1 || roster[0].id !== session.rosterId)
        return next();
    } else if (
      address !== firebaseAdminEmail ||
      decoded.firebase?.sign_in_provider !== "password"
    )
      return next();
    const memberSnapshot = await store.refs.accountMembers
      .doc(session.memberId)
      .get();
    const member = memberSnapshot.exists
      ? { id: memberSnapshot.id, ...memberSnapshot.data() }
      : null;
    if (
      !validMember(member, decoded.uid, session.role, address, session.rosterId)
    )
      return next();
    req.account = accountFrom(member, decoded.uid);
    next();
  });

  app.get("/api/session", (req, res) =>
    res.json({
      account: req.account
        ? {
            id: req.account.id,
            name: req.account.name,
            email: req.account.email,
            role: req.account.role,
            status: req.account.status,
            rosterId: req.account.rosterId,
            passwordLogin: false,
          }
        : null,
      adminEmail: firebaseAdminEmail,
      firebase: true,
      google: true,
      registration: false,
      recovery: false,
    }),
  );

  app.post("/api/session", async (req, res) => {
    const now = Date.now();
    for (const [key, entry] of limit) if (entry.until <= now) limit.delete(key);
    const key = req.ip || "local";
    const entry = limit.get(key) || { count: 0, until: now + 600000 };
    if (++entry.count > 20)
      throw new HttpError(429, "Try again in a few minutes.");
    limit.set(key, entry);
    const body = z
      .object({
        idToken: z.string().min(20).max(5000),
        role: z.enum(["admin", "faculty", "student"]),
        department: z.literal(departmentId).optional(),
      })
      .strict()
      .parse(req.body);
    let decoded;
    let user;
    try {
      decoded = await adapter.verifyIdToken(body.idToken, true);
      user = await adapter.getUser(decoded.uid);
    } catch {
      throw new HttpError(401, "Firebase sign-in is invalid or expired.");
    }
    const address = emailAddress(user.email);
    if (user.disabled || !address || address !== emailAddress(decoded.email))
      throw new HttpError(401, "This Firebase account is unavailable.");
    let rosterId = null;
    if (body.role === "admin") {
      if (
        address !== firebaseAdminEmail ||
        decoded.firebase?.sign_in_provider !== "password"
      )
        throw new HttpError(
          403,
          "The administrator account is not authorized.",
        );
    } else {
      if (
        !user.emailVerified ||
        !decoded.email_verified ||
        decoded.firebase?.sign_in_provider !== "google.com"
      )
        throw new HttpError(
          403,
          "Use a verified Google account for this role.",
        );
      const roster = await store.findRoster(body.role, address);
      if (roster.length !== 1)
        throw new HttpError(
          403,
          "This email must match exactly one active roster entry for the selected role.",
        );
      rosterId = roster[0].id;
    }
    const memberRef = store.memberRef(decoded.uid, body.role);
    const existing = await memberRef.get();
    const member = existing.data();
    if (body.role === "admin" && !existing.exists)
      throw new HttpError(403, "The administrator account is not authorized.");
    if (
      existing.exists &&
      !validMember(
        { ...member, id: existing.id },
        decoded.uid,
        body.role,
        address,
        rosterId,
      )
    )
      throw new HttpError(
        403,
        "This Niyam account is disabled or no longer matches its roster.",
      );
    const cookie = await adapter.createSessionCookie(body.idToken, {
      expiresIn: sessionAge,
    });
    const memberId = memberRef.id;
    await store.department.firestore.runTransaction(async (tx) => {
      const currentMember = await tx.get(memberRef);
      if (body.role === "admin" && !currentMember.exists)
        throw new HttpError(
          403,
          "The administrator account is not authorized.",
        );
      const roleCollection = body.role === "faculty" ? "faculty" : "students";
      const currentRoster =
        body.role === "admin"
          ? null
          : await tx.get(
              store.refs[roleCollection].where("email", "==", address),
            );
      const stateSnapshot = await tx.get(store.stateRef);
      const rows = currentRoster?.docs
        .map((doc) => doc.data())
        .filter(
          (person) =>
            person.department === departmentId &&
            person.status !== "inactive" &&
            person.status !== "disabled" &&
            person.active !== false &&
            emailAddress(person.email) === address,
        );
      if (
        body.role !== "admin" &&
        (rows.length !== 1 || rows[0].id !== rosterId)
      )
        throw new HttpError(
          403,
          "The roster changed during sign-in. Try again.",
        );
      const previous = currentMember.data();
      if (
        currentMember.exists &&
        !validMember(
          { ...previous, id: currentMember.id },
          decoded.uid,
          body.role,
          address,
          rosterId,
        )
      )
        throw new HttpError(
          403,
          "This Niyam account is disabled or no longer matches its roster.",
        );
      const displayName = user.displayName || rows?.[0]?.name || address;
      const record = {
        id: memberId,
        uid: decoded.uid,
        email: address,
        name: previous?.name || displayName,
        role: body.role,
        status: "active",
        department: departmentId,
        rosterId,
        verified: body.role === "admin" || user.emailVerified,
      };
      tx.set(memberRef, record);
      tx.set(store.sessionRef(cookie), {
        uid: decoded.uid,
        email: address,
        role: body.role,
        department: departmentId,
        rosterId,
        memberId,
        expiresAt: Date.now() + sessionAge,
      });
      if (!currentMember.exists) {
        const state = stateSnapshot.data() || { revision: 0, marker: 0 };
        tx.set(store.stateRef, {
          revision: state.revision || 0,
          marker: (state.marker || 0) + 1,
          updatedAt: new Date().toISOString(),
        });
        tx.create(store.refs.audit.doc(), {
          at: new Date().toISOString(),
          actor: decoded.uid,
          action: "account.google_linked",
          target: rosterId || memberId,
        });
      }
    });
    const memberSnapshot = await memberRef.get();
    res
      .cookie("__session", cookie, {
        ...cookieOptions(req.secure),
        maxAge: sessionAge,
      })
      .json({
        account: accountFrom(
          { id: memberId, ...memberSnapshot.data() },
          decoded.uid,
        ),
      });
  });

  app.delete("/api/session", async (req, res) => {
    if (req.cookies?.__session)
      await store.sessionRef(req.cookies.__session).delete();
    res.clearCookie("__session", cookieOptions(req.secure)).json({ ok: true });
  });

  app.patch("/api/profile", async (req, res) => {
    const account = requireRole(req);
    const { name } = z
      .object({ name: z.string().trim().min(2).max(100) })
      .parse(req.body);
    await adapter.updateUser(account.id, { displayName: name });
    const memberRef = store.refs.accountMembers.doc(account.memberId);
    await store.department.firestore.runTransaction(async (tx) => {
      const snapshot = await tx.get(memberRef);
      const stateSnapshot = await tx.get(store.stateRef);
      if (!snapshot.exists) throw new HttpError(401, "Sign in to continue.");
      tx.update(memberRef, { name });
      const state = stateSnapshot.data() || { revision: 0, marker: 0 };
      tx.set(store.stateRef, {
        revision: state.revision || 0,
        marker: (state.marker || 0) + 1,
        updatedAt: new Date().toISOString(),
      });
      tx.create(store.refs.audit.doc(), {
        at: new Date().toISOString(),
        actor: account.id,
        action: "account.profile_updated",
        target: account.memberId,
      });
    });
    res.json({ account: { ...account, name } });
  });

  app.get("/api/accounts", async (req, res) => {
    requireRole(req, "admin");
    const members = await store.listMembers();
    res.json(
      members.map((member) => ({
        id: member.id,
        name: member.name,
        email: member.email,
        role: member.role,
        status: member.status,
        rosterId: member.rosterId,
        verified: member.verified,
      })),
    );
  });
}

import {
  createAuthServer,
  NEON_AUTH_SESSION_CHALLENGE_COOKIE_NAME as challenge,
  NEON_AUTH_SESSION_DATA_COOKIE_NAME as sessionData,
  parseSetCookies,
  processAuthMiddleware,
  validateSessionData,
} from "@neon/auth/server";

export function googleAuth(origin) {
  const { NEON_AUTH_URL: baseUrl, NEON_AUTH_COOKIE_SECRET: cookieSecret } =
    process.env;
  if (!baseUrl || !cookieSecret || !origin) return null;

  return {
    async start(res, callbackURL) {
      const auth = createAuthServer({
        baseUrl,
        cookieSecret,
        sameSite: "lax",
        context: () => ({
          getCookies: () => "",
          getHeader: () => null,
          getOrigin: () => origin,
          getFramework: () => "express",
          setCookie(name, value, options) {
            if (name === challenge) {
              const { maxAge, ...flags } = options;
              res.cookie(name, value, {
                ...flags,
                path: callbackURL.pathname,
                maxAge: (maxAge ?? 600) * 1000,
              });
            }
          },
        }),
      });
      const { data, error } = await auth.signIn.social({
        provider: "google",
        callbackURL: callbackURL.href,
        errorCallbackURL: callbackURL.href,
      });
      return error ? null : data?.url;
    },
    async finish(req, res, callbackURL) {
      const cookie = req.cookies[challenge];
      res.clearCookie(challenge, {
        path: callbackURL.pathname,
        sameSite: "lax",
        secure: true,
        httpOnly: true,
      });
      if (
        !cookie ||
        !callbackURL.searchParams.has("neon_auth_session_verifier")
      )
        return null;
      const result = await processAuthMiddleware({
        request: new Request(callbackURL, {
          headers: { cookie: challenge + "=" + encodeURIComponent(cookie) },
        }),
        pathname: callbackURL.pathname,
        skipRoutes: [callbackURL.pathname],
        loginUrl: "/",
        baseUrl,
        cookieSecret,
      });
      if (result.action !== "redirect_oauth") return null;
      const signed = result.cookies
        .flatMap(parseSetCookies)
        .find((item) => item.name === sessionData);
      if (!signed) return null;
      const { valid, payload } = await validateSessionData(
        signed.value,
        cookieSecret,
      );
      return valid && payload?.user?.emailVerified === true
        ? payload.user.email
        : null;
    },
  };
}

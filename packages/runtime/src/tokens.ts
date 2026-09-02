import { SignJWT, jwtVerify } from "jose";

/** Access-token claims. 15-minute lifetime; the session id lets revocation bite within a refresh. */
export interface AccessClaims {
  sub: string;
  sid: string;
  /** Grant version at issue time; a bump invalidates cached grants within 60 s (RBAC-6). */
  gv: number;
}

const ACCESS_TTL_SECONDS = 15 * 60;

export function createTokenService(secret: string) {
  const key = new TextEncoder().encode(secret);
  return {
    accessTtlSeconds: ACCESS_TTL_SECONDS,
    async issueAccess(claims: AccessClaims): Promise<string> {
      return new SignJWT({ sid: claims.sid, gv: claims.gv })
        .setProtectedHeader({ alg: "HS256" })
        .setSubject(claims.sub)
        .setIssuedAt()
        .setExpirationTime(`${String(ACCESS_TTL_SECONDS)}s`)
        .sign(key);
    },
    async verifyAccess(token: string): Promise<AccessClaims | null> {
      try {
        const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
        if (typeof payload.sub !== "string" || typeof payload.sid !== "string") return null;
        return {
          sub: payload.sub,
          sid: payload.sid,
          gv: typeof payload.gv === "number" ? payload.gv : 0,
        };
      } catch {
        return null;
      }
    },
  };
}

export type TokenService = ReturnType<typeof createTokenService>;

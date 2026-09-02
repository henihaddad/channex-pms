import { PERMISSIONS, SENSITIVE_PERMISSIONS, SYSTEM_ROLES, systemRole } from "@pms/authz";
import { publicRoute } from "@/server/public";

/** RBAC-8: the permission catalogue is introspectable. Role contents are public knowledge (they are in the spec). */
export const GET = publicRoute("catalogue", async () =>
  Response.json({
    permissions: PERMISSIONS,
    sensitive: [...SENSITIVE_PERMISSIONS],
    roles: Object.fromEntries(
      SYSTEM_ROLES.map((r) => [
        r,
        { allow: [...systemRole(r).allow], stepUp: [...systemRole(r).stepUp] },
      ]),
    ),
  }),
);

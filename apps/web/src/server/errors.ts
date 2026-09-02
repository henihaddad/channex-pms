/** RFC 9457 problem details. Every denial carries a stable code and, for 403s, the missing permission (RBAC-7). */
export class HttpProblem extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly title: string,
    readonly detail?: string,
    readonly extras: Record<string, unknown> = {},
  ) {
    super(detail ?? title);
    this.name = "HttpProblem";
  }

  toResponse(requestId?: string): Response {
    return Response.json(
      {
        type: `https://channex-pms.dev/problems/${this.code}`,
        title: this.title,
        status: this.status,
        detail: this.detail,
        code: this.code,
        requestId,
        ...this.extras,
      },
      { status: this.status, headers: { "content-type": "application/problem+json" } },
    );
  }
}

export const unauthorized = () => new HttpProblem(401, "unauthenticated", "Sign in required");
export const forbidden = (missing: string, reason: string) =>
  new HttpProblem(403, "forbidden", "Permission denied", `Missing permission ${missing}`, {
    missing,
    reason,
  });
export const stepUpRequired = (permission: string) =>
  new HttpProblem(
    403,
    "step_up_required",
    "Re-authentication required",
    `${permission} requires recent authentication`,
    { permission },
  );
export const badRequest = (detail: string, issues?: unknown) =>
  new HttpProblem(400, "bad_request", "Invalid input", detail, issues ? { issues } : {});
export const notFound = () => new HttpProblem(404, "not_found", "Not found");

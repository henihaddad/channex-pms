import { forbidden, notFound, redirect } from "next/navigation";
import { HttpProblem } from "./errors";

/**
 * Server components cannot set status codes, so a permission failure inside a
 * page becomes a Next interrupt: 401 redirects to sign-in, 403 renders
 * `forbidden.tsx` with a 403 status, 404 renders not-found. Anything else is a bug.
 */
export async function guard<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof HttpProblem) {
      if (e.status === 401) redirect("/login");
      if (e.status === 403 && e.code === "step_up_required") redirect("/step-up");
      if (e.status === 403) forbidden();
      if (e.status === 404) notFound();
    }
    throw e;
  }
}

import { cookies } from "next/headers";
import {
  ADMIN_COOKIE,
  verifyAdminToken,
} from "../../lib/adminSession";
import AdminLogin from "./AdminLogin";

export const dynamic = "force-dynamic";

/**
 * Server-side gate for the entire /admin tree. When the admin_session
 * cookie is missing or invalid we render the login form instead of the
 * actual admin page, so no admin markup is ever sent to unauthenticated
 * visitors.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const jar = await cookies();
  const authed = verifyAdminToken(jar.get(ADMIN_COOKIE)?.value);
  if (!authed) {
    return <AdminLogin />;
  }
  return <>{children}</>;
}

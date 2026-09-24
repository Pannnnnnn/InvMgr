import { RequireClearance } from '@/components/RequireClearance';
import { AdminUsersPanel } from '@/components/AdminUsersPanel';

/**
 * Owner-only approval panel (PRD-adjacent, 2026-09-24 registration update):
 * lists everyone who has self-registered via /register and lets the owner
 * (clearance 1) approve them at clearance 1 (dev/owner) or 2 (manager), or
 * reject/revoke access. Real enforcement is server-side (requireOwner() in
 * src/lib/auth.ts) — this page is gated with min={1}.
 */
export default function AdminPage() {
  return (
    <RequireClearance min={1}>
      <AdminUsersPanel />
    </RequireClearance>
  );
}

# Moo Farm API Reference — Phase 1 (`/api/v1`)

All responses use a consistent JSON envelope:

- **Success:** `{ "success": true, "data": { ... }, "meta": { "serverTime": "...", "nairobiDate": "YYYY-MM-DD", "timezone": "Africa/Nairobi" } }`
- **Error:** `{ "success": false, "error": { "code": "...", "message": "...", "details"?: ... } }`

## Health

| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/health` | Public | Service health check & Nairobi server clock |

## Authentication (`/api/v1/auth`)

| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/auth/register` | Public | Register a new Farm Owner (`fullName`, `phone`, optional `email`, `password`, optional `farmName`, `farmLocation`) |
| `POST` | `/api/v1/auth/login` | Public | Sign in with phone number (or email for owners) + password; sets `HttpOnly` refresh cookie |
| `POST` | `/api/v1/auth/invitations/accept` | Public | Farm Assistant joins a farm using `phone`, `inviteCode`, `fullName`, and `password` (no email required) |
| `POST` | `/api/v1/auth/refresh` | Cookie | Rotate refresh token and issue a fresh access token (includes reuse detection) |
| `POST` | `/api/v1/auth/logout` | Optional | Revoke refresh token and clear session cookie |
| `GET` | `/api/v1/auth/me` | Bearer | Current user profile, active farm memberships, and resolved effective permissions |
| `PATCH` | `/api/v1/auth/me` | Bearer | Update display name or preferred locale (`en` / `sw`) |

## Farms (`/api/v1/farms`)

| Method | Endpoint | Permission | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/farms` | Authenticated | List all active farms where caller has membership |
| `POST` | `/api/v1/farms` | Owner account | Create a new farm (strictly blocked for Assistant accounts) |
| `GET` | `/api/v1/farms/:farmId` | `farm.view` | Get farm profile and caller's effective permissions |
| `PATCH` | `/api/v1/farms/:farmId` | `farm.manage` | Update farm profile and milk drop alert thresholds |
| `DELETE` | `/api/v1/farms/:farmId` | `farm.manage` | Soft-archive a farm |
| `GET` | `/api/v1/farms/:farmId/dashboard` | `farm.view` | Permission-aware operational dashboard (`recentActivity` and `pendingInvitationsCount` returned only if permitted) |

## Team, Assistant Invitations & Audit (`/api/v1/farms/:farmId`)

| Method | Endpoint | Permission | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/farms/:farmId/members` | `users.manage` | List farm members, roles, effective permissions, and configurable overrides |
| `POST` | `/api/v1/farms/:farmId/members/invitations` | `users.manage` | Create a 72-hour single-use phone invitation (`XXXX-XXXX`) for a Farm Assistant |
| `GET` | `/api/v1/farms/:farmId/members/invitations` | `users.manage` | List pending and historical farm invitations |
| `DELETE` | `/api/v1/farms/:farmId/members/invitations/:invitationId` | `users.manage` | Revoke a pending invitation |
| `PATCH` | `/api/v1/farms/:farmId/members/:membershipId/permissions` | `users.manage` | Toggle owner-configurable permissions (`payments.view`, `payments.create`, `milk.update`) for an assistant |
| `PATCH` | `/api/v1/farms/:farmId/members/:membershipId/status` | `users.manage` | Suspend, reactivate, or remove an assistant |
| `GET` | `/api/v1/farms/:farmId/audit-logs` | `audit.view` | Paginated farm activity and audit trail |

# Moo Farm — Offline-First Dairy Farm Management Application

Modern, offline-first dairy farm management web application (PWA) designed for smallholder dairy farmers in Kenya.

- **Timezone:** `Africa/Nairobi` (UTC+3)
- **Currency:** Kenyan Shillings (`KES`)
- **Units:** Milk in litres (`Decimal`)
- **Authentication:** Phone-first (Kenyan `+254` normalization; Farm Assistants authenticate exclusively with phone number + owner invite code)
- **Database:** PostgreSQL (Supabase) via Prisma ORM

## Project Structure

```text
moo-farm/
├── backend/         # Node.js + TypeScript + Express + Prisma REST API (/api/v1)
├── frontend/        # React + TypeScript + Vite + Tailwind + TanStack Query + Zustand + Dexie PWA
└── docs/            # API documentation & phase progress notes
```

## Implemented Phases

### Phase 1: Foundation and Authentication (Complete)
- Modular Express + TypeScript backend (`/api/v1`) with centralized error handling, Zod validation, Helmet, CORS, rate limiting, and audit logging.
- Normalized PostgreSQL/Prisma foundation schema (`User`, `RefreshToken`, `Farm`, `Role`, `Permission`, `RolePermission`, `FarmMembership`, `FarmMembershipPermission`, `FarmInvitation`, `AuditLog`, `SyncOperation`).
- Phone-first authentication (`+254` normalization; Farm Assistants authenticate exclusively with phone number + owner invite code), rotating `HttpOnly` refresh cookies with reuse detection, backend-enforced farm isolation, RBAC, and audit logging.
- Mobile-first React PWA shell with permission-aware navigation, multi-farm switcher, English/Kiswahili (`en`/`sw`) i18n scaffolding, and Dexie IndexedDB foundation.

### Phase 2: Core Dairy Operations (Complete)
- **Cow Profiles & Herd Management:** Cow profiles with cow-name initials avatars, unique tag numbers per farm, origin/breed/status tracking, single-cow hero optimization, and multi-cow filtering.
- **Milk Production Management:** Fast Morning/Evening milking entry with automatic 1-cow selection and Nairobi time session defaults, home/sold/spoiled allocation tracking, database + API duplicate session prevention (`uq_active_milk_session`), non-destructive correction workflow, Recharts daily trend chart, and rolling-baseline production drop alerts.
- **Customers, Deliveries & Payments:** Customer supply agreements with KES/L price snapshots, 1-tap daily delivery checklist, milk supply vs customer demand shortage alerts, transactional FIFO payment allocation (`CASH`, `M-Pesa`, `BANK`, `OTHER`), customer running-balance statements, owner-only payment voiding, and strict assistant financial visibility controls.
- See [docs/API_PHASE1.md](docs/API_PHASE1.md) and [docs/API_PHASE2.md](docs/API_PHASE2.md) for endpoint details.

## Running Locally

### 1. Backend
```bash
cd backend
cp .env.example .env   # Configure DATABASE_URL, DIRECT_URL, and JWT_ACCESS_SECRET
npm install
npx prisma generate
npx prisma db push
npm run prisma:seed
npm run dev
```

### 2. Frontend
```bash
cd frontend
npm install
npm run dev
```

The frontend runs on `http://localhost:5173` and proxies `/api` requests to `http://localhost:4000`.

## Running Tests

```bash
# Backend unit & integration tests (Auth, RBAC, Multi-Farm Isolation)
cd backend && npm test

# Frontend unit & permission-aware UI tests
cd frontend && npm test
```

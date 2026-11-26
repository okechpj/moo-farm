# Moo Farm API Reference — Phase 2 Core Dairy Operations (`/api/v1/farms/:farmId`)

All endpoints require `Authorization: Bearer <accessToken>` and active farm membership (`requireFarmMembership`).

## Animals (`/animals`)

| Method | Endpoint | Permission | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/animals` | `animals.view` | List active cows (or `?includeArchived=true`) with today's milk litres; `purchasePriceKes` returned only if caller has `expenses.view` |
| `POST` | `/animals` | `animals.create` | Add a cow (enforces unique normalized tag number per farm) |
| `GET` | `/animals/:animalId` | `animals.view` | Cow profile and recent milking records |
| `PATCH` | `/animals/:animalId` | `animals.update` | Update cow details or status (`MILKING`, `DRY`, `PREGNANT`, `SOLD`, `DECEASED`, `OTHER`) |
| `POST` | `/animals/:animalId/archive` | `animals.archive` | Soft-archive a cow profile |

## Milk Production (`/milk`)

| Method | Endpoint | Permission | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/milk` | `milk.view` | List active (non-superseded) milk entries filtered by `animalId`, `from`, `to`, `session` |
| `POST` | `/milk` | `milk.create` | Record Morning/Evening milking + home/sold/spoiled allocations; prevents duplicate active `(farmId, animalId, recordDate, session)` (`409`) |
| `POST` | `/milk/:recordId/correct` | `milk.update` | Formal non-destructive correction workflow (supersedes original record with `correctionReason` and audit log) |
| `GET` | `/milk/summary` | `milk.view` | Today's AM/PM/total/available milk, 7-day & 30-day totals, average daily output, 14-day daily chart series, and rolling-baseline production drop alerts |
| `GET` | `/milk/supply-balance` | `milk.view` | Compares milk available for sale against active customer expected daily demand and delivered litres, flagging shortages |

## Customers (`/customers`)

| Method | Endpoint | Permission | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/customers` | `customers.view` | List customers with calculated KES balances (`balance` is `null` if caller lacks `payments.view`) |
| `POST` | `/customers` | `customers.manage` | Add customer with Kenyan phone normalization, agreed `KES/L` price, and expected daily litres |
| `GET` | `/customers/:customerId` | `customers.view` | Customer details, balance summary (if permitted), and recent deliveries |
| `PATCH` | `/customers/:customerId` | `customers.manage` | Update customer profile, agreed pricing, daily expected quantity, or status |
| `GET` | `/customers/:customerId/statement` | `payments.view` | Chronological customer account statement (deliveries + payments with running KES balance) |

## Milk Deliveries (`/deliveries`)

| Method | Endpoint | Permission | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/deliveries` | `deliveries.view` | List deliveries filtered by `date`, `from`, `to`, `customerId`, `deliveryStatus` |
| `GET` | `/deliveries/daily-checklist` | `deliveries.view` | 1-tap daily delivery checklist for all active customers + supply-vs-demand status |
| `POST` | `/deliveries` | `deliveries.create` | Record delivery using customer's agreed `KES/L` price snapshot from DB (assistants cannot alter pricing) |
| `PATCH` | `/deliveries/:deliveryId` | `deliveries.update` | Owner update of delivery quantity or status (prevents cancelling deliveries with allocated payments) |

## Payments (`/payments`)

| Method | Endpoint | Permission | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/payments` | `payments.view` | List customer payments filtered by `customerId`, `from`, `to` |
| `POST` | `/payments` | `payments.create` | Transactional payment recording (`CASH`, `MPESA`, `BANK`, `OTHER`) with FIFO allocation across oldest unpaid deliveries |
| `POST` | `/payments/:paymentId/void` | `payments.manage` | Owner-only transactional voiding reversing delivery allocations while preserving full history & audit log |

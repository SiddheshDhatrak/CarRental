# Car Rental Backend

Express + MySQL API for the car rental project.

## Setup

1. Install dependencies

```bash
npm install
```

2. Configure environment

Create a local .env file from .env.example and edit values:

```bash
cp .env.example .env
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Required values:
- PORT (default 3000)
- DB_HOST
- DB_PORT
- DB_USER
- DB_PASSWORD
- DB_NAME
- CORS_ORIGIN (frontend URL)
- ADMIN_API_KEY

Optional values:
- RESET_FLEET_ON_STARTUP (`true`/`false`).

Dev note:
- When the backend is started with `npm run dev` (`node --watch`), the API automatically marks all cars as available again at startup and moves any `CONFIRMED` bookings to `COMPLETED`.
- Set `RESET_FLEET_ON_STARTUP=false` to disable this behavior, or `true` to force it even outside watch mode.

3. Ensure MySQL schema is loaded

From project root:

```bash
mysql -u root -p < schema.sql
```

4. Start API

```bash
npm start
```

## Endpoints

Public:
- GET /api/health
- GET /api/cars
- POST /api/rent
- GET /api/bookings?email=<email>
- PATCH /api/bookings/:bookingId/cancel

Admin (header x-admin-key required):
- GET /api/admin/bookings
- PATCH /api/admin/bookings/:bookingId/status
- POST /api/admin/cars
- PATCH /api/admin/cars/:carId

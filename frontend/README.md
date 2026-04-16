# DriveNow Scroll - Car Rental Website

A compact full-stack rental platform with a cinematic scroll interface, animated with Framer Motion and inspired by 21st.dev visual patterns.

## Features

- Full-page scroll storytelling landing with section-based navigation.
- Framer Motion animations: reveal transitions, hover lift, modal transitions, and live scroll progress bar.
- Fleet catalog with real-time availability and transparent per-day pricing.
- Booking modal with instant server-side lock so booked cars become unavailable to everyone else.
- Transaction-safe availability and bookings persisted in MySQL.

## Tech Stack

- React + Vite frontend.
- Separate Node.js + Express backend in ../backend.
- MySQL 8+ (InnoDB) for cars, customers, and bookings.
- Framer Motion for advanced animation and scroll interaction.
- 21st.dev package included for ecosystem compatibility and design workflow.

## Database Setup

1. Create database schema from the root project SQL file

```bash
mysql -u root -p < ../schema.sql
```

2. Set optional environment variables (defaults shown)

```bash
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=car_rental
DB_CONNECTION_LIMIT=10
```

## Run Locally

1. Install frontend dependencies

```bash
npm install
```

2. Start frontend

```bash
npm start
```

3. In a second terminal, start backend

```bash
cd ../backend
npm install
npm start
```

4. Production preview (frontend)

```bash
npm run build
npm run preview
```

5. Open http://localhost:5173

## API

- GET /api/cars
- POST /api/rent
- GET /api/bookings?email=<customer_email>
- PATCH /api/bookings/:bookingId/cancel
- GET /api/admin/bookings
- PATCH /api/admin/bookings/:bookingId/status
- POST /api/admin/cars
- PATCH /api/admin/cars/:carId

## Notes

- Booking writes are wrapped in SQL transactions and lock car rows with `FOR UPDATE` to prevent double booking.

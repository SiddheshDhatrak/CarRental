# DriveNow Scroll - Car Rental Website

A compact full-stack rental platform with a cinematic scroll interface, animated with Framer Motion and inspired by 21st.dev visual patterns.

## Features

- Full-page scroll storytelling landing with section-based navigation.
- Framer Motion animations: reveal transitions, hover lift, modal transitions, and live scroll progress bar.
- Fleet catalog with real-time availability and transparent per-day pricing.
- Booking modal with instant server-side lock so booked cars become unavailable to everyone else.
- Shared availability state persisted in data/cars.json.

## Tech Stack

- Node.js + Express for APIs and production static hosting.
- React + Vite frontend.
- Framer Motion for advanced animation and scroll interaction.
- 21st.dev package included for ecosystem compatibility and design workflow.

## Run Locally

1. Install dependencies

```bash
npm install
```

2. Development mode (API server + Vite frontend)

```bash
npm run dev
```

3. Production build and serve

```bash
npm run build
npm start
```

4. Open http://localhost:3000

## API

- GET /api/cars
- POST /api/rent

## Notes

- This project is intentionally lightweight and file-based.
- For production-grade systems, migrate availability and reservations to a transactional database.

const express = require("express");
const mysql = require("mysql2/promise");
const path = require("node:path");

const app = express();
const PORT = process.env.PORT || 3000;
const CLIENT_DIR = path.join(__dirname, "dist");

const pool = mysql.createPool({
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "car_rental",
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
  queueLimit: 0,
});

app.use(express.json());

function mapCarRow(row) {
  const available = Boolean(row.available);
  const car = {
    id: row.id,
    name: row.name,
    category: row.category,
    seats: row.seats,
    transmission: row.transmission,
    fuel: row.fuel,
    pricePerDay: Number(row.pricePerDay),
    image: row.image,
    available,
  };

  if (!available && row.customerName && row.customerEmail && row.rentalDays && row.bookedAt) {
    car.rentalInfo = {
      customerName: row.customerName,
      customerEmail: row.customerEmail,
      rentalDays: row.rentalDays,
      bookedAt: new Date(row.bookedAt).toISOString(),
    };
  }

  return car;
}

async function fetchFleet(connection = pool) {
  const [rows] = await connection.query(
    `
      SELECT
        c.public_code AS id,
        c.name,
        c.category,
        c.seats,
        c.transmission,
        c.fuel,
        c.price_per_day AS pricePerDay,
        c.image_url AS image,
        c.is_available AS available,
        cu.full_name AS customerName,
        cu.email AS customerEmail,
        b.rental_days AS rentalDays,
        b.booked_at AS bookedAt
      FROM cars c
      LEFT JOIN (
        SELECT b1.*
        FROM bookings b1
        JOIN (
          SELECT car_id, MAX(booking_id) AS latest_booking_id
          FROM bookings
          WHERE booking_status = 'CONFIRMED'
          GROUP BY car_id
        ) latest ON latest.latest_booking_id = b1.booking_id
      ) b ON b.car_id = c.car_id
      LEFT JOIN customers cu ON cu.customer_id = b.customer_id
      ORDER BY c.public_code
    `
  );

  return rows.map(mapCarRow);
}

async function reserveCar({ carId, customerName, customerEmail, rentalDays }) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [carRows] = await connection.query(
      `SELECT car_id, name, is_available FROM cars WHERE public_code = ? FOR UPDATE`,
      [carId]
    );

    if (carRows.length === 0) {
      const err = new Error("Car not found");
      err.statusCode = 404;
      throw err;
    }

    if (!carRows[0].is_available) {
      const err = new Error("Car already rented");
      err.statusCode = 409;
      throw err;
    }

    const normalizedName = customerName.trim();
    const normalizedEmail = customerEmail.trim().toLowerCase();

    await connection.query(
      `
        INSERT INTO customers (full_name, email)
        VALUES (?, ?)
        ON DUPLICATE KEY UPDATE
          full_name = VALUES(full_name)
      `,
      [normalizedName, normalizedEmail]
    );

    const [customerRows] = await connection.query(
      `SELECT customer_id FROM customers WHERE email = ? LIMIT 1`,
      [normalizedEmail]
    );

    const customerId = customerRows[0].customer_id;
    const [bookingResult] = await connection.query(
      `
        INSERT INTO bookings
          (customer_id, car_id, rental_days, start_date, booking_status, total_amount)
        VALUES
          (?, ?, ?, CURRENT_DATE, 'CONFIRMED', 0)
      `,
      [customerId, carRows[0].car_id, rentalDays]
    );

    await connection.commit();

    const [fleetRows] = await connection.query(
      `
        SELECT
          c.public_code AS id,
          c.name,
          c.category,
          c.seats,
          c.transmission,
          c.fuel,
          c.price_per_day AS pricePerDay,
          c.image_url AS image,
          c.is_available AS available,
          cu.full_name AS customerName,
          cu.email AS customerEmail,
          b.rental_days AS rentalDays,
          b.booked_at AS bookedAt
        FROM cars c
        JOIN bookings b ON b.car_id = c.car_id
        JOIN customers cu ON cu.customer_id = b.customer_id
        WHERE b.booking_id = ?
        LIMIT 1
      `,
      [bookingResult.insertId]
    );

    return mapCarRow(fleetRows[0]);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

app.get("/api/cars", async (_req, res) => {
  try {
    const cars = await fetchFleet();
    res.json(cars);
  } catch (error) {
    console.error("Failed to read cars:", error);
    res.status(500).json({ message: "Unable to load car list." });
  }
});

app.post("/api/rent", async (req, res) => {
  const { carId, customerName, customerEmail, rentalDays } = req.body;

  if (!carId || !customerName || !customerEmail || !rentalDays) {
    return res.status(400).json({ message: "All fields are required." });
  }

  if (!customerName.trim()) {
    return res.status(400).json({ message: "Name cannot be empty." });
  }

  const normalizedEmail = customerEmail.trim().toLowerCase();
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailPattern.test(normalizedEmail)) {
    return res.status(400).json({ message: "Please enter a valid email address." });
  }

  const days = Number(rentalDays);
  if (!Number.isInteger(days) || days < 1 || days > 30) {
    return res.status(400).json({ message: "Rental days must be between 1 and 30." });
  }

  try {
    const rentedCar = await reserveCar({
      carId,
      customerName,
      customerEmail: normalizedEmail,
      rentalDays: days,
    });

    res.status(201).json({
      message: `${rentedCar.name} booked successfully.`,
      car: rentedCar,
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    const message =
      statusCode === 500 ? "Booking failed due to a server error." : error.message;

    res.status(statusCode).json({ message });
  }
});

app.use(express.static(CLIENT_DIR));

app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api")) {
    return next();
  }

  res.sendFile(path.join(CLIENT_DIR, "index.html"));
});

async function startServer() {
  try {
    const connection = await pool.getConnection();
    await connection.ping();
    connection.release();

    app.listen(PORT, () => {
      console.log(`Car rental app running at http://localhost:${PORT}`);
      console.log("MySQL mode enabled. Configure DB_* environment variables if needed.");
    });
  } catch (error) {
    console.error("Unable to connect to MySQL. Check DB_* environment variables.");
    console.error(error.message);
    process.exit(1);
  }
}

startServer();

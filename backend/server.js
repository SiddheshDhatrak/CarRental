const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const mysql = require("mysql2/promise");

const app = express();
const PORT = Number(process.env.PORT || 3000);

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

const corsOrigin = process.env.CORS_ORIGIN || "http://localhost:5173";
const adminApiKey = process.env.ADMIN_API_KEY || "change-this-admin-key";

app.use(helmet());
app.use(cors({ origin: corsOrigin }));
app.use(express.json({ limit: "1mb" }));
app.use(morgan("dev"));

function createHttpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function parsePositiveInteger(value) {
  const numberValue = Number(value);
  if (!Number.isInteger(numberValue) || numberValue < 1) {
    return null;
  }

  return numberValue;
}

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

function adminOnly(req, _res, next) {
  const token = req.header("x-admin-key");
  if (!token || token !== adminApiKey) {
    return next(createHttpError(401, "Admin authorization failed."));
  }

  next();
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

app.get("/api/health", async (_req, res, next) => {
  try {
    const connection = await pool.getConnection();
    await connection.ping();
    connection.release();

    res.json({ status: "ok", database: "connected" });
  } catch (error) {
    next(error);
  }
});

app.get("/api/cars", async (_req, res, next) => {
  try {
    const cars = await fetchFleet();
    res.json(cars);
  } catch (error) {
    next(error);
  }
});

app.post("/api/rent", async (req, res, next) => {
  const { carId, customerName, customerEmail, rentalDays } = req.body;

  if (!carId || !customerName || !customerEmail || !rentalDays) {
    return next(createHttpError(400, "All fields are required."));
  }

  const normalizedName = String(customerName).trim();
  const normalizedEmail = String(customerEmail).trim().toLowerCase();
  const days = parsePositiveInteger(rentalDays);

  if (!normalizedName) {
    return next(createHttpError(400, "Name cannot be empty."));
  }

  if (!validateEmail(normalizedEmail)) {
    return next(createHttpError(400, "Please enter a valid email address."));
  }

  if (!days || days > 30) {
    return next(createHttpError(400, "Rental days must be between 1 and 30."));
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [carRows] = await connection.query(
      `SELECT car_id, name, is_available FROM cars WHERE public_code = ? FOR UPDATE`,
      [carId]
    );

    if (carRows.length === 0) {
      throw createHttpError(404, "Car not found");
    }

    if (!carRows[0].is_available) {
      throw createHttpError(409, "Car already rented");
    }

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
      [customerId, carRows[0].car_id, days]
    );

    await connection.commit();

    const [bookingCarRows] = await connection.query(
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

    res.status(201).json({
      message: `${carRows[0].name} booked successfully.`,
      car: mapCarRow(bookingCarRows[0]),
      bookingId: bookingResult.insertId,
    });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
});

app.get("/api/bookings", async (req, res, next) => {
  const email = String(req.query.email || "").trim().toLowerCase();

  if (!validateEmail(email)) {
    return next(createHttpError(400, "Valid email query parameter is required."));
  }

  try {
    const [rows] = await pool.query(
      `
        SELECT
          b.booking_id AS bookingId,
          b.booking_status AS bookingStatus,
          b.rental_days AS rentalDays,
          b.booked_at AS bookedAt,
          b.start_date AS startDate,
          b.end_date AS endDate,
          b.total_amount AS totalAmount,
          c.public_code AS carId,
          c.name AS carName,
          c.category,
          c.price_per_day AS pricePerDay
        FROM bookings b
        JOIN customers cu ON cu.customer_id = b.customer_id
        JOIN cars c ON c.car_id = b.car_id
        WHERE cu.email = ?
        ORDER BY b.booked_at DESC
      `,
      [email]
    );

    const bookings = rows.map((row) => ({
      bookingId: row.bookingId,
      bookingStatus: row.bookingStatus,
      rentalDays: row.rentalDays,
      bookedAt: new Date(row.bookedAt).toISOString(),
      startDate: row.startDate,
      endDate: row.endDate,
      totalAmount: Number(row.totalAmount),
      car: {
        id: row.carId,
        name: row.carName,
        category: row.category,
        pricePerDay: Number(row.pricePerDay),
      },
    }));

    res.json(bookings);
  } catch (error) {
    next(error);
  }
});

app.patch("/api/bookings/:bookingId/cancel", async (req, res, next) => {
  const bookingId = parsePositiveInteger(req.params.bookingId);
  const email = String(req.body.customerEmail || "").trim().toLowerCase();

  if (!bookingId) {
    return next(createHttpError(400, "bookingId must be a positive integer."));
  }

  if (!validateEmail(email)) {
    return next(createHttpError(400, "Valid customerEmail is required."));
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [rows] = await connection.query(
      `
        SELECT b.booking_id, b.booking_status
        FROM bookings b
        JOIN customers cu ON cu.customer_id = b.customer_id
        WHERE b.booking_id = ? AND cu.email = ?
        FOR UPDATE
      `,
      [bookingId, email]
    );

    if (rows.length === 0) {
      throw createHttpError(404, "Booking not found for this customer.");
    }

    if (rows[0].booking_status !== "CONFIRMED") {
      throw createHttpError(409, "Only confirmed bookings can be cancelled.");
    }

    await connection.query(
      `UPDATE bookings SET booking_status = 'CANCELLED' WHERE booking_id = ?`,
      [bookingId]
    );

    await connection.commit();

    res.json({ message: "Booking cancelled successfully.", bookingId });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
});

app.get("/api/admin/bookings", adminOnly, async (req, res, next) => {
  const page = parsePositiveInteger(req.query.page || "1") || 1;
  const pageSize = parsePositiveInteger(req.query.pageSize || "20") || 20;
  const size = Math.min(pageSize, 100);
  const offset = (page - 1) * size;

  try {
    const [rows] = await pool.query(
      `
        SELECT
          b.booking_id AS bookingId,
          b.booking_status AS bookingStatus,
          b.booked_at AS bookedAt,
          b.start_date AS startDate,
          b.end_date AS endDate,
          b.rental_days AS rentalDays,
          b.total_amount AS totalAmount,
          c.public_code AS carId,
          c.name AS carName,
          cu.full_name AS customerName,
          cu.email AS customerEmail
        FROM bookings b
        JOIN cars c ON c.car_id = b.car_id
        JOIN customers cu ON cu.customer_id = b.customer_id
        ORDER BY b.booked_at DESC
        LIMIT ? OFFSET ?
      `,
      [size, offset]
    );

    res.json({ page, pageSize: size, bookings: rows });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/admin/bookings/:bookingId/status", adminOnly, async (req, res, next) => {
  const bookingId = parsePositiveInteger(req.params.bookingId);
  const nextStatus = String(req.body.status || "").trim().toUpperCase();
  const allowedStatuses = new Set(["CONFIRMED", "CANCELLED", "COMPLETED"]);

  if (!bookingId) {
    return next(createHttpError(400, "bookingId must be a positive integer."));
  }

  if (!allowedStatuses.has(nextStatus)) {
    return next(createHttpError(400, "status must be CONFIRMED, CANCELLED, or COMPLETED."));
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [rows] = await connection.query(
      `SELECT booking_id, booking_status FROM bookings WHERE booking_id = ? FOR UPDATE`,
      [bookingId]
    );

    if (rows.length === 0) {
      throw createHttpError(404, "Booking not found.");
    }

    await connection.query(
      `UPDATE bookings SET booking_status = ? WHERE booking_id = ?`,
      [nextStatus, bookingId]
    );

    await connection.commit();

    res.json({ message: "Booking status updated.", bookingId, status: nextStatus });
  } catch (error) {
    await connection.rollback();
    next(error);
  } finally {
    connection.release();
  }
});

app.post("/api/admin/cars", adminOnly, async (req, res, next) => {
  const {
    id,
    name,
    brand,
    category,
    seats,
    transmission,
    fuel,
    pricePerDay,
    image,
  } = req.body;

  const publicCode = String(id || "").trim();
  const carName = String(name || "").trim();
  const carBrand = String(brand || "").trim();
  const carCategory = String(category || "").trim();
  const transmissionValue = String(transmission || "").trim();
  const fuelValue = String(fuel || "").trim();
  const imageUrl = image ? String(image).trim() : null;
  const seatsValue = parsePositiveInteger(seats);
  const numericPrice = Number(pricePerDay);

  if (
    !publicCode ||
    !carName ||
    !carBrand ||
    !carCategory ||
    !transmissionValue ||
    !fuelValue ||
    !seatsValue ||
    !Number.isFinite(numericPrice) ||
    numericPrice <= 0
  ) {
    return next(createHttpError(400, "Invalid payload for car creation."));
  }

  try {
    await pool.query(
      `
        INSERT INTO cars
          (public_code, name, brand, category, seats, transmission, fuel, price_per_day, image_url, is_available)
        VALUES
          (?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE)
      `,
      [
        publicCode,
        carName,
        carBrand,
        carCategory,
        seatsValue,
        transmissionValue,
        fuelValue,
        numericPrice,
        imageUrl,
      ]
    );

    res.status(201).json({ message: "Car created successfully.", id: publicCode });
  } catch (error) {
    if (error && error.code === "ER_DUP_ENTRY") {
      return next(createHttpError(409, "Car id already exists."));
    }

    next(error);
  }
});

app.patch("/api/admin/cars/:carId", adminOnly, async (req, res, next) => {
  const carId = String(req.params.carId || "").trim();
  const allowed = {
    name: "name",
    brand: "brand",
    category: "category",
    seats: "seats",
    transmission: "transmission",
    fuel: "fuel",
    pricePerDay: "price_per_day",
    image: "image_url",
    available: "is_available",
  };

  const updates = [];
  const values = [];

  Object.keys(allowed).forEach((key) => {
    if (!(key in req.body)) {
      return;
    }

    let value = req.body[key];
    if (key === "name" || key === "brand" || key === "category" || key === "transmission" || key === "fuel" || key === "image") {
      value = value == null ? null : String(value).trim();
    }

    if (key === "seats") {
      value = parsePositiveInteger(value);
      if (!value) {
        return;
      }
    }

    if (key === "pricePerDay") {
      value = Number(value);
      if (!Number.isFinite(value) || value <= 0) {
        return;
      }
    }

    if (key === "available") {
      value = Boolean(value);
    }

    updates.push(`${allowed[key]} = ?`);
    values.push(value);
  });

  if (updates.length === 0) {
    return next(createHttpError(400, "No valid fields provided for update."));
  }

  values.push(carId);

  try {
    const [result] = await pool.query(
      `UPDATE cars SET ${updates.join(", ")} WHERE public_code = ?`,
      values
    );

    if (result.affectedRows === 0) {
      return next(createHttpError(404, "Car not found."));
    }

    res.json({ message: "Car updated successfully.", id: carId });
  } catch (error) {
    next(error);
  }
});

app.use((error, _req, res, _next) => {
  const statusCode = error.statusCode || 500;

  if (statusCode >= 500) {
    console.error(error);
  }

  res.status(statusCode).json({
    message:
      statusCode >= 500
        ? "Request failed due to a server error."
        : error.message || "Request failed.",
  });
});

async function startServer() {
  try {
    const connection = await pool.getConnection();
    await connection.ping();
    connection.release();

    app.listen(PORT, () => {
      console.log(`Backend API running at http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Unable to connect to MySQL. Check DB_* environment variables.");
    console.error(error.message);
    process.exit(1);
  }
}

startServer();

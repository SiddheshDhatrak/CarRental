const express = require("express");
const fs = require("node:fs/promises");
const path = require("node:path");

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, "data", "cars.json");
const CLIENT_DIR = path.join(__dirname, "dist");

let mutationQueue = Promise.resolve();

app.use(express.json());

async function readCars() {
  const raw = await fs.readFile(DATA_FILE, "utf-8");
  return JSON.parse(raw);
}

async function writeCars(cars) {
  await fs.writeFile(DATA_FILE, JSON.stringify(cars, null, 2));
}

async function updateCars(mutator) {
  mutationQueue = mutationQueue.then(async () => {
    const cars = await readCars();
    const result = await mutator(cars);
    await writeCars(cars);
    return result;
  });

  return mutationQueue;
}

app.get("/api/cars", async (_req, res) => {
  try {
    const cars = await readCars();
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

  const days = Number(rentalDays);
  if (!Number.isInteger(days) || days < 1 || days > 30) {
    return res.status(400).json({ message: "Rental days must be between 1 and 30." });
  }

  try {
    const rentedCar = await updateCars(async (cars) => {
      const car = cars.find((item) => item.id === carId);

      if (!car) {
        const err = new Error("Car not found");
        err.statusCode = 404;
        throw err;
      }

      if (!car.available) {
        const err = new Error("Car already rented");
        err.statusCode = 409;
        throw err;
      }

      car.available = false;
      car.rentalInfo = {
        customerName: customerName.trim(),
        customerEmail: customerEmail.trim().toLowerCase(),
        rentalDays: days,
        bookedAt: new Date().toISOString(),
      };

      return car;
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

app.listen(PORT, () => {
  console.log(`Car rental app running at http://localhost:${PORT}`);
});

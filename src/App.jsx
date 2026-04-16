import { useEffect, useMemo, useState } from "react";
import {
  AnimatePresence,
  motion,
  useInView,
  useScroll,
  useSpring,
  useTransform,
} from "framer-motion";

const menuItems = [
  { href: "#hero", label: "Home" },
  { href: "#experience", label: "Experience" },
  { href: "#fleet", label: "Fleet" },
  { href: "#process", label: "Process" },
  { href: "#contact", label: "Contact" },
];

function useFleet() {
  const [cars, setCars] = useState([]);
  const [status, setStatus] = useState("");
  const [statusType, setStatusType] = useState("neutral");

  const setMessage = (message, type = "neutral") => {
    setStatus(message);
    setStatusType(type);
  };

  const fetchCars = async (showRefreshed = false) => {
    try {
      const response = await fetch("/api/cars");
      if (!response.ok) {
        throw new Error("Unable to fetch cars");
      }

      const data = await response.json();
      setCars(data);

      if (showRefreshed) {
        setMessage("Availability refreshed from server.", "success");
      }
    } catch (error) {
      setMessage("Could not sync fleet right now.", "error");
    }
  };

  useEffect(() => {
    fetchCars();
    const ticker = setInterval(() => fetchCars(true), 20000);
    return () => clearInterval(ticker);
  }, []);

  return {
    cars,
    setCars,
    status,
    statusType,
    setMessage,
    fetchCars,
  };
}

function ScrollReveal({ children, delay = 0 }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.22 }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1], delay }}
    >
      {children}
    </motion.div>
  );
}

function CarCard({ car, index, onRent }) {
  return (
    <motion.article
      className="car-card"
      initial={{ opacity: 0, y: 26 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{ duration: 0.45, delay: index * 0.06 }}
      whileHover={{ y: -8, rotateX: 1.5 }}
    >
      <img src={car.image} alt={car.name} loading="lazy" />
      <div className="car-card-inner">
        <div className="car-top-row">
          <h3>{car.name}</h3>
          <span className={`badge ${car.available ? "available" : "rented"}`}>
            {car.available ? "Available" : "Booked"}
          </span>
        </div>

        <p className="car-meta">
          {car.category} · {car.seats} Seats · {car.transmission} · {car.fuel}
        </p>

        <div className="car-price-row">
          <strong>${car.pricePerDay}</strong>
          <span>/day</span>
        </div>

        <button
          className="rent-btn"
          disabled={!car.available}
          onClick={() => onRent(car)}
          type="button"
        >
          {car.available ? "Reserve This Car" : "Unavailable"}
        </button>
      </div>
    </motion.article>
  );
}

function BookingModal({ car, onClose, onBooked, setMessage }) {
  const [loading, setLoading] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [rentalDays, setRentalDays] = useState(1);

  useEffect(() => {
    if (!car) {
      setCustomerName("");
      setCustomerEmail("");
      setRentalDays(1);
      setLoading(false);
    }
  }, [car]);

  const estimatedTotal = useMemo(() => {
    if (!car) return 0;
    return Number(rentalDays || 0) * car.pricePerDay;
  }, [car, rentalDays]);

  if (!car) return null;

  const handleSubmit = async (event) => {
    event.preventDefault();

    setLoading(true);
    try {
      const response = await fetch("/api/rent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          carId: car.id,
          customerName,
          customerEmail,
          rentalDays: Number(rentalDays),
        }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.message || "Booking failed.");
      }

      setMessage(result.message, "success");
      onBooked();
      onClose();
    } catch (error) {
      setMessage(error.message || "Booking failed.", "error");
      onBooked();
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        className="modal-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.form
          className="booking-modal"
          initial={{ opacity: 0, y: 22, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.97 }}
          transition={{ duration: 0.25 }}
          onSubmit={handleSubmit}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="modal-head">
            <h3>Book {car.name}</h3>
            <button type="button" className="ghost-btn" onClick={onClose}>
              Close
            </button>
          </div>

          <div className="modal-summary">
            <p>
              Daily Rate <strong>${car.pricePerDay}</strong>
            </p>
            <p>
              Estimated Total <strong>${estimatedTotal}</strong>
            </p>
          </div>

          <label>
            Full Name
            <input
              value={customerName}
              onChange={(event) => setCustomerName(event.target.value)}
              minLength={3}
              required
              type="text"
              placeholder="Alex Morgan"
            />
          </label>

          <label>
            Email Address
            <input
              value={customerEmail}
              onChange={(event) => setCustomerEmail(event.target.value)}
              required
              type="email"
              placeholder="alex@email.com"
            />
          </label>

          <label>
            Rental Days
            <input
              value={rentalDays}
              onChange={(event) => setRentalDays(event.target.value)}
              required
              min={1}
              max={30}
              type="number"
            />
          </label>

          <button className="book-btn" type="submit" disabled={loading}>
            {loading ? "Confirming..." : "Confirm Reservation"}
          </button>
        </motion.form>
      </motion.div>
    </AnimatePresence>
  );
}

function StatCard({ label, value }) {
  return (
    <motion.div
      className="stat-card"
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.35 }}
      transition={{ duration: 0.4 }}
    >
      <span>{label}</span>
      <strong>{value}</strong>
    </motion.div>
  );
}

function App() {
  const { scrollYProgress } = useScroll();
  const progressScale = useSpring(scrollYProgress, {
    stiffness: 140,
    damping: 20,
    mass: 0.3,
  });
  const heroY = useTransform(scrollYProgress, [0, 0.35], [0, -55]);

  const { cars, status, statusType, setMessage, fetchCars } = useFleet();
  const [activeCar, setActiveCar] = useState(null);

  const availableCount = cars.filter((car) => car.available).length;
  const averagePrice =
    cars.length > 0
      ? Math.round(cars.reduce((sum, car) => sum + car.pricePerDay, 0) / cars.length)
      : 0;

  return (
    <div className="app-shell">
      <motion.div className="scroll-progress" style={{ scaleX: progressScale }} />

      <header className="top-nav-wrap">
        <nav className="top-nav container">
          <a href="#hero" className="brand-mark">
            DriveNow Scroll
          </a>
          <ul>
            {menuItems.map((item) => (
              <li key={item.href}>
                <a href={item.href}>{item.label}</a>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <main>
        <section id="hero" className="hero container">
          <motion.div className="hero-content" style={{ y: heroY }}>
            <ScrollReveal>
              <p className="kicker">21st.dev style inspired visual narrative</p>
              <h1>
                A Scroll-First Car Rental Experience For The Modern City Traveler
              </h1>
              <p>
                Premium visuals, smooth motion, and real-time availability locking.
                When one user reserves a vehicle, it is instantly unavailable to others.
              </p>
              <div className="hero-actions">
                <a className="cta" href="#fleet">
                  Explore Fleet
                </a>
                <a className="ghost" href="#process">
                  See How It Works
                </a>
              </div>
            </ScrollReveal>
          </motion.div>

          <div className="hero-stats">
            <StatCard label="Cars in Fleet" value={String(cars.length)} />
            <StatCard label="Available Now" value={String(availableCount)} />
            <StatCard label="Average Daily Price" value={`$${averagePrice}`} />
          </div>
        </section>

        <section id="experience" className="experience container">
          <ScrollReveal>
            <h2>Designed For Fast Decisions</h2>
          </ScrollReveal>
          <div className="experience-grid">
            {["Live Availability", "Transparent Pricing", "Quick Reservation"].map(
              (title, index) => (
                <motion.article
                  key={title}
                  className="experience-card"
                  initial={{ opacity: 0, x: index % 2 === 0 ? -20 : 20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true, amount: 0.3 }}
                  transition={{ duration: 0.45, delay: index * 0.08 }}
                >
                  <h3>{title}</h3>
                  <p>
                    Engineered to feel effortless on both mobile and desktop, with
                    smooth section transitions and clear actions.
                  </p>
                </motion.article>
              )
            )}
          </div>
        </section>

        <section id="fleet" className="fleet container">
          <ScrollReveal>
            <h2>Fleet Catalog</h2>
            <p className="fleet-subtitle">
              Choose your car, review daily price, and book instantly.
            </p>
          </ScrollReveal>

          <p className={`status ${statusType}`}>{status || "Fleet synced."}</p>

          <div className="fleet-grid">
            {cars.map((car, index) => (
              <CarCard key={car.id} car={car} index={index} onRent={setActiveCar} />
            ))}
          </div>
        </section>

        <section id="process" className="process container">
          <ScrollReveal>
            <h2>Real-World Booking Flow</h2>
          </ScrollReveal>
          <div className="process-timeline">
            {[
              "Browse real-time available cars",
              "Select vehicle and submit renter details",
              "Receive immediate reservation lock",
            ].map((step, idx) => (
              <motion.div
                key={step}
                className="step"
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.34 }}
                transition={{ duration: 0.4, delay: idx * 0.07 }}
              >
                <span>{`0${idx + 1}`}</span>
                <p>{step}</p>
              </motion.div>
            ))}
          </div>
        </section>

        <section id="contact" className="contact container">
          <ScrollReveal>
            <h2>Need Support?</h2>
            <p>Email: support@drivenow.demo</p>
          </ScrollReveal>
        </section>
      </main>

      <BookingModal
        car={activeCar}
        onClose={() => setActiveCar(null)}
        onBooked={() => fetchCars()}
        setMessage={setMessage}
      />
    </div>
  );
}

export default App;

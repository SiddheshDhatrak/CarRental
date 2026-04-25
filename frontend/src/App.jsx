import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AnimatePresence,
  motion,
  useScroll,
  useSpring,
  useTransform,
} from "framer-motion";

const AUTH_TOKEN_KEY = "drivenow_auth_token";
const AUTH_USER_KEY = "drivenow_auth_user";
const AUTH_ROUTE = "/auth";
const HOME_ROUTE = "/";

async function readJsonResponse(response) {
  const rawBody = await response.text();
  const trimmedBody = rawBody.trim();

  if (!trimmedBody) {
    return {};
  }

  if (trimmedBody.startsWith("<")) {
    return {
      message: "Server returned HTML instead of JSON. Verify backend is running and API proxy is configured.",
    };
  }

  try {
    return JSON.parse(trimmedBody);
  } catch (_error) {
    return {
      message: "Server returned an invalid JSON response.",
    };
  }
}

function normalizePath(pathname) {
  if (!pathname || pathname === "/") {
    return HOME_ROUTE;
  }

  return pathname.startsWith("/") ? pathname : `/${pathname}`;
}

function useCurrentPath() {
  const [path, setPath] = useState(() => {
    if (typeof window === "undefined") {
      return HOME_ROUTE;
    }

    return normalizePath(window.location.pathname);
  });

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const onPopState = () => {
      setPath(normalizePath(window.location.pathname));
    };

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const navigate = useCallback((nextPath, replace = false) => {
    if (typeof window === "undefined") {
      return;
    }

    const normalizedPath = normalizePath(nextPath);
    const currentPath = normalizePath(window.location.pathname);
    if (normalizedPath === currentPath) {
      return;
    }

    if (replace) {
      window.history.replaceState({}, "", normalizedPath);
    } else {
      window.history.pushState({}, "", normalizedPath);
    }

    setPath(normalizedPath);
    window.scrollTo({ top: 0, left: 0 });
  }, []);

  return { path, navigate };
}

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
      const data = await readJsonResponse(response);

      if (!response.ok) {
        throw new Error(data.message || "Unable to fetch cars.");
      }

      if (!Array.isArray(data)) {
        throw new Error("Fleet response is invalid.");
      }

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
      initial={{ opacity: 0, y: 30, scale: 0.95 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{ duration: 0.6, delay: index * 0.08, ease: [0.25, 1, 0.5, 1] }}
      whileHover={{ y: -12, scale: 1.02, rotateX: 4, rotateY: 2 }}
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

function BookingModal({
  car,
  onClose,
  onBooked,
  setMessage,
  currentUser,
  authToken,
  onReservationAlert,
}) {
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
      return;
    }

    if (currentUser) {
      setCustomerName(currentUser.fullName || "");
      setCustomerEmail(currentUser.email || "");
    }
  }, [car, currentUser]);

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
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({
          carId: car.id,
          ...(currentUser ? {} : { customerName, customerEmail }),
          rentalDays: Number(rentalDays),
        }),
      });

      const result = await readJsonResponse(response);
      if (!response.ok) {
        throw new Error(result.message || "Booking failed.");
      }

      const successMessage = result.message || `${car.name} reserved successfully.`;
      setMessage(successMessage, "success");
      onReservationAlert(successMessage, "success");
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

          {currentUser ? (
            <div className="account-pill">
              Booking as <strong>{currentUser.fullName}</strong> ({currentUser.email})
            </div>
          ) : (
            <>
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
            </>
          )}

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

function ReservationAlert({ open, message, type = "success", onClose }) {
  return (
    <AnimatePresence>
      {open ? (
        <motion.aside
          className={`reservation-alert ${type}`}
          initial={{ opacity: 0, y: -18, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -16, scale: 0.98 }}
          transition={{ duration: 0.22, ease: [0.2, 0.9, 0.3, 1] }}
          role="status"
          aria-live="polite"
        >
          <div>
            <strong>{type === "success" ? "Reservation confirmed" : "Notice"}</strong>
            <p>{message}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Dismiss notification">
            Dismiss
          </button>
        </motion.aside>
      ) : null}
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

function AuthSection({
  authMode,
  setAuthMode,
  authLoading,
  authError,
  onSignup,
  onLogin,
}) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    setPassword("");
  }, [authMode]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (authMode === "signup") {
      await onSignup({ fullName, email, password });
      return;
    }

    await onLogin({ email, password });
  };

  return (
    <section className="auth container">
      <motion.div
        className="auth-card"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
      >
        <div className="auth-heading">
          <p>Account Access</p>
          <h2>{authMode === "signup" ? "Create your DriveNow account" : "Welcome back"}</h2>
        </div>

        <div className="auth-switch" role="tablist" aria-label="Authentication mode">
          <button
            type="button"
            className={authMode === "signup" ? "is-active" : ""}
            onClick={() => setAuthMode("signup")}
          >
            Sign Up
          </button>
          <button
            type="button"
            className={authMode === "login" ? "is-active" : ""}
            onClick={() => setAuthMode("login")}
          >
            Login
          </button>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          {authMode === "signup" ? (
            <label>
              Full Name
              <input
                type="text"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                minLength={2}
                placeholder="Alex Morgan"
                required
              />
            </label>
          ) : null}

          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="alex@email.com"
              required
            />
          </label>

          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={8}
              placeholder="At least 8 characters"
              required
            />
          </label>

          <button className="book-btn" type="submit" disabled={authLoading}>
            {authLoading
              ? "Please wait..."
              : authMode === "signup"
                ? "Create Account"
                : "Login"}
          </button>
        </form>

        {authError ? <p className="status error">{authError}</p> : null}
      </motion.div>
    </section>
  );
}

function AuthPage({
  authMode,
  setAuthMode,
  authLoading,
  authError,
  onSignup,
  onLogin,
}) {
  return (
    <div className="auth-page">
      <header className="auth-page-top container">
        <span className="brand-mark">DriveNow</span>
        <p>Sign in to unlock the full rental experience.</p>
      </header>
      <AuthSection
        authMode={authMode}
        setAuthMode={setAuthMode}
        authLoading={authLoading}
        authError={authError}
        onSignup={onSignup}
        onLogin={onLogin}
      />
    </div>
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
  const [authMode, setAuthMode] = useState("signup");
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authToken, setAuthToken] = useState("");
  const [currentUser, setCurrentUser] = useState(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [reservationAlert, setReservationAlert] = useState({
    open: false,
    message: "",
    type: "success",
  });
  const { path, navigate } = useCurrentPath();

  const isAuthRoute = path === AUTH_ROUTE;

  const availableCount = cars.filter((car) => car.available).length;
  const averagePrice =
    cars.length > 0
      ? Math.round(cars.reduce((sum, car) => sum + car.pricePerDay, 0) / cars.length)
      : 0;

  useEffect(() => {
    let isMounted = true;
    const initialToken = localStorage.getItem(AUTH_TOKEN_KEY);
    const initialUserRaw = localStorage.getItem(AUTH_USER_KEY);

    if (!initialToken || !initialUserRaw) {
      setSessionReady(true);
      return () => {
        isMounted = false;
      };
    }

    try {
      JSON.parse(initialUserRaw);

      fetch("/api/auth/me", {
        headers: { Authorization: `Bearer ${initialToken}` },
      })
        .then(async (response) => {
          const result = await readJsonResponse(response);
          if (!response.ok) {
            throw new Error(result.message || "Session expired.");
          }

          if (!isMounted) {
            return;
          }

          setAuthToken(result.token);
          setCurrentUser(result.user);
          localStorage.setItem(AUTH_TOKEN_KEY, result.token);
          localStorage.setItem(AUTH_USER_KEY, JSON.stringify(result.user));
        })
        .catch(() => {
          if (!isMounted) {
            return;
          }

          localStorage.removeItem(AUTH_TOKEN_KEY);
          localStorage.removeItem(AUTH_USER_KEY);
          setAuthToken("");
          setCurrentUser(null);
        })
        .finally(() => {
          if (isMounted) {
            setSessionReady(true);
          }
        });
    } catch (_error) {
      localStorage.removeItem(AUTH_TOKEN_KEY);
      localStorage.removeItem(AUTH_USER_KEY);
      setSessionReady(true);
    }

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!sessionReady) {
      return;
    }

    if (currentUser && isAuthRoute) {
      navigate(HOME_ROUTE, true);
      return;
    }

    if (!currentUser && !isAuthRoute) {
      navigate(AUTH_ROUTE, true);
    }
  }, [currentUser, isAuthRoute, navigate, sessionReady]);

  const handleAuthSuccess = (result, successMessage) => {
    setAuthToken(result.token);
    setCurrentUser(result.user);
    setAuthError("");
    setMessage(successMessage, "success");
    localStorage.setItem(AUTH_TOKEN_KEY, result.token);
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(result.user));
    navigate(HOME_ROUTE, true);
  };

  const handleSignup = async ({ fullName, email, password }) => {
    setAuthLoading(true);
    setAuthError("");

    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName, email, password }),
      });

      const result = await readJsonResponse(response);
      if (!response.ok) {
        throw new Error(result.message || "Signup failed.");
      }

      handleAuthSuccess(result, "Account created. You are now signed in.");
    } catch (error) {
      setAuthError(error.message || "Signup failed.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogin = async ({ email, password }) => {
    setAuthLoading(true);
    setAuthError("");

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const result = await readJsonResponse(response);
      if (!response.ok) {
        throw new Error(result.message || "Login failed.");
      }

      handleAuthSuccess(result, "Signed in successfully.");
    } catch (error) {
      setAuthError(error.message || "Login failed.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    setAuthToken("");
    setCurrentUser(null);
    setActiveCar(null);
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(AUTH_USER_KEY);
    setMessage("You have been signed out.", "neutral");
    navigate(AUTH_ROUTE, true);
  };

  const handleRentClick = (car) => {
    setActiveCar(car);
  };

  const showReservationAlert = useCallback((message, type = "success") => {
    setReservationAlert({ open: true, message, type });
  }, []);

  const closeReservationAlert = useCallback(() => {
    setReservationAlert((previous) => ({ ...previous, open: false }));
  }, []);

  useEffect(() => {
    if (!reservationAlert.open) {
      return undefined;
    }

    const timeoutId = setTimeout(() => {
      closeReservationAlert();
    }, 3500);

    return () => clearTimeout(timeoutId);
  }, [reservationAlert.open, closeReservationAlert]);

  if (!sessionReady) {
    return (
      <div className="auth-page">
        <section className="auth container">
          <div className="auth-card">
            <p className="status neutral">Verifying your session...</p>
          </div>
        </section>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <AuthPage
        authMode={authMode}
        setAuthMode={setAuthMode}
        authLoading={authLoading}
        authError={authError}
        onSignup={handleSignup}
        onLogin={handleLogin}
      />
    );
  }

  return (
    <div className="app-shell">
      <ReservationAlert
        open={reservationAlert.open}
        message={reservationAlert.message}
        type={reservationAlert.type}
        onClose={closeReservationAlert}
      />

      <motion.div className="scroll-progress" style={{ scaleX: progressScale }} />

      <header className="top-nav-wrap">
        <nav className="top-nav container">
          <a href="#hero" className="brand-mark">
            DriveNow
          </a>
          <ul>
            {menuItems.map((item) => (
              <li key={item.href}>
                <a href={item.href}>{item.label}</a>
              </li>
            ))}
          </ul>
          <div className="auth-nav">
            <span>{currentUser.fullName}</span>
            <button type="button" className="ghost-btn" onClick={handleLogout}>
              Logout
            </button>
          </div>
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
              <CarCard key={car.id} car={car} index={index} onRent={handleRentClick} />
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
        currentUser={currentUser}
        authToken={authToken}
        onReservationAlert={showReservationAlert}
      />
    </div>
  );
}

export default App;

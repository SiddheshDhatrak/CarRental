-- Car Rental database schema for MySQL 8+
-- Designed to match the current website booking flow.

CREATE DATABASE IF NOT EXISTS car_rental
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE car_rental;

-- Customers are kept separate so repeat renters are not duplicated.
CREATE TABLE IF NOT EXISTS customers (
  customer_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  full_name VARCHAR(100) NOT NULL,
  email VARCHAR(254) NOT NULL,
  phone VARCHAR(20) NULL,
  license_no VARCHAR(32) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (customer_id),
  UNIQUE KEY uq_customers_email (email),
  UNIQUE KEY uq_customers_license_no (license_no)
) ENGINE=InnoDB;

-- public_code maps to app ids like CR-101.
CREATE TABLE IF NOT EXISTS cars (
  car_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  public_code VARCHAR(20) NOT NULL,
  name VARCHAR(80) NOT NULL,
  brand VARCHAR(50) NOT NULL,
  category VARCHAR(40) NOT NULL,
  seats TINYINT UNSIGNED NOT NULL,
  transmission ENUM('Automatic', 'Manual') NOT NULL,
  fuel ENUM('Petrol', 'Diesel', 'Electric', 'Hybrid', 'CNG') NOT NULL,
  price_per_day DECIMAL(10,2) NOT NULL,
  image_url VARCHAR(600) NULL,
  is_available BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (car_id),
  UNIQUE KEY uq_cars_public_code (public_code),
  KEY idx_cars_available_price (is_available, price_per_day),
  CONSTRAINT chk_cars_seats CHECK (seats BETWEEN 2 AND 12),
  CONSTRAINT chk_cars_price CHECK (price_per_day > 0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS bookings (
  booking_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  customer_id BIGINT UNSIGNED NOT NULL,
  car_id BIGINT UNSIGNED NOT NULL,
  rental_days TINYINT UNSIGNED NOT NULL,
  booked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  start_date DATE NOT NULL DEFAULT (CURRENT_DATE),
  end_date DATE NULL,
  total_amount DECIMAL(12,2) NOT NULL,
  booking_status ENUM('CONFIRMED', 'CANCELLED', 'COMPLETED') NOT NULL DEFAULT 'CONFIRMED',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (booking_id),
  KEY idx_bookings_car_status_dates (car_id, booking_status, start_date, end_date),
  KEY idx_bookings_customer (customer_id),
  KEY idx_bookings_booked_at (booked_at),
  CONSTRAINT fk_bookings_customer
    FOREIGN KEY (customer_id)
    REFERENCES customers(customer_id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT fk_bookings_car
    FOREIGN KEY (car_id)
    REFERENCES cars(car_id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT chk_bookings_rental_days CHECK (rental_days BETWEEN 1 AND 30),
  CONSTRAINT chk_bookings_total_amount CHECK (total_amount >= 0),
  CONSTRAINT chk_bookings_date_order CHECK (end_date IS NULL OR end_date >= start_date)
) ENGINE=InnoDB;

DELIMITER //

CREATE TRIGGER trg_bookings_before_insert
BEFORE INSERT ON bookings
FOR EACH ROW
BEGIN
  DECLARE v_price DECIMAL(10,2);

  IF NEW.end_date IS NULL THEN
    SET NEW.end_date = DATE_ADD(NEW.start_date, INTERVAL NEW.rental_days DAY);
  END IF;

  SELECT price_per_day INTO v_price
  FROM cars
  WHERE car_id = NEW.car_id
  FOR UPDATE;

  IF v_price IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Car not found';
  END IF;

  SET NEW.total_amount = ROUND(v_price * NEW.rental_days, 2);
END //

CREATE TRIGGER trg_bookings_after_insert
AFTER INSERT ON bookings
FOR EACH ROW
BEGIN
  IF NEW.booking_status = 'CONFIRMED' THEN
    UPDATE cars
    SET is_available = FALSE
    WHERE car_id = NEW.car_id;
  END IF;
END //

CREATE TRIGGER trg_bookings_after_update
AFTER UPDATE ON bookings
FOR EACH ROW
BEGIN
  IF OLD.booking_status = 'CONFIRMED' AND NEW.booking_status IN ('CANCELLED', 'COMPLETED') THEN
    UPDATE cars
    SET is_available = TRUE
    WHERE car_id = NEW.car_id;
  END IF;
END //

DELIMITER ;

-- Seed matching the frontend fleet format.
INSERT INTO cars (public_code, name, brand, category, seats, transmission, fuel, price_per_day, image_url)
VALUES
  ('CR-101', 'Toyota Corolla', 'Toyota', 'Economy', 5, 'Automatic', 'Petrol', 44.00, 'https://images.unsplash.com/photo-1583121274602-3e2820c69888?auto=format&fit=crop&w=1200&q=80'),
  ('CR-102', 'Hyundai Tucson', 'Hyundai', 'SUV', 5, 'Automatic', 'Diesel', 78.00, 'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&w=1200&q=80'),
  ('CR-103', 'Honda City', 'Honda', 'Sedan', 5, 'Manual', 'Petrol', 57.00, 'https://images.unsplash.com/photo-1553440569-bcc63803a83d?auto=format&fit=crop&w=1200&q=80'),
  ('CR-104', 'Kia Carnival', 'Kia', 'Family Van', 7, 'Automatic', 'Diesel', 95.00, 'https://images.unsplash.com/photo-1494905998402-395d579af36f?auto=format&fit=crop&w=1200&q=80'),
  ('CR-105', 'MG ZS EV', 'MG', 'Electric', 5, 'Automatic', 'Electric', 88.00, 'https://images.unsplash.com/photo-1593941707882-a5bba14938c7?auto=format&fit=crop&w=1200&q=80'),
  ('CR-106', 'BMW 3 Series', 'BMW', 'Premium', 5, 'Automatic', 'Petrol', 120.00, 'https://images.unsplash.com/photo-1552519507-da3b142c6e3d?auto=format&fit=crop&w=1200&q=80');

-- Example renter and booking.
INSERT INTO customers (full_name, email)
VALUES ('John Doe', 'john@example.com');

INSERT INTO bookings (customer_id, car_id, rental_days, booked_at, start_date, booking_status, total_amount)
SELECT c.customer_id, ca.car_id, 1, '2026-04-16 16:12:34', '2026-04-16', 'CONFIRMED', 0
FROM customers c
JOIN cars ca ON ca.public_code = 'CR-101'
WHERE c.email = 'john@example.com';

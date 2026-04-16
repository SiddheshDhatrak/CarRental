
mysql> CREATE DATABASE car_rental;
Query OK, 1 row affected (0.06 sec)

mysql> USE car_rental;
Database changed
mysql> CREATE TABLE Customer(
    ->   customer_id INT AUTO_INCREMENT PRIMARY KEY,
    ->   name VARCHAR(50),
    ->   phone VARCHAR(15),
    ->   email VARCHAR(50),
    ->   license_no VARCHAR(20)
    -> );
Query OK, 0 rows affected (0.06 sec)

mysql> CREATE TABLE Car(
    ->   car_id INT AUTO_INCREMENT PRIMARY KEY,
    ->   model VARCHAR(50),
    ->   brand VARCHAR(50),
    ->   price_per_day DECIMAL(10,2),
    ->   status VARCHAR(20)
    -> );
Query OK, 0 rows affected (0.03 sec)

mysql>
mysql> CREATE TABLE Booking(
    ->   booking_id INT AUTO_INCREMENT PRIMARY KEY,
    ->   customer_id INT,
    ->   car_id INT,
    ->   start_date DATE,
    ->   end_date DATE,
    ->   total_amount DECIMAL(10,2),
    ->   FOREIGN KEY (customer_id) REFERENCES Customer(customer_id),
    ->   FOREIGN KEY (car_id) REFERENCES Car(car_id)
    -> );
Query OK, 0 rows affected (0.05 sec)

mysql> INSERT INTO Customer(name, phone, email, license_no) VALUES
    -> ('Rahul Patil', '9876543210', 'rahul@gmail.com', 'LIC123'),
    -> ('Amit Sharma', '9123456780', 'amit@gmail.com', 'LIC456');
Query OK, 2 rows affected (0.01 sec)
Records: 2  Duplicates: 0  Warnings: 0

mysql> INSERT INTO Car(model, brand, price_per_day, status) VALUES
    -> ('Swift', 'Maruti', 1500, 'Available'),
    -> ('i20', 'Hyundai', 1800, 'Available'),
    -> ('City', 'Honda', 2500, 'Available');
Query OK, 3 rows affected (0.01 sec)
Records: 3  Duplicates: 0  Warnings: 0

mysql> INSERT INTO Booking(customer_id, car_id, start_date, end_date, total_amount) VALUES
    -> (1, 2, '2026-04-10', '2026-04-12', 3600);
Query OK, 1 row affected (0.01 sec)

mysql> SELECT * FROM Customer;
+-------------+-------------+------------+-----------------+------------+
| customer_id | name        | phone      | email           | license_no |
+-------------+-------------+------------+-----------------+------------+
|           1 | Rahul Patil | 9876543210 | rahul@gmail.com | LIC123     |
|           2 | Amit Sharma | 9123456780 | amit@gmail.com  | LIC456     |
+-------------+-------------+------------+-----------------+------------+
2 rows in set (0.00 sec)

mysql> SELECT * FROM Car;
+--------+-------+---------+---------------+-----------+
| car_id | model | brand   | price_per_day | status    |
+--------+-------+---------+---------------+-----------+
|      1 | Swift | Maruti  |       1500.00 | Available |
|      2 | i20   | Hyundai |       1800.00 | Available |
|      3 | City  | Honda   |       2500.00 | Available |
+--------+-------+---------+---------------+-----------+
3 rows in set (0.00 sec)

mysql> SELECT * FROM Booking;
+------------+-------------+--------+------------+------------+--------------+
| booking_id | customer_id | car_id | start_date | end_date   | total_amount |
+------------+-------------+--------+------------+------------+--------------+
|          1 |           1 |      2 | 2026-04-10 | 2026-04-12 |      3600.00 |
+------------+-------------+--------+------------+------------+--------------+
1 row in set (0.00 sec)

mysql> DELIMITER //
mysql> CREATE TRIGGER update_car_status
    -> AFTER INSERT ON Booking
    -> FOR EACH ROW
    -> BEGIN
    ->   UPDATE Car SET status='Rented'
    ->   WHERE car_id = NEW.car_id;
    -> END //
Query OK, 0 rows affected (0.01 sec)

mysql> DELIMITER ;
mysql>
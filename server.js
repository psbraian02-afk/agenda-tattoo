const express = require("express");
const path = require("path");
const cors = require("cors");

const app = express();

// Habilitar CORS y parsear JSON
app.use(cors());
app.use(express.json());

// Reservas en memoria
let bookings = [];

// ===== Backend para reservas =====
app.get("/api/bookings", (req, res) => {
  res.json(bookings);
});

app.post("/api/bookings", (req, res) => {
  const booking = req.body;
  if (!booking.date || !booking.start || !booking.end || !booking.phone) {
    return res.status(400).json({ error: "Datos incompletos" });
  }
  bookings.push(booking);
  res.status(201).json({ message: "Reserva guardada", booking });
});

// ===== Servir frontend =====
app.use(express.static(path.join(__dirname, "public"))); // tu index.html va en carpeta 'public'
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public/index.html"));
});

// ===== Puerto =====
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

const express = require("express");
const path = require("path");
const fs = require("fs");

const app = express();

// Middleware para leer JSON del body con mayor límite para imágenes grandes
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Servir archivos estáticos desde la carpeta "public"
app.use(express.static(path.join(__dirname, "public")));

// Funciones para leer y escribir reservas
const BOOKINGS_FILE = path.join(__dirname, "bookings.json");

function readBookings() {
  try {
    const data = fs.readFileSync(BOOKINGS_FILE, "utf-8");
    return JSON.parse(data);
  } catch {
    return [];
  }
}

function writeBookings(bookings) {
  fs.writeFileSync(BOOKINGS_FILE, JSON.stringify(bookings, null, 2));
}

// GET /api/bookings -> devuelve todas las reservas
app.get("/api/bookings", (req, res) => {
  const bookings = readBookings();
  res.json(bookings);
});

// POST /api/bookings -> guarda una reserva nueva
app.post("/api/bookings", (req, res) => {
  const bookings = readBookings();
  const newBooking = req.body;

  // Validación básica obligatoria
  if (!newBooking.date || newBooking.start == null || newBooking.end == null || !newBooking.phone) {
    return res.status(400).json({ error: "Datos incompletos" });
  }

  // Validación opcional del tatuaje
  if (newBooking.tattoo) {
    const t = newBooking.tattoo;
    if (!t.image || !t.size || !t.place) {
      return res.status(400).json({ error: "Datos del tatuaje incompletos" });
    }
  }

  bookings.push(newBooking);
  writeBookings(bookings);

  res.status(201).json(newBooking);
});

// Todas las demás rutas devuelven index.html
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Puerto de Render o 3000 local
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

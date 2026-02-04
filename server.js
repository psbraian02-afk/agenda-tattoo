const express = require("express");
const path = require("path");
const fs = require("fs/promises"); // versión asíncrona
const { v4: uuidv4 } = require("uuid"); // para id único de cada reserva

const app = express();

// Middleware para JSON grande
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Archivos estáticos
app.use(express.static(path.join(__dirname, "public")));

const BOOKINGS_FILE = path.join(__dirname, "bookings.json");

// Leer reservas asíncrono
async function readBookings() {
  try {
    const data = await fs.readFile(BOOKINGS_FILE, "utf-8");
    return JSON.parse(data);
  } catch {
    return [];
  }
}

// Escribir reservas asíncrono
async function writeBookings(bookings) {
  await fs.writeFile(BOOKINGS_FILE, JSON.stringify(bookings, null, 2));
}

// GET /api/bookings -> últimas 50 reservas
app.get("/api/bookings", async (req, res) => {
  const bookings = await readBookings();
  // Orden descendente por fecha de creación y limitar
  const latest = bookings
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 50);
  res.json(latest);
});

// POST /api/bookings -> nueva reserva
app.post("/api/bookings", async (req, res) => {
  const bookings = await readBookings();
  const newBooking = { id: uuidv4(), ...req.body, createdAt: new Date().toISOString() };

  if (!newBooking.date || newBooking.start == null || newBooking.end == null || !newBooking.phone) {
    return res.status(400).json({ error: "Datos incompletos" });
  }

  if (newBooking.tattoo) {
    const t = newBooking.tattoo;
    if (!t.image || !t.size || !t.place) {
      return res.status(400).json({ error: "Datos del tatuaje incompletos" });
    }
  }

  bookings.push(newBooking);
  await writeBookings(bookings);
  res.status(201).json(newBooking);
});

// DELETE /api/bookings/:id -> eliminar reserva
app.delete("/api/bookings/:id", async (req, res) => {
  const id = req.params.id;
  let bookings = await readBookings();
  const index = bookings.findIndex(b => b.id === id);
  if (index === -1) return res.status(404).json({ error: "Reserva no encontrada" });

  bookings.splice(index, 1);
  await writeBookings(bookings);
  res.json({ message: "Reserva eliminada" });
});

// PATCH /api/bookings/:id -> actualizar horario
app.patch("/api/bookings/:id", async (req, res) => {
  const id = req.params.id;
  const { start, end } = req.body;
  let bookings = await readBookings();
  const booking = bookings.find(b => b.id === id);
  if (!booking) return res.status(404).json({ error: "Reserva no encontrada" });

  if (start != null) booking.start = start;
  if (end != null) booking.end = end;

  await writeBookings(bookings);
  res.json(booking);
});

// Todas las demás rutas -> index.html
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Puerto
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

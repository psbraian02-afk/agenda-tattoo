const express = require("express");
const path = require("path");
const fs = require("fs/promises");
const { v4: uuidv4 } = require("uuid");

const app = express();

/* =====================
   Middleware
===================== */
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

/* =====================
   Archivos estáticos
===================== */
app.use(express.static(path.join(__dirname, "public")));

/* =====================
   Archivo de datos
===================== */
const BOOKINGS_FILE = path.join(__dirname, "bookings.json");

/* =====================
   Helpers
===================== */
async function ensureBookingsFile() {
  try {
    await fs.access(BOOKINGS_FILE);
  } catch {
    await fs.writeFile(BOOKINGS_FILE, "[]");
  }
}

async function readBookings() {
  await ensureBookingsFile();
  const data = await fs.readFile(BOOKINGS_FILE, "utf-8");
  return JSON.parse(data);
}

async function writeBookings(bookings) {
  await fs.writeFile(
    BOOKINGS_FILE,
    JSON.stringify(bookings, null, 2),
    "utf-8"
  );
}

/* =====================
   API
===================== */

// GET últimas 50 reservas
app.get("/api/bookings", async (req, res) => {
  try {
    const bookings = await readBookings();
    const latest = bookings
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 50);
    res.json(latest);
  } catch (err) {
    res.status(500).json({ error: "Error leyendo reservas" });
  }
});

// POST nueva reserva
app.post("/api/bookings", async (req, res) => {
  try {
    const bookings = await readBookings();

    const newBooking = {
      id: uuidv4(),
      ...req.body,
      createdAt: new Date().toISOString()
    };

    if (
      !newBooking.date ||
      newBooking.start == null ||
      newBooking.end == null ||
      !newBooking.phone
    ) {
      return res.status(400).json({ error: "Datos incompletos" });
    }

    if (newBooking.tattoo) {
      const t = newBooking.tattoo;
      if (!t.image || !t.size || !t.place) {
        return res
          .status(400)
          .json({ error: "Datos del tatuaje incompletos" });
      }
    }

    bookings.push(newBooking);
    await writeBookings(bookings);

    res.status(201).json(newBooking);
  } catch (err) {
    res.status(500).json({ error: "Error guardando reserva" });
  }
});

// DELETE eliminar reserva
app.delete("/api/bookings/:id", async (req, res) => {
  try {
    const bookings = await readBookings();
    const index = bookings.findIndex(b => b.id === req.params.id);

    if (index === -1) {
      return res.status(404).json({ error: "Reserva no encontrada" });
    }

    bookings.splice(index, 1);
    await writeBookings(bookings);

    res.json({ message: "Reserva eliminada" });
  } catch (err) {
    res.status(500).json({ error: "Error eliminando reserva" });
  }
});

// PATCH actualizar horario
app.patch("/api/bookings/:id", async (req, res) => {
  try {
    const { start, end } = req.body;
    const bookings = await readBookings();
    const booking = bookings.find(b => b.id === req.params.id);

    if (!booking) {
      return res.status(404).json({ error: "Reserva no encontrada" });
    }

    if (start != null) booking.start = start;
    if (end != null) booking.end = end;

    await writeBookings(bookings);
    res.json(booking);
  } catch (err) {
    res.status(500).json({ error: "Error actualizando reserva" });
  }
});

/* =====================
   SPA fallback
===================== */
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

/* =====================
   Server
===================== */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});

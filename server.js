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
   Archivo de datos (Render-safe)
===================== */
// /tmp ES ESCRIBIBLE EN RENDER
const BOOKINGS_FILE = path.join("/tmp", "bookings.json");

/* =====================
   Helpers
===================== */
async function ensureBookingsFile() {
  try {
    await fs.access(BOOKINGS_FILE);
  } catch {
    await fs.writeFile(BOOKINGS_FILE, "[]", "utf-8");
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

// GET reservas
app.get("/api/bookings", async (req, res) => {
  try {
    const bookings = await readBookings();
    res.json(bookings);
  } catch (err) {
    console.error("READ ERROR:", err);
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

    // Validaciones
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
        return res.status(400).json({ error: "Datos del tatuaje incompletos" });
      }
    }

    bookings.push(newBooking);
    await writeBookings(bookings);

    res.status(201).json(newBooking);
  } catch (err) {
    console.error("WRITE ERROR:", err);
    res.status(500).json({ error: "No se pudo guardar la reserva" });
  }
});

// DELETE reserva
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
    console.error("DELETE ERROR:", err);
    res.status(500).json({ error: "No se pudo eliminar la reserva" });
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

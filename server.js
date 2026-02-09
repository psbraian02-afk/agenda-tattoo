const express = require("express");
const path = require("path");
const fs = require("fs/promises");
const fssync = require("fs");
const { v4: uuidv4 } = require("uuid");
const compression = require("compression");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;

const publicDir = path.join(__dirname, "public");
const BOOKINGS_FILE = path.join(__dirname, "bookings.json"); // ✅ ruta segura

let bookingsCache = [];

// --- MIDDLEWARE ---
app.use(cors());
app.use(compression());
app.use(express.json({ limit: "10mb" }));
app.use(express.static(publicDir));

// --- INICIALIZACIÓN ---
async function init() {
  if (!fssync.existsSync(publicDir)) {
    fssync.mkdirSync(publicDir, { recursive: true });
  }

  try {
    if (!fssync.existsSync(BOOKINGS_FILE)) {
      await fs.writeFile(BOOKINGS_FILE, "[]");
    }

    const data = await fs.readFile(BOOKINGS_FILE, "utf-8");
    bookingsCache = JSON.parse(data);
    console.log(`✅ Base de datos cargada: ${bookingsCache.length} reservas.`);
  } catch (error) {
    console.error("❌ Error inicializando bookings.json:", error.message);
    bookingsCache = [];
  }
}

init();

/* =====================
    NOTIFICACIÓN
===================== */
async function enviarNotificacionFormspree(booking) {
  const FORMSPREE_URL = "https://formspree.io/f/xzdapoze";
  const datos = {
    _subject: `🚀 NUEVO TURNO: ${booking.name} ${booking.surname}`,
    cliente: `${booking.name} ${booking.surname}`,
    whatsapp: booking.phone,
    fecha: booking.date,
    hora: `${booking.start}:00hs`,
    tamaño: booking.tattoo?.size || "N/A",
    zona: booking.tattoo?.place || "N/A",
    imagen_referencia: booking.tattoo?.image ? "Adjunta en base64" : "Sin imagen",
  };

  try {
    const res = await fetch(FORMSPREE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(datos),
    });
    if (res.ok) console.log("📧 Notificación enviada.");
  } catch (error) {
    console.error("❌ Error enviando email:", error.message);
  }
}

/* =====================
    API
===================== */

app.get("/api/bookings", (req, res) => {
  res.json(bookingsCache);
});

app.delete("/api/bookings/:id", async (req, res) => {
  try {
    bookingsCache = bookingsCache.filter((x) => x.id !== req.params.id);
    await fs.writeFile(BOOKINGS_FILE, JSON.stringify(bookingsCache, null, 2));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Error al borrar" });
  }
});

app.post("/api/bookings", async (req, res) => {
  try {
    const newBooking = {
      id: uuidv4(),
      ...req.body,
      createdAt: new Date().toISOString(),
    };
    bookingsCache.push(newBooking);
    await fs.writeFile(BOOKINGS_FILE, JSON.stringify(bookingsCache, null, 2));
    enviarNotificacionFormspree(newBooking);
    res.status(201).json(newBooking);
  } catch (err) {
    console.error("❌ Error guardando reserva:", err.message);
    res.status(500).json({ error: "Error interno" });
  }
});

// Panel admin
app.get("/admin", (req, res) => {
  const adminPath = path.join(publicDir, "admin.html");
  if (fssync.existsSync(adminPath)) res.sendFile(adminPath);
  else res.status(404).send("Falta admin.html en /public");
});

app.get("/scan-qr", (req, res) => {
  res.send(`<h2>Notificación activa</h2><a href="/">Volver</a>`);
});

app.get("/", (req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.get("*", (req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor listo en puerto ${PORT}`);
});

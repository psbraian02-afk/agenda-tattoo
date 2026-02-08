const express = require("express");
const path = require("path");
const fs = require("fs/promises");
const fssync = require("fs");
const { v4: uuidv4 } = require("uuid");
const compression = require("compression");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;

// En Railway, __dirname suele ser /app.
const publicDir = path.join(__dirname, 'public');
const BOOKINGS_FILE = path.join(__dirname, "bookings.json");

let bookingsCache = [];

// --- MIDDLEWARE ---
app.use(cors());
app.use(compression()); 
app.use(express.json({ limit: "10mb" })); 

// CAMBIO AQUÍ: Eliminamos el maxAge para que los cambios se vean de inmediato
app.use(express.static(publicDir)); 

// --- INICIALIZACIÓN ---
async function init() {
    if (!fssync.existsSync(publicDir)) {
        try {
            fssync.mkdirSync(publicDir, { recursive: true });
        } catch (e) {
            console.log("Nota: Carpeta public ya existía o no se pudo crear.");
        }
    }

    try {
        const data = await fs.readFile(BOOKINGS_FILE, "utf-8");
        bookingsCache = JSON.parse(data);
        console.log(`✅ Base de datos cargada: ${bookingsCache.length} reservas.`);
    } catch (error) {
        console.log("ℹ️ No se encontró bookings.json, creando uno nuevo...");
        bookingsCache = [];
        try {
            await fs.writeFile(BOOKINGS_FILE, "[]");
        } catch (writeErr) {
            console.error("⚠️ No se pudo escribir el archivo inicial.");
        }
    }
}

init();

/* =====================
    CONFIGURACIÓN DE NOTIFICACIÓN
===================== */
async function enviarNotificacionFormspree(booking) {
    const FORMSPREE_URL = "https://formspree.io/f/xzdapoze";
    const datos = {
        _subject: `🚀 NUEVO TURNO: ${booking.name} ${booking.surname}`,
        cliente: `${booking.name} ${booking.surname}`,
        whatsapp: booking.phone,
        fecha: booking.date,
        hora: `${booking.start}:00hs`,
        tamaño: booking.tattoo?.size || 'N/A',
        zona: booking.tattoo?.place || 'N/A',
        imagen_referencia: booking.tattoo?.image ? "Adjunta en base64" : "Sin imagen"
    };

    try {
        const response = await fetch(FORMSPREE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify(datos)
        });
        if (response.ok) console.log("📧 Notificación enviada.");
    } catch (error) {
        console.error("❌ Error enviando email:", error.message);
    }
}

/* =====================
    API Y RUTAS
===================== */

app.get("/api/bookings", (req, res) => {
    res.json(bookingsCache);
});

app.delete("/api/bookings/:id", async (req, res) => {
    try {
        bookingsCache = bookingsCache.filter(x => x.id !== req.params.id);
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
            createdAt: new Date().toISOString() 
        };
        bookingsCache.push(newBooking);
        fs.writeFile(BOOKINGS_FILE, JSON.stringify(bookingsCache, null, 2)).catch(err => console.error(err));
        enviarNotificacionFormspree(newBooking);
        res.status(201).json(newBooking);
    } catch (err) {
        res.status(500).json({ error: "Error interno" });
    }
});

app.get("/scan-qr", (req, res) => {
    res.send(`<div style="text-align:center;padding:50px;font-family:sans-serif;"><h2>Sistema de Notificación (Email) Activo</h2><p>Las reservas llegan a tu correo vía Formspree.</p><a href="/">Ir al Inicio</a></div>`);
});

// RUTA PRINCIPAL EXPLÍCITA
app.get("/", (req, res) => {
    res.sendFile(path.join(publicDir, "index.html"));
});

// SPA Fallback
app.get("*", (req, res) => {
    const indexPath = path.join(publicDir, "index.html");
    if (fssync.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.status(404).send("Error: No se encuentra index.html en la carpeta public.");
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Servidor listo en puerto ${PORT}`);
});
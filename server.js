const express = require("express");
const path = require("path");
const fs = require("fs/promises");
const fssync = require("fs");
const { v4: uuidv4 } = require("uuid");
const compression = require("compression");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;

const publicDir = path.join(__dirname, 'public');
const BOOKINGS_FILE = path.join(__dirname, "bookings.json");

let bookingsCache = [];

// --- MIDDLEWARE ---
app.use(cors());
app.use(compression()); 
app.use(express.json({ limit: "20mb" })); // Límite aumentado para fotos de tatuajes

// 1. Servir archivos estáticos (CSS, JS, etc.)
app.use(express.static(publicDir)); 

// --- INICIALIZACIÓN ---
async function init() {
    if (!fssync.existsSync(publicDir)) {
        try {
            fssync.mkdirSync(publicDir, { recursive: true });
        } catch (e) {
            console.log("Nota: Carpeta public ya existía.");
        }
    }

    try {
        if (fssync.existsSync(BOOKINGS_FILE)) {
            const data = await fs.readFile(BOOKINGS_FILE, "utf-8");
            bookingsCache = JSON.parse(data || "[]");
            console.log(`✅ Base de datos cargada: ${bookingsCache.length} reservas.`);
        } else {
            await fs.writeFile(BOOKINGS_FILE, "[]");
            bookingsCache = [];
        }
    } catch (error) {
        console.error("❌ Error cargando bookings.json:", error);
        bookingsCache = [];
    }
}

init();

/* =====================
    NOTIFICACIÓN (Original)
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
        await fetch(FORMSPREE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify(datos)
        });
        console.log("📧 Notificación enviada.");
    } catch (error) {
        console.error("❌ Error enviando email:", error.message);
    }
}

/* =====================
    API Y RUTAS (Orden Importante)
===================== */

// API: Obtener reservas (Lo que usa admin.html para mostrar la lista)
app.get("/api/bookings", (req, res) => {
    res.set('Cache-Control', 'no-store'); // Evita que el navegador guarde datos viejos
    res.json(bookingsCache);
});

// API: Borrar reserva
app.delete("/api/bookings/:id", async (req, res) => {
    try {
        bookingsCache = bookingsCache.filter(x => x.id !== req.params.id);
        await fs.writeFile(BOOKINGS_FILE, JSON.stringify(bookingsCache, null, 2));
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Error al borrar" });
    }
});

// API: Guardar reserva
app.post("/api/bookings", async (req, res) => {
    try {
        const newBooking = { 
            id: uuidv4(), 
            ...req.body, 
            createdAt: new Date().toISOString() 
        };
        bookingsCache.push(newBooking);
        await fs.writeFile(BOOKINGS_FILE, JSON.stringify(bookingsCache, null, 2));
        
        enviarNotificacionFormspree(newBooking).catch(console.error);
        
        res.status(201).json(newBooking);
    } catch (err) {
        res.status(500).json({ error: "Error al guardar la cita" });
    }
});

// RUTA ADMIN: Forzamos que cargue el archivo físico
app.get("/admin", (req, res) => {
    res.sendFile(path.join(publicDir, "admin.html"));
});

app.get("/scan-qr", (req, res) => {
    res.send(`<div style="text-align:center;padding:50px;font-family:sans-serif;"><h2>Sistema Activo</h2><a href="/">Ir al Inicio</a></div>`);
});

// RUTA PRINCIPAL
app.get("/", (req, res) => {
    res.sendFile(path.join(publicDir, "index.html"));
});

// CUALQUIER OTRA RUTA (Debe ir al final)
app.get("*", (req, res) => {
    res.sendFile(path.join(publicDir, "index.html"));
});

app.listen(PORT, () => {
    console.log(`🚀 Servidor listo en puerto ${PORT}`);
});
const express = require("express");
const path = require("path");
const fs = require("fs/promises");
const fssync = require("fs");
const { v4: uuidv4 } = require("uuid");
const compression = require("compression"); // Nueva dependencia para velocidad

const app = express();
const PORT = process.env.PORT || 3000;
const BOOKINGS_FILE = path.join(__dirname, "bookings.json");
const publicDir = path.join(__dirname, 'public');

// Variable en memoria para evitar lecturas constantes de disco
let bookingsCache = [];

// Middleware
app.use(compression()); // Comprime las respuestas (Gzip)
app.use(express.json({ limit: "10mb" })); // Bajamos un poco el límite por seguridad
app.use(express.static(publicDir, { maxAge: '1d' })); // Cacheamos estáticos por 1 día

// Inicialización: Cargar datos al arrancar
async function init() {
    if (!fssync.existsSync(publicDir)) fssync.mkdirSync(publicDir);
    try {
        const data = await fs.readFile(BOOKINGS_FILE, "utf-8");
        bookingsCache = JSON.parse(data);
    } catch {
        await fs.writeFile(BOOKINGS_FILE, "[]");
        bookingsCache = [];
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
    };

    try {
        // Usamos fetch nativo (Node 18+) o una sola importación
        await fetch(FORMSPREE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify(datos)
        });
    } catch (error) {
        console.error("❌ Error en notificación (Background):", error.message);
    }
}

/* =====================
    API Y RUTAS
===================== */

// GET: Súper rápido porque responde desde la RAM
app.get("/api/bookings", (req, res) => {
    res.json(bookingsCache);
});

// DELETE: Filtra en memoria y guarda en disco sin bloquear
app.delete("/api/bookings/:id", async (req, res) => {
    try {
        bookingsCache = bookingsCache.filter(x => x.id !== req.params.id);
        await fs.writeFile(BOOKINGS_FILE, JSON.stringify(bookingsCache, null, 2));
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Error al borrar" });
    }
});

// POST: Optimizado para respuesta inmediata
app.post("/api/bookings", async (req, res) => {
    try {
        const newBooking = { 
            id: uuidv4(), 
            ...req.body, 
            createdAt: new Date().toISOString() 
        };
        
        bookingsCache.push(newBooking);
        
        // Guardado asíncrono (no esperamos a que termine para responder)
        fs.writeFile(BOOKINGS_FILE, JSON.stringify(bookingsCache, null, 2));

        // Notificación en segundo plano (Background task)
        enviarNotificacionFormspree(newBooking);

        // Respondemos de inmediato al cliente
        res.status(201).json(newBooking);
    } catch (err) {
        console.error("Error en el POST:", err);
        res.status(500).json({ error: "Error interno" });
    }
});

app.get("/scan-qr", (req, res) => {
    res.send(`<div style="text-align:center;padding:50px;font-family:sans-serif;"><h2>Sistema de Notificación Activo</h2><p>Recibirás los avisos en tu email.</p><a href="/">Ir al Inicio</a></div>`);
});

// Manejo de rutas SPA (Single Page Application) mejorado
app.get("*", (req, res) => {
    res.sendFile(path.join(publicDir, "index.html"), (err) => {
        if (err) res.status(404).send("Archivo no encontrado");
    });
});

app.listen(PORT, () => {
    console.log(`🚀 Servidor optimizado en puerto ${PORT}`);
});
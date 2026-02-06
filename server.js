const express = require("express");
const path = require("path");
const fs = require("fs/promises");
const fssync = require("fs"); 
const { v4: uuidv4 } = require("uuid");

const app = express();
const PORT = process.env.PORT || 3000;

const publicDir = path.join(__dirname, 'public');
if (!fssync.existsSync(publicDir)) fssync.mkdirSync(publicDir);

// 1. AUMENTAMOS EL LÍMITE
app.use(express.json({ limit: "20mb" }));
app.use(express.static(publicDir));

/* =====================
    CONFIGURACIÓN DE NOTIFICACIÓN (Vía Formspree - Bye bye bloqueos)
===================== */
async function enviarNotificacionFormspree(booking) {
    const FORMSPREE_URL = "https://formspree.io/f/xzdapoze"; 

    const datos = {
        _subject: `🚀 NUEVO TURNO: ${booking.name} ${booking.surname}`,
        cliente: `${booking.name} ${booking.surname}`,
        whatsapp: booking.phone,
        fecha: booking.date,
        hora: `${booking.start}:00hs`,
        tamaño: booking.tattoo.size,
        zona: booking.tattoo.place,
        link_referencia: "Ver imagen en Panel de Artista"
    };

    try {
        // Importación dinámica de node-fetch para compatibilidad con Render
        const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
        
        await (await fetch)(FORMSPREE_URL, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Accept': 'application/json' 
            },
            body: JSON.stringify(datos)
        });
        console.log("✅ Notificación enviada correctamente a tu email");
    } catch (error) {
        console.error("❌ Error enviando notificación:", error);
    }
}

/* =====================
    API Y RUTAS
===================== */
const BOOKINGS_FILE = path.join(__dirname, "bookings.json");

async function readBookings() {
    try {
        const data = await fs.readFile(BOOKINGS_FILE, "utf-8");
        return JSON.parse(data);
    } catch {
        await fs.writeFile(BOOKINGS_FILE, "[]");
        return [];
    }
}

app.get("/api/bookings", async (req, res) => { 
    res.json(await readBookings()); 
});

app.delete("/api/bookings/:id", async (req, res) => {
    try {
        let b = await readBookings();
        b = b.filter(x => x.id !== req.params.id);
        await fs.writeFile(BOOKINGS_FILE, JSON.stringify(b, null, 2));
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Error al borrar" });
    }
});

app.post("/api/bookings", async (req, res) => {
    try {
        const bookings = await readBookings();
        const newBooking = { id: uuidv4(), ...req.body, createdAt: new Date().toISOString() };
        bookings.push(newBooking);
        await fs.writeFile(BOOKINGS_FILE, JSON.stringify(bookings, null, 2));

        // Enviar notificación a través del puente de Formspree
        await enviarNotificacionFormspree(newBooking);

        res.status(201).json(newBooking);
    } catch (err) {
        console.error("Error en el POST:", err);
        res.status(500).json({ error: "Error" });
    }
});

app.get("/scan-qr", (req, res) => {
    res.send(`<div style="text-align:center;padding:50px;font-family:sans-serif;"><h2>Sistema de Notificación Activo</h2><p>Recibirás los avisos en tu email.</p><a href="/">Ir al Inicio</a></div>`);
});

app.get("*", (req, res) => {
    const indexPath = path.join(publicDir, "index.html");
    fssync.existsSync(indexPath) ? res.sendFile(indexPath) : res.status(404).send("index.html no encontrado");
});

app.listen(PORT, () => console.log(`🚀 Servidor activo y usando Formspree en puerto ${PORT}`));
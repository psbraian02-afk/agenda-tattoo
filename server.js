const express = require("express");
const path = require("path");
const fs = require("fs/promises");
const { existsSync, mkdirSync, writeFileSync } = require("fs");
const { v4: uuidv4 } = require("uuid");
const compression = require("compression");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;

// Configuración de rutas
const publicDir = path.join(__dirname, "public");
const BOOKINGS_FILE = path.join(__dirname, "bookings.json");

// Cache en memoria para respuestas rápidas
let bookingsCache = [];

// --- MIDDLEWARES ---
app.use(cors());
app.use(compression());
app.use(express.json({ limit: "15mb" })); // Aumentado un poco para imágenes pesadas
app.use(express.static(publicDir));

// --- INICIALIZACIÓN SÍNCRONA AL ARRANQUE ---
function initSync() {
    if (!existsSync(publicDir)) mkdirSync(publicDir, { recursive: true });
    
    if (!existsSync(BOOKINGS_FILE)) {
        writeFileSync(BOOKINGS_FILE, "[]");
    }

    try {
        const data = require(BOOKINGS_FILE);
        bookingsCache = Array.isArray(data) ? data : [];
        console.log(`✅ DB cargada: ${bookingsCache.length} reservas.`);
    } catch (err) {
        console.error("⚠️ Error cargando JSON, reseteando...", err.message);
        bookingsCache = [];
        writeFileSync(BOOKINGS_FILE, "[]");
    }
}
initSync();

// --- FUNCIONES DE APOYO ---
async function saveToDisk() {
    try {
        // Guardamos de forma asíncrona para no bloquear el servidor
        await fs.writeFile(BOOKINGS_FILE, JSON.stringify(bookingsCache, null, 2));
    } catch (err) {
        console.error("❌ Error al escribir en disco:", err.message);
    }
}

async function enviarNotificacionFormspree(booking) {
    const FORMSPREE_URL = "https://formspree.io/f/xzdapoze";
    
    // Simplificamos la lógica de la imagen para el correo
    const tieneImagen = booking.tattoo?.image && booking.tattoo.image.length > 0;

    const datos = {
        _subject: `🚀 NUEVO TURNO: ${booking.name} ${booking.surname}`,
        cliente: `${booking.name} ${booking.surname}`,
        whatsapp: booking.phone,
        fecha: booking.date,
        hora: `${booking.start}:00hs`,
        tamaño: booking.tattoo?.size || "N/A",
        zona: booking.tattoo?.place || "N/A",
        imagen_link: tieneImagen ? "Imagen adjunta en la base de datos del Admin" : "Sin imagen",
    };

    try {
        await fetch(FORMSPREE_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Accept": "application/json" },
            body: JSON.stringify(datos),
        });
    } catch (error) {
        console.error("❌ Error enviando notificación:", error.message);
    }
}

// --- RUTAS DE API ---

// Obtener todas las reservas (El admin usará esto)
app.get("/api/bookings", (req, res) => {
    res.json(bookingsCache);
});

// Crear nueva reserva
app.post("/api/bookings", async (req, res) => {
    try {
        const { name, surname, phone, date, start, tattoo } = req.body;

        const newBooking = {
            id: uuidv4(),
            name,
            surname,
            phone,
            date,
            start,
            tattoo: {
                size: tattoo?.size || "",
                place: tattoo?.place || "",
                // Aquí nos aseguramos de que la imagen Base64 se guarde
                image: tattoo?.image || null 
            },
            createdAt: new Date().toISOString(),
        };

        bookingsCache.push(newBooking);
        await saveToDisk();
        
        // No bloqueamos la respuesta al cliente por el envío del mail
        enviarNotificacionFormspree(newBooking);

        res.status(201).json(newBooking);
    } catch (err) {
        res.status(500).json({ error: "Error interno al guardar reserva" });
    }
});

// Borrar reserva
app.delete("/api/bookings/:id", async (req, res) => {
    const initialLength = bookingsCache.length;
    bookingsCache = bookingsCache.filter((x) => x.id !== req.params.id);
    
    if (bookingsCache.length !== initialLength) {
        await saveToDisk();
        return res.json({ success: true });
    }
    res.status(404).json({ error: "No encontrado" });
});

// --- RUTAS DE NAVEGACIÓN ---

app.get("/admin", (req, res) => {
    res.sendFile(path.join(publicDir, "admin.html"));
});

// SPA fallback: cualquier otra ruta va al index
app.get("*", (req, res) => {
    res.sendFile(path.join(publicDir, "index.html"));
});

app.listen(PORT, () => {
    console.log(`🚀 Servidor optimizado en: http://localhost:${PORT}`);
});
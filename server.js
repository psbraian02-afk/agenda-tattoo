const express = require("express");
const path = require("path");
const fs = require("fs/promises");
const { existsSync, mkdirSync, writeFileSync } = require("fs");
const { v4: uuidv4 } = require("uuid");
const compression = require("compression");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;

const publicDir = path.join(__dirname, "public");
const BOOKINGS_FILE = path.join(__dirname, "bookings.json");

let bookingsCache = [];

// --- MIDDLEWARES (Ajustados para no crashear) ---
app.use(cors());
app.use(compression());

/** * Aumentamos el límite a 50mb. 
 * Si un cliente sube una foto pesada desde un iPhone/Android moderno, 
 * 15mb se queda corto y tira el servidor.
 */
app.use(express.json({ limit: "50mb" })); 
app.use(express.urlencoded({ limit: "50mb", extended: true }));

app.use(express.static(publicDir));

// --- INICIALIZACIÓN ---
function initSync() {
    if (!existsSync(publicDir)) mkdirSync(publicDir, { recursive: true });
    if (!existsSync(BOOKINGS_FILE)) writeFileSync(BOOKINGS_FILE, "[]");

    try {
        // Usamos fs.readFileSync para evitar problemas de caché de 'require'
        const rawData = require('fs').readFileSync(BOOKINGS_FILE, 'utf-8');
        bookingsCache = JSON.parse(rawData);
        console.log(`✅ DB cargada: ${bookingsCache.length} reservas.`);
    } catch (err) {
        console.error("⚠️ Error cargando JSON:", err.message);
        bookingsCache = [];
        writeFileSync(BOOKINGS_FILE, "[]");
    }
}
initSync();

// --- FUNCIONES DE APOYO ---
async function saveToDisk() {
    try {
        await fs.writeFile(BOOKINGS_FILE, JSON.stringify(bookingsCache, null, 2));
    } catch (err) {
        console.error("❌ Error al escribir en disco:", err.message);
    }
}

async function enviarNotificacionFormspree(booking) {
    const FORMSPREE_URL = "https://formspree.io/f/xzdapoze";
    const tieneImagen = booking.tattoo?.image && booking.tattoo.image.length > 0;

    const datos = {
        _subject: `🚀 NUEVO TURNO: ${booking.name} ${booking.surname}`,
        cliente: `${booking.name} ${booking.surname}`,
        whatsapp: booking.phone,
        fecha: booking.date,
        hora: `${booking.start}:00hs`,
        tamaño: booking.tattoo?.size || "N/A",
        zona: booking.tattoo?.place || "N/A",
        imagen: tieneImagen ? "Imagen guardada en el panel Admin" : "Sin imagen",
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

app.get("/api/bookings", (req, res) => {
    res.json(bookingsCache);
});

app.post("/api/bookings", async (req, res) => {
    try {
        const { name, surname, phone, email, date, start, tattoo } = req.body;

        const newBooking = {
            id: uuidv4(),
            name,
            surname,
            phone,
            email: email || "",
            date,
            start,
            tattoo: {
                size: tattoo?.size || "",
                place: tattoo?.place || "",
                image: tattoo?.image || null // Aquí se guarda el Base64 de la foto
            },
            createdAt: new Date().toISOString(),
        };

        bookingsCache.push(newBooking);
        await saveToDisk();
        enviarNotificacionFormspree(newBooking);

        res.status(201).json(newBooking);
    } catch (err) {
        console.error("Error en POST /api/bookings:", err);
        res.status(500).json({ error: "Error interno al guardar" });
    }
});

app.delete("/api/bookings/:id", async (req, res) => {
    const initialLength = bookingsCache.length;
    bookingsCache = bookingsCache.filter((x) => x.id !== req.params.id);
    
    if (bookingsCache.length !== initialLength) {
        await saveToDisk();
        return res.json({ success: true });
    }
    res.status(404).json({ error: "No encontrado" });
});

// --- NAVEGACIÓN ---
app.get("/admin", (req, res) => {
    res.sendFile(path.join(publicDir, "admin.html"));
});

app.get("*", (req, res) => {
    res.sendFile(path.join(publicDir, "index.html"));
});

// Manejador de errores para atrapar fallos de tamaño de archivo
app.use((err, req, res, next) => {
    if (err.type === 'entity.too.large') {
        return res.status(413).json({ error: "La imagen es demasiado grande." });
    }
    next(err);
});

app.listen(PORT, () => {
    console.log(`🚀 Servidor listo en: http://localhost:${PORT}`);
});
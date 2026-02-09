const express = require("express");
const path = require("path");
const fs = require("fs/promises");
const { existsSync, mkdirSync, writeFileSync, readFileSync } = require("fs");
const { v4: uuidv4 } = require("uuid");
const compression = require("compression");
const cors = require("cors");

const app = express();
// Railway necesita que uses process.env.PORT
const PORT = process.env.PORT || 3000;

const publicDir = path.join(__dirname, "public");
const BOOKINGS_FILE = path.join(__dirname, "bookings.json");

let bookingsCache = [];

// --- MIDDLEWARES (Configuración de alto rendimiento) ---
app.use(cors());
app.use(compression());
app.use(express.json({ limit: "50mb" })); 
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(express.static(publicDir));

// --- INICIALIZACIÓN DE DATOS (Sin errores de carga) ---
function initSync() {
    try {
        if (!existsSync(publicDir)) mkdirSync(publicDir, { recursive: true });
        
        // Si el archivo no existe o está vacío, creamos uno válido
        if (!existsSync(BOOKINGS_FILE)) {
            writeFileSync(BOOKINGS_FILE, "[]");
            console.log("📄 Archivo bookings.json creado.");
        }

        const rawData = readFileSync(BOOKINGS_FILE, 'utf-8').trim();
        
        // Si el archivo existe pero está vacío por error, forzamos el array
        if (!rawData || rawData === "") {
            bookingsCache = [];
            writeFileSync(BOOKINGS_FILE, "[]");
        } else {
            bookingsCache = JSON.parse(rawData);
        }
        
        console.log(`✅ Base de datos unificada: ${bookingsCache.length} reservas.`);
    } catch (err) {
        console.error("⚠️ Error crítico en base de datos, reseteando:", err.message);
        bookingsCache = [];
        writeFileSync(BOOKINGS_FILE, "[]");
    }
}
initSync();

// --- FUNCIONES DE APOYO (Manteniendo TODO) ---

async function saveToDisk() {
    try {
        await fs.writeFile(BOOKINGS_FILE, JSON.stringify(bookingsCache, null, 2));
    } catch (err) {
        console.error("❌ Error al escribir en disco:", err.message);
    }
}

async function enviarNotificacionFormspree(booking) {
    const FORMSPREE_URL = "https://formspree.io/f/xzdapoze";
    const tieneImagen = booking.tattoo?.image && booking.tattoo.image.length > 10;

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
        console.log("📧 Notificación enviada a Formspree.");
    } catch (error) {
        console.error("❌ Error notificación correo:", error.message);
    }
}

// --- API UNIFICADA (Para Index y Admin) ---

app.get("/api/bookings", (req, res) => {
    res.json(bookingsCache);
});

app.post("/api/bookings", async (req, res) => {
    try {
        const { name, surname, phone, email, date, start, tattoo } = req.body;
        const newBooking = {
            id: uuidv4(),
            name, surname, phone, email: email || "",
            date, start,
            tattoo: {
                size: tattoo?.size || "",
                place: tattoo?.place || "",
                image: tattoo?.image || null 
            },
            createdAt: new Date().toISOString(),
        };

        bookingsCache.push(newBooking);
        await saveToDisk();
        enviarNotificacionFormspree(newBooking);

        res.status(201).json(newBooking);
    } catch (err) {
        res.status(500).json({ error: "Error al guardar" });
    }
});

app.delete("/api/bookings/:id", async (req, res) => {
    const originalCount = bookingsCache.length;
    bookingsCache = bookingsCache.filter((x) => x.id !== req.params.id);
    if (bookingsCache.length !== originalCount) {
        await saveToDisk();
    }
    res.json({ success: true });
});

// --- NAVEGACIÓN ---

// Redirigir /admin o /admin.html al mismo archivo
app.get(["/admin", "/admin.html"], (req, res) => {
    res.sendFile(path.join(publicDir, "admin.html"));
});

// Todo lo demás al index
app.get("*", (req, res) => {
    res.sendFile(path.join(publicDir, "index.html"));
});

// Manejo de errores de carga pesada
app.use((err, req, res, next) => {
    if (err.type === 'entity.too.large') {
        return res.status(413).json({ error: "Imagen demasiado pesada." });
    }
    next(err);
});

// IMPORTANTE: En Railway, "0.0.0.0" es fundamental
app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 RichardTattoo ONLINE en puerto ${PORT}`);
});
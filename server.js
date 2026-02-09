const express = require("express");
const path = require("path");
const fs = require("fs/promises");
const { existsSync, mkdirSync, writeFileSync, readFileSync } = require("fs");
const { v4: uuidv4 } = require("uuid");
const compression = require("compression");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;

const publicDir = path.join(__dirname, "public");
const BOOKINGS_FILE = path.join(__dirname, "bookings.json");

let bookingsCache = [];

// --- MIDDLEWARES (Soporte para fotos pesadas y optimización) ---
app.use(cors());
app.use(compression());
app.use(express.json({ limit: "50mb" })); 
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(express.static(publicDir));

// --- INICIALIZACIÓN (Base de datos única para todo el sitio) ---
function initSync() {
    if (!existsSync(publicDir)) mkdirSync(publicDir, { recursive: true });
    if (!existsSync(BOOKINGS_FILE)) writeFileSync(BOOKINGS_FILE, "[]");

    try {
        const rawData = readFileSync(BOOKINGS_FILE, 'utf-8');
        bookingsCache = JSON.parse(rawData);
        console.log(`✅ Base de datos unificada: ${bookingsCache.length} reservas cargadas.`);
    } catch (err) {
        console.error("⚠️ Error cargando JSON, reseteando...");
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
    const FORMSPREE_URL = "https://formspree.io/f/xzdapoze"; // Tu ID de Formspree
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
        console.log("📧 Notificación de correo enviada.");
    } catch (error) {
        console.error("❌ Error enviando notificación:", error.message);
    }
}

// --- RUTAS DE API (Fuente única de datos para el Index y el Admin) ---

// 1. Obtener todas las reservas (para bloquear fechas en el index y listarlas en admin)
app.get("/api/bookings", (req, res) => {
    res.json(bookingsCache);
});

// 2. Crear una nueva reserva (desde el formulario principal)
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
                image: tattoo?.image || null // Aquí se guarda la foto en Base64
            },
            createdAt: new Date().toISOString(),
        };

        bookingsCache.push(newBooking);
        await saveToDisk();
        
        // Ejecutar notificación en segundo plano
        enviarNotificacionFormspree(newBooking);

        res.status(201).json(newBooking);
    } catch (err) {
        console.error("Error en POST /api/bookings:", err);
        res.status(500).json({ error: "Error interno al guardar" });
    }
});

// 3. Eliminar reserva (Desde el panel de administración)
app.delete("/api/bookings/:id", async (req, res) => {
    const initialLength = bookingsCache.length;
    bookingsCache = bookingsCache.filter((x) => x.id !== req.params.id);
    
    if (bookingsCache.length !== initialLength) {
        await saveToDisk();
        return res.json({ success: true });
    }
    res.status(404).json({ error: "No encontrado" });
});

// --- MANEJO DE NAVEGACIÓN ---

// Forzamos que tanto /admin como /admin.html carguen el panel de control
app.get(["/admin", "/admin.html"], (req, res) => {
    res.sendFile(path.join(publicDir, "admin.html"));
});

// Cualquier otra ruta redirige al index (Single Page Application style)
app.get("*", (req, res) => {
    res.sendFile(path.join(publicDir, "index.html"));
});

// Manejador de errores para archivos demasiado grandes
app.use((err, req, res, next) => {
    if (err.type === 'entity.too.large') {
        return res.status(413).json({ error: "La imagen es demasiado pesada para el servidor." });
    }
    next(err);
});

app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Servidor listo en el puerto ${PORT}`);
});
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

// --- MIDDLEWARES ---
app.use(cors());
app.use(compression());
app.use(express.json({ limit: "50mb" })); 
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(express.static(publicDir));

// --- INICIALIZACIÓN ---
function initSync() {
    try {
        if (!existsSync(publicDir)) mkdirSync(publicDir, { recursive: true });
        if (!existsSync(BOOKINGS_FILE)) writeFileSync(BOOKINGS_FILE, "[]");

        const rawData = readFileSync(BOOKINGS_FILE, 'utf-8').trim();
        bookingsCache = rawData ? JSON.parse(rawData) : [];
        
        console.log(`✅ DB Unificada: ${bookingsCache.length} reservas (Sin imágenes en disco).`);
    } catch (err) {
        console.error("⚠️ Error inicializando:", err.message);
        bookingsCache = [];
        writeFileSync(BOOKINGS_FILE, "[]");
    }
}
initSync();

// --- ENVÍO A FORMSPARK (Imagen por correo) ---
async function enviarAFormspark(booking, base64Image) {
    // Reemplaza con tu ID de Formspark
    const FORMSPARK_URL = "https://submit-form.com/xzdapoze"; 

    try {
        await fetch(FORMSPARK_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Accept": "application/json" },
            body: JSON.stringify({
                _email_subject: `Nueva Cita: ${booking.name} ${booking.surname}`,
                cliente: `${booking.name} ${booking.surname}`,
                whatsapp: `https://wa.me/598${booking.phone}`,
                fecha: booking.date,
                hora: `${booking.start}:00hs`,
                tatuaje: `${booking.tattoo.size} en ${booking.tattoo.place}`,
                // La imagen se envía directamente aquí
                referencia_foto: base64Image, 
            }),
        });
        console.log("📧 Imagen enviada a Formspark correctamente.");
    } catch (error) {
        console.error("❌ Error en Formspark:", error.message);
    }
}

// --- API ---

app.get("/api/bookings", (req, res) => {
    res.json(bookingsCache);
});

app.post("/api/bookings", async (req, res) => {
    try {
        const { name, surname, phone, email, date, start, tattoo } = req.body;
        
        // Extraemos la imagen para el correo
        const imagenParaEmail = tattoo?.image;

        const newBooking = {
            id: uuidv4(),
            name, surname, phone, email: email || "",
            date, start,
            tattoo: {
                size: tattoo?.size || "",
                place: tattoo?.place || "",
                image: null // ⚠️ NO guardamos la imagen para evitar el CRASH (SIGTERM)
            },
            createdAt: new Date().toISOString(),
        };

        bookingsCache.push(newBooking);
        
        // Guardamos el JSON (ahora es muy liviano)
        await fs.writeFile(BOOKINGS_FILE, JSON.stringify(bookingsCache, null, 2));

        // Enviamos a Formspark sin bloquear al usuario
        if (imagenParaEmail) {
            enviarAFormspark(newBooking, imagenParaEmail).catch(err => console.error("Error Formspark:", err));
        }

        res.status(201).json(newBooking);
    } catch (err) {
        console.error("❌ Error en reserva:", err);
        res.status(500).json({ error: "Error interno" });
    }
});

app.delete("/api/bookings/:id", async (req, res) => {
    const originalCount = bookingsCache.length;
    bookingsCache = bookingsCache.filter((x) => x.id !== req.params.id);
    if (bookingsCache.length !== originalCount) {
        await fs.writeFile(BOOKINGS_FILE, JSON.stringify(bookingsCache, null, 2));
    }
    res.json({ success: true });
});

// --- NAVEGACIÓN ---
app.get(["/admin", "/admin.html"], (req, res) => {
    res.sendFile(path.join(publicDir, "admin.html"));
});

app.get("*", (req, res) => {
    res.sendFile(path.join(publicDir, "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 RichardTattoo ONLINE en puerto ${PORT}`);
});
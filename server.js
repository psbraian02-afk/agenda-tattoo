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

// --- MIDDLEWARES (Configurados para soportar fotos sin morir) ---
app.use(cors());
app.use(compression());
app.use(express.json({ limit: "50mb" })); 
app.use(express.static(publicDir));

// --- INICIALIZACIÓN ---
function initSync() {
    if (!existsSync(publicDir)) mkdirSync(publicDir, { recursive: true });
    if (!existsSync(BOOKINGS_FILE)) writeFileSync(BOOKINGS_FILE, "[]");
    try {
        const data = readFileSync(BOOKINGS_FILE, "utf-8");
        bookingsCache = JSON.parse(data);
        console.log("✅ DB conectada.");
    } catch (err) {
        bookingsCache = [];
    }
}
initSync();

// --- FUNCIÓN FORMSPARK ---
async function enviarAFormspark(booking, base64Image) {
    // REEMPLAZA 'TU_ID_DE_FORMSPARK' con el ID que te da Formspark (el código de la URL)
    const FORMSPARK_ACTION_URL = "https://submit-form.com/xzdapoze"; 

    try {
        await fetch(FORMSPARK_ACTION_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
            },
            body: JSON.stringify({
                cliente: `${booking.name} ${booking.surname}`,
                whatsapp: `0${booking.phone}`,
                fecha: booking.date,
                hora: `${booking.start}:00hs`,
                tatuaje_detalle: `${booking.tattoo.size} en ${booking.tattoo.place}`,
                // Enviamos la imagen. Formspark la recibirá como un string largo o link si el plan lo permite
                imagen_referencia: base64Image, 
                _email_subject: `Nuevo Turno: ${booking.name}`
            }),
        });
        console.log("📧 Enviado a Formspark correctamente.");
    } catch (error) {
        console.error("❌ Error en Formspark:", error.message);
    }
}

// --- RUTAS API ---

app.post("/api/bookings", async (req, res) => {
    try {
        const { name, surname, phone, date, start, tattoo } = req.body;
        
        // Guardamos la imagen en una constante y la quitamos del objeto original
        const imagenTemporal = tattoo?.image;

        const newBooking = {
            id: uuidv4(),
            name, surname, phone, date, start,
            tattoo: {
                size: tattoo?.size || "",
                place: tattoo?.place || "",
                image: null // 👈 IMPORTANTE: Aquí la borramos para que el JSON no pese nada
            },
            createdAt: new Date().toISOString(),
        };

        // Guardar en JSON (solo texto ligero)
        bookingsCache.push(newBooking);
        await fs.writeFile(BOOKINGS_FILE, JSON.stringify(bookingsCache, null, 2));

        // Enviar imagen por correo vía Formspark
        if (imagenTemporal) {
            enviarAFormspark(newBooking, imagenTemporal);
        }

        res.status(201).json(newBooking);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Error en el servidor" });
    }
});

app.get("/api/bookings", (req, res) => res.json(bookingsCache));

app.delete("/api/bookings/:id", async (req, res) => {
    bookingsCache = bookingsCache.filter(b => b.id !== req.params.id);
    await fs.writeFile(BOOKINGS_FILE, JSON.stringify(bookingsCache, null, 2));
    res.json({ success: true });
});

app.get("*", (req, res) => res.sendFile(path.join(publicDir, "index.html")));

app.listen(PORT, () => console.log(`🚀 RichardTattoo listo en puerto ${PORT}`));
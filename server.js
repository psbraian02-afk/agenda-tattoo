const express = require("express");
const path = require("path");
const fs = require("fs/promises");
const fssync = require("fs");
const { v4: uuidv4 } = require("uuid");
const compression = require("compression");
const cors = require("cors"); // Importante para Railway

const app = express();
const PORT = process.env.PORT || 3000;

// En Railway, __dirname suele ser /app.
const publicDir = path.join(__dirname, 'public');

// IMPORTANTE:
// En Railway, si reinicias el servidor, el archivo bookings.json se borrará 
// porque el sistema de archivos es "efímero". 
// El código funcionará, pero ten en cuenta que los datos se reinician con cada "Deploy".
const BOOKINGS_FILE = path.join(__dirname, "bookings.json");

// Variable en memoria
let bookingsCache = [];

// Middleware
app.use(cors()); // Habilita conexiones externas seguras
app.use(compression()); 
app.use(express.json({ limit: "10mb" })); 
app.use(express.static(publicDir, { maxAge: '1d' })); 

// Inicialización: Cargar datos al arrancar
async function init() {
    // Asegurar que la carpeta public existe (sin romper si ya existe)
    if (!fssync.existsSync(publicDir)) {
        try {
            fssync.mkdirSync(publicDir, { recursive: true });
        } catch (e) {
            console.log("Nota: Carpeta public ya existía o no se pudo crear.");
        }
    }

    // Intentar leer la base de datos local
    try {
        const data = await fs.readFile(BOOKINGS_FILE, "utf-8");
        bookingsCache = JSON.parse(data);
        console.log(`✅ Base de datos cargada: ${bookingsCache.length} reservas.`);
    } catch (error) {
        // Si no existe el archivo, creamos uno vacío en memoria y disco
        console.log("ℹ️ No se encontró bookings.json, creando uno nuevo...");
        bookingsCache = [];
        try {
            await fs.writeFile(BOOKINGS_FILE, "[]");
        } catch (writeErr) {
            console.error("⚠️ No se pudo escribir el archivo inicial (posiblemente falta de permisos de escritura en disco efímero).");
        }
    }
}

// Ejecutamos la inicialización
init();

/* =====================
    CONFIGURACIÓN DE NOTIFICACIÓN
===================== */
async function enviarNotificacionFormspree(booking) {
    // Asegúrate de que este ID de formspree sea el correcto
    const FORMSPREE_URL = "https://formspree.io/f/xzdapoze";
    
    const datos = {
        _subject: `🚀 NUEVO TURNO: ${booking.name} ${booking.surname}`,
        cliente: `${booking.name} ${booking.surname}`,
        whatsapp: booking.phone,
        fecha: booking.date,
        hora: `${booking.start}:00hs`,
        tamaño: booking.tattoo?.size || 'N/A',
        zona: booking.tattoo?.place || 'N/A',
        imagen_referencia: booking.tattoo?.image ? "Adjunta en base64 (muy larga)" : "Sin imagen"
    };

    try {
        // Fetch nativo (Node 18+)
        const response = await fetch(FORMSPREE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify(datos)
        });
        
        if (response.ok) {
            console.log("📧 Notificación enviada a Formspree exitosamente.");
        } else {
            console.error("❌ Formspree devolvió error:", response.status);
        }
    } catch (error) {
        console.error("❌ Error enviando email:", error.message);
    }
}

/* =====================
    API Y RUTAS
===================== */

// GET
app.get("/api/bookings", (req, res) => {
    res.json(bookingsCache);
});

// DELETE
app.delete("/api/bookings/:id", async (req, res) => {
    try {
        bookingsCache = bookingsCache.filter(x => x.id !== req.params.id);
        // Intentamos guardar en disco, si falla no detenemos la respuesta
        try {
            await fs.writeFile(BOOKINGS_FILE, JSON.stringify(bookingsCache, null, 2));
        } catch (e) { console.error("Error guardando en disco (Delete)", e.message); }
        
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Error al borrar" });
    }
});

// POST
app.post("/api/bookings", async (req, res) => {
    try {
        const newBooking = { 
            id: uuidv4(), 
            ...req.body, 
            createdAt: new Date().toISOString() 
        };
        
        bookingsCache.push(newBooking);
        
        // Guardado asíncrono en disco
        fs.writeFile(BOOKINGS_FILE, JSON.stringify(bookingsCache, null, 2)).catch(err => console.error("Error escritura disco:", err.message));

        // Notificación
        enviarNotificacionFormspree(newBooking);

        res.status(201).json(newBooking);
    } catch (err) {
        console.error("Error en el POST:", err);
        res.status(500).json({ error: "Error interno" });
    }
});

app.get("/scan-qr", (req, res) => {
    // Como eliminaste la lógica de Whatsapp en este archivo y usas Formspree, 
    // este mensaje es correcto.
    res.send(`<div style="text-align:center;padding:50px;font-family:sans-serif;"><h2>Sistema de Notificación (Email) Activo</h2><p>Las reservas llegan a tu correo vía Formspree.</p><a href="/">Ir al Inicio</a></div>`);
});

// SPA Fallback
app.get("*", (req, res) => {
    const indexPath = path.join(publicDir, "index.html");
    if (fssync.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.status(404).send("Error: No se encuentra index.html en la carpeta public. Asegúrate de subirlo.");
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Servidor listo en puerto ${PORT}`);
});
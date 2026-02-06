const express = require("express");
const path = require("path");
const fs = require("fs/promises");
const fssync = require("fs"); 
const { v4: uuidv4 } = require("uuid");
const nodemailer = require("nodemailer"); // Nueva librería para correos

const app = express();
const PORT = process.env.PORT || 3000;

const publicDir = path.join(__dirname, 'public');
if (!fssync.existsSync(publicDir)) fssync.mkdirSync(publicDir);

app.use(express.json({ limit: "5mb" }));
app.use(express.static(publicDir));

/* =====================
    CONFIGURACIÓN DE EMAIL (Reemplaza a WhatsApp)
===================== */
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'richardtattoo2026@gmail.com',
        pass: 'ktmeidxvfkfvgudi' // RECUERDA: Aquí van las 16 letras de Google sin espacios
    }
});

async function enviarNotificacionEmail(booking) {
    const mailOptions = {
        from: '"Agenda Richard Tattoo" <richardtattoo2026@gmail.com>',
        to: 'richardtattoo2026@gmail.com', 
        subject: `🚀 NUEVO TURNO: ${booking.name} ${booking.surname}`,
        html: `
            <div style="font-family: sans-serif; border: 1px solid #ddd; padding: 20px; border-radius: 10px;">
                <h2 style="color: #333;">🔥 Tienes una nueva reserva</h2>
                <p><strong>Cliente:</strong> ${booking.name} ${booking.surname}</p>
                <p><strong>Teléfono:</strong> ${booking.phone}</p>
                <p><strong>Fecha:</strong> ${booking.date}</p>
                <p><strong>Hora:</strong> ${booking.start}:00hs</p>
                <hr>
                <p style="font-size: 12px; color: #666;">Notificación enviada automáticamente desde tu sistema de agenda.</p>
            </div>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log("✅ Notificación de correo enviada");
    } catch (error) {
        console.error("❌ Error enviando email:", error);
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

// Mantengo tus rutas originales de obtener y borrar
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

// RUTA DE CREAR CITA (Ahora usa Email)
app.post("/api/bookings", async (req, res) => {
    try {
        const bookings = await readBookings();
        const newBooking = { id: uuidv4(), ...req.body, createdAt: new Date().toISOString() };
        bookings.push(newBooking);
        await fs.writeFile(BOOKINGS_FILE, JSON.stringify(bookings, null, 2));

        // Enviar aviso por correo al tatuador
        enviarNotificacionEmail(newBooking);

        res.status(201).json(newBooking);
    } catch (err) {
        console.error("Error en el POST:", err);
        res.status(500).json({ error: "Error" });
    }
});

// Ruta vieja de QR como aviso
app.get("/scan-qr", (req, res) => {
    res.send(`<div style="text-align:center;padding:50px;font-family:sans-serif;"><h2>El sistema de WhatsApp se cambió por Email</h2><p>Ya no necesitas escanear nada. Recibirás avisos en richardtattoo2026@gmail.com</p><a href="/">Ir al Inicio</a></div>`);
});

app.get("*", (req, res) => {
    const indexPath = path.join(publicDir, "index.html");
    fssync.existsSync(indexPath) ? res.sendFile(indexPath) : res.status(404).send("index.html no encontrado");
});

app.listen(PORT, () => console.log(`🚀 Servidor en puerto ${PORT} - Notificaciones por Email listas`));
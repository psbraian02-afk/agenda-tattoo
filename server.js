const express = require("express");
const path = require("path");
const fs = require("fs/promises");
const fssync = require("fs"); 
const { v4: uuidv4 } = require("uuid");

// --- LIBRERÍAS ---
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrImage = require('qr-image');
const cron = require('node-cron');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuración de carpetas
const publicDir = path.join(__dirname, 'public');
if (!fssync.existsSync(publicDir)) {
    fssync.mkdirSync(publicDir);
}

/* =====================
    RUTAS DE INTERFAZ
===================== */
app.use(express.json({ limit: "10mb" }));
app.use(express.static(publicDir));

// RUTA PARA EL QR
app.get("/scan-qr", (req, res) => {
    const qrPath = path.join(publicDir, 'qr.png');
    if (fssync.existsSync(qrPath)) {
        res.send(`
            <div style="text-align:center; font-family:sans-serif; margin-top:50px;">
                <h1>Escanea el QR de WhatsApp</h1>
                <img src="/qr.png?t=${Date.now()}" style="border: 5px solid #25D366; border-radius: 10px; width: 300px;">
                <p>Si ya escaneaste, esta página dirá que no está disponible.</p>
                <script>setInterval(() => location.reload(), 5000);</script>
            </div>
        `);
    } else {
        res.send(`
            <div style="text-align:center; font-family:sans-serif; margin-top:50px;">
                <h2>QR no disponible</h2>
                <p>Esto puede ser porque: <br> 1. Ya estás conectado. <br> 2. El servidor aún está iniciando.</p>
                <a href="/scan-qr">Reintentar</a>
            </div>
        `);
    }
});

/* =====================
    Configuración WhatsApp
===================== */
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: { 
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] 
    }
});

client.on('qr', (qr) => {
    console.log('--- GENERANDO QR ---');
    const img = qrImage.image(qr, { type: 'png' });
    const qrPath = path.join(publicDir, 'qr.png');
    const fileStream = fssync.createWriteStream(qrPath);
    img.pipe(fileStream);
});

client.on('ready', () => {
    console.log('✅ WhatsApp Conectado');
    const qrPath = path.join(publicDir, 'qr.png');
    if (fssync.existsSync(qrPath)) fssync.unlinkSync(qrPath);
    client.sendMessage("59891923107@c.us", "✅ Richard, ya estoy conectado y los mensajes están activos.");
});

client.initialize().catch(err => console.error("Error al iniciar WhatsApp:", err));

/* =====================
    Lógica de Archivos
===================== */
// Usamos una ruta persistente si es posible, sino /tmp
const BOOKINGS_FILE = path.join(__dirname, "bookings.json");

async function ensureBookingsFile() {
  try { await fs.access(BOOKINGS_FILE); } 
  catch { await fs.writeFile(BOOKINGS_FILE, "[]", "utf-8"); }
}

async function readBookings() {
  await ensureBookingsFile();
  const data = await fs.readFile(BOOKINGS_FILE, "utf-8");
  return JSON.parse(data);
}

async function writeBookings(bookings) {
  await fs.writeFile(BOOKINGS_FILE, JSON.stringify(bookings, null, 2), "utf-8");
}

/* =====================
    API Bookings (CRUD COMPLETO)
===================== */

// 1. OBTENER TODAS LAS CITAS (Lo que le faltaba a tu panel)
app.get("/api/bookings", async (req, res) => {
    try {
        const bookings = await readBookings();
        res.json(bookings);
    } catch (err) {
        res.status(500).json({ error: "Error al leer citas" });
    }
});

// 2. CREAR CITA
app.post("/api/bookings", async (req, res) => {
  try {
    const bookings = await readBookings();
    const newBooking = { id: uuidv4(), ...req.body, createdAt: new Date().toISOString() };
    bookings.push(newBooking);
    await writeBookings(bookings);

    const numeroTatuador = "59891923107@c.us"; 
    
    let numCliente = newBooking.phone.replace(/[^0-9]/g, "");
    if (numCliente.startsWith("0")) numCliente = "598" + numCliente.substring(1);
    if (!numCliente.startsWith("598")) numCliente = "598" + numCliente;
    const chatIdCliente = `${numCliente}@c.us`;

    const aviso = `🚀 *NUEVO TURNO*\n\n📱 Cliente: ${newBooking.name} ${newBooking.surname}\n📞 Tel: ${newBooking.phone}\n📅 Fecha: ${newBooking.date}\n⏰ Hora: ${newBooking.start}:00hs`;

    client.sendMessage(numeroTatuador, aviso).catch(e => console.error("Error Richard:", e));
    client.sendMessage(chatIdCliente, `¡Hola! Tu turno ha sido agendado para el ${newBooking.date}. Te esperamos.`).catch(e => console.error("Error Cliente:", e));

    res.status(201).json(newBooking);
  } catch (err) { 
    console.error(err);
    res.status(500).json({ error: "Error interno" }); 
  }
});

// 3. ELIMINAR CITA (Para que funcione el botón de borrar en el panel)
app.delete("/api/bookings/:id", async (req, res) => {
    try {
        let bookings = await readBookings();
        bookings = bookings.filter(b => b.id !== req.params.id);
        await writeBookings(bookings);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Error al borrar" });
    }
});

/* =====================
    Marketing (Cron)
===================== */
cron.schedule('0 10 * * *', async () => { // Cambiado a las 10:00 AM para no ser spam cada minuto
    try {
        const bookings = await readBookings();
        if (bookings.length === 0) return;
        
        const uniquePhones = [...new Set(bookings.map(b => {
            let num = b.phone.replace(/[^0-9]/g, "");
            if (num.startsWith("0")) num = "598" + num.substring(1);
            if (!num.startsWith("598")) num = "598" + num;
            return `${num}@c.us`;
        }))];

        for (const chatId of uniquePhones) {
            await client.sendMessage(chatId, "¡Hola! Tenemos nuevos diseños disponibles. ¿Te gustaría agendar un nuevo tatuaje?").catch(() => {});
        }
    } catch (err) { console.error("Error en Cron:", err); }
});

// Catch-all para el frontend
app.get("*", (req, res) => {
    const indexPath = path.join(publicDir, "index.html");
    if (fssync.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.status(404).send("No se encontró index.html");
    }
});

app.listen(PORT, () => console.log(`✅ Servidor en puerto ${PORT}`));
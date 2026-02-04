// server.js
const express = require('express');
const cors = require('cors');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());

const FILE = "bookings.json";

// Crear el archivo si no existe
if(!fs.existsSync(FILE)) fs.writeFileSync(FILE, JSON.stringify([]));

// Obtener todas las reservas
app.get("/api/bookings", (req, res) => {
  const data = JSON.parse(fs.readFileSync(FILE));
  res.json(data);
});

// Guardar una reserva nueva
app.post("/api/bookings", (req, res) => {
  const data = JSON.parse(fs.readFileSync(FILE));
  const booking = req.body;
  data.push(booking);
  fs.writeFileSync(FILE, JSON.stringify(data));
  res.json({ status: "ok" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

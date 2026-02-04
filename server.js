const express = require("express");
const path = require("path");

const app = express();

// Servir archivos estáticos (index.html, CSS, JS)
app.use(express.static(path.join(__dirname)));

// Cualquier otra ruta redirige a index.html (opcional)
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// Usar puerto asignado por Render
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

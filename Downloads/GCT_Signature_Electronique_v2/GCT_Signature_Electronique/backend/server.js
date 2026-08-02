const express = require('express');
const cors = require('cors');
console.log('DB_HOST:', process.env.DB_HOST);
console.log('DB_NAME:', process.env.DB_NAME);
require('dotenv').config();
console.log('ENV CHECK:', {
    DB_HOST: process.env.DB_HOST,
    DB_PORT: process.env.DB_PORT,
    DB_USER: process.env.DB_USER,
    DB_NAME: process.env.DB_NAME,
});

const authRoutes = require('./routes/authRoutes');
const documentRoutes = require('./routes/documentRoutes');
const signatureRoutes = require('./routes/signatureRoutes');
const verifyRoute = require('./routes/verifyRoute');

const app = express();

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static('uploads'));

app.use('/api', authRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/signatures', signatureRoutes);

// Route publique de vérification — sans authentification
app.use('/api/verify', verifyRoute);

app.get('/', (req, res) => {
    res.send('Le serveur backend GCT fonctionne correctement !');
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Serveur démarré sur http://localhost:${PORT}`);
});
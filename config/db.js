// Ce fichier sert UNIQUEMENT à se connecter à la base de données MySQL.
// On utilise le paquet "mysql2" car il est simple et il accepte les "promesses"
// (ça nous permet d'utiliser async/await, plus facile à lire que les callbacks)

const mysql = require('mysql2');
require('dotenv').config(); // permet de lire les valeurs du fichier .env

// On crée un "pool" de connexions = un petit groupe de connexions prêtes à l'emploi.
// C'est plus efficace que de créer une nouvelle connexion à chaque requête.
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
});

// On transforme le pool en version "promise"
// pour pouvoir écrire : const [resultat] = await db.query(...)
const db = pool.promise();

// On exporte "db" pour pouvoir l'utiliser dans les autres fichiers (routes)
module.exports = db;

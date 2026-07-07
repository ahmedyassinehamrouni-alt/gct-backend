// Ce fichier gère tout ce qui concerne les documents :
// créer un document (avec un PDF), voir la liste, voir un document précis,
// et faire une recherche simple par titre.

const express = require('express');
const router = express.Router();
const db = require('../config/db');
const multer = require('multer');

// ===== Configuration de Multer =====
// Multer est l'outil qui permet de recevoir un fichier (le PDF) envoyé par le frontend.
const stockage = multer.diskStorage({
    // Dossier où seront enregistrés les fichiers PDF téléversés
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    // On choisit le nom du fichier enregistré sur le serveur.
    // On ajoute la date (Date.now()) devant pour éviter que 2 fichiers
    // portent exactement le même nom.
    filename: (req, file, cb) => {
        const nomUnique = Date.now() + '-' + file.originalname;
        cb(null, nomUnique);
    }
});

const upload = multer({ storage: stockage });

// ===== Route : POST /api/documents =====
// Créer un nouveau document.
// upload.single('fichier_pdf') = on attend un seul fichier, dans un champ nommé "fichier_pdf"
router.post('/', upload.single('fichier_pdf'), async (req, res) => {
    const { titre, description, user_id } = req.body;

    // On vérifie que les champs obligatoires sont bien présents
    if (!titre || !user_id || !req.file) {
        return res.status(400).json({ message: "Le titre, le fichier PDF et l'utilisateur sont obligatoires." });
    }

    try {
        const nomFichier = req.file.filename; // nom du fichier enregistré par multer

        const [resultat] = await db.query(
            'INSERT INTO documents (titre, description, fichier_pdf, user_id) VALUES (?, ?, ?, ?)',
            [titre, description || '', nomFichier, user_id]
        );

        res.status(201).json({
            message: "Document créé avec succès.",
            id: resultat.insertId
        });

    } catch (erreur) {
        console.error(erreur);
        res.status(500).json({ message: "Erreur du serveur." });
    }
});

// ===== Route : GET /api/documents =====
// Voir la liste de tous les documents.
// On peut filtrer avec ?recherche=motcle pour faire une recherche simple sur le titre.
router.get('/', async (req, res) => {
    const { recherche } = req.query;

    try {
        // On récupère les documents en les joignant avec la table "users"
        // pour connaître le nom de l'auteur (l'employé qui a créé le document)
        let sql = `
            SELECT documents.*, users.nom AS auteur_nom, users.prenom AS auteur_prenom
            FROM documents
            JOIN users ON documents.user_id = users.id
        `;
        let parametres = [];

        // Si l'utilisateur tape quelque chose dans la barre de recherche
        if (recherche) {
            sql += ' WHERE documents.titre LIKE ?';
            parametres.push('%' + recherche + '%');
        }

        sql += ' ORDER BY documents.date_creation DESC';

        const [documents] = await db.query(sql, parametres);
        res.json(documents);

    } catch (erreur) {
        console.error(erreur);
        res.status(500).json({ message: "Erreur du serveur." });
    }
});

// ===== Route : GET /api/documents/:id =====
// Voir le détail d'un seul document (utile pour la page de consultation)
router.get('/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const [resultats] = await db.query(
            `SELECT documents.*, users.nom AS auteur_nom, users.prenom AS auteur_prenom
             FROM documents
             JOIN users ON documents.user_id = users.id
             WHERE documents.id = ?`,
            [id]
        );

        if (resultats.length === 0) {
            return res.status(404).json({ message: "Document introuvable." });
        }

        res.json(resultats[0]);

    } catch (erreur) {
        console.error(erreur);
        res.status(500).json({ message: "Erreur du serveur." });
    }
});

module.exports = router;

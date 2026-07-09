const express = require('express');
const router = express.Router();
const db = require('../config/db');
const multer = require('multer');

const stockage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage: stockage });

// POST /api/documents
router.post('/', upload.single('fichier_pdf'), async (req, res) => {
    const { titre, description, user_id, ordre_obligatoire, signers } = req.body;
    if (!titre || !user_id || !req.file) {
        return res.status(400).json({ message: "Le titre, le fichier PDF et l'utilisateur sont obligatoires." });
    }

    try {
        const nomFichier = req.file.filename;
        const [resultat] = await db.query(
            'INSERT INTO documents (titre, description, fichier_pdf, user_id, ordre_obligatoire) VALUES (?, ?, ?, ?, ?)',
            [titre, description || '', nomFichier, user_id, ordre_obligatoire === '1' ? 1 : 0]
        );
        const documentId = resultat.insertId;

        // Insert signers
        if (signers) {
            const parsedSigners = JSON.parse(signers);
            for (const s of parsedSigners) {
                await db.query(
                    'INSERT INTO document_signers (document_id, user_id, ordre) VALUES (?, ?, ?)',
                    [documentId, s.user_id, s.ordre]
                );
            }
        }

        res.status(201).json({ message: "Document cree avec succes.", id: documentId });
    } catch (erreur) {
        console.error(erreur);
        res.status(500).json({ message: "Erreur du serveur." });
    }
});

// GET /api/documents
router.get('/', async (req, res) => {
    const { recherche } = req.query;
    try {
        let sql = `SELECT documents.*, users.nom AS auteur_nom, users.prenom AS auteur_prenom
                   FROM documents JOIN users ON documents.user_id = users.id`;
        let params = [];
        if (recherche) { sql += ' WHERE documents.titre LIKE ?'; params.push('%' + recherche + '%'); }
        sql += ' ORDER BY documents.date_creation DESC';
        const [documents] = await db.query(sql, params);
        res.json(documents);
    } catch (erreur) {
        console.error(erreur);
        res.status(500).json({ message: "Erreur du serveur." });
    }
});

// GET /api/documents/:id
router.get('/:id', async (req, res) => {
    try {
        const [resultats] = await db.query(
            `SELECT documents.*, users.nom AS auteur_nom, users.prenom AS auteur_prenom
             FROM documents JOIN users ON documents.user_id = users.id
             WHERE documents.id = ?`,
            [req.params.id]
        );
        if (resultats.length === 0) return res.status(404).json({ message: "Document introuvable." });
        res.json(resultats[0]);
    } catch (erreur) {
        console.error(erreur);
        res.status(500).json({ message: "Erreur du serveur." });
    }
});

// GET /api/documents/:id/signers
router.get('/:id/signers', async (req, res) => {
    try {
        const [signers] = await db.query(
            `SELECT document_signers.*, users.nom, users.prenom
             FROM document_signers
             JOIN users ON document_signers.user_id = users.id
             WHERE document_signers.document_id = ?
             ORDER BY document_signers.ordre ASC`,
            [req.params.id]
        );
        res.json(signers);
    } catch (erreur) {
        console.error(erreur);
        res.status(500).json({ message: "Erreur du serveur." });
    }
});

module.exports = router;
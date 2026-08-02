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
// Filtres disponibles :
//   recherche      -> titre LIKE %...%
//   filtre=waiting_on_me  (necessite user_id) -> documents ou c'est le tour de user_id de signer
//   filtre=created_by_me  (necessite user_id) -> documents crees par user_id
//   auteur_id      -> documents crees par un auteur precis
//   date_debut / date_fin -> plage sur date_creation (format YYYY-MM-DD)
//
// Visibilite par defaut (quand filtre n'est pas waiting_on_me/created_by_me) :
//   agent -> uniquement les documents qu'il a crees OU ou il est assigne comme signataire
//   chef  -> tout son departement, + les documents ou il est cree/assigne (meme hors departement)
//   admin -> tout, sans restriction
// (necessite role_app + user_id ; departement necessaire pour le scope "chef")
router.get('/', async (req, res) => {
    const { recherche, filtre, user_id, auteur_id, date_debut, date_fin, role_app, departement } = req.query;
    try {
        let sql, params = [];

        if (filtre === 'waiting_on_me') {
            if (!user_id) return res.status(400).json({ message: "user_id requis pour ce filtre." });
            sql = `SELECT DISTINCT documents.*, users.nom AS auteur_nom, users.prenom AS auteur_prenom
                   FROM documents
                   JOIN users ON documents.user_id = users.id
                   JOIN document_signers ds ON ds.document_id = documents.id
                   WHERE ds.user_id = ? AND ds.statut = 'en_attente' AND documents.statut = 'en_attente'
                   AND (
                       documents.ordre_obligatoire = 0
                       OR NOT EXISTS (
                           SELECT 1 FROM document_signers ds2
                           WHERE ds2.document_id = documents.id AND ds2.ordre < ds.ordre AND ds2.statut != 'signe'
                       )
                   )`;
            params.push(user_id);
        } else {
            sql = `SELECT documents.*, users.nom AS auteur_nom, users.prenom AS auteur_prenom
                   FROM documents JOIN users ON documents.user_id = users.id WHERE 1=1`;

            if (filtre === 'created_by_me') {
                if (!user_id) return res.status(400).json({ message: "user_id requis pour ce filtre." });
                sql += ' AND documents.user_id = ?'; params.push(user_id);
            } else if (role_app === 'admin') {
                // pas de restriction supplementaire : un admin voit tout
            } else if (role_app === 'chef') {
                if (!user_id) return res.status(400).json({ message: "user_id requis." });
                sql += ` AND (
                    users.departement <=> ?
                    OR documents.user_id = ?
                    OR EXISTS (SELECT 1 FROM document_signers ds3 WHERE ds3.document_id = documents.id AND ds3.user_id = ?)
                )`;
                params.push(departement || null, user_id, user_id);
            } else if (role_app === 'agent') {
                if (!user_id) return res.status(400).json({ message: "user_id requis." });
                sql += ` AND (
                    documents.user_id = ?
                    OR EXISTS (SELECT 1 FROM document_signers ds3 WHERE ds3.document_id = documents.id AND ds3.user_id = ?)
                )`;
                params.push(user_id, user_id);
            }
            // si role_app n'est pas fourni (ancien appel), pas de restriction — comportement historique conserve
        }

        if (recherche) { sql += ' AND documents.titre LIKE ?'; params.push('%' + recherche + '%'); }
        if (auteur_id) { sql += ' AND documents.user_id = ?'; params.push(auteur_id); }
        if (date_debut) { sql += ' AND documents.date_creation >= ?'; params.push(date_debut + ' 00:00:00'); }
        if (date_fin) { sql += ' AND documents.date_creation <= ?'; params.push(date_fin + ' 23:59:59'); }

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

// GET /api/documents/:id/comments
router.get('/:id/comments', async (req, res) => {
    try {
        const [comments] = await db.query(
            'SELECT * FROM document_comments WHERE document_id = ? ORDER BY created_at ASC',
            [req.params.id]
        );
        res.json(comments);
    } catch (erreur) {
        console.error(erreur);
        res.status(500).json({ message: "Erreur du serveur." });
    }
});

// POST /api/documents/:id/comments
router.post('/:id/comments', async (req, res) => {
    const { user_id, nom_auteur, contenu } = req.body;
    if (!user_id || !nom_auteur || !contenu || !contenu.trim()) {
        return res.status(400).json({ message: "Le commentaire ne peut pas etre vide." });
    }
    try {
        const [docRows] = await db.query('SELECT id FROM documents WHERE id = ?', [req.params.id]);
        if (docRows.length === 0) return res.status(404).json({ message: "Document introuvable." });

        const [resultat] = await db.query(
            'INSERT INTO document_comments (document_id, user_id, nom_auteur, contenu) VALUES (?, ?, ?, ?)',
            [req.params.id, user_id, nom_auteur, contenu.trim()]
        );
        res.status(201).json({ message: "Commentaire ajoute.", id: resultat.insertId });
    } catch (erreur) {
        console.error(erreur);
        res.status(500).json({ message: "Erreur du serveur." });
    }
});

module.exports = router;
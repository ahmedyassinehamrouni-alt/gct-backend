// Route publique de vérification — aucune authentification requise
// Accessible par n'importe qui ayant l'ID de la signature (via QR code ou lien)

const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { verifierSignature } = require('../pki');
const { verifierHorodatage } = require('../horodatage');

// GET /api/verify/:id
// Vérifie une signature par son ID — public, sans login
router.get('/:id', async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT signatures.*, 
                    users.cle_publique, 
                    documents.titre,
                    signatures.document_id,
                    signatures.user_id
             FROM signatures
             JOIN users ON signatures.user_id = users.id
             JOIN documents ON signatures.document_id = documents.id
             WHERE signatures.id = ?`,
            [req.params.id]
        );

        if (rows.length === 0) {
            return res.status(404).json({ valide: false, message: "Signature introuvable. Ce document n'existe pas dans notre système." });
        }

        const s = rows[0];

        if (!s.cle_publique) {
            return res.status(400).json({ valide: false, message: "Clé publique du signataire introuvable." });
        }

        const contenu = `document_id:${s.document_id}|titre:${s.titre}|signe_par:${s.user_id}`;
        const signatureValide = verifierSignature(contenu, s.signature_numerique, s.cle_publique);
        const horodatageValide = verifierHorodatage(s.signature_numerique, s.horodatage_date, s.horodatage_empreinte);

        res.json({
            valide: signatureValide && horodatageValide,
            signataire: s.nom_signataire,
            document: s.titre,
            date: s.horodatage_date,
            empreinte: s.horodatage_empreinte,
            signature_valide: signatureValide,
            horodatage_valide: horodatageValide,
        });

    } catch (erreur) {
        console.error('Erreur vérification publique:', erreur);
        res.status(500).json({ valide: false, message: "Erreur serveur." });
    }
});

module.exports = router;
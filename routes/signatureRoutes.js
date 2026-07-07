const express = require('express');
const router = express.Router();
const db = require('../config/db');
const verifierRole = require('../middleware/auth');
const { signerDocument, verifierSignature } = require('../pki');
const { creerHorodatage, verifierHorodatage } = require('../horodatage');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

async function tamponnerPDF(nomFichierPdf, nomSignataire, horodatage, signatureId, baseUrl) {
    const pdfPath = path.join(__dirname, '../uploads/', nomFichierPdf);
    if (!fs.existsSync(pdfPath)) throw new Error('Fichier PDF introuvable : ' + pdfPath);

    const pdfBytes = fs.readFileSync(pdfPath);
    const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
    const pages = pdfDoc.getPages();
    const lastPage = pages[pages.length - 1];
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const { width } = lastPage.getSize();

    const dateAffichee = new Date(horodatage.date).toLocaleString('fr-FR');
    const empreinteCourtee = horodatage.empreinte.substring(0, 40) + '...';
    const verifyUrl = `${baseUrl}/api/verify/${signatureId}`;

    const boxX = 30, boxY = 20, boxWidth = width - 60, boxHeight = 105;

    lastPage.drawRectangle({
        x: boxX, y: boxY, width: boxWidth, height: boxHeight,
        color: rgb(0.94, 0.99, 0.94),
        borderColor: rgb(0.18, 0.55, 0.18),
        borderWidth: 1.2, opacity: 0.95,
    });

    lastPage.drawText('Signe electroniquement - GCT Gabes', {
        x: boxX + 10, y: boxY + boxHeight - 18,
        size: 10, font: fontBold, color: rgb(0.1, 0.38, 0.1),
    });

    lastPage.drawLine({
        start: { x: boxX + 10, y: boxY + boxHeight - 23 },
        end: { x: boxX + boxWidth - 10, y: boxY + boxHeight - 23 },
        thickness: 0.5, color: rgb(0.18, 0.55, 0.18),
    });

    const lignes = [
        'Signataire : ' + nomSignataire,
        'Date       : ' + dateAffichee,
        'Empreinte  : ' + empreinteCourtee,
        'Verifier   : ' + verifyUrl,
    ];

    lignes.forEach((ligne, i) => {
        lastPage.drawText(ligne, {
            x: boxX + 10,
            y: boxY + boxHeight - 38 - i * 16,
            size: 8, font,
            color: i === 3 ? rgb(0.1, 0.2, 0.6) : rgb(0.1, 0.3, 0.1),
        });
    });

    const signedBytes = await pdfDoc.save();
    fs.writeFileSync(pdfPath, signedBytes);
    console.log('Tampon PDF ajouté avec succès :', pdfPath);
}

// POST /api/signatures — signer un document
router.post('/', verifierRole('responsable'), async (req, res) => {
    const { document_id, user_id, nom_signataire, cle_privee } = req.body;
    if (!document_id || !user_id || !nom_signataire || !cle_privee) {
        return res.status(400).json({ message: "Champs manquants pour la signature." });
    }

    try {
        const [docs] = await db.query('SELECT titre, fichier_pdf FROM documents WHERE id = ?', [document_id]);
        if (docs.length === 0) return res.status(404).json({ message: "Document introuvable." });

        const { titre, fichier_pdf } = docs[0];
        const contenuASignier = `document_id:${document_id}|titre:${titre}|signe_par:${user_id}`;

        const signatureNumerique = signerDocument(contenuASignier, cle_privee);
        const horodatage = creerHorodatage(signatureNumerique);

        const [result] = await db.query(
            `INSERT INTO signatures 
             (document_id, user_id, nom_signataire, statut, signature_numerique, horodatage_date, horodatage_empreinte)
             VALUES (?, ?, ?, 'Signe', ?, ?, ?)`,
            [document_id, user_id, nom_signataire, signatureNumerique, horodatage.date, horodatage.empreinte]
        );

        const signatureId = result.insertId;

        await db.query(`UPDATE documents SET statut = 'signe' WHERE id = ?`, [document_id]);

        // Build the public verification URL
        const baseUrl = `${req.protocol}://${req.get('host')}`;

        if (fichier_pdf) {
            try {
                await tamponnerPDF(fichier_pdf, nom_signataire, horodatage, signatureId, baseUrl);
            } catch (pdfErr) {
                console.error('Erreur tampon PDF:', pdfErr.message);
            }
        }

        res.status(201).json({
            message: "Document signe avec succes.",
            horodatage,
            signature_id: signatureId,
            verify_url: `${baseUrl}/api/verify/${signatureId}`
        });

    } catch (erreur) {
        console.error('Erreur signature:', erreur);
        res.status(500).json({ message: "Erreur : " + erreur.message });
    }
});

// GET /api/signatures — historique (avec filtre optionnel par document_id)
router.get('/', async (req, res) => {
    try {
        const { document_id } = req.query;
        let query = `SELECT signatures.*, documents.titre AS document_titre
                     FROM signatures
                     JOIN documents ON signatures.document_id = documents.id`;
        const params = [];
        if (document_id) { query += ` WHERE signatures.document_id = ?`; params.push(document_id); }
        query += ` ORDER BY signatures.date_signature DESC`;
        const [signatures] = await db.query(query, params);
        res.json(signatures);
    } catch (erreur) {
        console.error(erreur);
        res.status(500).json({ message: "Erreur du serveur." });
    }
});

// GET /api/signatures/verifier/:id — vérification interne (avec auth)
router.get('/verifier/:id', async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT signatures.*, users.cle_publique, documents.titre,
                    signatures.document_id, signatures.user_id
             FROM signatures
             JOIN users ON signatures.user_id = users.id
             JOIN documents ON signatures.document_id = documents.id
             WHERE signatures.id = ?`,
            [req.params.id]
        );
        if (rows.length === 0) return res.status(404).json({ message: "Signature introuvable." });
        const s = rows[0];
        const contenu = `document_id:${s.document_id}|titre:${s.titre}|signe_par:${s.user_id}`;
        const signatureValide = verifierSignature(contenu, s.signature_numerique, s.cle_publique);
        const horodatageValide = verifierHorodatage(s.signature_numerique, s.horodatage_date, s.horodatage_empreinte);
        res.json({
            signataire: s.nom_signataire,
            document: s.titre,
            date: s.horodatage_date,
            signature_valide: signatureValide,
            horodatage_valide: horodatageValide
        });
    } catch (erreur) {
        console.error(erreur);
        res.status(500).json({ message: "Erreur du serveur." });
    }
});

module.exports = router;
const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { verifierSignature } = require('../pki');
const { verifierHorodatage } = require('../horodatage');

router.get('/:id', async (req, res) => {
    const acceptsHTML = req.headers.accept && req.headers.accept.includes('text/html');

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

        if (rows.length === 0) {
            if (acceptsHTML) return res.send(renderPage(false, null, "Signature introuvable."));
            return res.status(404).json({ valide: false, message: "Signature introuvable." });
        }

        const s = rows[0];
        const contenu = `document_id:${s.document_id}|titre:${s.titre}|signe_par:${s.user_id}|pdf_hash:${s.pdf_hash}`;
        const signatureValide = verifierSignature(contenu, s.signature_numerique, s.cle_publique);
        const horodatageValide = verifierHorodatage(s.signature_numerique, s.horodatage_date, s.horodatage_empreinte);
        const valide = signatureValide && horodatageValide;

        const data = {
            valide,
            signataire: s.nom_signataire,
            document: s.titre,
            date: s.horodatage_date,
            empreinte: s.horodatage_empreinte,
            pdf_hash: s.pdf_hash,
            signature_valide: signatureValide,
            horodatage_valide: horodatageValide,
        };

        if (acceptsHTML) return res.send(renderPage(valide, data, null));
        res.json(data);

    } catch (erreur) {
        console.error('Erreur verification publique:', erreur);
        if (acceptsHTML) return res.send(renderPage(false, null, 'Erreur serveur.'));
        res.status(500).json({ valide: false, message: "Erreur serveur." });
    }
});

function renderPage(valide, data, erreur) {
    const date = data ? new Date(data.date).toLocaleString('fr-FR', {
        day: '2-digit', month: 'long', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
    }) : '';
    const empreinteCourtee = data ? data.empreinte.substring(0, 32) + '...' : '';
    const pdfHashCourt = data && data.pdf_hash ? data.pdf_hash.substring(0, 32) + '...' : 'N/A';

    return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Verification de signature - GCT</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f1923; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 2rem; }
.card { background: #1a2535; border-radius: 16px; padding: 2.5rem; max-width: 540px; width: 100%; box-shadow: 0 25px 60px rgba(0,0,0,0.4); }
.logo { text-align: center; margin-bottom: 2rem; }
.logo-text { font-size: 1.4rem; font-weight: 700; color: #4a9eff; letter-spacing: 2px; }
.logo-sub { font-size: 0.8rem; color: #6b7a8d; margin-top: 4px; }
hr { border: none; border-top: 1px solid #2a3a4f; margin: 1.5rem 0; }
.status { text-align: center; padding: 1.5rem; border-radius: 12px; margin-bottom: 1.5rem; }
.status.valid { background: rgba(34,197,94,0.1); border: 1px solid rgba(34,197,94,0.3); }
.status.invalid { background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3); }
.status-icon { font-size: 3rem; margin-bottom: .75rem; }
.status-title { font-size: 1.2rem; font-weight: 700; margin-bottom: .3rem; }
.status.valid .status-title { color: #22c55e; }
.status.invalid .status-title { color: #ef4444; }
.status-sub { font-size: .85rem; color: #6b7a8d; }
.info-grid { display: flex; flex-direction: column; gap: .85rem; }
.info-row { display: flex; align-items: flex-start; gap: .75rem; padding: .75rem 1rem; background: #0f1923; border-radius: 8px; }
.info-icon { font-size: 1.1rem; flex-shrink: 0; margin-top: 1px; }
.info-label { font-size: .72rem; color: #6b7a8d; text-transform: uppercase; letter-spacing: .5px; margin-bottom: 2px; }
.info-value { font-size: .92rem; color: #e2e8f0; font-weight: 500; word-break: break-all; }
.checks { display: flex; gap: .75rem; margin-top: 1.5rem; }
.check { flex: 1; padding: .75rem; border-radius: 8px; text-align: center; font-size: .8rem; font-weight: 600; }
.check.ok { background: rgba(34,197,94,0.1); color: #22c55e; border: 1px solid rgba(34,197,94,0.2); }
.check.fail { background: rgba(239,68,68,0.1); color: #ef4444; border: 1px solid rgba(239,68,68,0.2); }
.check-icon { font-size: 1.3rem; display: block; margin-bottom: 4px; }
.footer { text-align: center; margin-top: 1.5rem; font-size: .75rem; color: #3d4f63; }
</style>
</head>
<body>
<div class="card">
    <div class="logo">
        <div class="logo-text">G C T</div>
        <div class="logo-sub">Groupe Chimique Tunisien - Gabes</div>
    </div>
    <hr>
    ${erreur ? `
    <div class="status invalid">
        <div class="status-icon">❌</div>
        <div class="status-title">Verification impossible</div>
        <div class="status-sub">${erreur}</div>
    </div>` : `
    <div class="status ${valide ? 'valid' : 'invalid'}">
        <div class="status-icon">${valide ? '✅' : '❌'}</div>
        <div class="status-title">${valide ? 'Signature authentique' : 'Signature invalide ou document modifie'}</div>
        <div class="status-sub">${valide
            ? 'Ce document a ete signe electroniquement. Son contenu au moment de la signature est certifie.'
            : 'La signature ou le contenu du document n\'a pas pu etre verifie.'
        }</div>
    </div>
    <div class="info-grid">
        <div class="info-row"><span class="info-icon">👤</span><div><div class="info-label">Signataire</div><div class="info-value">${data.signataire}</div></div></div>
        <div class="info-row"><span class="info-icon">📄</span><div><div class="info-label">Document</div><div class="info-value">${data.document}</div></div></div>
        <div class="info-row"><span class="info-icon">🕐</span><div><div class="info-label">Date de signature</div><div class="info-value">${date}</div></div></div>
        <div class="info-row"><span class="info-icon">📋</span><div><div class="info-label">Empreinte horodatage</div><div class="info-value" style="font-family:monospace;font-size:.78rem">${empreinteCourtee}</div></div></div>
        <div class="info-row"><span class="info-icon">🔒</span><div><div class="info-label">Hash PDF au moment de la signature</div><div class="info-value" style="font-family:monospace;font-size:.78rem">${pdfHashCourt}</div></div></div>
    </div>
    <div class="checks">
        <div class="check ${data.signature_valide ? 'ok' : 'fail'}">
            <span class="check-icon">${data.signature_valide ? '🔐' : '🔓'}</span>
            Signature RSA<br>${data.signature_valide ? 'Valide' : 'Invalide'}
        </div>
        <div class="check ${data.horodatage_valide ? 'ok' : 'fail'}">
            <span class="check-icon">${data.horodatage_valide ? '⏱' : '⚠️'}</span>
            Horodatage<br>${data.horodatage_valide ? 'Valide' : 'Invalide'}
        </div>
        <div class="check ${data.signature_valide ? 'ok' : 'fail'}">
            <span class="check-icon">${data.signature_valide ? '📄' : '⚠️'}</span>
            Integrite PDF<br>${data.signature_valide ? 'Certifiee' : 'Non verifiee'}
        </div>
    </div>`}
    <div class="footer">Systeme de signature electronique GCT - ${new Date().getFullYear()}</div>
</div>
</body>
</html>`;
}

module.exports = router;
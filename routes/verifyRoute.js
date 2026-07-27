const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { verifierSignature } = require('../pki');
const { verifierHorodatage } = require('../horodatage');
const multer = require('multer');
const crypto = require('crypto');

// Store uploaded PDF in memory (no disk write needed)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

function calculerHashBuffer(buffer) {
    return crypto.createHash('sha256').update(buffer).digest('hex');
}

// GET /api/verify/:id — show the verification page
router.get('/:id', async (req, res) => {
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
            return res.send(renderPage(req.params.id, null, null, "Signature introuvable."));
        }

        const s = rows[0];
        const contenu = `document_id:${s.document_id}|titre:${s.titre}|signe_par:${s.user_id}|pdf_hash:${s.pdf_hash}`;
        const signatureValide = verifierSignature(contenu, s.signature_numerique, s.cle_publique);
        const horodatageValide = verifierHorodatage(s.signature_numerique, s.horodatage_date, s.horodatage_empreinte);

        const data = {
            signataire: s.nom_signataire,
            document: s.titre,
            date: s.horodatage_date,
            empreinte: s.horodatage_empreinte,
            pdf_hash: s.pdf_hash,
            signature_valide: signatureValide,
            horodatage_valide: horodatageValide,
            valide: signatureValide && horodatageValide,
            pdf_integrite: null, // not checked yet — waiting for upload
        };

        res.send(renderPage(req.params.id, data, null, null));

    } catch (erreur) {
        console.error('Erreur verification:', erreur);
        res.send(renderPage(req.params.id, null, null, 'Erreur serveur.'));
    }
});

// POST /api/verify/:id — check uploaded PDF against stored hash
router.post('/:id', upload.single('pdf'), async (req, res) => {
    try {
        if (!req.file) {
            return res.send(renderPage(req.params.id, null, null, 'Aucun fichier recu.'));
        }

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
            return res.send(renderPage(req.params.id, null, null, 'Signature introuvable.'));
        }

        const s = rows[0];
        const contenu = `document_id:${s.document_id}|titre:${s.titre}|signe_par:${s.user_id}|pdf_hash:${s.pdf_hash}`;
        const signatureValide = verifierSignature(contenu, s.signature_numerique, s.cle_publique);
        const horodatageValide = verifierHorodatage(s.signature_numerique, s.horodatage_date, s.horodatage_empreinte);

        // Hash the uploaded PDF and compare to stored hash
        const hashRecu = calculerHashBuffer(req.file.buffer);
        const pdfIntegre = (hashRecu === s.pdf_hash);

        console.log('[VERIFY] Stored hash:', s.pdf_hash);
        console.log('[VERIFY] Received hash:', hashRecu);
        console.log('[VERIFY] Match:', pdfIntegre);

        const data = {
            signataire: s.nom_signataire,
            document: s.titre,
            date: s.horodatage_date,
            empreinte: s.horodatage_empreinte,
            pdf_hash: s.pdf_hash,
            hash_recu: hashRecu,
            signature_valide: signatureValide,
            horodatage_valide: horodatageValide,
            pdf_integrite: pdfIntegre,
            valide: signatureValide && horodatageValide && pdfIntegre,
        };

        res.send(renderPage(req.params.id, data, null, null));

    } catch (erreur) {
        console.error('Erreur verification PDF:', erreur);
        res.send(renderPage(req.params.id, null, null, 'Erreur serveur.'));
    }
});

function renderPage(signatureId, data, pdfResult, erreur) {
    const date = data ? new Date(data.date).toLocaleString('fr-FR', {
        day: '2-digit', month: 'long', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
    }) : '';
    const empreinteCourtee = data ? data.empreinte.substring(0, 32) + '...' : '';
    const pdfHashCourt = data && data.pdf_hash ? data.pdf_hash.substring(0, 32) + '...' : 'N/A';

    const showUploadResult = data && data.pdf_integrite !== null;
    const allValid = data && data.valide;

    return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Verification de signature - GCT</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f1923; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 2rem; }
.card { background: #1a2535; border-radius: 16px; padding: 2.5rem; max-width: 560px; width: 100%; box-shadow: 0 25px 60px rgba(0,0,0,0.4); }
.logo { text-align: center; margin-bottom: 1.5rem; }
.logo-text { font-size: 1.4rem; font-weight: 700; color: #4a9eff; letter-spacing: 2px; }
.logo-sub { font-size: 0.8rem; color: #6b7a8d; margin-top: 4px; }
hr { border: none; border-top: 1px solid #2a3a4f; margin: 1.2rem 0; }
.status { text-align: center; padding: 1.2rem; border-radius: 12px; margin-bottom: 1.2rem; }
.status.valid { background: rgba(34,197,94,0.1); border: 1px solid rgba(34,197,94,0.3); }
.status.invalid { background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3); }
.status.pending { background: rgba(251,191,36,0.1); border: 1px solid rgba(251,191,36,0.3); }
.status-icon { font-size: 2.5rem; margin-bottom: .5rem; }
.status-title { font-size: 1.1rem; font-weight: 700; margin-bottom: .3rem; }
.status.valid .status-title { color: #22c55e; }
.status.invalid .status-title { color: #ef4444; }
.status.pending .status-title { color: #fbbf24; }
.status-sub { font-size: .82rem; color: #6b7a8d; }
.info-grid { display: flex; flex-direction: column; gap: .7rem; margin-bottom: 1.2rem; }
.info-row { display: flex; align-items: flex-start; gap: .75rem; padding: .65rem 1rem; background: #0f1923; border-radius: 8px; }
.info-icon { font-size: 1rem; flex-shrink: 0; margin-top: 2px; }
.info-label { font-size: .7rem; color: #6b7a8d; text-transform: uppercase; letter-spacing: .5px; margin-bottom: 2px; }
.info-value { font-size: .88rem; color: #e2e8f0; font-weight: 500; word-break: break-all; }
.checks { display: flex; gap: .6rem; margin-bottom: 1.2rem; }
.check { flex: 1; padding: .65rem; border-radius: 8px; text-align: center; font-size: .75rem; font-weight: 600; }
.check.ok { background: rgba(34,197,94,0.1); color: #22c55e; border: 1px solid rgba(34,197,94,0.2); }
.check.fail { background: rgba(239,68,68,0.1); color: #ef4444; border: 1px solid rgba(239,68,68,0.2); }
.check.pending { background: rgba(251,191,36,0.1); color: #fbbf24; border: 1px solid rgba(251,191,36,0.2); }
.check-icon { font-size: 1.2rem; display: block; margin-bottom: 3px; }
.upload-box { background: #0f1923; border: 2px dashed #2a3a4f; border-radius: 12px; padding: 1.5rem; text-align: center; margin-bottom: 1rem; }
.upload-box:hover { border-color: #4a9eff; }
.upload-box p { color: #6b7a8d; font-size: .85rem; margin-bottom: 1rem; }
.upload-box strong { color: #e2e8f0; }
input[type=file] { display: none; }
.upload-label { display: inline-block; padding: .6rem 1.5rem; background: #1e4d7b; color: white; border-radius: 8px; cursor: pointer; font-size: .85rem; font-weight: 600; transition: background .2s; }
.upload-label:hover { background: #2563eb; }
.btn-verify { width: 100%; padding: .75rem; background: #22c55e; color: white; border: none; border-radius: 8px; font-size: .95rem; font-weight: 600; cursor: pointer; margin-top: .75rem; transition: background .2s; }
.btn-verify:hover { background: #16a34a; }
.footer { text-align: center; margin-top: 1.2rem; font-size: .72rem; color: #3d4f63; }
.hash-match { font-size: .75rem; font-family: monospace; padding: .4rem .8rem; border-radius: 6px; margin-top: .5rem; }
.hash-match.ok { background: rgba(34,197,94,0.1); color: #22c55e; }
.hash-match.fail { background: rgba(239,68,68,0.1); color: #ef4444; }
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

    ${!showUploadResult ? `
    <div class="status ${data && data.signature_valide && data.horodatage_valide ? 'pending' : 'invalid'}">
        <div class="status-icon">${data && data.signature_valide && data.horodatage_valide ? '🔐' : '❌'}</div>
        <div class="status-title">${data && data.signature_valide && data.horodatage_valide ? 'Signature cryptographique valide' : 'Signature invalide'}</div>
        <div class="status-sub">${data && data.signature_valide && data.horodatage_valide
            ? 'Telechargez le PDF recu pour verifier que son contenu n\'a pas ete modifie.'
            : 'La signature RSA ou l\'horodatage est invalide.'
        }</div>
    </div>` : `
    <div class="status ${allValid ? 'valid' : 'invalid'}">
        <div class="status-icon">${allValid ? '✅' : '❌'}</div>
        <div class="status-title">${allValid ? 'Document authentique et integre' : 'Document modifie ou invalide'}</div>
        <div class="status-sub">${allValid
            ? 'La signature est valide et le PDF recu est identique a celui qui a ete signe.'
            : 'Le PDF recu a ete modifie apres la signature, ou la signature est invalide.'
        }</div>
    </div>`}

    ${data ? `
    <div class="info-grid">
        <div class="info-row"><span class="info-icon">👤</span><div><div class="info-label">Signataire</div><div class="info-value">${data.signataire}</div></div></div>
        <div class="info-row"><span class="info-icon">📄</span><div><div class="info-label">Document</div><div class="info-value">${data.document}</div></div></div>
        <div class="info-row"><span class="info-icon">🕐</span><div><div class="info-label">Date de signature</div><div class="info-value">${date}</div></div></div>
        <div class="info-row"><span class="info-icon">🔒</span><div>
            <div class="info-label">Hash PDF original (au moment de la signature)</div>
            <div class="info-value" style="font-family:monospace;font-size:.75rem">${pdfHashCourt}</div>
            ${showUploadResult ? `<div class="hash-match ${data.pdf_integrite ? 'ok' : 'fail'}">
                Hash recu : ${data.hash_recu ? data.hash_recu.substring(0, 32) + '...' : 'N/A'}<br>
                ${data.pdf_integrite ? '✔ Les hash correspondent — PDF intact' : '✘ Hash differents — PDF modifie'}
            </div>` : ''}
        </div></div>
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
        <div class="check ${!showUploadResult ? 'pending' : (data.pdf_integrite ? 'ok' : 'fail')}">
            <span class="check-icon">${!showUploadResult ? '📤' : (data.pdf_integrite ? '📄' : '⚠️')}</span>
            Integrite PDF<br>${!showUploadResult ? 'En attente' : (data.pdf_integrite ? 'Intact' : 'Modifie')}
        </div>
    </div>` : ''}

    <div class="upload-box">
        <p><strong>Verification du contenu PDF</strong><br>
        Telechargez le PDF que vous avez recu pour confirmer qu'il n'a pas ete modifie depuis la signature.</p>
        <form method="POST" enctype="multipart/form-data">
            <label class="upload-label" for="pdf-input">📎 Choisir le fichier PDF</label>
            <input type="file" id="pdf-input" name="pdf" accept="application/pdf" onchange="this.nextElementSibling.textContent=this.files[0]?.name||''">
            <p id="filename" style="margin-top:.5rem;margin-bottom:0;font-size:.8rem;color:#4a9eff"></p>
            <button type="submit" class="btn-verify">Verifier l'integrite du PDF</button>
        </form>
    </div>`}

    <div class="footer">Systeme de signature electronique GCT - ${new Date().getFullYear()}</div>
</div>
</body>
</html>`;
}

module.exports = router;
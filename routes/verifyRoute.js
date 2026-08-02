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

// --- Inline SVG icon set (Bootstrap Icons paths, stroke/fill via currentColor) ---
const icons = {
    shieldCheck: `<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="currentColor" viewBox="0 0 16 16"><path d="M5.338 1.59a61 61 0 0 0-2.837.856.48.48 0 0 0-.328.39c-.554 4.157.726 7.19 2.253 9.188a10.7 10.7 0 0 0 2.287 2.233c.346.244.652.42.893.533q.18.085.293.118a1 1 0 0 0 .101.025 1 1 0 0 0 .1-.025q.114-.033.294-.118c.24-.113.547-.29.893-.533a10.7 10.7 0 0 0 2.287-2.233c1.527-1.997 2.807-5.031 2.253-9.188a.48.48 0 0 0-.328-.39q-1.383-.494-2.837-.856l-.11 1.94a.5.5 0 1 1-.998-.056l.11-1.949a25 25 0 0 0-.987-.198l-.1 1.99a.5.5 0 1 1-.998-.05l.099-1.99a25 25 0 0 0-1.008 0l.099 1.99a.5.5 0 1 1-.998.05l-.1-1.99a25 25 0 0 0-.987.198l.11 1.95a.5.5 0 1 1-.998.055z"/><path fill-rule="evenodd" d="M7.918.13a.5.5 0 0 1 .164 0l.246.043a41 41 0 0 1 4.339 1.086c.428.137.68.503.61.900l-.03.176.03-.176a.5.5 0 0 1-.006.032c-.564 4.373-2.104 7.554-3.702 9.667-.799 1.058-1.694 1.885-2.464 2.427a6.3 6.3 0 0 1-1.107.607c-.075.03-.157.06-.226.07a1 1 0 0 1-.336 0c-.07-.01-.15-.04-.226-.07a6.3 6.3 0 0 1-1.107-.607c-.77-.542-1.665-1.369-2.464-2.427-1.598-2.113-3.138-5.294-3.702-9.667a.5.5 0 0 1-.006-.032l.03-.176-.03.176a.5.5 0 0 1 .61-.9A41 41 0 0 1 7.672.173z"/></svg>`,
    shieldX: `<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="currentColor" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M5.443 1.05a61 61 0 0 0-3.05.79.7.7 0 0 0-.505.604c-.575 6.41 1.35 10.646 3.28 13.187a13.5 13.5 0 0 0 2.678 2.7l.033.019.037.017a2.4 2.4 0 0 0 .376.148.9.9 0 0 0 .376-.148l.037-.017.033-.019a13.5 13.5 0 0 0 2.678-2.7c1.93-2.541 3.855-6.777 3.28-13.187a.7.7 0 0 0-.505-.604 61 61 0 0 0-3.05-.79A.5.5 0 0 0 8 1v14a.5.5 0 0 1-.5-.5V1a.5.5 0 0 0-.057.05"/><path d="M5.354 5.646a.5.5 0 1 0-.708.708L6.293 8l-1.647 1.646a.5.5 0 0 0 .708.708L7 8.707l1.646 1.647a.5.5 0 0 0 .708-.708L7.707 8l1.647-1.646a.5.5 0 0 0-.708-.708L7 7.293z"/></svg>`,
    clock: `<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="currentColor" viewBox="0 0 16 16"><path d="M8 3.5a.5.5 0 0 0-1 0V9a.5.5 0 0 0 .252.434l3.5 2a.5.5 0 0 0 .496-.868L8 8.71z"/><path d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16m7-8A7 7 0 1 1 1 8a7 7 0 0 1 14 0"/></svg>`,
    alertTriangle: `<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="currentColor" viewBox="0 0 16 16"><path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14m0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16"/><path d="M7.002 11a1 1 0 1 1 2 0 1 1 0 0 1-2 0M7.1 4.995a.905.905 0 1 1 1.8 0l-.35 3.507a.552.552 0 0 1-1.1 0z"/></svg>`,
    user: `<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="currentColor" viewBox="0 0 16 16"><path d="M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6m2-3a2 2 0 1 1-4 0 2 2 0 0 1 4 0m4 8c0 1-1 1-1 1H3s-1 0-1-1 1-4 6-4 6 3 6 4m-1-.004c-.001-.246-.154-.986-.832-1.664C11.516 10.68 10.289 10 8 10s-3.516.68-4.168 1.332c-.678.678-.83 1.418-.832 1.664z"/></svg>`,
    file: `<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="currentColor" viewBox="0 0 16 16"><path d="M14 4.5V14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2h5.5zm-3 0A1.5 1.5 0 0 1 9.5 3V1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V4.5z"/></svg>`,
    calendar: `<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="currentColor" viewBox="0 0 16 16"><path d="M3.5 0a.5.5 0 0 1 .5.5V1h8V.5a.5.5 0 0 1 1 0V1h1a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2h1V.5a.5.5 0 0 1 .5-.5M1 4v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V4z"/></svg>`,
    lock: `<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="currentColor" viewBox="0 0 16 16"><path d="M8 1a2 2 0 0 1 2 2v4H6V3a2 2 0 0 1 2-2m3 6V3a3 3 0 0 0-6 0v4a2 2 0 0 0-2 2v5a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2"/></svg>`,
    upload: `<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="currentColor" viewBox="0 0 16 16"><path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5"/><path d="M7.646.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1-.708.708L8.5 1.707V11.5a.5.5 0 0 1-1 0V1.707L5.354 3.854a.5.5 0 1 1-.708-.708z"/></svg>`,
    check: `<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="currentColor" viewBox="0 0 16 16"><path d="M13.485 1.929a1 1 0 0 1 .143 1.407l-7 8.5a1 1 0 0 1-1.487.081L2.05 8.828a1 1 0 1 1 1.4-1.428l2.31 2.264 6.318-7.664a1 1 0 0 1 1.407-.071z" transform="translate(0 .5)"/></svg>`,
    paperclip: `<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="currentColor" viewBox="0 0 16 16"><path d="M4.5 3a2.5 2.5 0 0 1 5 0v9a1.5 1.5 0 0 1-3 0V5a.5.5 0 0 1 1 0v7a.5.5 0 0 0 1 0V3a1.5 1.5 0 1 0-3 0v9a2.5 2.5 0 0 0 5 0V5a.5.5 0 0 1 1 0v7a3.5 3.5 0 0 1-7 0z"/></svg>`,
    hash: `<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="currentColor" viewBox="0 0 16 16"><path d="M8.39 12.648a1.32 1.32 0 0 0-.015.18c0 .305.21.508.5.508.266 0 .492-.172.555-.477l.554-2.703h1.204c.421 0 .617-.234.617-.547 0-.312-.188-.53-.617-.53h-.985l.516-2.524h1.35c.43 0 .618-.227.618-.547 0-.312-.188-.531-.618-.531h-1.11l.492-2.393c.028-.156.023-.267.023-.31 0-.36-.211-.567-.556-.567-.243 0-.484.147-.554.5l-.554 2.771h-2.223l.492-2.393c.028-.156.023-.267.023-.31 0-.36-.211-.567-.556-.567-.243 0-.484.147-.554.5l-.554 2.771h-1.35c-.421 0-.617.219-.617.531 0 .32.196.547.617.547h1.11l-.516 2.524h-1.35c-.421 0-.617.219-.617.531 0 .312.196.53.617.53h1.11l-.492 2.394c-.028.156-.023.267-.023.31 0 .36.211.567.556.567.243 0 .484-.147.554-.5l.554-2.771h2.223zm-1.964-3.13.517-2.523h2.223l-.517 2.524z"/></svg>`,
    docBadge: `<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" fill="currentColor" viewBox="0 0 16 16"><path d="M0 12V4a2 2 0 0 1 2-2h5.5v1H2a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V6h1v6a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2"/><path d="M15 0h-4a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1V1a1 1 0 0 0-1-1m-3.146 1.646a.5.5 0 0 1 .708 0L13 2.293l.44-.44a.5.5 0 1 1 .706.708l-.793.793a.5.5 0 0 1-.707 0l-.792-.793a.5.5 0 0 1 0-.708zM13 3.5v2a.5.5 0 0 0 1 0v-2z"/></svg>`
};

function renderPage(signatureId, data, pdfResult, erreur) {
    const date = data ? new Date(data.date).toLocaleString('fr-FR', {
        day: '2-digit', month: 'long', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
    }) : '';
    const pdfHashCourt = data && data.pdf_hash ? data.pdf_hash.substring(0, 32) + '...' : 'N/A';

    const showUploadResult = data && data.pdf_integrite !== null;
    const allValid = data && data.valide;
    const cryptoValid = data && data.signature_valide && data.horodatage_valide;

    return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Verification de signature - GCT</title>
<style>
:root {
  --bg: #0b1420;
  --panel: #121e2e;
  --panel-alt: #0c1622;
  --border: #223143;
  --text: #e6edf5;
  --text-muted: #7e8fa3;
  --brand: #3f8ae0;
  --brand-dark: #1e4d7b;
  --green: #22c55e;
  --green-bg: rgba(34,197,94,0.10);
  --green-border: rgba(34,197,94,0.28);
  --red: #ef4444;
  --red-bg: rgba(239,68,68,0.10);
  --red-border: rgba(239,68,68,0.28);
  --amber: #f5a524;
  --amber-bg: rgba(245,165,36,0.10);
  --amber-border: rgba(245,165,36,0.28);
  --radius: 14px;
}
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  background: radial-gradient(circle at top, #142032 0%, var(--bg) 60%);
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  color: var(--text);
}
.card {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 2.25rem;
  max-width: 560px;
  width: 100%;
  box-shadow: 0 30px 70px rgba(0,0,0,0.45);
}
.brand {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: .6rem;
  margin-bottom: 1.6rem;
}
.brand-mark {
  width: 36px; height: 36px;
  border-radius: 9px;
  background: linear-gradient(135deg, var(--brand), var(--brand-dark));
  display: flex; align-items: center; justify-content: center;
  color: #fff; font-weight: 700; font-size: .85rem;
}
.brand-name { font-size: 1.05rem; font-weight: 700; letter-spacing: .5px; }
.brand-sub { font-size: .75rem; color: var(--text-muted); }

hr { border: none; border-top: 1px solid var(--border); margin: 1.4rem 0; }

.status {
  display: flex;
  align-items: flex-start;
  gap: .85rem;
  padding: 1.1rem 1.2rem;
  border-radius: 12px;
  margin-bottom: 1.3rem;
}
.status.valid   { background: var(--green-bg); border: 1px solid var(--green-border); }
.status.invalid { background: var(--red-bg);   border: 1px solid var(--red-border); }
.status.pending { background: var(--amber-bg); border: 1px solid var(--amber-border); }
.status-icon {
  width: 34px; height: 34px; flex-shrink: 0;
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 1.1rem;
}
.status.valid .status-icon   { background: rgba(34,197,94,0.18);  color: var(--green); }
.status.invalid .status-icon { background: rgba(239,68,68,0.18);  color: var(--red); }
.status.pending .status-icon { background: rgba(245,165,36,0.18); color: var(--amber); }
.status-title { font-size: .98rem; font-weight: 700; margin-bottom: .25rem; }
.status.valid .status-title   { color: var(--green); }
.status.invalid .status-title { color: var(--red); }
.status.pending .status-title { color: var(--amber); }
.status-sub { font-size: .82rem; color: var(--text-muted); line-height: 1.45; }

.info-grid { display: flex; flex-direction: column; gap: .6rem; margin-bottom: 1.3rem; }
.info-row {
  display: flex; align-items: flex-start; gap: .75rem;
  padding: .7rem .9rem;
  background: var(--panel-alt);
  border: 1px solid var(--border);
  border-radius: 10px;
}
.info-icon {
  width: 26px; height: 26px; flex-shrink: 0;
  border-radius: 7px;
  background: rgba(63,138,224,0.12);
  color: var(--brand);
  display: flex; align-items: center; justify-content: center;
  font-size: .85rem;
}
.info-label { font-size: .68rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: .6px; margin-bottom: 2px; }
.info-value { font-size: .87rem; color: var(--text); font-weight: 500; word-break: break-all; }

.checks { display: flex; gap: .6rem; margin-bottom: 1.3rem; }
.check {
  flex: 1;
  padding: .8rem .5rem;
  border-radius: 10px;
  text-align: center;
  font-size: .73rem;
  font-weight: 600;
  border: 1px solid transparent;
}
.check.ok      { background: var(--green-bg); color: var(--green); border-color: var(--green-border); }
.check.fail    { background: var(--red-bg);   color: var(--red);   border-color: var(--red-border); }
.check.pending { background: var(--amber-bg); color: var(--amber); border-color: var(--amber-border); }
.check-icon { display: block; font-size: 1.25rem; margin-bottom: 4px; }
.check-label { display: block; color: var(--text-muted); font-weight: 500; font-size: .68rem; margin-bottom: 2px; text-transform: uppercase; letter-spacing: .4px; }

.badge {
  display: inline-flex; align-items: center; gap: .35rem;
  padding: .2rem .6rem;
  border-radius: 999px;
  font-size: .7rem;
  font-weight: 600;
}
.badge.ok   { background: var(--green-bg); color: var(--green); border: 1px solid var(--green-border); }
.badge.fail { background: var(--red-bg);   color: var(--red);   border: 1px solid var(--red-border); }

.upload-box {
  background: var(--panel-alt);
  border: 1.5px dashed var(--border);
  border-radius: 12px;
  padding: 1.6rem;
  text-align: center;
  margin-bottom: 1rem;
  transition: border-color .2s;
}
.upload-box:hover { border-color: var(--brand); }
.upload-box p { color: var(--text-muted); font-size: .84rem; margin-bottom: 1.1rem; line-height: 1.5; }
.upload-box strong { color: var(--text); }
input[type=file] { display: none; }

.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: .5rem;
  border: none; border-radius: 9px;
  font-size: .85rem; font-weight: 600;
  cursor: pointer;
  transition: background .2s, transform .05s;
  font-family: inherit;
}
.btn:active { transform: scale(0.98); }
.btn-outline {
  padding: .6rem 1.4rem;
  background: transparent;
  color: var(--brand);
  border: 1px solid var(--brand-dark);
}
.btn-outline:hover { background: rgba(63,138,224,0.1); }
.btn-primary {
  width: 100%;
  padding: .75rem;
  background: var(--brand);
  color: #fff;
  margin-top: .8rem;
}
.btn-primary:hover { background: #2f74c4; }

#filename { margin-top: .6rem; margin-bottom: 0; font-size: .78rem; color: var(--brand); min-height: 1em; }

.hash-compare {
  font-size: .74rem;
  font-family: 'SFMono-Regular', Consolas, monospace;
  padding: .55rem .75rem;
  border-radius: 8px;
  margin-top: .6rem;
  line-height: 1.6;
}
.hash-compare.ok   { background: var(--green-bg); color: var(--green); }
.hash-compare.fail { background: var(--red-bg); color: var(--red); }
.hash-compare .hc-label { color: var(--text-muted); font-family: inherit; }

.footer { text-align: center; margin-top: 1.4rem; font-size: .72rem; color: #4a5d73; }
</style>
</head>
<body>
<div class="card">
    <div class="brand">
        <div class="brand-mark">GCT</div>
        <div>
            <div class="brand-name">Verification de signature</div>
            <div class="brand-sub">Groupe Chimique Tunisien &mdash; Gabes</div>
        </div>
    </div>
    <hr>

    ${erreur ? `
    <div class="status invalid">
        <div class="status-icon">${icons.shieldX}</div>
        <div>
            <div class="status-title">Verification impossible</div>
            <div class="status-sub">${erreur}</div>
        </div>
    </div>` : `

    ${!showUploadResult ? `
    <div class="status ${cryptoValid ? 'pending' : 'invalid'}">
        <div class="status-icon">${cryptoValid ? icons.shieldCheck : icons.shieldX}</div>
        <div>
            <div class="status-title">${cryptoValid ? 'Signature cryptographique valide' : 'Signature invalide'}</div>
            <div class="status-sub">${cryptoValid
                ? 'Telechargez le PDF recu pour verifier que son contenu n\'a pas ete modifie.'
                : 'La signature RSA ou l\'horodatage est invalide.'
            }</div>
        </div>
    </div>` : `
    <div class="status ${allValid ? 'valid' : 'invalid'}">
        <div class="status-icon">${allValid ? icons.shieldCheck : icons.shieldX}</div>
        <div>
            <div class="status-title">${allValid ? 'Document authentique et integre' : 'Document modifie ou invalide'}</div>
            <div class="status-sub">${allValid
                ? 'La signature est valide et le PDF recu est identique a celui qui a ete signe.'
                : 'Le PDF recu a ete modifie apres la signature, ou la signature est invalide.'
            }</div>
        </div>
    </div>`}

    ${data ? `
    <div class="info-grid">
        <div class="info-row"><span class="info-icon">${icons.user}</span><div><div class="info-label">Signataire</div><div class="info-value">${data.signataire}</div></div></div>
        <div class="info-row"><span class="info-icon">${icons.file}</span><div><div class="info-label">Document</div><div class="info-value">${data.document}</div></div></div>
        <div class="info-row"><span class="info-icon">${icons.calendar}</span><div><div class="info-label">Date de signature</div><div class="info-value">${date}</div></div></div>
        <div class="info-row"><span class="info-icon">${icons.hash}</span><div>
            <div class="info-label">Hash PDF original (au moment de la signature)</div>
            <div class="info-value" style="font-family:monospace;font-size:.75rem">${pdfHashCourt}</div>
            ${showUploadResult ? `<div class="hash-compare ${data.pdf_integrite ? 'ok' : 'fail'}">
                <span class="hc-label">Hash recu&nbsp;:</span> ${data.hash_recu ? data.hash_recu.substring(0, 32) + '...' : 'N/A'}<br>
                ${data.pdf_integrite ? 'Les empreintes correspondent &mdash; PDF intact' : 'Empreintes differentes &mdash; PDF modifie'}
            </div>` : ''}
        </div></div>
    </div>

    <div class="checks">
        <div class="check ${data.signature_valide ? 'ok' : 'fail'}">
            <span class="check-icon">${data.signature_valide ? icons.lock : icons.shieldX}</span>
            <span class="check-label">Signature RSA</span>${data.signature_valide ? 'Valide' : 'Invalide'}
        </div>
        <div class="check ${data.horodatage_valide ? 'ok' : 'fail'}">
            <span class="check-icon">${data.horodatage_valide ? icons.clock : icons.alertTriangle}</span>
            <span class="check-label">Horodatage</span>${data.horodatage_valide ? 'Valide' : 'Invalide'}
        </div>
        <div class="check ${!showUploadResult ? 'pending' : (data.pdf_integrite ? 'ok' : 'fail')}">
            <span class="check-icon">${!showUploadResult ? icons.upload : (data.pdf_integrite ? icons.docBadge : icons.alertTriangle)}</span>
            <span class="check-label">Integrite PDF</span>${!showUploadResult ? 'En attente' : (data.pdf_integrite ? 'Intact' : 'Modifie')}
        </div>
    </div>` : ''}

    <div class="upload-box">
        <p><strong>Verification du contenu PDF</strong><br>
        Telechargez le PDF que vous avez recu pour confirmer qu'il n'a pas ete modifie depuis la signature.</p>
        <form method="POST" enctype="multipart/form-data">
            <label class="btn btn-outline" for="pdf-input">${icons.paperclip} Choisir le fichier PDF</label>
            <input type="file" id="pdf-input" name="pdf" accept="application/pdf" onchange="document.getElementById('filename').textContent=this.files[0]?.name||''">
            <p id="filename"></p>
            <button type="submit" class="btn btn-primary">${icons.check} Verifier l'integrite du PDF</button>
        </form>
    </div>`}

    <div class="footer">Systeme de signature electronique GCT &mdash; ${new Date().getFullYear()}</div>
</div>
</body>
</html>`;
}

module.exports = router;
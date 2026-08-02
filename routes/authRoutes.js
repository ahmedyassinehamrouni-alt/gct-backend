// Ce fichier gère la connexion des utilisateurs.
// À la première connexion, on génère un certificat numérique pour l'utilisateur
// (n'importe quel role_app peut désormais signer, donc n'importe qui a besoin d'un certificat).

const express = require('express');
const router = express.Router();
const db = require('../config/db');
const forge = require('node-forge');
const { genererCertificat } = require('../pki');

// ===== Route : POST /api/login =====
router.post('/login', async (req, res) => {
    const { email, mot_de_passe } = req.body;

    if (!email || !mot_de_passe) {
        return res.status(400).json({ message: "Email et mot de passe obligatoires." });
    }

    try {
        const [resultats] = await db.query('SELECT * FROM users WHERE email = ?', [email]);

        if (resultats.length === 0) {
            return res.status(401).json({ message: "Email ou mot de passe incorrect." });
        }

        const utilisateur = resultats[0];

        if (mot_de_passe !== utilisateur.mot_de_passe) {
            return res.status(401).json({ message: "Email ou mot de passe incorrect." });
        }

        if (utilisateur.actif === 0) {
            return res.status(403).json({ message: "Ce compte a ete desactive. Contactez un administrateur." });
        }

        // Si l'utilisateur n'a pas encore de certificat, on en génère un maintenant
        // (tous les role_app peuvent signer, donc tous ont besoin d'un certificat)
        let clePrivee = null;
        if (!utilisateur.certificat) {
            const nomComplet = utilisateur.prenom + ' ' + utilisateur.nom;
            const resultatPki = genererCertificat(nomComplet, email);

            await db.query(
                'UPDATE users SET certificat = ?, cle_publique = ? WHERE id = ?',
                [resultatPki.certificat, resultatPki.clePublique, utilisateur.id]
            );

            clePrivee = resultatPki.clePrivee; // envoyée une seule fois, à stocker côté client
        }

        res.json({
            id: utilisateur.id,
            nom: utilisateur.nom,
            prenom: utilisateur.prenom,
            email: utilisateur.email,
            role: utilisateur.role,
            role_app: utilisateur.role_app,
            poste: utilisateur.poste,
            departement: utilisateur.departement,
            certificat: utilisateur.certificat || null,
            cle_privee: clePrivee
        });

    } catch (erreur) {
        console.error(erreur);
        res.status(500).json({ message: "Erreur du serveur." });
    }
});

// ===== Route : GET /api/certificat/:user_id =====
router.get('/certificat/:user_id', async (req, res) => {
    try {
        const [resultats] = await db.query(
            'SELECT certificat FROM users WHERE id = ?',
            [req.params.user_id]
        );

        if (resultats.length === 0 || !resultats[0].certificat) {
            return res.status(404).json({ message: "Aucun certificat trouvé pour cet utilisateur." });
        }

        const cert = forge.pki.certificateFromPem(resultats[0].certificat);

        const sujet = {};
        cert.subject.attributes.forEach(attr => { sujet[attr.shortName] = attr.value; });

        const emetteur = {};
        cert.issuer.attributes.forEach(attr => { emetteur[attr.shortName] = attr.value; });

        res.json({
            numero_serie: cert.serialNumber,
            valide_depuis: cert.validity.notBefore,
            valide_jusqu_a: cert.validity.notAfter,
            titulaire: sujet,
            emetteur: emetteur,
            auto_signe: sujet.CN === emetteur.CN && sujet.emailAddress === emetteur.emailAddress
        });

    } catch (erreur) {
        console.error(erreur);
        res.status(500).json({ message: "Erreur du serveur." });
    }
});

// GET /api/users/responsables — conserve pour compatibilite (anciens appels), retourne chef+admin
router.get('/users/responsables', async (req, res) => {
    try {
        const [users] = await db.query(
            "SELECT id, nom, prenom, email FROM users WHERE role_app IN ('chef','admin') AND actif = 1 ORDER BY nom ASC"
        );
        res.json(users);
    } catch (erreur) {
        console.error(erreur);
        res.status(500).json({ message: "Erreur du serveur." });
    }
});

// GET /api/users/signataires — tous les utilisateurs actifs, utilisable comme signataire
// (n'importe qui peut signer tant qu'il est assigne)
router.get('/users/signataires', async (req, res) => {
    try {
        const [users] = await db.query(
            "SELECT id, nom, prenom, email, poste, departement, role_app FROM users WHERE actif = 1 ORDER BY nom ASC"
        );
        res.json(users);
    } catch (erreur) {
        console.error(erreur);
        res.status(500).json({ message: "Erreur du serveur." });
    }
});

// GET /api/users — liste de tous les utilisateurs actifs (pour le filtre "auteur")
router.get('/users', async (req, res) => {
    try {
        const [users] = await db.query(
            "SELECT id, nom, prenom, role_app, poste, departement FROM users WHERE actif = 1 ORDER BY nom ASC"
        );
        res.json(users);
    } catch (erreur) {
        console.error(erreur);
        res.status(500).json({ message: "Erreur du serveur." });
    }
});

module.exports = router;

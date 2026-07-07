// Ce fichier gère la connexion des utilisateurs.
// À la première connexion, on génère un certificat numérique pour le responsable.

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

        // Vérification du mot de passe (texte en clair)
        if (mot_de_passe !== utilisateur.mot_de_passe) {
            return res.status(401).json({ message: "Email ou mot de passe incorrect." });
        }

        // Si le responsable n'a pas encore de certificat, on en génère un maintenant
        let clePrivee = null;
        if (utilisateur.role === 'responsable' && !utilisateur.certificat) {
            const nomComplet = utilisateur.prenom + ' ' + utilisateur.nom;
            const resultatPki = genererCertificat(nomComplet, email);

            // On sauvegarde le certificat et la clé publique en base
            // La clé privée est renvoyée UNE SEULE FOIS au responsable (jamais stockée)
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
            certificat: utilisateur.certificat || null,
            cle_privee: clePrivee // null si déjà généré avant
        });

    } catch (erreur) {
        console.error(erreur);
        res.status(500).json({ message: "Erreur du serveur." });
    }
});

// ===== Route : POST /api/register =====
// Créer un compte (mot de passe hashé avec bcrypt)
router.post('/register', async (req, res) => {
    const { nom, prenom, email, mot_de_passe, role } = req.body;

    if (!nom || !prenom || !email || !mot_de_passe || !role) {
        return res.status(400).json({ message: "Tous les champs sont obligatoires." });
    }

    try {
        await db.query(
            'INSERT INTO users (nom, prenom, email, mot_de_passe, role) VALUES (?, ?, ?, ?, ?)',
            [nom, prenom, email, mot_de_passe, role]
        );

        res.status(201).json({ message: "Compte créé avec succès." });

    } catch (erreur) {
        if (erreur.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ message: "Cet email est déjà utilisé." });
        }
        console.error(erreur);
        res.status(500).json({ message: "Erreur du serveur." });
    }
});

// ===== Route : GET /api/certificat/:user_id =====
// Lire et décoder le certificat d'un utilisateur (lecture seule, pas de secret exposé).
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

        // On extrait les infos lisibles du certificat
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

module.exports = router;
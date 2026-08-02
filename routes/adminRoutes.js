// Ce fichier contient les routes reservees a l'administrateur :
// creation de comptes, modification (poste/departement/role_app), activation/desactivation.
// Remplace l'ancienne inscription publique : desormais seul un admin cree des comptes.

const express = require('express');
const router = express.Router();
const db = require('../config/db');
const verifierRoleApp = require('../middleware/auth');

// Liste fixe des departements — doit rester synchronisee avec DEPARTEMENTS dans
// frontend/src/components/AdminUsers.js
const DEPARTEMENTS_VALIDES = [
    'Production',
    'Maintenance',
    'Informatique',
    'Ressources Humaines',
    'Finance & Comptabilite',
    'Qualite, Securite & Environnement',
    'Achats & Logistique',
    'Laboratoire & R&D',
    'Direction Generale',
];

// GET /api/admin/users — liste complete (y compris comptes desactives) pour le panneau admin
router.get('/users', verifierRoleApp('admin'), async (req, res) => {
    try {
        const [users] = await db.query(
            `SELECT id, nom, prenom, email, role, role_app, poste, departement, actif, created_at
             FROM users ORDER BY departement ASC, nom ASC`
        );
        res.json(users);
    } catch (erreur) {
        console.error(erreur);
        res.status(500).json({ message: "Erreur du serveur." });
    }
});

// POST /api/admin/users — creer un compte pour un employe
router.post('/users', verifierRoleApp('admin'), async (req, res) => {
    const { nom, prenom, email, mot_de_passe, poste, departement, role_app } = req.body;

    if (!nom || !prenom || !email || !mot_de_passe || !role_app) {
        return res.status(400).json({ message: "Nom, prenom, email, mot de passe et role sont obligatoires." });
    }
    if (!['agent', 'chef', 'admin'].includes(role_app)) {
        return res.status(400).json({ message: "Role invalide." });
    }
    if (departement && !DEPARTEMENTS_VALIDES.includes(departement)) {
        return res.status(400).json({ message: "Departement invalide." });
    }

    try {
        // role legacy conserve pour compatibilite avec l'ancien systeme (non utilise pour les droits)
        const roleLegacy = role_app === 'agent' ? 'employe' : 'responsable';

        await db.query(
            `INSERT INTO users (nom, prenom, email, mot_de_passe, role, role_app, poste, departement, actif)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
            [nom, prenom, email, mot_de_passe, roleLegacy, role_app, poste || null, departement || null]
        );

        res.status(201).json({ message: "Compte cree avec succes." });
    } catch (erreur) {
        if (erreur.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ message: "Cet email est deja utilise." });
        }
        console.error(erreur);
        res.status(500).json({ message: "Erreur du serveur." });
    }
});

// PUT /api/admin/users/:id — modifier poste/departement/role_app/actif d'un compte
router.put('/users/:id', verifierRoleApp('admin'), async (req, res) => {
    const { poste, departement, role_app, actif } = req.body;

    if (role_app && !['agent', 'chef', 'admin'].includes(role_app)) {
        return res.status(400).json({ message: "Role invalide." });
    }
    if (departement && !DEPARTEMENTS_VALIDES.includes(departement)) {
        return res.status(400).json({ message: "Departement invalide." });
    }

    try {
        const champs = [];
        const valeurs = [];
        if (poste !== undefined) { champs.push('poste = ?'); valeurs.push(poste); }
        if (departement !== undefined) { champs.push('departement = ?'); valeurs.push(departement); }
        if (role_app !== undefined) {
            champs.push('role_app = ?'); valeurs.push(role_app);
            champs.push('role = ?'); valeurs.push(role_app === 'agent' ? 'employe' : 'responsable');
        }
        if (actif !== undefined) { champs.push('actif = ?'); valeurs.push(actif ? 1 : 0); }

        if (champs.length === 0) return res.status(400).json({ message: "Aucune modification fournie." });

        valeurs.push(req.params.id);
        await db.query(`UPDATE users SET ${champs.join(', ')} WHERE id = ?`, valeurs);

        res.json({ message: "Compte mis a jour." });
    } catch (erreur) {
        console.error(erreur);
        res.status(500).json({ message: "Erreur du serveur." });
    }
});

// PUT /api/admin/users/:id/password — reinitialiser le mot de passe d'un compte
router.put('/users/:id/password', verifierRoleApp('admin'), async (req, res) => {
    const { nouveau_mot_de_passe } = req.body;
    if (!nouveau_mot_de_passe || nouveau_mot_de_passe.length < 4) {
        return res.status(400).json({ message: "Mot de passe trop court (4 caracteres minimum)." });
    }
    try {
        await db.query('UPDATE users SET mot_de_passe = ? WHERE id = ?', [nouveau_mot_de_passe, req.params.id]);
        res.json({ message: "Mot de passe reinitialise." });
    } catch (erreur) {
        console.error(erreur);
        res.status(500).json({ message: "Erreur du serveur." });
    }
});

module.exports = router;

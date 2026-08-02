// Ce fichier verifie les DROITS de l'utilisateur selon un systeme hierarchique a 3 niveaux :
//   agent (1) < chef (2) < admin (3)
//
// IMPORTANT : comme avant, c'est une verification SIMPLE faite pour un prototype de stage.
// Le role_app est envoye par le frontend dans le corps (body) ou la query de la requete.
// (Dans une vraie entreprise, on utiliserait des sessions/tokens signes cote serveur.)

const NIVEAUX = { agent: 1, chef: 2, admin: 3 };

// Exige un niveau minimum (ex: verifierRoleApp('admin') => seul un admin passe)
function verifierRoleApp(niveauMin) {
    return (req, res, next) => {
        const roleApp = req.query.role_app || req.body.role_app;

        if (!roleApp) {
            return res.status(400).json({ message: "Le role de l'utilisateur est manquant." });
        }
        if (!NIVEAUX[roleApp]) {
            return res.status(400).json({ message: "Role invalide." });
        }
        if (NIVEAUX[roleApp] < NIVEAUX[niveauMin]) {
            return res.status(403).json({ message: "Acces refuse : droits insuffisants pour cette action." });
        }
        next();
    };
}

module.exports = verifierRoleApp;
module.exports.NIVEAUX = NIVEAUX;

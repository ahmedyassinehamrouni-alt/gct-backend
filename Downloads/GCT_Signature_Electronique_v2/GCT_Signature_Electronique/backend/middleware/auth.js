// Ce fichier contient une fonction simple pour vérifier le RÔLE de l'utilisateur.
// Exemple : seul un "responsable" a le droit de signer un document.
//
// IMPORTANT : c'est une vérification SIMPLE, faite pour un prototype de stage.
// Le rôle est simplement envoyé par le frontend dans le corps (body) de la requête.
// (Dans une vraie entreprise, on utiliserait un système plus sécurisé comme des
// sessions ou des tokens, mais ce n'est pas demandé ici.)

function verifierRole(roleAutorise) {
    // On retourne une fonction "middleware" qu'Express va exécuter
    // avant d'exécuter la route (ex: avant de signer le document)
    return (req, res, next) => {
        const role = req.body.role; // le rôle envoyé par le frontend

        // Si le rôle n'est pas envoyé du tout
        if (!role) {
            return res.status(400).json({ message: "Le rôle de l'utilisateur est manquant." });
        }

        // Si le rôle envoyé ne correspond pas au rôle autorisé pour cette action
        if (role !== roleAutorise) {
            return res.status(403).json({ message: "Accès refusé : vous n'avez pas le droit de faire cette action." });
        }

        // Si tout est bon, on laisse passer la requête vers la suite (la vraie route)
        next();
    };
}

module.exports = verifierRole;

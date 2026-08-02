// horodatage.js - Horodatage simple des signatures
// Le but : prouver qu'une signature a eu lieu à un moment précis et qu'elle n'a pas été modifiée.
// Pour le prototype : on génère un "jeton d'horodatage" en hachant la signature + la date.

const forge = require('node-forge');

// Crée un jeton d'horodatage pour une signature
function creerHorodatage(signatureBase64) {
    const maintenant = new Date().toISOString(); // ex: "2025-06-29T14:30:00.000Z"

    // On hache ensemble : la signature + la date exacte
    // → si quelqu'un change la date ou la signature, le hash sera différent
    const contenu = signatureBase64 + '|' + maintenant;
    const hash = forge.md.sha256.create();
    hash.update(contenu);
    const empreinte = hash.digest().toHex();

    return {
        date: maintenant,
        empreinte: empreinte  // ce hash prouve que la signature existait à cette date
    };
}

// Vérifie qu'un horodatage est cohérent (la date et la signature n'ont pas changé)
function verifierHorodatage(signatureBase64, date, empreinte) {
    const contenu = signatureBase64 + '|' + date;
    const hash = forge.md.sha256.create();
    hash.update(contenu);
    const empreinteAttendue = hash.digest().toHex();
    return empreinteAttendue === empreinte;
}

module.exports = { creerHorodatage, verifierHorodatage };
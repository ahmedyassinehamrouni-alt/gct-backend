const forge = require('node-forge');

function genererCertificat(nom, email) {
    const paire = forge.pki.rsa.generateKeyPair(2048);
    const clePrivee = paire.privateKey;
    const clePublique = paire.publicKey;

    const cert = forge.pki.createCertificate();
    cert.publicKey = clePublique;
    cert.serialNumber = Date.now().toString();
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);

    const infos = [
        { name: 'commonName', value: nom },
        { name: 'emailAddress', value: email },
        { name: 'organizationName', value: 'GCT Gabès' }
    ];
    cert.setSubject(infos);
    cert.setIssuer(infos);
    cert.sign(clePrivee, forge.md.sha256.create());

    return {
        clePrivee: forge.pki.privateKeyToPem(clePrivee),
        clePublique: forge.pki.publicKeyToPem(clePublique),
        certificat: forge.pki.certificateToPem(cert)
    };
}

// Encode base64 en version URL-safe (pas de +, /, = qui posent problème en DB)
function toSafeBase64(str) {
    return str.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function fromSafeBase64(str) {
    str = str.replace(/-/g, '+').replace(/_/g, '/');
    while (str.length % 4) str += '=';
    return str;
}

function signerDocument(contenu, clePriveePem) {
    const clePrivee = forge.pki.privateKeyFromPem(clePriveePem);
    const md = forge.md.sha256.create();
    md.update(contenu, 'utf8');
    const signature = clePrivee.sign(md);
    return toSafeBase64(forge.util.encode64(signature));
}

function verifierSignature(contenu, signatureSafeBase64, clePubliquePem) {
    try {
        const clePublique = forge.pki.publicKeyFromPem(clePubliquePem);
        const md = forge.md.sha256.create();
        md.update(contenu, 'utf8');
        const signature = forge.util.decode64(fromSafeBase64(signatureSafeBase64));
        return clePublique.verify(md.digest().getBytes(), signature);
    } catch (e) {
        console.error('Erreur vérification:', e.message);
        return false;
    }
}

module.exports = { genererCertificat, signerDocument, verifierSignature };
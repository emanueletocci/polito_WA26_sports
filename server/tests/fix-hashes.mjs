/* Rigenera solo gli hash delle password, riusando i salt già presenti nel tuo database.
   Esegui con: node fix-hashes.mjs
   Poi copia gli hash stampati in un UPDATE (o direttamente in schema.sql). */

import crypto from 'crypto';

// Inserisci qui: email, password in chiaro, e il salt ESATTO già presente nel tuo DB per quell'utente.
const users = [
  { email: 's363290@studenti.polito.it', password: 'Password1!', salt: '8f650e1213b07092045b20d53fcab067' },
  { email: 'user2@example.com', password: 'Password2!', salt: '7d6342853652c5951b8bb683a404922e' },
  { email: 'user3@example.com', password: 'Password3!', salt: '9f05bb88125fdf55b89aabc279d63e84' },
  { email: 'user4@example.com', password: 'Password4!', salt: '5e931bb30b7e1a50ffdbf0002fe3c3be' },
];

function generateHash(password, salt) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, Buffer.from(salt, 'hex'), 32, (err, derivedKey) => {
      if (err) return reject(err);
      resolve(derivedKey.toString('hex'));
    });
  });
}

async function main() {
  for (const u of users) {
    const hash = await generateHash(u.password, u.salt);
    console.log(`-- ${u.email}`);
    console.log(`UPDATE users SET password_hash = '${hash}' WHERE email = '${u.email}';`);
    console.log(`   (lunghezza hash: ${hash.length} - deve essere 64)\n`);
  }
}

main();

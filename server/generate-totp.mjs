import { TOTP } from 'otpauth';

// Usa lo stesso secret che hai nel seed per user2/user4
const secret = process.argv[2] || 'LXBSMDTMSP2I5XFXIYRGFVWSFI';

const totp = new TOTP({
  algorithm: 'SHA1',
  digits: 6,
  period: 30,
  secret,
});

const code = totp.generate();
console.log('Codice TOTP valido ora:', code);
console.log('Secondi rimanenti prima che scada:', 30 - (Math.floor(Date.now() / 1000) % 30));

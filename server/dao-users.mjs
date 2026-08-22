import db from './db.mjs';
import crypto from 'crypto'

const getUserById = (id) => {
  return new Promise((resolve, reject) => {
    const sql = 'SELECT * FROM users WHERE id_user=?';
    db.get(sql, [id], (err, row) => {
      if (err)
        reject(err);
      else if (row === undefined)
        resolve({ error: 'User not found.' });
      else {
        // By default, the local strategy looks for "username": 
        // for simplicity, instead of using "email", we create an object with that property.
        const user = { id: row.id_user, username: row.email, name: row.name, surname: row.surname, is_admin: row.is_admin, secret: row.secret, lastTotpStep: row.last_Totp_Step }; 
        resolve(user);
      }
    });
  });
};



const getUser = (email, password) => {
  return new Promise((resolve, reject) => {
    const sql = 'SELECT * FROM users WHERE email=?';
    db.get(sql, [email], (err, row) => {
      if (err) {
        reject(err);
      } else if (row === undefined) {
        resolve(false);
      }
      else {
        const user = { id: row.id_user, username: row.email, name: row.name, surname: row.surname, is_admin: row.is_admin, secret: row.secret, lastTotpStep: row.last_Totp_Step }; 
        
        // Check the hashes with an async call, this operation may be CPU-intensive (and we don't want to block the server)
        crypto.scrypt(password, row.salt, 32, function (err, hashedPassword) { // WARN: it is 64 and not 32 (as in the week example) in the DB
          if (err) reject(err);
          if (!crypto.timingSafeEqual(Buffer.from(row.hash, 'hex'), hashedPassword)) // WARN: it is hash and not password (as in the week example) in the DB
            resolve(false);
          else
            resolve(user);
        });
      }
    });
  });
};


const updateLastTotpStep = (userId, lastTotpStep) => {
  return new Promise((resolve, reject) => {
    const sql = 'UPDATE users SET last_Totp_Step = ? WHERE id_user = ?';
    db.run(sql, [lastTotpStep, userId], function (err) {
      if (err) {
        reject(err);
      }
      if (this.changes !== 1) {
        resolve({ error: 'User not found.' });
      } else {
        resolve(this.changes);
      }
    });
  });
};


export default {
  getUserById,
  getUser,
  updateLastTotpStep
};





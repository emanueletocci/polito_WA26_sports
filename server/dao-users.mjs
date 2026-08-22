/* Data Access Object (DAO) module for accessing users data */

import db from "./db.mjs";
import crypto from "crypto";

// This function returns user's information given its id.
const getUserById = (id) => {
	return new Promise((resolve, reject) => {
		const sql = "SELECT * FROM users WHERE id=?";
		db.get(sql, [id], (err, row) => {
			if (err) reject(err);
			else if (row === undefined) resolve({ error: "User not found." });
			else {
				// By default, the local strategy looks for "username":
				// for simplicity, instead of using "email", we create an object with that property.
				const user = {
					id: row.id,
					email: row.email,
					name: row.name,
					surname: row.surname,
					score: row.score,
					totpSecret: row.totp_secret,
					lastTotpStep: row.last_totp_step,
				};
				resolve(user);
			}
		});
	});
};

// This function is used at log-in time to verify username and password.
const getUser = (email, password) => {
	return new Promise((resolve, reject) => {
		const sql = "SELECT * FROM users WHERE email=?";
		db.get(sql, [email], (err, row) => {
			if (err) {
				reject(err);
			} else if (row === undefined) {
				resolve(false);
			} else {
				const user = {
					id: row.id,
					username: row.email,
					name: row.name,
					secret: row.totp_secret,
					lastTotpStep: row.last_totp_step,
				};

				// Check the hashes with an async call, this operation may be CPU-intensive (and we don't want to block the server)
				crypto.scrypt(
					password,
					Buffer.from(row.salt, "hex"),
					32,
					function (err, hashedPassword) {
						// WARN: it is 64 and not 32 (as in the week example) in the DB
						if (err) reject(err);
						if (
							!crypto.timingSafeEqual(
								// row.password_hash is stored as a hex string (TEXT column in SQLite), not as raw bytes.
								// Buffer.from(row.password_hash, 'hex') decodes it back into a real byte sequence,
								// matching the Buffer format returned by crypto.scrypt - without this conversion,
								// timingSafeEqual would compare a text string against raw bytes and always fail.
								Buffer.from(row.password_hash, "hex"),
								hashedPassword,
							)
						)
							// WARN: it is hash and not password (as in the week example) in the DB
							resolve(false);
						else resolve(user);
					},
				);
			}
		});
	});
};

// TODO: testare
// This function updates the lastTotpStep for the user in the database.
const updateLastTotpStep = (userId, lastTotpStep) => {
	return new Promise((resolve, reject) => {
		const sql = "UPDATE users SET last_totp_step = ? WHERE id = ?";
		db.run(sql, [lastTotpStep, userId], function (err) {
			if (err) {
				reject(err);
			}
			if (this.changes !== 1) {
				resolve({ error: "User not found." });
			} else {
				resolve(this.changes);
			}
		});
	});
};

// Decreases the user's score by 1 (called on "delete reservation").
const decrementScore = (userId) => {
	return new Promise((resolve, reject) => {
		const sql = "UPDATE users SET score = score - 1 WHERE id = ?";
		db.run(sql, [userId], function (err) {
			if (err) reject(err);
			else if (this.changes !== 1) resolve({ error: "User not found." });
			else resolve(this.changes);
		});
	});
};

// Increases the user's score by 1 (for symmetry).
const incrementScore = (userId) => {
	return new Promise((resolve, reject) => {
		const sql = "UPDATE users SET score = score + 1 WHERE id = ?";
		db.run(sql, [userId], function (err) {
			if (err) reject(err);
			else if (this.changes !== 1) resolve({ error: "User not found." });
			else resolve(this.changes);
		});
	});
};

// Resets the user's score to 0 (called after a successful TOTP login).
const resetScore = (userId) => {
	return new Promise((resolve, reject) => {
		const sql = "UPDATE users SET score = 0 WHERE id = ?";
		db.run(sql, [userId], function (err) {
			if (err) reject(err);
			else if (this.changes !== 1) resolve({ error: "User not found." });
			else resolve(this.changes);
		});
	});
};

export default {
	getUserById,
	getUser,
	updateLastTotpStep,
  decrementScore,
  incrementScore,
  resetScore,
};

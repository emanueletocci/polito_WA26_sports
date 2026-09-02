/* Data Access Object (DAO) module for accessing users data */

import db from "./db.mjs";
import crypto from "crypto";

// Maps a row of the "users" table into the user object used by the application,
// converting the snake_case column names into camelCase properties. The password
// hash and the salt are deliberately left out: they never leave the DAO.
// - dbRecord: a row as returned by SQLite
// Returns the user object { id, email, name, surname, score, totpSecret, lastTotpStep }
const convertUserFromDbRecord = (dbRecord) => {
	return {
		id: dbRecord.id,
		email: dbRecord.email,
		name: dbRecord.name,
		surname: dbRecord.surname,
		score: dbRecord.score,
		totpSecret: dbRecord.totp_secret,
		lastTotpStep: dbRecord.last_totp_step,
	};
};

// This function returns user's information given its id.
const getUserById = (id) => {
	return new Promise((resolve, reject) => {
		const sql = "SELECT * FROM users WHERE id=?";
		db.get(sql, [id], (err, row) => {
			if (err) reject(err);
			else if (row === undefined) resolve({ error: "User not found." });
			else resolve(convertUserFromDbRecord(row));
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
				// No user with this email. NB: the same "false" is returned when the
				// password is wrong
				resolve(false);
			} else {
				// The application-level user object is built here, but it is returned
				// ONLY if the password check below succeeds.
				const user = convertUserFromDbRecord(row);

				// Check the hashes with an async call: this operation may be
				// CPU-intensive (and we don't want to block the server)
				crypto.scrypt(
					password,
					Buffer.from(row.salt, "hex"),
					32, // 32 bytes = the 64 hex characters stored in password_hash
					function (err, hashedPassword) {
						if (err) {
							reject(err);
							return;
						}
						if (
							!crypto.timingSafeEqual(
								// password_hash is stored as a hex string (TEXT column), not as
								// raw bytes: Buffer.from(..., "hex") decodes it back into the
								// byte sequence returned by crypto.scrypt.
								Buffer.from(row.password_hash, "hex"),
								hashedPassword,
							)
						)
							resolve(false);
						else resolve(user);
					},
				);
			}
		});
	});
};

const updateLastTotpStep = (userId, lastTotpStep) => {
	return new Promise((resolve, reject) => {
		const sql = "UPDATE users SET last_totp_step = ? WHERE id = ?";
		db.run(sql, [lastTotpStep, userId], function (err) {
			if (err) {
				reject(err);
			} else {
				if (this.changes !== 1) {
					resolve({ error: "User not found." });
				} else {
					resolve(this.changes);
				}
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
	resetScore,
};

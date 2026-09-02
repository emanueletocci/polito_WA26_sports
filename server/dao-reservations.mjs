/* Data Access Object (DAO) module for accessing reservations and rents data */

import db from "./db.mjs";
import dayjs from "dayjs";

// -----------------------------------------------------------------------------
// RESERVATIONS
// -----------------------------------------------------------------------------

// Returns all ACTIVE reservations for a given user, joined with facility info.
// Returns a Promise resolving to an array of rows, each shaped like:
// { id, userId, facilityCode, createdAt, facilityTypeId, facilityTypeName }
const getActiveReservationsByUser = (userId) => {
	return new Promise((resolve, reject) => {
		const sql = `
      SELECT r.id, r.user_id AS userId, r.facility_code AS facilityCode,
             r.created_at AS createdAt, f.facility_type_id AS facilityTypeId, ft.name AS facilityTypeName
      FROM reservations r
      JOIN facilities f ON f.code = r.facility_code
      JOIN facility_types ft ON ft.id = f.facility_type_id
      WHERE r.user_id = ? AND r.status = 'active'
    `;
		db.all(sql, [userId], (err, rows) => {
			if (err) reject(err);
			else resolve(rows);
		});
	});
};

// Returns a single reservation given its id, joined with facility_type_id
// AND facility_type_name (needed for authorization checks, to know which
// equipment rules apply, and to display the facility type name in the UI).
// Returns a Promise resolving to:
// - { id, userId, facilityCode, createdAt, status, releasedAt, facilityTypeId, facilityTypeName } if found
// - { error: 'Reservation not found.' } if no reservation has this id
const getReservationById = (id) => {
	return new Promise((resolve, reject) => {
		const sql = `
      SELECT r.id, r.user_id AS userId, r.facility_code AS facilityCode,
             r.created_at AS createdAt, r.status, r.released_at AS releasedAt,
             f.facility_type_id AS facilityTypeId, ft.name AS facilityTypeName
      FROM reservations r
      JOIN facilities f ON f.code = r.facility_code
      JOIN facility_types ft ON ft.id = f.facility_type_id
      WHERE r.id = ?
    `;
		db.get(sql, [id], (err, row) => {
			if (err) reject(err);
			else if (row === undefined) resolve({ error: "Reservation not found." });
			else resolve(row);
		});
	});
};

// Creates a new (active) reservation for a user on a given facility.
// - userId: the id of the user making the reservation
// - facilityCode: the code of the facility being reserved (must already be
//   booked atomically via facilityDao.bookFacilityIfFree before calling this)
// Returns a Promise resolving to the id of the newly created reservation
// (this.lastID, the autoincrement id assigned by SQLite).
const createReservation = (userId, facilityCode) => {
	return new Promise((resolve, reject) => {
		const createdAt = dayjs().toISOString();
		const sql =
			"INSERT INTO reservations (user_id, facility_code, created_at) VALUES (?, ?, ?)";
		db.run(sql, [userId, facilityCode, createdAt], function (err) {
			if (err) reject(err);
			else resolve(this.lastID);
		});
	});
};

// Marks an active reservation as cancelled and records the release time (used for
// the 30s rebooking rule).
//
// Returns a Promise resolving to:
// - the number of changed rows (1) if the reservation was active and has been cancelled
// - { error: 'Reservation not found or not active.' } if it does not exist or was
//   already cancelled (possibly by a concurrent request)
const cancelReservation = (id) => {
	return new Promise((resolve, reject) => {
		const releasedAt = dayjs().toISOString();
		const sql = `UPDATE reservations SET status = 'cancelled', released_at = ?
             WHERE id = ? AND status = 'active'`;
		db.run(sql, [releasedAt, id], function (err) {
			if (err) reject(err);
			else if (this.changes !== 1)
				resolve({ error: "Reservation not found or not active" });
			else resolve(this.changes);
		});
	});
};

// Returns the timestamp of the most recent release (cancellation) by this user for this facility type,
// or undefined if none exists. The caller compares this timestamp with the current time in JS
// to decide whether the 30-second cooldown rule applies.
//
// Returns a Promise resolving to the raw released_at string, or undefined if
// this user never cancelled a reservation of this facility type.
const getLastReleaseTime = (userId, facilityTypeId) => {
	return new Promise((resolve, reject) => {
		const sql = `
      SELECT r.released_at AS releasedAt
      FROM reservations r
      JOIN facilities f ON f.code = r.facility_code
      WHERE r.user_id = ? AND f.facility_type_id = ? AND r.status = 'cancelled'
      ORDER BY r.released_at DESC
      LIMIT 1
    `;
		db.get(sql, [userId, facilityTypeId], (err, row) => {
			if (err) reject(err);
			else resolve(row ? row.releasedAt : undefined);
		});
	});
};

// -----------------------------------------------------------------------------
// RENTS (equipment rented for a reservation)
// -----------------------------------------------------------------------------

// Returns all equipment rented for a given reservation, joined with equipment info.
//
// Returns a Promise resolving to an array of rows, each shaped like:
// { reservationId, equipmentId, quantity, name, minQuantity }
const getRentsByReservation = (reservationId) => {
	return new Promise((resolve, reject) => {
		const sql = `
      SELECT rt.reservation_id AS reservationId, rt.equipment_id AS equipmentId,
             rt.quantity, e.name, e.min_quantity AS minQuantity
      FROM rents rt
      JOIN equipment e ON e.id = rt.equipment_id
      WHERE rt.reservation_id = ?
    `;
		db.all(sql, [reservationId], (err, rows) => {
			if (err) reject(err);
			else resolve(rows);
		});
	});
};

// Adds one equipment line to a reservation.
// - reservationId: the reservation the equipment line belongs to
// - equipmentId: the id of the equipment being rented
// - quantity: how many units are being rented
//
// Returns a Promise resolving to the id of the newly created rent row
// (this.lastID). The caller is responsible for also decrementing the
// equipment's available quantity (facilityDao.decrementEquipmentAvailability).
const addRent = (reservationId, equipmentId, quantity) => {
	return new Promise((resolve, reject) => {
		const sql =
			"INSERT INTO rents (reservation_id, equipment_id, quantity) VALUES (?, ?, ?)";
		db.run(sql, [reservationId, equipmentId, quantity], function (err) {
			if (err) reject(err);
			else resolve(this.lastID);
		});
	});
};

// Updates the quantity of an already-rented equipment line (used when the user changes an extra quantity).
// - reservationId: the reservation the equipment line belongs to
// - equipmentId: the id of the equipment whose quantity is being updated
// - quantity: the new quantity to set
//
// Returns a Promise resolving to:
// - the number of changed rows (1) on success
// - { error: 'Rent line not found.' } if no matching row exists
const updateRentQuantity = (reservationId, equipmentId, quantity) => {
	return new Promise((resolve, reject) => {
		const sql =
			"UPDATE rents SET quantity = ? WHERE reservation_id = ? AND equipment_id = ?";
		db.run(sql, [quantity, reservationId, equipmentId], function (err) {
			if (err) reject(err);
			else if (this.changes !== 1) resolve({ error: "Rent line not found." });
			else resolve(this.changes);
		});
	});
};

// Removes one equipment line from a reservation (used when removing an optional/extra item; the caller
// must ensure this is never called for a mandatory minimum line).
// - reservationId: the reservation the equipment line belongs to
// - equipmentId: the id of the equipment line to remove
//
// Returns a Promise resolving to the number of deleted rows (0 or 1 - the
// caller does not currently distinguish between "nothing to delete" and
// "deleted successfully").
const deleteRent = (reservationId, equipmentId) => {
	return new Promise((resolve, reject) => {
		const sql =
			"DELETE FROM rents WHERE reservation_id = ? AND equipment_id = ?";
		db.run(sql, [reservationId, equipmentId], function (err) {
			if (err) reject(err);
			else resolve(this.changes);
		});
	});
};

export default {
	getActiveReservationsByUser,
	getLastReleaseTime,
	getReservationById,
	createReservation,
	cancelReservation,
	getRentsByReservation,
	addRent,
	updateRentQuantity,
	deleteRent,
};

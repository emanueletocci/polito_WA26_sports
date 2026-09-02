/* Data Access Object (DAO) module for accessing facility types, facilities and equipment data */

import db from "./db.mjs";

// ============================================================
// FACILITIES
// ============================================================

// Maps every accepted value of the "status" query parameter to the function
// that filters the rows for it. The DB is queried once, without a WHERE clause,
// and the filtering is done in JS.

// The object plays two roles at the same time:
//  - its KEYS are the list of accepted values, so validating the parameter is
//    just a matter of checking whether the key exists (see getFacilities);
//  - its VALUES hold the filtering function, so the string coming from the
//    client is turned into a function with one lookup, without a chain of ifs.

const facilityFilterValues = {
	free: { filterFunction: (f) => f.isBooked === 0 },
	booked: { filterFunction: (f) => f.isBooked === 1 },
};

// Returns facilities (each with its type), optionally filtered by status ("free" | "booked").
// Without a filter, returns ALL facilities; used by the public homepage to compute per-type counts (free/booked/total).
const getFacilities = (filter) => {
	return new Promise((resolve, reject) => {
		const sql = `
      SELECT f.code, f.is_booked AS isBooked, ft.id AS facilityTypeId, ft.name AS facilityTypeName
      FROM facilities f
      JOIN facility_types ft ON f.facility_type_id = ft.id
    `;
		db.all(sql, [], (err, rows) => {
			if (err) {
				reject(err);
				return;
			}
			// Check if a filter is specified, otherwise just return the complete list.
			if (filter) {
				// WARNING: using facilityFilterValues[filter] directly would also match
				// inherited properties like 'constructor', but then .filterFunction would
				// not exist - hasOwnProperty avoids that trap, checking only own properties of the object.
				if (facilityFilterValues.hasOwnProperty(filter)) {
					resolve(rows.filter(facilityFilterValues[filter].filterFunction));
				} else {
					reject({ error: "The specified filter is not available" });
				}
				return;
			}
			resolve(rows);
		});
	});
};

// Returns the list of all the facility types of the sport center.
// [{ id: 1, name: 'tennis' }, { id: 2, name: 'basketball' }, ...].
const getAllFacilityTypes = () => {
	return new Promise((resolve, reject) => {
		const sql = "SELECT id, name FROM facility_types";
		db.all(sql, [], (err, rows) => {
			if (err) reject(err);
			else resolve(rows);
		});
	});
};

// Returns a single facility given its code.
const getFacilityByCode = (code) => {
	return new Promise((resolve, reject) => {
		const sql =
			"SELECT code, facility_type_id AS facilityTypeId, is_booked AS isBooked FROM facilities WHERE code = ?";
		db.get(sql, [code], (err, row) => {
			if (err) reject(err);
			else if (row === undefined) resolve({ error: "Facility not found." });
			else resolve(row);
		});
	});
};

// Picks one free facility of a given type automatically (system assignment mode).
// Returns undefined if none is available.
const getOneFreeFacilityByType = (facilityTypeId) => {
	return new Promise((resolve, reject) => {
		const sql =
			"SELECT code FROM facilities WHERE facility_type_id = ? AND is_booked = 0 ORDER BY code LIMIT 1";
		db.get(sql, [facilityTypeId], (err, row) => {
			if (err) reject(err);
			else resolve(row); // undefined if none free
		});
	});
};

// Books a facility, but ONLY if it is still free at the moment this
// exact query runs.
const bookFacilityIfFree = (code) => {
	return new Promise((resolve, reject) => {
		const sql =
			"UPDATE facilities SET is_booked = 1 WHERE code = ? AND is_booked = 0";
		db.run(sql, [code], function (err) {
			if (err) reject(err);
			// If no row was updated, it means the facility was already booked by someone else.
			else if (this.changes !== 1)
				resolve({ error: "Facility is no longer available." });
			else resolve(this.changes);
		});
	});
};

// Marks a facility as free again (e.g. when a reservation is deleted, or when an operation must be undone).
// Booking is NOT done here: it is performed by bookFacilityIfFree.
const freeFacility = (code) => {
	return new Promise((resolve, reject) => {
		const sql = "UPDATE facilities SET is_booked = 0 WHERE code = ?";
		db.run(sql, [code], function (err) {
			if (err) reject(err);
			else if (this.changes !== 1) resolve({ error: "Facility not found." });
			else resolve(this.changes);
		});
	});
};

// ============================================================
// EQUIPMENT
// ============================================================

// Returns ALL the equipment of the sport center, with its current availability.
const getEquipment = () => {
	return new Promise((resolve, reject) => {
		const sql = `
		SELECT e.id, e.name, e.total_quantity AS totalQuantity,
			e.available_quantity AS availableQuantity,
			e.min_quantity AS minQuantity,
			e.facility_type_id AS facilityTypeId,
			ft.name AS facilityTypeName
		FROM equipment e
		JOIN facility_types ft ON e.facility_type_id = ft.id
    	`;
		db.all(sql, [], (err, rows) => {
			if (err) reject(err);
			else resolve(rows);
		});
	});
};

// getEquipmentRulesForFacilityType
// Returns the equipment rules of ONE facility type: which items can be rented
// with it, how many of each are mandatory, and how many are free right now.
// This is the "rules" array on which the validation functions of utils.mjs
// iterate.
//
//
// Returns a Promise resolving to an array of rules. For tennis (id 1):
//   [
//     { id: 1, name: 'tennis_racket', totalQuantity: 8, availableQuantity: 6, minQuantity: 2 },
//     { id: 2, name: 'tennis_ball',   totalQuantity: 7, availableQuantity: 4, minQuantity: 3 },
//     { id: 3, name: 'towel',         totalQuantity: 4, availableQuantity: 4, minQuantity: 0 }
//   ]
// where:
//  - minQuantity > 0  -> mandatory, and that value is the lowest quantity a
//                        reservation may have ;
//  - minQuantity === 0 -> optional, so it can be removed completely;
//  - availableQuantity -> units free in the whole sport center, NOT counting the
//                        ones already held by existing reservations (they were
//                        subtracted when those reservations were created). 
//
// An EMPTY array means that no equipment is associated to this id, i.e. the
// facility type does not exist.

const getEquipmentRulesForFacilityType = (facilityTypeId) => {
	return new Promise((resolve, reject) => {
		const sql = `
      SELECT id, name, total_quantity AS totalQuantity,
             available_quantity AS availableQuantity, min_quantity AS minQuantity
      FROM equipment
      WHERE facility_type_id = ?
    `;
		db.all(sql, [facilityTypeId], (err, rows) => {
			if (err) reject(err);
			else resolve(rows);
		});
	});
};

// Decreases the available quantity of an equipment type by a given amount.
const decrementEquipmentAvailability = (equipmentId, quantity) => {
	return new Promise((resolve, reject) => {
		const sql = `
      UPDATE equipment
      SET available_quantity = available_quantity - ?
      WHERE id = ? AND available_quantity >= ?
    `;
		db.run(sql, [quantity, equipmentId, quantity], function (err) {
			if (err) reject(err);
			else if (this.changes !== 1)
				resolve({ error: "Not enough equipment available." });
			else resolve(this.changes);
		});
	});
};

// Increases the available quantity of an equipment type by a given amount (e.g. on reservation deletion).
const incrementEquipmentAvailability = (equipmentId, quantity) => {
	return new Promise((resolve, reject) => {
		const sql =
			"UPDATE equipment SET available_quantity = available_quantity + ? WHERE id = ?";
		db.run(sql, [quantity, equipmentId], function (err) {
			if (err) reject(err);
			else if (this.changes !== 1) resolve({ error: "Equipment not found." });
			else resolve(this.changes);
		});
	});
};

export default {
	getFacilities,
	getAllFacilityTypes,
	getFacilityByCode,
	getOneFreeFacilityByType,
	bookFacilityIfFree,
	freeFacility,
	getEquipment,
	getEquipmentRulesForFacilityType,
	decrementEquipmentAvailability,
	incrementEquipmentAvailability,
};

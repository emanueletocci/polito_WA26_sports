/* Data Access Object (DAO) module for accessing facility types, facilities and equipment data */

import db from "./db.mjs";

// ============================================================
// FACILITIES
// ============================================================

// Filter functions applied in JS, after a single unfiltered query to the DB.
// This mirrors the "filterValues" pattern used for films in the lab.
const facilityFilterValues = {
	free: { filterFunction: (f) => f.isBooked === 0 },
	booked: { filterFunction: (f) => f.isBooked === 1 },
};

// Returns facilities (each with its type), optionally filtered by status ("free" | "booked").
// Without a filter, returns ALL facilities - this is what the public homepage needs
// to compute per-type counts (free/booked/total).
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

// Returns the list of all facility types (id, name) - useful for dropdowns/validation.
const getAllFacilityTypes = () => {
	return new Promise((resolve, reject) => {
		const sql = "SELECT id, name FROM facility_types";
		db.all(sql, [], (err, rows) => {
			if (err) reject(err);
			else resolve(rows);
		});
	});
};

// Returns a single facility given its code, including its facility_type_id (needed to know which equipment rules apply).
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
			else if (this.changes !== 1)
				resolve({ error: "Facility is no longer available." });
			else resolve(this.changes);
		});
	});
};

// freeFacility
// Marks a facility as free again (e.g. when a reservation is deleted, or when an
// operation must be undone).
// Booking is NOT done here: it needs the atomic bookFacilityIfFree.
// - code: the code of the facility to release
// Returns a Promise resolving to the number of changed rows (1), or
// { error: 'Facility not found.' } if no facility has this code.
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

// Returns, for each equipment type, id, name, facilityTypeId, facilityTypeName, totalQuantity, availableQuantity, minQuantity
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

// Returns all equipment rules (name, min_quantity) for a given facility type.
// min_quantity = 0 means optional, > 0 means mandatory with that minimum.
// Used to validate a reservation request (mandatory minimums, allowed equipment types).
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
// Only succeeds (changes = 1) if enough quantity is available - this is an atomic check-and-update
// that prevents overbooking equipment under concurrent requests.
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

// -----------------------------------------------------------------------------
// UTILITY FUNCTIONS
// -----------------------------------------------------------------------------

/* Utility functions shared by the API routes of index.mjs.
 * They are kept in a separate module to keep index.mjs focused on the routes:
 * here there is the business logic (validation of the requested equipment,
 * choice of the facility, taking/giving back the equipment) and a few small
 * formatting helpers.
 */

import dayjs from "dayjs";

import reservationDao from "./dao-reservations.mjs";
import facilityDao from "./dao-facilities.mjs";

// A user cannot book again a facility of a type they have just released
// before this amount of seconds has passed (requirement of the exam text).
const REBOOKING_COOLDOWN_SECONDS = 30;

// -----------------------------------------------------------------------------
// FORMATTERS
// -----------------------------------------------------------------------------

/**
 * Builds the user information that is safe to send to the client (no password
 * hash, no salt, no TOTP secret).
 *
 * INPUT (params, positional):
 * - req: the request object (req.user comes from the session, req.session.method
 *   tells whether the TOTP step has been completed)
 *
 * OUTPUT (return value):
 * - object { id, email, name, surname, score, hasTotpEnabled, isTotpVerified }
 */
function clientUserInfo(req) {
	const user = req.user;
	return {
		id: user.id,
		email: user.email,
		name: user.name,
		surname: user.surname,
		score: user.score,
		hasTotpEnabled: user.totpSecret ? true : false,
		isTotpVerified: req.session.method === "totp",
	};
}

/**
 * Formats the errors produced by express-validator as strings.
 *
 * INPUT (params, destructured from the error object):
 * - location, msg, param, value, nestedErrors
 *
 * OUTPUT (return value):
 * - string describing the error, e.g. "body[rating]: Invalid value"
 */
function errorFormatter({ location, msg, param, value, nestedErrors }) {
	return `${location}[${param}]: ${msg}`;
}

/**
 * Turns a snake_case name into Title Case: replaces underscores with spaces,
 * then capitalizes the first letter of every word. Used to build readable
 * error messages (e.g. "table_tennis_racket" -> "Table Tennis Racket").
 *
 * INPUT (params, positional):
 * - name: string, the name as stored in the DB
 *
 * OUTPUT (return value):
 * - string, the same name in Title Case
 */
function formatName(name) {
	// Splitting the string on every underscore
	const words = name.split("_");
	const capitalizedWords = words.map(
		(word) => word.charAt(0).toUpperCase() + word.slice(1),
	);
	return capitalizedWords.join(" ");
}

// -----------------------------------------------------------------------------
// VALIDATION FUNCTIONS
// -----------------------------------------------------------------------------

/**
 * Chooses the facility to be booked, either the one explicitly selected by the
 * user or, if none was selected, one automatically assigned by the system.
 * NOTE: this only selects a CANDIDATE.
 *
 * INPUT (params, positional):
 * - facilityTypeId: number, the id of the requested facility type
 * - facilityCode: string or undefined, the code chosen by the user (undefined
 *   means "automatic assignment")
 *
 * OUTPUT (return value):
 * - a Promise resolving to { code } with the code of the chosen facility,
 *   or to { error: <message> } if no suitable facility is available
 */
async function resolveFacility(facilityTypeId, facilityCode) {
	// Case 1: the user picked a specific facility
	// facilityCode is explicitely given, so we must check that it is valid and available.
	if (facilityCode) {
		const facility = await facilityDao.getFacilityByCode(facilityCode);
		if (
			facility.error || // no facility with this code
			facility.isBooked || // facility exists but is already taken
			facility.facilityTypeId !== facilityTypeId // wrong type for this code
		) {
			return {
				error: "Not enough facilities: the selected facility is not available.",
			};
		}
		return { code: facilityCode };
	}
	// Case 2: no code given, automatically assign any free facility of the requested type.
	const free = await facilityDao.getOneFreeFacilityByType(facilityTypeId);
	if (!free) {
		return { error: "Not enough facilities of this type." };
	}
	return { code: free.code };
}

/**
 * Checks whether the 30-second rebooking cooldown blocks this request.
 *
 * INPUT:
 * - userId: the id of the user making the request
 * - facilityTypeId: the id of the facility type they want to book
 *
 * OUTPUT (return value):
 * - a Promise resolving to true if the user released a facility of this type
 *   less than REBOOKING_COOLDOWN_SECONDS ago, false otherwise
 */
async function isRebookingTooEarly(userId, facilityTypeId) {
	// When did this user last release a facility of this type?
	const lastRelease = await reservationDao.getLastReleaseTime(
		userId,
		facilityTypeId,
	);
	// No previous release found, so there is no cooldown to wait for.
	if (!lastRelease) return false;
	const secondsPassed = dayjs().diff(dayjs(lastRelease), "second");
	// Too early if not enough time has passed since the last release.
	return secondsPassed < REBOOKING_COOLDOWN_SECONDS;
}

/**
 * Returns the quantity requested for a given equipment id.
 *
 * INPUT (params):
 * - requested: array of { equipmentId, quantity } coming from the request body
 *   (may be undefined) sent by the client when creating or modifying a reservation
 * - equipmentId: the id of the equipment to look for
 *
 * OUTPUT (return value):
 * - number: the requested quantity, or 0 if that equipment was not requested at all
 */
function getRequestedEquipmentQuantity(requested, equipmentId) {
	if (!requested) return 0;
	const line = requested.find((r) => r.equipmentId === equipmentId);
	// return 0 if the equipment was not in the body requested at all, otherwise return the quantity requested
	return line ? line.quantity : 0;
}

/**
 * Validates the equipment requested when CREATING a new reservation. It is a , read-only function:
 * it never writes to the DB.
 *
 * INPUT (params):
 * - rules: array from facilityDao.getEquipmentRulesForFacilityType(facilityTypeId),
 *   i.e. [{ id, name, totalQuantity, availableQuantity, minQuantity }, ...]
 * - requested: array from req.body.equipment, i.e. [{ equipmentId, quantity }, ...]
 * - userScore: number, the score of the user (a negative score allows only the
 *   mandatory minimum quantities)
 *
 * OUTPUT (return value):
 * - { error: <message> } on the first violation found, or
 * - { lines: [{ equipmentId, name, quantity }, ...] } with the equipment to be
 *   taken and stored (only the lines with quantity greater than 0)
 */
function validateEquipmentRequest(rules, requested, userScore) {
	// The ids of the equipment that belongs to this facility type
	const allowedIds = rules.map((r) => r.id);

	// Check for equipment that does not belong to this facility type
	const hasUnknownEquipment = requested.some(
		(e) => !allowedIds.includes(e.equipmentId),
	);
	if (hasUnknownEquipment) {
		return {
			error: "Requested equipment is not valid for this facility type.",
		};
	}

	for (const rule of rules) {
		const requestedQuantity = getRequestedEquipmentQuantity(requested, rule.id);

		if (rule.minQuantity > 0) {
			// Case 1: mandatory equipment
			if (requestedQuantity < rule.minQuantity) {
				return {
					error: `Requested quantity for ${formatName(rule.name)} is below the mandatory minimum of ${rule.minQuantity}.`,
				};
			}
			if (userScore < 0 && requestedQuantity > rule.minQuantity) {
				return {
					error: `Your score is negative: you cannot request more than the mandatory minimum of ${formatName(rule.name)}.`,
				};
			}
		} else {
			// Case 2: optional equipment
			if (userScore < 0 && requestedQuantity > 0) {
				return {
					error:
						"Your score is negative: you cannot request optional equipment.",
				};
			}
		}

		// Availability check against the current stock.
		if (requestedQuantity > rule.availableQuantity) {
			return {
				error: `Not enough equipment of type ${formatName(rule.name)} available.`,
			};
		}
	}

	// All the checks passed: build the lines to be stored, keeping only the
	// equipment actually requested (quantity greater than 0).
	const lines = rules
		.map((rule) => ({
			equipmentId: rule.id,
			name: rule.name,
			quantity: getRequestedEquipmentQuantity(requested, rule.id),
		}))
		.filter((line) => line.quantity > 0);

	return { lines };
}

/**
 * Validates the equipment changes requested when MODIFYING an existing
 * reservation. It is read-only function.
 *
 * INPUT (params):
 * - currentRents: array from reservationDao.getRentsByReservation(reservationId),
 *   i.e. what is rented by this reservation right now
 * - rules: array from facilityDao.getEquipmentRulesForFacilityType(facilityTypeId)
 * - requestedEquipment: array from req.body.equipment, i.e. [{ equipmentId, quantity }, ...]
 * - userScore: number, the score of the user (a negative score allows removals only)
 *
 * OUTPUT (return value):
 * - { error: <message> } on the first violation found, or
 * - { changes: [{ equipmentId, name, currentQuantity, newQuantity, delta }, ...] }
 *   containing only the equipment whose quantity actually changes
 */
function validateEquipmentChanges(
	currentRents,
	rules,
	requestedEquipment,
	userScore,
) {
	// Reject any equipment that does not belong to this reservation's facility type.
	const allowedIds = rules.map((r) => r.id);
	const hasUnknownEquipment = requestedEquipment.some(
		(e) => !allowedIds.includes(e.equipmentId),
	);
	if (hasUnknownEquipment) {
		return {
			error: "Requested equipment is not valid for this facility type.",
		};
	}

	const changes = [];

	// The FULL set of rules is examined (not only the request body), so that an
	// item missing from the request is correctly treated as "reduced to 0"
	// instead of being ignored.
	for (const rule of rules) {
		const currentLine = currentRents.find((r) => r.equipmentId === rule.id);
		const currentQuantity = currentLine ? currentLine.quantity : 0;
		const newQuantity = getRequestedEquipmentQuantity(
			requestedEquipment,
			rule.id,
		);

		if (newQuantity === currentQuantity) continue; // nothing changes for this item

		// Rule 1: a mandatory equipment type may be increased or decreased, but
		// never below the minimum quantity required by this facility type.
		// An optional one (minQuantity === 0) may be removed completely.
		if (newQuantity < rule.minQuantity) {
			return {
				error: `${formatName(rule.name)} cannot go below the mandatory minimum of ${rule.minQuantity}.`,
			};
		}

		// Rule 2: a negative score forbids any increase, only removals are allowed.
		if (userScore < 0 && newQuantity > currentQuantity) {
			return {
				error:
					"Your score is negative: you can only remove equipment, not add it.",
			};
		}

		// Early availability check for the additional units
		const delta = newQuantity - currentQuantity;
		if (delta > rule.availableQuantity) {
			return {
				error: `Not enough equipment of type ${formatName(rule.name)} available.`,
			};
		}

		changes.push({
			equipmentId: rule.id,
			name: rule.name,
			currentQuantity: currentQuantity,
			newQuantity: newQuantity,
			delta: delta,
		});
	}

	return { changes: changes };
}

// -----------------------------------------------------------------------------
// PERSISTENCE FUNCTIONS (DB WRITING)
// -----------------------------------------------------------------------------

/**
 * Applies to the DB the changes already validated by validateEquipmentChanges:
 * updates the availability of the equipment and the rent lines of the reservation.
 *
 * INPUT (params):
 * - reservationId: the id of the reservation being modified
 * - changes: array from validateEquipmentChanges, i.e.
 *   [{ equipmentId, name, currentQuantity, newQuantity, delta }, ...]
 *
 * OUTPUT (return value):
 * - a Promise resolving to {} on success, or to { error: <message> } if some of
 *   the additional units are no longer available (in that case nothing is
 *   changed at all: the units taken in the meantime are given back)
 */
async function applyEquipmentChanges(reservationId, changes) {
	// The units to be added are taken FIRST: if they are no longer available the
	// reservation is left exactly as it was, with no partial modification.
	// Quantity contains only the difference to be taken, not the total quantity requested.
	// The map method is used to build a new array in the form that reserveEquipment expects, i.e. { equipmentId, name, quantity }.
	const linesToTake = changes
		.filter((c) => c.delta > 0)
		.map((c) => ({
			equipmentId: c.equipmentId,
			name: c.name,
			quantity: c.delta,
		}));

	// If some of the additional units are no longer available, reserveEquipment will return an error
	// reserveEquipment will decrement the availability of the requested equipment in the DB, and if
	// it fails it will give back any units already taken.
	const reserveResult = await reserveEquipment(linesToTake);
	if (reserveResult.error) {
		return reserveResult;
	}

	// The removed units are given back to the pool.
	// A negative delta here means that the user is reducing the quantity of that equipment,
	// so we need to give those units back to the pool.
	const linesToGiveBack = changes
		.filter((c) => c.delta < 0)
		.map((c) => ({ equipmentId: c.equipmentId, quantity: -c.delta }));
	await releaseEquipment(linesToGiveBack);

	// At this point the availability of the equipment (equipment table) has been updated,
	// so we can update the rent lines of the reservation (rent table) to reflect the new quantities.
	for (const change of changes) {
		// the line does not exist yet in the rent table, so we need to create it
		if (change.currentQuantity === 0) {
			await reservationDao.addRent(
				reservationId,
				change.equipmentId,
				change.newQuantity,
			);
			// the line exists in the rent table, but the user wants to remove it completely
		} else if (change.newQuantity === 0) {
			await reservationDao.deleteRent(reservationId, change.equipmentId);
		} else {
			await reservationDao.updateRentQuantity(
				reservationId,
				change.equipmentId,
				change.newQuantity,
			);
		}
	}

	return {};
}

/**
 * Takes the requested equipment from the common pool, decrementing its
 * availability. If an error occurs, the already taken equipment is given back to the pool.
 *
 * INPUT (params):
 * - lines: array of { equipmentId, name, quantity } to be taken
 *
 * OUTPUT (return value):
 * - a Promise resolving to {} if all the lines have been taken, or to
 *   { error: <message> } if one of them was not available any more. In the
 *   latter case the lines already taken are given back, so nothing is left
 *   half-decremented.
 */
async function reserveEquipment(lines) {
	const alreadyTaken = [];

	for (const line of lines) {
		const result = await facilityDao.decrementEquipmentAvailability(
			line.equipmentId,
			line.quantity,
		);
		if (result.error) {
			await releaseEquipment(alreadyTaken);
			return {
				error: `Not enough equipment of type ${formatName(line.name)} available.`,
			};
		}
		alreadyTaken.push(line);
	}

	return {};
}

/**
 * Gives equipment back to the common pool, incrementing its availability (used
 * when a reservation is deleted or reduced, and to undo a failed operation).
 *
 * INPUT (params):
 * - lines: array of { equipmentId, quantity } to be given back
 *
 * OUTPUT (return value):
 * - a Promise resolving to undefined (its job is a SIDE EFFECT on the DB)
 */
async function releaseEquipment(lines) {
	for (const line of lines) {
		await facilityDao.incrementEquipmentAvailability(
			line.equipmentId,
			line.quantity,
		);
	}
}

/**
 * Undoes a reservation creation that failed halfway because of a DB error.
 *
 * Creating a reservation needs four separate writes (take the equipment, book
 * the facility, create the reservation, add the rent lines). If the DB fails in
 * the middle, some of them are already done: for example the facility is marked
 * as booked and the equipment has been taken, but no reservation exists. Without
 * this function that facility and that equipment would stay blocked forever,
 * because there is no reservation to cancel in order to free them again.
 *
 * The caller keeps track of what has already been done in three variables
 * (createdReservationId, bookedFacilityCode, takenLines) and passes them here,
 * because the exception itself does not carry that information. The undoing is
 * done in the reverse order of the writes, and each step is skipped when the
 * corresponding value is null, i.e. when that step never happened.
 *
 * INPUT (params):
 * - reservationId: the id of the reservation already created, or null
 * - facilityCode: the code of the facility already booked, or null
 * - lines: array of { equipmentId, quantity } already taken (possibly empty)
 */
async function rollbackReservationAttempt(reservationId, facilityCode, lines) {
	try {
		// Skipping the steps that never happened (null values) and undoing the others in reverse order.
		if (reservationId) await reservationDao.cancelReservation(reservationId);
		if (facilityCode) await facilityDao.freeFacility(facilityCode);
		await releaseEquipment(lines);
	} catch (err) {
		console.error("Rollback failed:", err);
	}
}

export {
	clientUserInfo,
	errorFormatter,
	resolveFacility,
	isRebookingTooEarly,
	validateEquipmentRequest,
	validateEquipmentChanges,
	applyEquipmentChanges,
	reserveEquipment,
	releaseEquipment,
	rollbackReservationAttempt,
};

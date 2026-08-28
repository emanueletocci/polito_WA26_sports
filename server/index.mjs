/*** Importing modules ***/
import express from "express";
import morgan from "morgan"; // logging middleware
import { check, validationResult } from "express-validator"; // validation middleware
import cors from "cors";

/** Authentication-related imports **/
import passport from "passport";
import LocalStrategy from "passport-local";
import session from "express-session";

import { TOTP } from "otpauth";

import userDao from "./dao-users.mjs";
import reservationDao from "./dao-reservations.mjs";
import facilityDao from "./dao-facilities.mjs";

import dayjs from "dayjs";

// A user cannot book again a facility of a type they have just released
// before this amount of seconds has passed.
const REBOOKING_COOLDOWN_SECONDS = 30;

/*** init express and set-up the middlewares ***/
const app = express();
app.use(morgan("dev"));
app.use(express.json());

/** Set up and enable Cross-Origin Resource Sharing (CORS) **/
const corsOptions = {
	origin: "http://localhost:5173",
	credentials: true,
};
app.use(cors(corsOptions));

// -----------------------------------------------------------------------------
// Passport
// -----------------------------------------------------------------------------

/** Set up authentication strategy to search in the DB a user with a matching password.
 * The user object will contain all fields returned by userDao.getUser
 * (i.e., id, email, name, surname, score, totpSecret, lastTotpStep).
 **/
passport.use(
	new LocalStrategy(
		{ usernameField: "email" }, // our field is "email", not the Passport default "username"
		async function verify(email, password, callback) {
			const user = await userDao.getUser(email, password);
			if (!user) return callback(null, false, "Incorrect email or password");

			return callback(null, user); // NOTE: user info in the session (all fields returned by userDao.getUser)
		},
	),
);

// Serializing in the session the user object given from LocalStrategy(verify).
passport.serializeUser(function (user, callback) {
	// Only the user id is stored in the session, because the user object contains
	// dynamic fields (score, lastTotpStep) that may change during the session.
	// To avoid mismatches between the session and the DB, the full user object is
	// retrieved from the DB on every request (see deserializeUser below).
	callback(null, user.id);
});

// Starting from the data in the session, we extract the current (logged-in) user.
passport.deserializeUser(function (id, callback) {
	userDao
		.getUserById(id)
		.then((user) => callback(null, user))
		.catch((err) => callback(err, null));
});

/** Creating the session */
app.use(
	session({
		secret: "shhhhh... it's a secret! - change it for the exam!",
		resave: false,
		saveUninitialized: false,
	}),
);
app.use(passport.authenticate("session"));

/**
 * Verifies a TOTP code for a given user, with replay protection.
 *
 * INPUT (params, positional):
 * - user: the user object taken from the session (needs totpSecret and lastTotpStep)
 * - token: string, the 6-digit code sent by the client
 *
 * OUTPUT (return value):
 * - true if the code is valid AND it has not been used before (its time step is
 *   newer than the last one accepted for this user). As a side effect, in this
 *   case user.lastTotpStep is updated in memory (the caller must persist it).
 * - false if the code is invalid, expired, or already used (replay).
 */
function verifyTotpToken(user, token) {
	const totp = new TOTP({
		algorithm: "SHA1",
		digits: 6,
		period: 30,
		secret: user.totpSecret,
	});

	// Validate the code
	const delta = totp.validate({ token, window: 1 });
	if (delta === null) {
		return false; // invalid code
	}

	// Get the CURRENT time-step counter from OTPAuth
	//
	// Important:
	//  - delta tells us how many steps away the provided token is
	//  - counter() gives the *current* step index
	//
	// Therefore: actual_step = current_counter + delta
	//
	const currentCounter = totp.counter();
	const actualStep = currentCounter + delta;

	if (actualStep <= user.lastTotpStep) return false; // Reject replay or older step

	// Accept: update last-used step (in memory, will be persisted to DB by the caller)
	user.lastTotpStep = actualStep;
	return true;
}

/** Defining authentication verification middleware **/
const isLoggedIn = (req, res, next) => {
	// it checks if a session with the current user exists (i.e., if the user is logged in)
	if (req.isAuthenticated()) {
		return next();
	}
	return res.status(401).json({ error: "Not authenticated" });
};

// -----------------------------------------------------------------------------
// Auth APIs
// -----------------------------------------------------------------------------

// POST /api/sessions
// This route is used for performing login (email + password only).
app.post("/api/sessions", function (req, res, next) {
	passport.authenticate("local", (err, user, info) => {
		if (err) return next(err);
		if (!user) {
			// display wrong login messages
			return res.status(401).json({ error: info });
		}
		// success, perform the login and establish a login session
		req.login(user, (err) => {
			if (err) return next(err);

			// req.user contains the authenticated user, we send all the user info back
			// this is coming from userDao.getUser() in LocalStrategy Verify Fn
			return res.json(clientUserInfo(req));
		});
	})(req, res, next);
});

// POST /api/login-totp
// Second step of login: verifies the TOTP code for users who enabled 2FA.
// A successful verification also resets the user's score to 0
app.post("/api/login-totp", isLoggedIn, async (req, res) => {
	if (!req.user.totpSecret) {
		return res.status(400).json({ error: "Cannot authenticate with TOTP" });
	}

	const success = verifyTotpToken(req.user, req.body.code);
	if (!success) {
		return res.status(401).json({ error: "Cannot authenticate with TOTP" });
	}

	req.session.method = "totp";
	try {
		// Persist the consumed step (replay protection) and reset the score to 0
		await userDao.updateLastTotpStep(req.user.id, req.user.lastTotpStep);
		await userDao.resetScore(req.user.id);
	} catch (err) {
		return res.status(503).json({ error: "Database error" });
	}
	return res.json({ otp: "authorized" });
});

// GET /api/sessions/current
// This route checks whether the user is logged in or not.
app.get("/api/sessions/current", (req, res) => {
	if (req.isAuthenticated()) {
		res.status(200).json(clientUserInfo(req));
	} else res.status(401).json({ error: "Not authenticated" });
});

// DELETE /api/sessions/current
// This route is used for logging out the current user.
app.delete("/api/sessions/current", (req, res) => {
	req.logout(() => {
		res.status(200).json({});
	});
});

// -----------------------------------------------------------------------------
// Facilities & Equipment APIs (public, no login required)
// -----------------------------------------------------------------------------

// GET /api/facilities
// This route also handles "status=?" (optional) query parameter, accessed via req.query.status.
// Allowed values: "free", "booked". Without it, returns ALL facilities (used by the public
// homepage to compute per-type counts).
app.get("/api/facilities", async (req, res) => {
	try {
		const facilities = await facilityDao.getFacilities(req.query.status);
		res.json(facilities);
	} catch (err) {
		if (err.error) {
			// invalid filter value provided by the client
			return res.status(422).json(err);
		}
		console.error(err);
		res.status(500).json({ error: "Database error" });
	}
});

// GET /api/equipment
// Optional query param: facilityTypeId (returns only the equipment rules of that
// facility type, including minQuantity). Without it, returns all the equipment
// with its availability (public homepage).
app.get("/api/equipment", async (req, res) => {
	try {
		let equipment;

		if (req.query.facilityTypeId !== undefined) {
			const facilityTypeId = Number(req.query.facilityTypeId);
			if (!Number.isInteger(facilityTypeId) || facilityTypeId < 1) {
				return res.status(422).json({ error: "Invalid facilityTypeId value" });
			}
			equipment =
				await facilityDao.getEquipmentRulesForFacilityType(facilityTypeId);
		} else {
			equipment = await facilityDao.getEquipment();
		}

		res.json(equipment);
	} catch (err) {
		console.error(err);
		res.status(500).json({ error: "Database error" });
	}
});

// GET /api/facility-types
// Returns the list of all facility types (id, name) - used to populate the
// "type" dropdown in the reservation form.
app.get("/api/facility-types", async (req, res) => {
	try {
		const types = await facilityDao.getAllFacilityTypes();
		res.json(types);
	} catch (err) {
		console.error(err);
		res.status(500).json({ error: "Database error" });
	}
});

// -----------------------------------------------------------------------------
// Reservations APIs (login required)
// -----------------------------------------------------------------------------

// GET /api/reservations
// Returns the list of the logged-in user's active reservations, each with its rented equipment.
app.get("/api/reservations", isLoggedIn, async (req, res) => {
	try {
		// get all active reservations for the current user
		const reservations = await reservationDao.getActiveReservationsByUser(
			req.user.id,
		);
		// for each reservation, also load the equipment rented with it
		const withEquipment = await Promise.all(
			reservations.map(async (r) => ({
				...r,
				equipment: await reservationDao.getRentsByReservation(r.id),
			})),
		);
		res.json(withEquipment);
	} catch (err) {
		console.error(err);
		res.status(500).json({ error: "Database error" });
	}
});

// GET /api/reservations/:id
// Returns a single reservation belonging to the logged-in user, together with its
// rented equipment. Used by the client to prefill the "modify reservation" page.
app.get(
	"/api/reservations/:id",
	isLoggedIn,
	[check("id").isInt({ min: 1 })],
	async (req, res) => {
		const errors = validationResult(req).formatWith(errorFormatter);
		if (!errors.isEmpty()) {
			return res.status(422).json(errors.errors);
		}

		const reservationId = Number(req.params.id);

		try {
			const reservation =
				await reservationDao.getReservationById(reservationId);

			// NEVER trust a userId coming from the client
			if (reservation.error || reservation.userId !== req.user.id) {
				return res.status(404).json({ error: "Reservation not found." });
			}

			const equipment =
				await reservationDao.getRentsByReservation(reservationId);
			res.json({ ...reservation, equipment });
		} catch (err) {
			console.error(err);
			res.status(500).json({ error: "Database error" });
		}
	},
);

// POST /api/reservations
// Creates a new reservation for the logged-in user, with its equipment.
// The request body contains: facilityTypeId, an optional facilityCode (absent when
// the facility is automatically assigned by the system), and the equipment array.
//
// The operations are performed in this exact order:
//   1. read-only checks (cooldown, equipment rules, user score, facility choice);
//   2. the equipment is currently taken from the pool
//   3. the facility is actually booked
//   4. the reservation and its rent lines are stored.
// If a step fails, everything already taken in the previous steps is given back,
// so that the DB is never left in an inconsistent state.
app.post(
	"/api/reservations",
	isLoggedIn,
	[
		check("facilityTypeId").isInt({ min: 1 }),
		check("facilityCode").optional().isString().notEmpty(),
		check("equipment").isArray(),
		// The "*" wildcard applies this validation rule to every element of the "equipment" array
		// (e.g. equipment[0].equipmentId, equipment[1].equipmentId, ...), regardless of the array's length.
		check("equipment.*.equipmentId").isInt({ min: 1 }),
		check("equipment.*.quantity").isInt({ min: 0 }),
	],
	async (req, res) => {
		const errors = validationResult(req).formatWith(errorFormatter);
		if (!errors.isEmpty()) {
			return res.status(422).json(errors.errors);
		}

		// isInt() accepts also the string "3": the value is explicitly converted to
		// a number, otherwise the strict comparisons below would always fail.
		const facilityTypeId = Number(req.body.facilityTypeId);

		// facilityCode is optional:
		// - if it is present: the user is manually selecting the facility to book
		// - if it is not present: the user is using the
		const facilityCode = req.body.facilityCode;
		const requestedEquipment = req.body.equipment;

		// takenLines: the equipment lines whose availability has already been decremented.
		// Empty until step 2 succeeds; emptied again as soon as the units are given back.
		let takenLines = [];

		// bookedFacilityCode: the code of the facility already marked as booked (is_booked = 1).
		// null until step 3 succeeds; tells the rollback which facility must be set free again.
		let bookedFacilityCode = null;

		// createdReservationId: the id of the reservation row already inserted in the DB.
		// null until step 4 succeeds; tells the rollback which reservation must be cancelled.
		let createdReservationId = null;

		try {
			// READ-ONLY CHECKS, first check, then write on DB

			// The user released a facility of this type less than 30 seconds ago.
			if (await isRebookingTooEarly(req.user.id, facilityTypeId)) {
				return res.status(422).json({
					error: "Too early to reserve again a facility of this type.",
				});
			}

			// getEquipmentRulesForFacilityType returns an array of
			// { id, name, totalQuantity, availableQuantity, minQuantity }, e.g. for tennis:
			// [ { id: 1, name: 'tennis_racket', totalQuantity: 8, availableQuantity: 6, minQuantity: 2 }, ... ]
			const rules =
				await facilityDao.getEquipmentRulesForFacilityType(facilityTypeId);
			if (rules.length === 0) {
				return res
					.status(422)
					.json({ error: "The requested facility type does not exist." });
			}

			// Validate the requested equipment against the rules and the user's score.
			const validation = validateEquipmentRequest(
				rules,
				requestedEquipment,
				req.user.score,
			);
			if (validation.error) {
				return res.status(422).json({ error: validation.error });
			}

			// Pick the facility to book (direct choice or automatic assignment).
			// This only selects a CANDIDATE: it is not a reservation yet.
			const facilityResult = await resolveFacility(
				facilityTypeId,
				facilityCode,
			);
			if (facilityResult.error) {
				return res.status(422).json({ error: facilityResult.error });
			}

			// TAKE THE EQUIPMENT

			// This is the real, race-condition-safe availability check: the quantity
			// is decremented only if it is still available at that exact moment.
			const reserveResult = await reserveEquipment(validation.lines);
			if (reserveResult.error) {
				return res.status(422).json(reserveResult);
			}
			takenLines = validation.lines;

			// TAKE THE FACILITY

			const bookResult = await facilityDao.bookFacilityIfFree(
				facilityResult.code,
			);
			if (bookResult.error) {
				// If somebody else booked this facility in the meantime: give the
				// equipment back before reporting the failure.
				await releaseEquipment(takenLines);
				takenLines = [];
				return res.status(422).json(bookResult);
			}
			bookedFacilityCode = facilityResult.code;

			// STORE THE RESERVATION
			createdReservationId = await reservationDao.createReservation(
				req.user.id,
				bookedFacilityCode,
			);
			for (const line of takenLines) {
				await reservationDao.addRent(
					createdReservationId,
					line.equipmentId,
					line.quantity,
				);
			}

			// Return the newly created reservation together with its equipment.
			const created =
				await reservationDao.getReservationById(createdReservationId);
			const createdEquipment =
				await reservationDao.getRentsByReservation(createdReservationId);
			res.json({ ...created, equipment: createdEquipment });
		} catch (err) {
			console.error(err);
			// A DB error occurred in the middle of the operation: give back
			// everything that was already taken, so that no facility/equipment
			// stays blocked without a valid reservation.
			await rollbackReservationAttempt(
				createdReservationId,
				bookedFacilityCode,
				takenLines,
			);
			res.status(500).json({ error: "Database error" });
		}
	},
);

// PUT /api/reservations/:id
// Modifies the equipment of an existing active reservation.
// Rules enforced here:
// - Mandatory equipment can never be changed (it must stay exactly as booked).
// - If the user's score is negative, quantities can only DECREASE, never increase.
// - An item missing from req.body.equipment is treated as "reduced to 0": this is
//   why the whole "rules" list of the facility type is examined, and not only the
//   request body.
app.put(
	"/api/reservations/:id",
	isLoggedIn,
	[
		check("id").isInt({ min: 1 }),
		check("equipment").isArray(),
		check("equipment.*.equipmentId").isInt({ min: 1 }),
		check("equipment.*.quantity").isInt({ min: 0 }),
	],
	async (req, res) => {
		const errors = validationResult(req).formatWith(errorFormatter);
		if (!errors.isEmpty()) {
			return res.status(422).json(errors.errors);
		}

		const reservationId = Number(req.params.id);

		try {
			const reservation =
				await reservationDao.getReservationById(reservationId);

			// Existence and ownership are checked together (see GET above).
			if (reservation.error || reservation.userId !== req.user.id) {
				return res.status(404).json({ error: "Reservation not found." });
			}

			// Only an active reservation can be modified.
			if (reservation.status !== "active") {
				return res
					.status(422)
					.json({ error: "This reservation is not active." });
			}

			const currentRents =
				await reservationDao.getRentsByReservation(reservationId);
			const rules = await facilityDao.getEquipmentRulesForFacilityType(
				reservation.facilityTypeId,
			);

			// FIRST all the checks are performed (read-only)...
			const validation = validateEquipmentChanges(
				currentRents,
				rules,
				req.body.equipment,
				req.user.score,
			);
			if (validation.error) {
				return res.status(422).json({ error: validation.error });
			}

			// ...and ONLY AFTER that the changes are written to the DB.
			const applyResult = await applyEquipmentChanges(
				reservationId,
				validation.changes,
			);
			if (applyResult.error) {
				return res.status(422).json(applyResult);
			}

			// Return the reservation together with its updated equipment.
			const updatedEquipment =
				await reservationDao.getRentsByReservation(reservationId);
			res.json({ ...reservation, equipment: updatedEquipment });
		} catch (err) {
			console.error(err);
			res.status(500).json({ error: "Database error" });
		}
	},
);

// DELETE /api/reservations/:id
// Cancels an existing active reservation: restores facility and equipment availability,
// decrements the user's score, and records the release time (used for the 30-second cooldown rule).
app.delete(
	"/api/reservations/:id",
	isLoggedIn,
	[check("id").isInt({ min: 1 })],
	async (req, res) => {
		const errors = validationResult(req).formatWith(errorFormatter);
		if (!errors.isEmpty()) {
			return res.status(422).json(errors.errors);
		}

		const reservationId = Number(req.params.id);

		try {
			// retrieve the reservation to be cancelled: does it exist, and does it
			// belong to THIS user?
			const reservation =
				await reservationDao.getReservationById(reservationId);
			if (reservation.error || reservation.userId !== req.user.id) {
				return res.status(404).json({ error: "Reservation not found." });
			}

			// retrieve the rented equipment BEFORE cancelling, so we know how much to give back
			const rents = await reservationDao.getRentsByReservation(reservationId);

			// Mark the reservation as cancelled (this also records released_at).
			// The DAO only updates a reservation that is still 'active', in the very
			// same SQL statement: two concurrent DELETE requests on the same
			// reservation can never both succeed, so the equipment is given back
			// once and the score is decremented once.
			const cancelResult =
				await reservationDao.cancelReservation(reservationId);
			if (cancelResult.error) {
				return res
					.status(422)
					.json({ error: "This reservation is not active." });
			}

			// restore the facility to "free"
			await facilityDao.setFacilityBooked(reservation.facilityCode, false);

			// restore the availability of every equipment type that was rented
			await releaseEquipment(rents);

			// decrement the user's score
			await userDao.decrementScore(req.user.id);

			res.status(200).json({});
		} catch (err) {
			console.error(err);
			res.status(500).json({ error: "Database error" });
		}
	},
);

// -----------------------------------------------------------------------------
// Utility functions
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

/**
 * Chooses the facility to be booked, either the one explicitly selected by the
 * user or, if none was selected, one automatically assigned by the system.
 * NOTE: this only selects a CANDIDATE. The facility is actually taken (in a
 * race-condition-safe way) by facilityDao.bookFacilityIfFree.
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
	// Case 1: the user picked a specific facility.
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
 * INPUT (params, positional):
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
 * INPUT (params, positional):
 * - requested: array of { equipmentId, quantity } coming from the request body
 *   (may be undefined)
 * - equipmentId: the id of the equipment to look for
 *
 * OUTPUT (return value):
 * - number: the requested quantity, or 0 if that equipment was not requested at all
 */
function getRequestedEquipmentQuantity(requested, equipmentId) {
	if (!requested) return 0;
	const line = requested.find((r) => r.equipmentId === equipmentId);
	return line ? line.quantity : 0;
}

/**
 * Validates the equipment requested when CREATING a new reservation without modifying the DB.
 *
 * INPUT (params, positional):
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
			// Mandatory equipment
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
			// Cptional equipment
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
 * reservation. It is a pure, read-only function: it never writes to the DB, so
 * that a violation found on the last item cannot leave the previous ones
 * already applied.
 *
 * INPUT (params, positional):
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

		// Rule 1: mandatory equipment can never be modified.
		if (rule.minQuantity > 0) {
			return {
				error: `${formatName(rule.name)} is mandatory and cannot be modified.`,
			};
		}

		// Rule 2: a negative score forbids any increase, only removals are allowed.
		if (userScore < 0 && newQuantity > currentQuantity) {
			return {
				error:
					"Your score is negative: you can only remove equipment, not add it.",
			};
		}

		// Early availability check for the additional units (the binding one is
		// the atomic decrement performed by reserveEquipment).
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

/**
 * Applies to the DB the changes already validated by validateEquipmentChanges:
 * updates the availability of the equipment and the rent lines of the reservation.
 *
 * INPUT (params, positional):
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
	const linesToTake = changes
		.filter((c) => c.delta > 0)
		.map((c) => ({
			equipmentId: c.equipmentId,
			name: c.name,
			quantity: c.delta,
		}));

	const reserveResult = await reserveEquipment(linesToTake);
	if (reserveResult.error) {
		return reserveResult;
	}

	// The removed units are given back to the pool.
	const linesToGiveBack = changes
		.filter((c) => c.delta < 0)
		.map((c) => ({ equipmentId: c.equipmentId, quantity: -c.delta }));
	await releaseEquipment(linesToGiveBack);

	// Finally the rent lines are aligned with the new quantities.
	for (const change of changes) {
		if (change.currentQuantity === 0) {
			await reservationDao.addRent(
				reservationId,
				change.equipmentId,
				change.newQuantity,
			);
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
 * availability. Every decrement is an atomic check-and-update performed by the
 * DAO (the quantity is decremented only if it is still available), therefore
 * this is the real protection against two clients taking the same last unit.
 *
 * INPUT (params, positional):
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
 * INPUT (params, positional):
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
 * Undoes a reservation creation that failed halfway because of a DB error, so
 * that no facility and no equipment stays blocked without a valid reservation.
 *
 * INPUT (params, positional):
 * - reservationId: the id of the reservation already created, or null
 * - facilityCode: the code of the facility already booked, or null
 * - lines: array of { equipmentId, quantity } already taken (possibly empty)
 *
 * OUTPUT (return value):
 * - a Promise resolving to undefined (its job is a SIDE EFFECT on the DB). Any
 *   error happening while undoing is only logged: the client is answered with
 *   the original error anyway.
 */
async function rollbackReservationAttempt(reservationId, facilityCode, lines) {
	try {
		if (reservationId) await reservationDao.cancelReservation(reservationId);
		if (facilityCode) await facilityDao.setFacilityBooked(facilityCode, false);
		await releaseEquipment(lines);
	} catch (err) {
		console.error("Rollback failed:", err);
	}
}

// Activating the server
const PORT = 3001;
app.listen(PORT, (err) => {
	if (err) console.log(err);
	else console.log(`Server listening at http://localhost:${PORT}`);
});

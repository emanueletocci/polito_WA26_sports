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

// Business logic and formatting helpers, kept in a separate module so that this
// file contains (almost) only the definition of the API routes.
import {
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
} from "./utils.mjs";

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
// Initializes Passport's internal state, then restores the login session
// (req.user) starting from the session cookie.
app.use(passport.initialize());
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
// A successful verification also resets the user's score to 0, as required by the exam text.
app.post("/api/login-totp", isLoggedIn, async (req, res) => {
	if (!req.user.totpSecret) {
		return res.status(400).json({ error: "Cannot authenticate with TOTP" });
	}

	const success = verifyTotpToken(req.user, req.body.code);
	if (!success) {
		// NB: generic message on purpose, to avoid telling an attacker whether the
		// code was wrong, expired, or already used.
		return res.status(401).json({ error: "Cannot authenticate with TOTP" });
	}

	req.session.method = "totp";
	try {
		// Persist the consumed step (replay protection) and reset the score to 0
		await userDao.updateLastTotpStep(req.user.id, req.user.lastTotpStep);
		await userDao.resetScore(req.user.id);
	} catch (err) {
		console.error(err);
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

		// The value is compared with undefined (and not just checked for
		// truthiness) so that the parameter is always handled explicitly.
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

			// NEVER trust a userId coming from the client: the owner is always
			// checked against req.user.id, which comes from the (server-side) session.
			// A reservation of another user is reported as "not found" (and not as
			// "not authorized") so that its existence is not disclosed.
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
//   2. the equipment is actually taken from the pool (atomic check-and-update);
//   3. the facility is actually booked (atomic check-and-update);
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
		const facilityCode = req.body.facilityCode;
		const requestedEquipment = req.body.equipment;

		// What has already been taken from the DB, to be given back if a later step fails.
		let takenLines = [];
		let bookedFacilityCode = null;
		let createdReservationId = null;

		try {
			// ---- STEP 1: read-only checks ----------------------------------------

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
			// This is a pure, read-only check: it does NOT write to the DB.
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

			// ---- STEP 2: take the equipment --------------------------------------
			// This is the real, race-condition-safe availability check: the quantity
			// is decremented only if it is still available at that exact moment.
			const reserveResult = await reserveEquipment(validation.lines);
			if (reserveResult.error) {
				return res.status(422).json(reserveResult);
			}
			takenLines = validation.lines;

			// ---- STEP 3: take the facility ---------------------------------------
			const bookResult = await facilityDao.bookFacilityIfFree(
				facilityResult.code,
			);
			if (bookResult.error) {
				// Somebody else booked this facility in the meantime: give the
				// equipment back before reporting the failure.
				await releaseEquipment(takenLines);
				takenLines = [];
				return res.status(422).json(bookResult);
			}
			bookedFacilityCode = facilityResult.code;

			// ---- STEP 4: store the reservation and its rent lines ----------------
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
			await facilityDao.freeFacility(reservation.facilityCode);

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

// Activating the server
const PORT = 3001;
app.listen(PORT, (err) => {
	if (err) console.log(err);
	else console.log(`Server listening at http://localhost:${PORT}`);
});

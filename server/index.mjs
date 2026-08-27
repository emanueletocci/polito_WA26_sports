/*** Importing modules ***/
import express from "express";
import morgan from "morgan"; // logging middleware
import { check, validationResult } from "express-validator"; // validation middleware
import cors from "cors";

/** Authentication-related imports **/
import passport from "passport"; // authentication middleware
import LocalStrategy from "passport-local"; // authentication strategy (email and password)
import session from "express-session";

import { TOTP } from "otpauth";

import userDao from "./dao-users.mjs"; // module for accessing the users table in the DB
import reservationDao from "./dao-reservations.mjs";
import facilityDao from "./dao-facilities.mjs";

import dayjs from "dayjs";

const responseDelay = 1000;
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
	// only store the user id in the session just because the user object contains dynamic fields (score, lastTotpStep) that may change during the session.
	// So, to avoid mismatches between the session and the DB, we only store the user id in the session and retrieve the full user object from the DB on every request.
	callback(null, user.id);
});

// Starting from the data in the session, we extract the current (logged-in) user.
passport.deserializeUser(function (id, callback) {
	userDao
		.getUserById(id)
		.then((user) => callback(null, user))
		.catch((err) => callback(err, null));
});

// Required for Passport to work correctly (was missing): initializes Passport's
// internal state before any authenticate()/session middleware is used.
app.use(passport.initialize());

/** Creating the session */
app.use(
	session({
		secret: "shhhhh... it's a secret! - change it for the exam!",
		resave: false,
		saveUninitialized: false,
	}),
);
app.use(passport.authenticate("session"));

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

	// Accept: update last-used step (in-memory, will be persisted to DB by the caller)
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

function isTotp(req, res, next) {
	if (req.session.method === "totp") return next();
	return res.status(401).json({ error: "Missing TOTP authentication" });
}

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
// Resets the user's score to 0, as required by the spec.
app.post("/api/login-totp", isLoggedIn, async (req, res) => {
	if (!req.user.totpSecret) {
		console.log("TOTP not enabled for this user");
		return res.status(400).json({ error: "Cannot authenticate with TOTP" });
	}
	const success = verifyTotpToken(req.user, req.body.code);
	console.log(
		"DEBUG: about to save lastTotpStep =",
		req.user.lastTotpStep,
		"for user",
		req.user.id,
	);
	if (success) {
		req.session.method = "totp";
		try {
			// Persist the consumed step (replay protection) and reset the score to 0
			await userDao.updateLastTotpStep(req.user.id, req.user.lastTotpStep);
			await userDao.resetScore(req.user.id);
		} catch (err) {
			console.log(err);
			return res.status(503).json({ error: "Database error" });
		}
		return res.json({ otp: "authorized" });
	} else {
		console.log("Invalid or replayed TOTP code");
		return res.status(401).json({ error: "Cannot authenticate with TOTP" });
	}
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
// Facilities & Equipment APIs (public, no login)
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
// Optional query param: facilityTypeId (filters to equipment rules for that facility type,
// including minQuantity). Without it, returns all equipment (public homepage).
app.get("/api/equipment", async (req, res) => {
	try {
		const { facilityTypeId } = req.query;
		let equipment;

		if (facilityTypeId) {
			equipment = await facilityDao.getEquipmentRulesForFacilityType(
				Number(facilityTypeId),
			);
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
			if (reservation.error) return res.status(404).json(reservation);

			// NEVER trust a userId coming from the client - always compare with
			// req.user.id, which comes from the (server-side) session.
			if (reservation.userId !== req.user.id) {
				return res.status(403).json({ error: "Not authorized." });
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
// Creates a new reservation for the logged-in user, with optional equipment.
// The request body must contain: facilityTypeId, optional facilityCode, and optional equipment array.
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

		// Extract the relevant fields from the request body - Destructuring syntax
		const { facilityTypeId, facilityCode, equipment } = req.body;

		try {
			// Block if the user just released a facility of this type recently.
			if (await isRebookingTooEarly(req.user.id, facilityTypeId)) {
				return res.status(422).json({
					error: "Too early to reserve again for this facility type.",
				});
			}

			// Pick the facility to book (direct choice or auto-assigned).
			const facilityResult = await resolveFacility(
				facilityTypeId,
				facilityCode,
			);

			if (facilityResult.error) {
				return res.status(422).json({ error: facilityResult.error });
			}
			const chosenFacilityCode = facilityResult.code;

			// Check the requested equipment against the rules for this facility type.
			// getEquipmentRulesForFacilityType returns an array of { id, name, totalQuantity, availableQuantity, minQuantity }
			// eg. tennis:
			// [
			// {
			//  id: 1,
			//  name: 'tennis_racket',
			//  totalQuantity: 8,
			//  availableQuantity: 6,
			//  minQuantity: 2
			// },
			// ...
			// ]

			// Retrieve the equipment rules for the requested facility type
			const rules =
				await facilityDao.getEquipmentRulesForFacilityType(facilityTypeId);
			// Validate the requested equipment against the rules and the user's score
			// (this is a pure, read-only check: it does NOT write to the DB yet).
			const validation = validateEquipmentRequest(
				rules,
				equipment,
				req.user.score,
			);

			if (validation.error) {
				return res.status(422).json({ error: validation.error });
			}

			// Only NOW, right before any DB write happens, attempt to actually book
			// the facility - atomically. This is the real, race-condition-safe
			// check: two concurrent requests targeting the same facility can never
			// both succeed here, unlike the earlier resolveFacility lookup, which
			// only picks a CANDIDATE and could be stale by the time we reach this
			// point.
			const bookResult =
				await facilityDao.bookFacilityIfFree(chosenFacilityCode);
			if (bookResult && bookResult.error) {
				return res.status(422).json(bookResult);
			}

			// Everything is valid: store the reservation...
			const reservationId = await reservationDao.createReservation(
				req.user.id,
				chosenFacilityCode,
			);

			// update the equipment availability and store the rented equipment for this reservation
			for (const line of validation.lines) {
				await reservationDao.addRent(
					reservationId,
					line.equipmentId,
					line.quantity,
				);
				await facilityDao.decrementEquipmentAvailability(
					line.equipmentId,
					line.quantity,
				);
			}

			// Return the newly created reservation together with its equipment.
			const created = await reservationDao.getReservationById(reservationId);
			const createdEquipment =
				await reservationDao.getRentsByReservation(reservationId);
			res.json({ ...created, equipment: createdEquipment });
		} catch (err) {
			console.error(err);
			res.status(500).json({ error: "Database error" });
		}
	},
);

// PUT /api/reservations/:id
// Modifies the optional/extra equipment of an existing active reservation.
// Requirements enforced here:
// - Mandatory equipment can never be changed (must stay exactly as originally booked).
// - If the user's score is negative, optional equipment quantities can only DECREASE,
//   never increase (see forum clarification: removing is always allowed, adding is not).
// - An item silently missing from req.body.equipment (compared to what is currently
//   rented) is treated as "rSeduced to 0" - this is why we loop over the facility type's
//   full "rules" list below, not just over the request body.
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
			if (reservation.error) return res.status(404).json(reservation);

			// NEVER trust a userId coming from the client - always compare with
			// req.user.id, which comes from the (server-side) session.
			if (reservation.userId !== req.user.id) {
				return res.status(403).json({ error: "Not authorized." });
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

			// Validate the two business rules (mandatory locked, negative score
			// only allows removals) and apply the changes to the DB (availability
			// + rents rows). Returns { error } on the first violation found.
			const applyResult = await applyEquipmentChanges(
				reservationId,
				currentRents,
				rules,
				req.body.equipment,
				req.user.score,
			);
			if (applyResult && applyResult.error) {
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
			// retrieve the reservation to be cancelled
			const reservation =
				await reservationDao.getReservationById(reservationId);

			// check: exists? belongs to THIS user? still active?
			if (
				reservation.error ||
				reservation.userId !== req.user.id ||
				reservation.status !== "active"
			) {
				return res.status(404).json({ error: "Reservation not found." });
			}

			// retrieve the rented equipment before cancelling, so we know how much to give back
			const rents = await reservationDao.getRentsByReservation(reservationId);

			// mark the reservation as cancelled (this also records released_at)
			await reservationDao.cancelReservation(reservationId);

			// restore the facility to "free"
			await facilityDao.setFacilityBooked(reservation.facilityCode, false);

			// restore the availability of every equipment type that was rented
			for (const rent of rents) {
				await facilityDao.incrementEquipmentAvailability(
					rent.equipmentId,
					rent.quantity,
				);
			}

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
// Utiity functions
// -----------------------------------------------------------------------------

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

// This function is used to format express-validator errors as strings
function errorFormatter({ location, msg, param, value, nestedErrors }) {
	return `${location}[${param}]: ${msg}`;
}

// Returns { code } if a valid facility is found, otherwise { error }.
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
	// Case 2: no code given, auto-assign any free facility of the requested type.
	const free = await facilityDao.getOneFreeFacilityByType(facilityTypeId);
	if (!free) {
		return { error: "Not enough facilities of this type." };
	}
	return { code: free.code };
}

// Checks whether the 30-second rebooking cooldown blocks this request.
async function isRebookingTooEarly(userId, facilityTypeId) {
	// When did this user last release a facility of this type?
	const lastRelease = await reservationDao.getLastReleaseTime(
		userId,
		facilityTypeId,
	);
	// No previous release found, so there's no cooldown to wait for.
	if (!lastRelease) return false;
	const secondsPassed = dayjs().diff(dayjs(lastRelease), "second");
	// Too early if not enough time has passed since the last release.
	return secondsPassed < REBOOKING_COOLDOWN_SECONDS;
}

// Validates the equipment quantities requested by the user against the rules of a facility type.
// - rules: array from facilityDao.getEquipmentRulesForFacilityType(facilityTypeId)
// - requested: array from req.body.equipment, e.g. [{ equipmentId, quantity }, ...]
// - userScore: the user's current score (negative scores restrict to mandatory minimums only)
// Returns { error: 'message' } on the first violation found, or { lines: [...] } with the
// final list of { equipmentId, name, quantity } to persist (only lines with quantity > 0).

function validateEquipmentRequest(rules, requested, userScore) {
	// extracting allowed equipment IDs from the rules
	const allowedIds = rules.map((r) => r.id);

	// Check for unknown equipment IDs in the request
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
					error: `Requested quantity for ${rule.name} is below the mandatory minimum of ${rule.minQuantity}.`,
				};
			}
			if (userScore < 0 && requestedQuantity > rule.minQuantity) {
				return {
					error: `User score is negative; cannot request more than the mandatory minimum for ${rule.name}.`,
				};
			}
		} else {
			// Case 2: optional equipment
			if (userScore < 0 && requestedQuantity > 0) {
				return {
					error: `User score is negative; cannot request any optional equipment.`,
				};
			}
		}

		// check availability against the current stock
		if (requestedQuantity > rule.availableQuantity) {
			return {
				error: `Not enough equipment of type ${rule.name} available.`,
			};
		}
	}

	// If we reach this point, all checks passed. We can construct the final lines that will be stored in the database.
	// We only include lines with quantity > 0, as per the requirement.
	const lines = rules
		.map((rule) => ({
			equipmentId: rule.id,
			name: rule.name,
			quantity: getRequestedEquipmentQuantity(requested, rule.id),
		}))
		.filter((line) => line.quantity > 0); // only keep lines with quantity > 0

	return { lines };
}

// Returns the quantity requested for a given equipmentId, or 0 if not requested
// (also returns 0 if "requested" itself is missing/undefined).
function getRequestedEquipmentQuantity(requested, equipmentId) {
	if (!requested) return 0;
	const line = requested.find((r) => r.equipmentId === equipmentId);
	return line ? line.quantity : 0;
}

// Applies the equipment changes requested when modifying an EXISTING
// reservation (PUT /api/reservations/:id). Unlike validateEquipmentRequest
// (used at creation time, which only validates and returns lines to insert),
// this function both validates the two edit-specific business rules AND
// performs the DB writes (availability + rents rows) as it goes.
// - reservationId: the reservation being modified
// - currentRents: array from reservationDao.getRentsByReservation(reservationId),
//   i.e. what is rented on this reservation RIGHT NOW
// - rules: array from facilityDao.getEquipmentRulesForFacilityType(facilityTypeId)
// - requestedEquipment: array from req.body.equipment, e.g. [{ equipmentId, quantity }, ...]
// - userScore: the user's current score (negative -> only removals allowed)
// Returns { error: 'message' } on the first violation found, or undefined on success.
async function applyEquipmentChanges(
	reservationId,
	currentRents,
	rules,
	requestedEquipment,
	userScore,
) {
	// Reject any equipmentId in the request that doesn't belong to this
	// reservation's facility type at all.
	const validIds = rules.map((r) => r.id);
	for (const line of requestedEquipment) {
		if (!validIds.includes(line.equipmentId)) {
			return {
				error: `Equipment ${line.equipmentId} is not valid for this facility type.`,
			};
		}
	}

	// Iterate over the FULL set of equipment rules for this facility type
	// (not just the request body), so an item silently missing from the
	// request is correctly treated as "reduced to 0" rather than ignored.
	for (const rule of rules) {
		const currentLine = currentRents.find((r) => r.equipmentId === rule.id);
		const currentQty = currentLine ? currentLine.quantity : 0;
		// Reuses the same helper function already used by validateEquipmentRequest:
		// returns the requested quantity for this equipment, or 0 if the client
		// omitted it (which, for optional equipment, means "removed").
		const requestedQty = getRequestedEquipmentQuantity(
			requestedEquipment,
			rule.id,
		);

		if (requestedQty === currentQty) continue; // nothing to do for this line

		// Rule 1: mandatory equipment can never be changed.
		if (rule.minQuantity > 0) {
			return {
				error: `${rule.name} is mandatory and cannot be modified.`,
			};
		}

		// Rule 2: a negative score forbids ANY increase, only decreases allowed.
		if (userScore < 0 && requestedQty > currentQty) {
			return {
				error: "Negative score: only removing equipment is allowed.",
			};
		}

		const delta = requestedQty - currentQty;

		if (delta > 0) {
			// Adding equipment: decrement availability atomically. If there
			// isn't enough left, this is where the (real, race-condition-safe)
			// check happens - not in a separate pre-check.
			const decResult = await facilityDao.decrementEquipmentAvailability(
				rule.id,
				delta,
			);
			if (decResult && decResult.error) {
				return decResult;
			}
		} else {
			// Removing equipment: give the freed units back.
			await facilityDao.incrementEquipmentAvailability(rule.id, -delta);
		}

		// Keep the "rents" table in sync with the new quantity.
		if (currentQty === 0) {
			await reservationDao.addRent(reservationId, rule.id, requestedQty);
		} else if (requestedQty === 0) {
			await reservationDao.deleteRent(reservationId, rule.id);
		} else {
			await reservationDao.updateRentQuantity(
				reservationId,
				rule.id,
				requestedQty,
			);
		}
	}

	return undefined; // success, nothing to report
}

// Activating the server
const PORT = 3001;
app.listen(PORT, (err) => {
	if (err) console.log(err);
	else console.log(`Server listening at http://localhost:${PORT}`);
});

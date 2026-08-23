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

const responseDelay = 1000;

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
// PASSPORT
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
	// this user is id + email + name + surname + score + totpSecret + lastTotpStep
	callback(null, user);
});

// Starting from the data in the session, we extract the current (logged-in) user.
passport.deserializeUser(function (user, callback) {
	// this user is id + email + name + surname + score + totpSecret + lastTotpStep
	// if needed, we can do extra check here (e.g., double check that the user is still in the database, etc.)
	// e.g.: return userDao.getUserById(user.id).then(u => callback(null, u)).catch(err => callback(err, null));

	return callback(null, user); // this will be available in req.user
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
// UTILITY FUNCTIONS
// -----------------------------------------------------------------------------

// Regola esplicita del testo: non è possibile ri-prenotare un impianto dello stesso tipo
// entro 30 secondi dal rilascio da parte dello stesso utente.
const REBOOKING_COOLDOWN_SECONDS = 30;

// This function is used to format express-validator errors as strings
const errorFormatter = ({ location, msg, param, value, nestedErrors }) => {
	return `${location}[${param}]: ${msg}`;
};

// Validates the equipment quantities requested by the user against the rules of a facility type.
// - rules: array from facilityDao.getEquipmentRulesForFacilityType(facilityTypeId)
// - requested: array from req.body.equipment, e.g. [{ equipmentId, quantity }, ...]
// - userScore: the user's current score (negative scores restrict to mandatory minimums only)
// Returns { error: 'message' } on the first violation found, or { lines: [...] } with the
// final list of { equipmentId, name, quantity } to persist (only lines with quantity > 0).
function validateEquipmentRequest(rules, requested, userScore) {
	const requestedMap = new Map(
		(requested || []).map((e) => [e.equipmentId, e.quantity]),
	);
	const lines = [];

	for (const rule of rules) {
		const qty = requestedMap.get(rule.id) || 0;

		if (rule.minQuantity > 0) {
			// Mandatory equipment: must always be present with at least the minimum quantity.
			if (qty < rule.minQuantity) {
				return {
					error: `Not enough ${rule.name}: at least ${rule.minQuantity} required.`,
				};
			}
			// Negative score users may not request MORE than the mandatory minimum.
			if (userScore < 0 && qty > rule.minQuantity) {
				return {
					error: `Negative score: only the mandatory minimum quantity of ${rule.name} is allowed.`,
				};
			}
		} else {
			// Optional equipment: negative score users may not request it at all.
			if (userScore < 0 && qty > 0) {
				return {
					error: `Negative score: optional equipment (${rule.name}) is not allowed.`,
				};
			}
		}

		if (qty > rule.availableQuantity) {
			return { error: `Not enough equipment of type ${rule.name} available.` };
		}

		if (qty > 0) {
			lines.push({ equipmentId: rule.id, name: rule.name, quantity: qty });
		}
	}

	// Reject any requested equipment id that is not part of this facility type's rules.
	const validIds = new Set(rules.map((r) => r.id));
	for (const e of requested || []) {
		if (!validIds.has(e.equipmentId)) {
			return {
				error: `Equipment id ${e.equipmentId} is not valid for this facility type.`,
			};
		}
	}

	return { lines };
}

function clientUserInfo(req) {
	const user = req.user;
	return {
		id: user.id,
		email: user.email,
		name: user.name,
		surname: user.surname,
		score: user.score,
		canDoTotp: user.totpSecret ? true : false,
		isTotp: req.session.method === "totp",
	};
}

// -----------------------------------------------------------------------------
// Facilities & Equipment APIs (public, no login required)
// -----------------------------------------------------------------------------

// GET /api/facilities
// Retrieve the list of available facilities
app.get("/api/facilities", async (req, res) => {
	try {
		const facilities = await facilityDao.getFreeFacilities();
		res.json(facilities);
	} catch (err) {
		console.error(err);
		res.status(500).json({ error: "Database error" });
	}
});

// GET /api/equipment
// Retrieve the list of available equipment
app.get("/api/equipment", async (req, res) => {
	try {
		const equipment = await facilityDao.getEquipmentAvailability();
		res.json(equipment);
	} catch (err) {
		console.error(err);
		res.status(500).json({ error: "Database error" });
	}
});

// -----------------------------------------------------------------------------
// Reservations APIs (require login)
// -----------------------------------------------------------------------------

// GET /api/reservations
// Returns the list of the logged-in user's active reservations, each with its rented equipment.
app.get("/api/reservations", isLoggedIn, async (req, res) => {
	try {
		const reservations = await reservationDao.getActiveReservationsByUser(
			req.user.id,
		);
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

// POST /api/reservations
// Creates a new reservation: picks a facility (direct selection or automatic assignment),
// checks the 30-second rebooking cooldown, validates the requested equipment, then persists everything.
app.post("/api/reservations", isLoggedIn, async (req, res) => {
	const { facilityTypeId, facilityCode, equipment } = req.body;

	try {
		// 1. 30-second cooldown check (done in JS, comparing timestamps - see getLastReleaseTime).
		const lastRelease = await reservationDao.getLastReleaseTime(
			req.user.id,
			facilityTypeId,
		);
		if (lastRelease) {
			const secondsPassed = (Date.now() - new Date(lastRelease + "Z")) / 1000;
			if (secondsPassed < REBOOKING_COOLDOWN_SECONDS) {
				return res.status(422).json({
					error: "Too early to reserve again for this facility type.",
				});
			}
		}

		// 2. Facility selection: direct (facilityCode given) or automatic assignment.
		let chosenFacilityCode = facilityCode;
		if (chosenFacilityCode) {
			const facility = await facilityDao.getFacilityByCode(chosenFacilityCode);
			if (
				facility.error ||
				facility.isBooked ||
				facility.facilityTypeId !== facilityTypeId
			) {
				return res.status(422).json({
					error:
						"Not enough facilities: the selected facility is not available.",
				});
			}
		} else {
			const free = await facilityDao.getOneFreeFacilityByType(facilityTypeId);
			if (!free) {
				return res
					.status(422)
					.json({ error: "Not enough facilities of this type." });
			}
			chosenFacilityCode = free.code;
		}

		// 3. Equipment validation (mandatory minimums, optional/extra rules, negative score, availability).
		const rules =
			await facilityDao.getEquipmentRulesForFacilityType(facilityTypeId);
		const validation = validateEquipmentRequest(
			rules,
			equipment,
			req.user.score,
		);
		if (validation.error) {
			return res.status(422).json({ error: validation.error });
		}

		// 4. Persist: create the reservation, add each equipment line, update availability.
		const reservationId = await reservationDao.createReservation(
			req.user.id,
			chosenFacilityCode,
		);
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
		await facilityDao.setFacilityBooked(chosenFacilityCode, true);

		const created = await reservationDao.getReservationById(reservationId);
		const createdEquipment =
			await reservationDao.getRentsByReservation(reservationId);
		res.json({ ...created, equipment: createdEquipment });
	} catch (err) {
		console.error(err);
		res.status(500).json({ error: "Database error" });
	}
});

// PUT /api/reservations/:id
// Modifies the equipment of an existing active reservation (only optional/extra quantities;
// the mandatory minimum can never be reduced or removed).
app.put(
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
			if (
				reservation.error ||
				reservation.userId !== req.user.id ||
				reservation.status !== "active"
			) {
				return res.status(404).json({ error: "Reservation not found." });
			}

			const rules = await facilityDao.getEquipmentRulesForFacilityType(
				reservation.facilityTypeId,
			);
			const validation = validateEquipmentRequest(
				rules,
				req.body.equipment,
				req.user.score,
			);
			if (validation.error) {
				return res.status(422).json({ error: validation.error });
			}

			const currentRents =
				await reservationDao.getRentsByReservation(reservationId);
			const currentMap = new Map(
				currentRents.map((r) => [r.equipmentId, r.quantity]),
			);
			const newMap = new Map(
				validation.lines.map((l) => [l.equipmentId, l.quantity]),
			);

			// Apply the difference between old and new quantities, adjusting equipment availability.
			const allIds = new Set([...currentMap.keys(), ...newMap.keys()]);
			for (const equipmentId of allIds) {
				const oldQty = currentMap.get(equipmentId) || 0;
				const newQty = newMap.get(equipmentId) || 0;
				if (newQty === oldQty) continue;

				const delta = newQty - oldQty;
				if (delta > 0) {
					await facilityDao.decrementEquipmentAvailability(equipmentId, delta);
				} else {
					await facilityDao.incrementEquipmentAvailability(equipmentId, -delta);
				}

				if (oldQty === 0) {
					await reservationDao.addRent(reservationId, equipmentId, newQty);
				} else if (newQty === 0) {
					await reservationDao.deleteRent(reservationId, equipmentId);
				} else {
					await reservationDao.updateRentQuantity(
						reservationId,
						equipmentId,
						newQty,
					);
				}
			}

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
// Cancels a reservation: restores facility and equipment availability, decrements the user's score.
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
			const reservation =
				await reservationDao.getReservationById(reservationId);
			if (
				reservation.error ||
				reservation.userId !== req.user.id ||
				reservation.status !== "active"
			) {
				return res.status(404).json({ error: "Reservation not found." });
			}

			const rents = await reservationDao.getRentsByReservation(reservationId);

			await reservationDao.cancelReservation(reservationId);
			await facilityDao.setFacilityBooked(reservation.facilityCode, false);
			for (const rent of rents) {
				await facilityDao.incrementEquipmentAvailability(
					rent.equipmentId,
					rent.quantity,
				);
			}
			await userDao.decrementScore(req.user.id);

			// IMPORTANT: same issue as the TOTP flow - the score just changed in the DB, but the
			// session store still holds the OLD score (the whole user object was serialized at login
			// time). Re-login to refresh the session, otherwise req.user.score would stay stale for
			// the rest of the session (e.g. the client would keep seeing the pre-cancellation score).
			req.user.score -= 1;
			req.login(req.user, (err) => {
				if (err) {
					console.error(err);
					return res.status(503).json({ error: "Database error" });
				}
				res.status(200).json({});
			});
		} catch (err) {
			console.error(err);
			res.status(500).json({ error: "Database error" });
		}
	},
);

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
	if (success) {
		req.session.method = "totp";
		try {
			// Persist the consumed step (replay protection) and reset the score to 0
			await userDao.updateLastTotpStep(req.user.id, req.user.lastTotpStep);
			await userDao.resetScore(req.user.id);
			req.user.score = 0; // keep the in-memory copy consistent with the DB

			// IMPORTANT: since the whole user object is stored in the session (not just the id),
			// the session store still holds the OLD score/lastTotpStep from the initial login.
			// Re-calling req.login() re-serializes the updated req.user into the session store,
			// otherwise a subsequent request in the same session would see stale values again
			// (e.g. the replay-protection check could be bypassed on a second TOTP attempt).
			req.login(req.user, (err) => {
				if (err) {
					console.log(err);
					return res.status(503).json({ error: "Database error" });
				}
				return res.json({ otp: "authorized" });
			});
		} catch (err) {
			console.log(err);
			return res.status(503).json({ error: "Database error" });
		}
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

// Activating the server
const PORT = 3001;
app.listen(PORT, (err) => {
	if (err) console.log(err);
	else console.log(`Server listening at http://localhost:${PORT}`);
});

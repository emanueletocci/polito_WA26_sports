/*** Importing modules ***/
import express from "express";
import morgan from "morgan"; // logging middleware
import { check, validationResult, oneOf } from "express-validator"; // validation middleware
import cors from "cors";

/** Authentication-related imports **/
import passport from "passport"; // authentication middleware
import LocalStrategy from "passport-local"; // authentication strategy (username and password)

import { TOTP } from "otpauth";

import userDao from "./dao-users.mjs"; // module for accessing the user table in the DB
import session from "express-session";

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

/*** Passport ***/

/** Set up authentication strategy to search in the DB a user with a matching password.
 * The user object will contain other information extracted by the method userDao.getUser (i.e., id, username, name).
 **/
passport.use(
	new LocalStrategy(
		{ usernameField: "email" }, // setting email as the username field
		async function verify(username, password, callback) {
			const user = await userDao.getUser(username, password);
			if (!user) return callback(null, false, "Incorrect username or password");

			return callback(null, user); // NOTE: user info in the session (all fields returned by userDao.getUser, i.e, id, username, name)
		},
	),
);

// Serializing in the session the user object given from LocalStrategy(verify).
passport.serializeUser(function (user, callback) {
	// this user is id + username + name
	callback(null, user);
});

// Starting from the data in the session, we extract the current (logged-in) user.
passport.deserializeUser(function (user, callback) {
	// this user is id + email + name
	// if needed, we can do extra check here (e.g., double check that the user is still in the database, etc.)
	// e.g.: return userDao.getUserById(id).then(user => callback(null, user)).catch(err => callback(err, null));

	userDao
		.getUserById(id) // rileggo SEMPRE dal DB, fresco
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

function verifyTotpToken(user, token) {
	const totp = new TOTP({
		algorithm: "SHA1",
		digits: 6,
		period: 30,
		secret: user.secret,
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
	//console.log('DEBUG: Token valid for step '+actualStep, ' (current counter: '+currentCounter+', delta: '+delta+')');

	if (actualStep <= user.lastTotpStep) return false; // Reject replay or older step

	// Accept : update last-used step
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

/*** Utility Functions ***/

// Make sure to set a reasonable value (not too small!) depending on the application constraints
// It is recommended (but NOT strictly required) to have a limit here or in the DB constraints
// to avoid malicious requests waste space in DB and network bandwidth.

const REBOOKING_COOLDOWN_SECONDS = 30;

// This function is used to format express-validator errors as strings
const errorFormatter = ({ location, msg, param, value, nestedErrors }) => {
	return `${location}[${param}]: ${msg}`;
};

// APIs

// Activating the server
const PORT = 3001;
// Activate the server
app.listen(PORT, (err) => {
	if (err) console.log(err);
	else console.log(`Server listening at http://localhost:${PORT}`);
});

import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap-icons/font/bootstrap-icons.css";
import "./App.css";

import { useState, useEffect } from "react";
import { Routes, Route, Navigate } from "react-router";

import Layout, { NotFound } from "./components/Layout.jsx";
import Home from "./components/Home.jsx";
import { LoginForm, TotpForm } from "./components/Auth.jsx";
import Reservations from "./components/Reservations.jsx";
import Book from "./components/Book.jsx";
import ReservationEdit from "./components/ReservationEdit.jsx";

import API from "./API.js";

/**
 * App
 *
 * INPUT: none (this is the root component of the application)
 *
 * OUTPUT (return value):
 * - the full set of application routes (<Routes>), with the authentication state
 *   (loggedIn, loggedInTotp, user) and the feedback message shared with the pages
 */
function App() {
	// loggedIn: whether the user has a valid session (passed username/password)
	const [loggedIn, setLoggedIn] = useState(false);
	// loggedInTotp: whether the user has also completed the 2FA (TOTP) step,
	// for users who have 2FA enabled
	const [loggedInTotp, setLoggedInTotp] = useState(false);

	const [user, setUser] = useState(null);

	// message: the feedback shown to the user after an operation, as an object
	// { text, type } where type is a react-bootstrap Alert variant
	// ("success" for a completed operation, "danger" for a failure).
	// null means "nothing to show".
	// NB: only the last message is kept. A more complex application would need a
	// queue of messages.
	const [message, setMessage] = useState(null);

	// On first mount, check whether a session already exists server-side
	// (e.g. the browser still has a valid session cookie from a previous visit).
	useEffect(() => {
		const checkAuth = async () => {
			try {
				const user = await API.getUserInfo();
				setLoggedIn(true);
				setUser(user);
				if (user.isTotpVerified) setLoggedInTotp(true);
			} catch (err) {
				// Empty on purpose: no user logged in, nothing to handle
			}
		};
		checkAuth();
	}, []);

	/**
	 * Shows a green confirmation message to the user.
	 *
	 * INPUT (params, positional):
	 * - text: string, the message to display
	 *
	 * OUTPUT (return value):
	 * - none (undefined). Its job is a SIDE EFFECT: it updates the "message" state,
	 *   which makes the Alert appear inside the Layout.
	 */
	const showSuccess = (text) => {
		setMessage({ text: text, type: "success" });
	};

	/**
	 * Shows a red error message to the user, extracting the text from whatever the
	 * failed API call rejected with.
	 *
	 * INPUT (params, positional):
	 * - err: the rejection value. It can be an object { error: <message> }, an
	 *   array of express-validator errors, a plain string, or something unknown.
	 *
	 * OUTPUT (return value):
	 * - none (undefined). Its job is a SIDE EFFECT: it updates the "message" state.
	 */
	const handleErrors = (err) => {
		let text = "";
		if (err.error) text = err.error;
		else if (Array.isArray(err) && err[0] && err[0].msg)
			text = err[0].msg + " : " + err[0].path;
		else if (typeof err === "string") text = String(err);
		else text = "Unknown Error";
		setMessage({ text: text, type: "danger" });
	};

	/**
	 * Handles the login process.
	 * It requires an email and a password inside a "credentials" object.
	 *
	 * INPUT (params, positional):
	 * - credentials: object { email, password }
	 *
	 * OUTPUT (return value):
	 * - none (undefined) on success: updates user/loggedIn state as a side effect.
	 * - on failure: does NOT swallow the error, it re-throws it, so that the caller
	 *   (LoginForm) can catch it and display it next to the form.
	 */
	const handleLogin = async (credentials) => {
		try {
			const user = await API.logIn(credentials);
			setUser(user);
			setLoggedIn(true);
			setMessage(null); // a new session starts with no leftover message
		} catch (err) {
			// error is handled and visualized in the login form, do not manage error, throw it
			throw err;
		}
	};

	/**
	 * Handles the logout process.
	 *
	 * INPUT: none
	 *
	 * OUTPUT (return value):
	 * - none (undefined). Its job is a SIDE EFFECT: it calls the API to destroy
	 *   the session, then resets loggedIn/loggedInTotp/user/message regardless of
	 *   whether the API call succeeded or failed.
	 */
	const handleLogout = async () => {
		try {
			await API.logOut();
		} catch (err) {
			// Cannot do anything more if logout fails: just avoid an uncaught rejected promise
			handleErrors(err);
		} finally {
			setLoggedIn(false);
			setLoggedInTotp(false);
			setUser(null);
			setMessage(null);
		}
	};

	/**
	 * Re-fetches the current user's info from the server (rehydrating), so that
	 * the client state (e.g. the score shown in the navbar) reflects a change
	 * caused by an operation performed elsewhere (e.g. deleting a reservation,
	 * or the score reset after a TOTP login).
	 *
	 * INPUT: none
	 *
	 * OUTPUT (return value):
	 * - none (undefined). Its job is a SIDE EFFECT: it updates the "user" state.
	 */
	const refreshUserInfo = async () => {
		try {
			const updatedUser = await API.getUserInfo();
			setUser(updatedUser);
		} catch (err) {
			handleErrors(err);
		}
	};

	return (
		<Routes>
			{/*
				Top-level route "/": renders Layout (navbar + message + <Outlet />) as
				the shared shell for every nested route below.
			*/}
			<Route
				path="/"
				element={
					<Layout
						loggedIn={loggedIn}
						user={user}
						loggedInTotp={loggedInTotp}
						logout={handleLogout}
						message={message}
						setMessage={setMessage}
					/>
				}
			>
				{/* index route: what renders at exactly "/" inside the Layout */}
				<Route
					index
					element={<Home handleErrors={handleErrors} loggedIn={loggedIn} />}
				/>

				{/*
					"reservations" and "book" are protected routes: only accessible
					if loggedIn is true, otherwise the user is redirected to "/login".
					NB: this is only a convenience for the user, the real protection is
					on the server, where every API checks the session.
				*/}
				<Route
					path="reservations"
					element={
						loggedIn ? (
							<Reservations
								refreshUserInfo={refreshUserInfo}
								showSuccess={showSuccess}
								handleErrors={handleErrors}
							/>
						) : (
							<Navigate replace to="/login" />
						)
					}
				/>
				<Route
					path="reservations/:reservationId/edit"
					element={
						loggedIn ? (
							<ReservationEdit
								user={user}
								showSuccess={showSuccess}
								handleErrors={handleErrors}
							/>
						) : (
							<Navigate replace to="/login" />
						)
					}
				/>
				<Route
					path="book"
					element={
						loggedIn ? (
							<Book
								user={user}
								showSuccess={showSuccess}
								handleErrors={handleErrors}
							/>
						) : (
							<Navigate replace to="/login" />
						)
					}
				/>

				{/* Any other URL under "/": show a page with a link back to the home */}
				<Route path="*" element={<NotFound />} />
			</Route>

			{/*
				"/login" is outside the Layout (no navbar wrapper needed there).
				All the auth-related state and setters are passed down to
				LoginWithTotp, which decides what to actually show.
			*/}
			<Route
				path="/login"
				element={
					<LoginWithTotp
						loggedIn={loggedIn}
						login={handleLogin}
						user={user}
						loggedInTotp={loggedInTotp}
						setLoggedInTotp={setLoggedInTotp}
						setLoggedIn={setLoggedIn}
						refreshUserInfo={refreshUserInfo}
						showSuccess={showSuccess}
					/>
				}
			/>
		</Routes>
	);
}

/**
 * LoginWithTotp
 *
 * INPUT (props, passed as a single object):
 * - props.loggedIn: boolean, whether email/password have already been verified
 * - props.user: object, current user info
 * - props.loggedInTotp: boolean, whether the TOTP step has already been completed
 * - props.login: function(credentials), performs the login (passed to LoginForm)
 * - props.setLoggedIn: function(boolean), state setter (passed to TotpForm)
 * - props.setLoggedInTotp: function(boolean), state setter called by TotpForm
 *   once the TOTP code is verified successfully
 * - props.refreshUserInfo: function, re-fetches user info (passed to TotpForm)
 * - props.showSuccess: function(text), shows a confirmation message
 *
 * OUTPUT (return value):
 * - one of three possible screens, depending on the nested if/else logic:
 *   - <Navigate to="/"> if the user is already fully authenticated
 *     (logged in, and either TOTP is not required, or it is already verified)
 *   - <TotpForm> if the user is logged in, has 2FA enabled, but has not
 *     completed the TOTP step yet
 *   - <LoginForm> if the user is not logged in at all yet
 */
function LoginWithTotp(props) {
	if (props.loggedIn) {
		if (props.user.hasTotpEnabled) {
			if (props.loggedInTotp) {
				// Already fully authenticated (password + TOTP done): go home.
				return <Navigate replace to="/" />;
			} else {
				// Logged in, 2FA enabled, but TOTP not verified yet: show the TOTP form.
				return (
					<TotpForm
						totpSuccessful={() => props.setLoggedInTotp(true)}
						setLoggedIn={props.setLoggedIn}
						refreshUserInfo={props.refreshUserInfo}
						showSuccess={props.showSuccess}
					/>
				);
			}
		} else {
			// Logged in, but this user does not have 2FA enabled at all: go home.
			return <Navigate replace to="/" />;
		}
	} else {
		// Not logged in yet: show the email/password login form.
		return <LoginForm login={props.login} />;
	}
}

export default App;

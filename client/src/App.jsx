import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap-icons/font/bootstrap-icons.css";
import "./App.css";

import { useState, useEffect } from "react";
import { Routes, Route, Navigate } from "react-router";

import Layout from "./components/Layout.jsx";
import Home from "./components/Home.jsx";
import { LoginForm, TotpForm } from "./components/Auth.jsx";
import Reservations from "./components/Reservations.jsx";
import Book from "./components/Book.jsx";
import ReservationEdit from "./components/ReservationEdit.jsx";

import API from "./API.js";

/**
 * OUTPUT (return value):
 * - the full set of application routes (<Routes>), with authentication state props (loggedIn, loggedInTotp, user)
 */
function App() {
	// loggedIn: whether the user has a valid session (passed username/password)
	const [loggedIn, setLoggedIn] = useState(false);
	// loggedInTotp: whether the user has also completed the 2FA (TOTP) step,
	// for users who have 2FA enabled
	const [loggedInTotp, setLoggedInTotp] = useState(false);

	const [user, setUser] = useState(null);

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
	 * Handlss the login process.
	 * It requires a username and a password inside a "credentials" object.
	 *
	 * INPUT (params):
	 * - credentials: object { email, password }
	 *
	 * OUTPUT (return value):
	 * - none (undefined) on success: updates user/loggedIn state as a side effect.
	 * - on failure: does NOT swallow the error, it re-throws it (after logging it),
	 *   so that the caller (LoginForm) can catch it and display it to the user.
	 */
	const handleLogin = async (credentials) => {
		try {
			const user = await API.logIn(credentials);
			setUser(user);
			setLoggedIn(true);
		} catch (err) {
			console.error(err);
			// error is handled and visualized in the login form, do not manage error, throw it
			throw err;
		}
	};

	/**
	 * Handles the logout process.
	 *
	 * OUTPUT (return value):
	 * - none (undefined). Its job is a SIDE EFFECT: it calls the API to destroy
	 *   the session, then resets loggedIn/loggedInTotp/user regardless of
	 *   whether the API call succeeded or failed.
	 */
	const handleLogout = async () => {
		try {
			await API.logOut();
		} catch (err) {
			// Cannot do anything more if logout fails: just avoid uncaught rejected promise
			console.error(err);
		} finally {
			setLoggedIn(false);
			setLoggedInTotp(false);
			setUser(null);
		}
	};

	/**
	 * Re-fetches the current user's info from the server (rehydrating), so that
	 * client-side state (e.g. the score shown in the navbar) reflects any change
	 * caused by an action performed elsewhere (e.g. deleting a reservation).
	 *
	 */
	const refreshUserInfo = async () => {
		try {
			const updatedUser = await API.getUserInfo();
			setUser(updatedUser);
		} catch (err) {
			console.error(err);
		}
	};

	return (
		<Routes>
			{/*
				Top-level route "/": renders Layout (navbar + <Outlet />) as the
				shared shell for every nested route below.
			*/}
			<Route
				path="/"
				element={
					<Layout
						loggedIn={loggedIn}
						user={user}
						loggedInTotp={loggedInTotp}
						logout={handleLogout}
					/>
				}
			>
				{/* index route: what renders at exactly "/" inside the Layout */}
				<Route index element={<Home loggedIn={loggedIn} />} />

				{/*
					"reservations" and "book" are protected routes: only accessible
					if loggedIn is true, otherwise the user is redirected to "/login".
				*/}
				<Route
					path="reservations"
					element={
						loggedIn ? (
							<Reservations refreshUserInfo={refreshUserInfo} />
						) : (
							<Navigate to="/login" />
						)
					}
				/>
				<Route
					path="reservations/:reservationId/edit"
					element={
						loggedIn ? (
							<ReservationEdit user={user} />
						) : (
							<Navigate to="/login" />
						)
					}
				/>
				<Route
					path="book"
					element={loggedIn ? <Book /> : <Navigate to="/login" />}
				/>
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
					/>
				}
			/>
		</Routes>
	);
}

/**
 * LoginWithTotp
 *
 * INPUT (props):
 * - props.loggedIn: boolean, whether username/password have already been verified
 * - props.user: object, current user info
 * - props.loggedInTotp: boolean, whether the TOTP step has already been completed
 * - props.login: function(credentials), performs the login (passed to LoginForm)
 * - props.setLoggedIn: function(boolean), state setter (passed to TotpForm)
 * - props.setLoggedInTotp: function(boolean), state setter called by TotpForm
 *   once the TOTP code is verified successfully
 * - props.refreshUserInfo: function, re-fetches user info (passed to TotpForm)
 *
 * OUTPUT (return value):
 * - Onx of three possible screens, depending on the nested if/else logic:
 *   - <Navigate to="/"> if the user is already fully authenticated
 *     (logged in, and either TOTP is not required, or it's already verified)
 *   - <TotpForm> if the user is logged in, has 2FA enabled, but hasn't
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
					/>
				);
			}
		} else {
			// Logged in, but this user doesn't have 2FA enabled at all: go home.
			return <Navigate replace to="/" />;
		}
	} else {
		// Not logged in yet: show the username/password login form.
		return <LoginForm login={props.login} />;
	}
}

export default App;

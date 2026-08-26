import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap-icons/font/bootstrap-icons.css";
import "./App.css";

import { useState, useEffect } from "react";
import { Routes, Route, Navigate } from "react-router";

import Layout from "./components/Layout.jsx";
import Home from "./components/Home.jsx";
import { LoginForm, TotpForm } from "./components/Auth.jsx";
import API from "./API.js";

function App() {
	const [loggedIn, setLoggedIn] = useState(false);
	const [loggedInTotp, setLoggedInTotp] = useState(false);
	const [user, setUser] = useState(null);

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
	 * This function handles the login process.
	 * It requires a username and a password inside a "credentials" object.
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
	 * This function handles the logout process.
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

	return (
		<Routes>
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
				<Route index element={<Home />} />
			</Route>
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
					/>
				}
			/>
		</Routes>
	);
}

// Decides which screen to show on the /login route, based on the current
// authentication state: plain login form, TOTP form, or redirect to home.
function LoginWithTotp(props) {
	if (props.loggedIn) {
		if (props.user.hasTotpEnabled) {
			if (props.loggedInTotp) {
				return <Navigate replace to="/" />;
			} else {
				return (
					<TotpForm
						totpSuccessful={() => props.setLoggedInTotp(true)}
						setLoggedIn={props.setLoggedIn}
					/>
				);
			}
		} else {
			return <Navigate replace to="/" />;
		}
	} else {
		return <LoginForm login={props.login} />;
	}
}

export default App;

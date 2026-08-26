import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap-icons/font/bootstrap-icons.css";
import "./App.css";

import { useState, useEffect } from "react";

import Layout from "./components/Layout.jsx";
import Home from "./components/Home.jsx";
import API from "./API.js";
import { Routes, Route } from "react-router";

function App() {
	// This state keeps track if the user is currently logged-in.
	const [loggedIn, setLoggedIn] = useState(false);

	// This state keeps track if the user has used topt authentication.
	const [loggedInTotp, setLoggedInTotp] = useState(false);

	// This state contains the user's info.
	const [user, setUser] = useState(null);

	useEffect(() => {
		const checkAuth = async () => {
			try {
				// here you have the user info, if already logged in
				const user = await API.getUserInfo();
				setLoggedIn(true);
				setUser(user);
				if (user.isTotpVerified) setLoggedInTotp(true);
			} catch (err) {
				// Empty on purpose: an error here just means no user is logged in, so there is nothing to handle
				//handleError(err);
			}
		};
		checkAuth();
	}, []); // The useEffect callback is called only the first time the component is mounted.

	return (
		<Routes>
			<Route
				path="/"
				element={
					<Layout loggedIn={loggedIn} user={user} loggedInTotp={loggedInTotp} />
				}
			>
				<Route index element={<Home />} />
			</Route>
		</Routes>
	);
}

export default App;

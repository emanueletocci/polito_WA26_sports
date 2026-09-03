import { useState } from "react";
import { Form, Button, Alert, Col, Row, Card } from "react-bootstrap";
import { Link, useNavigate } from "react-router";

import API from "../API.js";

/**
 * TotpForm
 *
 * Form used to enter the 2FA (TOTP) code, after the email and the password have
 * already been verified. Completing this step also resets a negative score back
 * to zero.
 *
 * INPUT (props, passed as a single object):
 * - props.totpSuccessful: function, called (with no argument) when the code has
 *   been verified, to tell the parent that the 2FA step is done
 * - props.refreshUserInfo: function, re-fetches the info of the current user
 *   (the score may have been reset by the server)
 * - props.setLoggedIn: function(boolean), used to log the user out if the
 *   session expired while the code was being typed
 * - props.showSuccess: function(text), shows a confirmation message
 *
 * OUTPUT (return value):
 * - JSX: a card with the field for the 6-digit code, a "Validate" button and a
 *   "Skip" button
 */
function TotpForm(props) {
	// totpCode: the code currently typed by the user
	const [totpCode, setTotpCode] = useState("");

	const [errorMessage, setErrorMessage] = useState("");

	const navigate = useNavigate();

	/**
	 * Checks the 6-digit TOTP code and completes the 2FA step if it is valid.
	 */
	const doTotpVerify = () => {
		API.totpVerify(totpCode)
			.then(() => {
				setErrorMessage("");
				// Tell the parent component that the 2FA step succeeded...
				props.totpSuccessful();
				// ...and fetch the user info again, since the score has been reset.
				props.refreshUserInfo();
				props.showSuccess(
					"Two-factor authentication completed: your score is back to zero.",
				);
				navigate("/");
			})
			.catch((err) => {
				// The session expired while the user was typing the code.
				if (err && err.error && err.error === "Not authorized") {
					setErrorMessage(
						"Your session has expired, you will be redirected to the login page",
					);
					// Wait two seconds, so that the message can be read, then log out.
					setTimeout(() => props.setLoggedIn(false), 2000);
				} else {
					// A generic message is used here, to avoid telling an
					// attacker why exactly the code was rejected.
					setErrorMessage("Wrong code, please try again");
				}
			});
	};

	/**
	 * handleSubmit
	 *
	 * INPUT (params):
	 * - event: the (synthetic) form submit event
	 */
	const handleSubmit = (event) => {
		// Prevent the browser's default behaviour (a full page reload on submit).
		event.preventDefault();
		setErrorMessage("");

		// A valid TOTP code must be present and exactly 6 characters long.
		let valid = true;
		if (totpCode === "" || totpCode.length !== 6) valid = false;

		if (valid) {
			doTotpVerify();
		} else {
			setErrorMessage(
				"Invalid content in form: either empty or not 6-char long",
			);
		}
	};

	// The Alert is shown only when there is something to report.
	let errorAlert = null;
	if (errorMessage) {
		errorAlert = (
			<Alert variant="danger" dismissible onClose={() => setErrorMessage("")}>
				{errorMessage}
			</Alert>
		);
	}

	return (
		<Row className="justify-content-center mt-5">
			<Col md={5}>
				<Card className="p-3">
					<h1 className="h3">Second factor authentication</h1>
					<p className="text-muted">
						Enter the code shown by your authenticator app. Completing this step
						also resets a negative score back to zero.
					</p>
					<Form onSubmit={handleSubmit}>
						{errorAlert}
						<Form.Group controlId="totpCode" className="mb-3">
							<Form.Label>Code (6 digits)</Form.Label>
							{/*
								- ev is a (synthetic) event object
								- ev.target is the DOM element that generated the event
								  (here, the text field the user is typing into)
								- ev.target.value is what the user has typed so far
							*/}
							<Form.Control
								type="text"
								value={totpCode}
								onChange={(ev) => setTotpCode(ev.target.value)}
							/>
						</Form.Group>
						<Button className="me-2" type="submit">
							Validate
						</Button>
						{/* The second factor is optional: the user may go on without it */}
						<Button variant="secondary" onClick={() => navigate("/")}>
							Skip
						</Button>
					</Form>
				</Card>
			</Col>
		</Row>
	);
}

/**
 * LoginForm
 *
 * INPUT (props, passed as a single object):
 * - props.login: function(credentials) returning a Promise; it performs the
 *   actual login. credentials = { email, password }
 *
 * OUTPUT (return value):
 * - JSX: a card with the email and password fields, a "Login" button and a link
 *   back to the public home page
 */
function LoginForm(props) {
	// For development purposes, the fields are pre-filled with a valid user
	// in order to save time when testing the login and the 2FA step. 
	const [email, setEmail] = useState("user2@example.com");
	const [password, setPassword] = useState("Password2!");

	const [errorMessage, setErrorMessage] = useState("");

	/**
	 * handleSubmit
	 *
	 * INPUT (params, positional):
	 * - event: the (synthetic) form submit event
	 *
	 * OUTPUT (return value):
	 * - none (undefined). It checks that the fields are not empty and then either
	 *   calls props.login(credentials) or shows a validation message.
	 */
	const handleSubmit = (event) => {
		// Prevent the browser's default behaviour (a full page reload on submit).
		event.preventDefault();
		const credentials = { email: email, password: password };

		if (!email) {
			setErrorMessage("Email cannot be empty");
		} else if (!password) {
			setErrorMessage("Password cannot be empty");
		} else {
			// Navigating after a successful login happens by itself: LoginWithTotp,
			// in App.jsx, re-renders with the updated loggedIn/user state and decides
			// whether to show the TOTP screen or to go straight to the home page.
			props.login(credentials).catch((err) => {
				// The credentials were refused by the server: the user must clearly
				// see that the attempt failed.
				if (err && err.error) setErrorMessage(err.error);
				else setErrorMessage("Login failed, please try again");
			});
		}
	};

	// The Alert is shown only when there is something to report.
	let errorAlert = null;
	if (errorMessage) {
		errorAlert = (
			<Alert variant="danger" dismissible onClose={() => setErrorMessage("")}>
				{errorMessage}
			</Alert>
		);
	}

	return (
		<Row className="justify-content-center mt-5">
			<Col md={5}>
				<Card className="p-3">
					<h1 className="h3 text-center">Login</h1>
					<Form onSubmit={handleSubmit}>
						{errorAlert}
						<Form.Group className="mb-3" controlId="email">
							<Form.Label>Email</Form.Label>
							{/* ev.target.value = the text currently typed in the field */}
							<Form.Control
								type="email"
								value={email}
								onChange={(ev) => setEmail(ev.target.value)}
							/>
						</Form.Group>
						<Form.Group className="mb-3" controlId="password">
							<Form.Label>Password</Form.Label>
							<Form.Control
								type="password"
								value={password}
								onChange={(ev) => setPassword(ev.target.value)}
							/>
						</Form.Group>
						<Button className="mt-3 w-100" type="submit">
							Login
						</Button>
						{/*
							The home page is public: this is only a way back to it, not an
							alternative way of authenticating.
						*/}
						<Link to="/" className="d-block mt-3 text-center">
							Back to the home page
						</Link>
					</Form>
				</Card>
			</Col>
		</Row>
	);
}

/**
 * LogoutButton
 *
 * INPUT (props, passed as a single object):
 * - props.logout: function, called (with no argument) when the button is clicked
 *
 * OUTPUT (return value):
 * - JSX: a single red "Logout" button
 */
function LogoutButton(props) {
	return (
		<Button variant="danger" onClick={props.logout}>
			Logout
		</Button>
	);
}

/**
 * LoginButton
 *
 * OUTPUT (return value):
 * - JSX: a single "Login" button that navigates to "/login" when clicked
 */
function LoginButton() {
	const navigate = useNavigate();
	return (
		<Button variant="outline-light" onClick={() => navigate("/login")}>
			Login
		</Button>
	);
}

export { LoginForm, LogoutButton, LoginButton, TotpForm };

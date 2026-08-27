import { useState } from "react";
import { Form, Button, Alert, Col, Row, Card } from "react-bootstrap";
import { Link, useNavigate } from "react-router";
import API from "../API.js";

/**
 * Form for entering the 2FA (TOTP) code after a successful login
 *
 * INPUT (props, passed as a single object):
 * - props.totpSuccessful: function, called (no arguments) when the TOTP code
 *   is verified successfully, to tell the parent component the 2FA step is done
 * - props.refreshUserInfo: function, called to re-fetch/update the current user
 *   info after a successful TOTP verification
 * - props.setLoggedIn: function(boolean), used to log the user out (set to false)
 *   if the session has expired while entering the TOTP code
 *
 * OUTPUT (return value):
 * - a card with a form to enter the 6-digit TOTP code, a "Validate" button,
 *   and a "Skip" button
 */
function TotpForm(props) {
	// totpCode: the 6-digit code currently typed by the user
	const [totpCode, setTotpCode] = useState("");

	const [errorMessage, setErrorMessage] = useState("");

	const navigate = useNavigate();

	/**
	 * doTotpVerify
	 *
	 * INPUT: none (reads totpCode from the component's state via closure)
	 *
	 * OUTPUT (return value):
	 * - none (undefined). Its job is a SIDE EFFECT: it calls the API to verify
	 *   the TOTP code, and on success/failure updates state and/or navigates.
	 */
	const doTotpVerify = () => {
		API.totpVerify(totpCode)
			.then(() => {
				setErrorMessage("");
				// Tell the parent component that 2FA succeeded...
				props.totpSuccessful();
				props.refreshUserInfo();
				navigate("/");
			})
			.catch((err) => {
				// The session expired while the user was typing the code.
				if (err && err.error && err.error === "Not authorized") {
					setErrorMessage(
						"Your session has expired, you will be redirected to the login page",
					);
					// Wait 2 seconds (so the user can read the message), then log out.
					setTimeout(() => props.setLoggedIn(false), 2000);
				} else {
					// NB: Must use a generic error message
					// (avoid giving attackers hints about why the code was rejected)
					setErrorMessage("Wrong code, please try again");
				}
			});
	};

	/**
	 * handleSubmit
	 *
	 * INPUT (params, positional):
	 * - event: the (synthetic) form submit event
	 *
	 * OUTPUT (return value):
	 * - none (undefined). Validates the code locally, then either calls
	 *   doTotpVerify() or shows a validation error message.
	 */
	const handleSubmit = (event) => {
		// Prevent the browser's default behavior (a full page reload on submit).
		event.preventDefault();
		setErrorMessage("");

		// Some validation
		// A valid TOTP code must be present and exactly 6 characters long.
		let valid = true;
		if (totpCode === "" || totpCode.length !== 6) valid = false;

		if (valid) {
			doTotpVerify(totpCode);
		} else {
			setErrorMessage(
				"Invalid content in form: either empty or not 6-char long",
			);
		}
	};

	return (
		<Row className="justify-content-center mt-5">
			<Col md={5}>
				<Card className="p-3 shadow-sm">
					<h2>Second Factor Authentication</h2>
					<h5>Please enter the code that you read on your device</h5>
					<Form onSubmit={handleSubmit}>
						{/* Show the error Alert only when errorMessage is not empty,
						    otherwise render nothing (empty string) */}
						{errorMessage ? (
							<Alert
								variant="danger"
								dismissible
								onClose={() => setErrorMessage("")}
							>
								{errorMessage}
							</Alert>
						) : (
							""
						)}
						<Form.Group controlId="totpCode">
							<Form.Label>Code</Form.Label>
							{/*
								- ev is a (synthetic) event object
								- ev.target represents the DOM element that triggered the event
								  (here, the text input the user is typing into)
								- ev.target.value is the current text content of the input,
								  i.e. what the user has typed so far
							*/}
							<Form.Control
								type="text"
								value={totpCode}
								onChange={(ev) => setTotpCode(ev.target.value)}
							/>
						</Form.Group>
						<Button className="my-2" type="submit">
							Validate
						</Button>
						<Button
							className="my-2 mx-2"
							variant="danger"
							onClick={() => navigate("/")}
						>
							Skip
						</Button>
					</Form>
				</Card>
			</Col>
		</Row>
	);
}

/**
 * Form for log in
 *
 * INPUT (props, passed as a single object):
 * - props.login: function(credentials) that returns a Promise; performs the
 *   actual login API call. credentials = { email, password }
 *
 * OUTPUT (return value):
 * - JSX: a card with email/password fields, a "Login" button, and a
 *   "Continue as guest" link
 */
function LoginForm(props) {
	// email/password: the values currently typed into the two form fields
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");

	const [errorMessage, setErrorMessage] = useState("");

	/**
	 * handleSubmit
	 *
	 * INPUT (params, positional):
	 * - event: the (synthetic) form submit event
	 *
	 * OUTPUT (return value):
	 * - none (undefined). Validates the fields locally, then either calls
	 *   props.login(credentials) or shows a validation error message.
	 */
	const handleSubmit = (event) => {
		// Prevent the browser's default behavior (a full page reload on submit).
		event.preventDefault();
		const credentials = { email, password };

		if (!email) {
			setErrorMessage("Email cannot be empty");
		} else if (!password) {
			setErrorMessage("Password cannot be empty");
		} else {
			// Navigation after a successful login happens automatically: LoginWithTotp,
			// in App.jsx, re-renders based on the updated loggedIn/user state and decides
			// whether to show the TOTP screen or redirect straight to the home page.
			props.login(credentials).catch((err) => {
				setErrorMessage(err.error);
			});
		}
	};

	return (
		<Row className="justify-content-center mt-5">
			<Col md={5}>
				<Card className="p-3 shadow-sm">
					<h1 className="text-center">Login</h1>
					<Form onSubmit={handleSubmit}>
						{/* Show the error Alert only when errorMessage is not empty */}
						{errorMessage ? (
							<Alert
								dismissible
								onClose={() => setErrorMessage("")}
								variant="danger"
							>
								{errorMessage}
							</Alert>
						) : null}
						<Form.Group className="mb-3">
							<Form.Label>Email</Form.Label>
							{/* ev.target.value = the current text typed in the email field */}
							<Form.Control
								type="email"
								value={email}
								placeholder="Example: user2@example.com"
								onChange={(ev) => setEmail(ev.target.value)}
							/>
						</Form.Group>
						<Form.Group className="mb-3">
							<Form.Label>Password</Form.Label>
							{/* ev.target.value = the current text typed in the password field */}
							<Form.Control
								type="password"
								value={password}
								placeholder="Enter your password"
								onChange={(ev) => setPassword(ev.target.value)}
							/>
						</Form.Group>
						<Button className="mt-3 w-100" type="submit">
							Login
						</Button>
						{/* Lets an unauthenticated user proceed without logging in */}
						<Link to="/" className="d-block mt-3 text-center">
							Continue as guest
						</Link>
					</Form>
				</Card>
			</Col>
		</Row>
	);
}

/**
 * Button that logs the current user out when clicked
 *
 * INPUT (props, passed as a single object):
 * - props.logout: function, called (no arguments) when the button is clicked;
 *   performs the actual logout logic
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
 * Button that navigates to the login page when clicked
 *
 * INPUT: none (this component takes no props)
 *
 * OUTPUT (return value):
 * - JSX: a single "Login" button that, when clicked, navigates to "/login"
 */
function LoginButton(props) {
	const navigate = useNavigate();
	return (
		<Button variant="outline-light" onClick={() => navigate("/login")}>
			Login
		</Button>
	);
}

export { LoginForm, LogoutButton, LoginButton, TotpForm };

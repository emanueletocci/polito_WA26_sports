import { useState } from "react";
import { Form, Button, Alert, Col, Row, Card } from "react-bootstrap";
import { Link, useNavigate } from "react-router";
import API from "../API.js";

// Form for entering the 2FA (TOTP) code after a successful login
function TotpForm(props) {
	const [totpCode, setTotpCode] = useState("");
	const [errorMessage, setErrorMessage] = useState("");

	const navigate = useNavigate();

	//console.log('DEBUG: RENDER TotpForm');

	const doTotpVerify = () => {
		API.totpVerify(totpCode)
			.then(() => {
				setErrorMessage("");
				props.totpSuccessful();
				props.refreshUserInfo();
				navigate("/");
			})
			.catch((err) => {
				if (err && err.error && err.error === "Not authorized") {
					setErrorMessage(
						"Your session has expired, you will be redirected to the login page",
					);
					setTimeout(() => props.setLoggedIn(false), 2000);
				} else {
					// NB: Must use a generic error message
					setErrorMessage("Wrong code, please try again");
				}
			});
	};

	const handleSubmit = (event) => {
		event.preventDefault();
		setErrorMessage("");

		// Some validation
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
						{errorMessage ? (
							<Alert
								variant="danger"
								dismissible
								onClick={() => setErrorMessage("")}
							>
								{errorMessage}
							</Alert>
						) : (
							""
						)}
						<Form.Group controlId="totpCode">
							<Form.Label>Code</Form.Label>
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

// Form for log in
function LoginForm(props) {
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [errorMessage, setErrorMessage] = useState("");

	const handleSubmit = (event) => {
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
							<Form.Control
								type="email"
								value={email}
								placeholder="Example: user2@example.com"
								onChange={(ev) => setEmail(ev.target.value)}
							/>
						</Form.Group>
						<Form.Group className="mb-3">
							<Form.Label>Password</Form.Label>
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
						<Link to="/" className="d-block mt-3 text-center">
							Continue as guest
						</Link>
					</Form>
				</Card>
			</Col>
		</Row>
	);
}

// Button that logs the current user out when clicked
function LogoutButton(props) {
	return (
		<Button variant="danger" onClick={props.logout}>
			Logout
		</Button>
	);
}

// Button that navigates to the login page when clicked
function LoginButton(props) {
	const navigate = useNavigate();
	return (
		<Button variant="outline-light" onClick={() => navigate("/login")}>
			Login
		</Button>
	);
}

export { LoginForm, LogoutButton, LoginButton, TotpForm };

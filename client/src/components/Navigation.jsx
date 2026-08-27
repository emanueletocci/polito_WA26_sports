import { Navbar, Nav, Badge, Button } from "react-bootstrap";
import { Link } from "react-router";
import { LoginButton, LogoutButton } from "./Auth.jsx";

/**
 * Navigation
 *
 * INPUT (props, passed as a single object):
 * - loggedIn: boolean, whether the current user is authenticated
 * - user: object, info about the currently logged-in user
 * - loggedInTotp: boolean, whether the user has also completed the 2FA (TOTP) step
 * - logout: function, called to log the current user out;
 *   passed down to LogoutButton
 *
 * OUTPUT (return value):
 * - JSX: the top navigation bar, showing either a Login button (guest)
 *   or the user's name/score/reservation links/Logout button (logged in)
 */
function Navigation({ loggedIn, user, loggedInTotp, logout }) {
	// authSection: the right-hand side content of the navbar.
	// Its content depends entirely on whether the user is logged in or not,
	// so it's computed once here (with a standard if/else), then just
	// inserted into the JSX below via {authSection}.
	let authSection;
	if (loggedIn) {
		authSection = (
			<>
				<Navbar.Text className="text-white me-3 fw-bold">
					{`${user.name} ${user.surname}`}
					{/* Show "(2FA)" next to the name only if the user completed the TOTP step */}
					{loggedInTotp ? " (2FA)" : null}
				</Navbar.Text>
				<Badge
					bg="light"
					// Badge text color: red if the score is negative, otherwise dark
					text={user.score < 0 ? "danger" : "dark"}
					className="me-3 text-nowrap fs-6"
				>
					Score: {user.score}
				</Badge>
				<Button
					as={Link}
					to="/reservations"
					variant="outline-light"
					className="me-3"
				>
					My reservations
				</Button>
				<Button as={Link} to="/book" variant="outline-light" className="me-3">
					Book
				</Button>
				<LogoutButton logout={logout} />
			</>
		);
	} else {
		// Not logged in: only show the Login button
		authSection = <LoginButton />;
	}

	return (
		<Navbar bg="primary" expand="md" variant="dark" className="mb-2 p-3">
			<Navbar.Brand as={Link} to="/">
				<i className="bi bi-trophy-fill mx-2"></i>
				Sport Center
			</Navbar.Brand>
			<Nav className="ms-auto align-items-center">{authSection}</Nav>
		</Navbar>
	);
}

export default Navigation;

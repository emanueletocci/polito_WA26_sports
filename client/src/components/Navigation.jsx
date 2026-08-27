import { Navbar, Nav, Badge, Button } from "react-bootstrap";
import { Link } from "react-router";
import { LoginButton, LogoutButton } from "./Auth.jsx";

function Navigation({ loggedIn, user, loggedInTotp, logout }) {
	let authSection;
	if (loggedIn) {
		authSection = (
			<>
				<Navbar.Text className="text-white me-3 fw-bold">
					{`${user.name} ${user.surname}`}
					{loggedInTotp ? " (2FA)" : null}
				</Navbar.Text>
				<Badge
					bg="light"
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

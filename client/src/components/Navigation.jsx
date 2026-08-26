import { Navbar, Nav } from "react-bootstrap";
import { LoginButton, LogoutButton } from "./Auth.jsx";

function Navigation({ loggedIn, user, loggedInTotp, logout }) {
	let authSection;
	if (loggedIn) {
		authSection = (
			<>
				<Navbar.Text className="text-white me-3">
					Logged in as: {user.name}
					{loggedInTotp ? " (2FA)" : null}
				</Navbar.Text>
				<LogoutButton logout={logout} />
			</>
		);
	} else {
		authSection = <LoginButton />;
	}

	return (
		<Navbar bg="primary" expand="md" variant="dark" className="mb-4 px-3">
			<Navbar.Brand>
				<i className="bi bi-trophy-fill mx-2"></i>
				Sport Center
			</Navbar.Brand>
			<Nav className="ms-auto">{authSection}</Nav>
		</Navbar>
	);
}

export default Navigation;

import { Navbar, Nav, Button } from "react-bootstrap";

function Navigation({ loggedIn, user, loggedInTotp }) {
	let authSection;
	if (loggedIn) {
		authSection = (
			<>
				<Navbar.Text className="text-white me-3">
					Logged in as: {user.name}
					{loggedInTotp ? " (2FA)" : null}
				</Navbar.Text>
				<Button variant="light">Logout</Button>
			</>
		);
	} else {
		authSection = <Button variant="light">Login</Button>;
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

import { Navbar, Nav, Button } from "react-bootstrap";

function Navigation({ children }) {
	return (
		<>
			<Navbar bg="primary" expand="md" variant="dark" className="mb-4 px-3">
				<Navbar.Brand>
					<i className="bi bi-trophy-fill mx-2"></i>
					Sport Center
				</Navbar.Brand>
				<Nav className="ms-auto">
					<Button variant="outline-light" className="me-2">
						Guest
					</Button>
					<Button variant="light">Login</Button>
				</Nav>
			</Navbar>

			{children}
		</>
	);
}

export default Navigation;

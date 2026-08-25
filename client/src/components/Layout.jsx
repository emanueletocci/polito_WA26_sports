import { Navbar, Nav, Button } from 'react-bootstrap';

function Layout({ children }) {
	return (
		<>
			<Navbar bg="primary" variant="dark" className="mb-4 px-3">
				<Navbar.Brand>Centro Sportivo Aurora</Navbar.Brand>
				<Nav className="ms-auto">
					<Button variant="outline-light" className="me-2">Username</Button>
					<Button variant="light">Login</Button>
				</Nav>
			</Navbar>

			{children}
		</>
	);
}

export default Layout;
import { Navbar, Nav, Button } from 'react-bootstrap';

function Layout({ children }) {
	return (
		<>
			<Navbar bg="primary" variant="dark" className="mb-4 px-3">
				<Navbar.Brand>Sport Center</Navbar.Brand>
				<Nav className="ms-auto">
					<Button variant="outline-light" className="me-2">Guest</Button>
					<Button variant="light">Login</Button>
				</Nav>
			</Navbar>

			{children}
		</>
	);
}

export default Layout;
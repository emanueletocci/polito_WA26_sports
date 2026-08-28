import { Container, Alert, Button } from "react-bootstrap";
import { Outlet, Link } from "react-router";

import Navigation from "./Navigation.jsx";

/**
 * Layout
 *
 * INPUT (props, passed as a single object):
 * - loggedIn: boolean, whether the current user is authenticated
 * - user: object (or null), info about the currently logged-in user
 * - loggedInTotp: boolean, whether the user has also completed the 2FA (TOTP) step
 * - logout: function, called to log the current user out
 *   (passed down to Navigation, which renders the Logout button)
 * - message: object { text, type } with the feedback of the last operation,
 *   or null when there is nothing to show
 * - setMessage: function, used to clear the message when the user closes the Alert
 *
 * OUTPUT (return value):
 * - JSX: the persistent page shell, made of the top Navigation bar, the feedback
 *   Alert (when present), and whatever the currently matched route renders
 *   through <Outlet />
 */
function Layout({ loggedIn, user, loggedInTotp, logout, message, setMessage }) {
	let messageAlert = null;
	if (message) {
		messageAlert = (
			<Container fluid className="px-3 pt-3">
				<Alert
					variant={message.type}
					dismissible
					onClose={() => setMessage(null)}
					className="mb-0"
				>
					{message.text}
				</Alert>
			</Container>
		);
	}

	return (
		<>
			{/* Navigation bar, shown on every page regardless of the current route */}
			<Navigation
				loggedIn={loggedIn}
				user={user}
				loggedInTotp={loggedInTotp}
				logout={logout}
			/>

			{messageAlert}

			{/*
				Outlet is basically a Router placeholder: it renders whichever child
				route component currently matches the URL (e.g. Home, Book, ...).
			*/}
			<Outlet />
		</>
	);
}

/**
 * NotFound
 *
 * INPUT: none (this component takes no props)
 *
 * OUTPUT (return value):
 * - JSX: the page shown for any URL that does not match a known route, with a
 *   clearly visible button to go back to the home page (the user must never be
 *   forced to use the browser's back button)
 */
function NotFound() {
	return (
		<Container fluid className="py-4">
			<h1 className="mb-3">This page does not exist</h1>
			<p className="text-muted">
				The address you asked for is not part of this application.
			</p>
			<Button as={Link} to="/" variant="primary">
				Go back to the home page
			</Button>
		</Container>
	);
}

export default Layout;
export { NotFound };

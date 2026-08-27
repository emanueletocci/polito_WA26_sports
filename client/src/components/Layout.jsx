import Navigation from "./Navigation.jsx";
import { Outlet } from "react-router";

/**
 * Layout
 *
 * INPUT (props, passed as a single object):
 * - loggedIn: boolean, whether the current user is authenticated
 * - user: object (or undefined/null), info about the currently logged-in user
 * - loggedInTotp: boolean, whether the user has also completed the 2FA (TOTP) step
 * - logout: function, called to log the current user out
 *   (passed down to Navigation, which renders the Logout button)
 *
 * OUTPUT (return value):
 * - JSX: the persistent page shell, made of the top Navigation bar plus
 *   whatever the currently matched route renders via <Outlet />
 */
function Layout({ loggedIn, user, loggedInTotp, logout }) {
	return (
		<>
			{/* Navigation bar, shown on every page regardless of the current route */}
			<Navigation
				loggedIn={loggedIn}
				user={user}
				loggedInTotp={loggedInTotp}
				logout={logout}
			/>
			{/*
				Outlet is a React Router placeholder: it renders whichever child
				route component currently matches the URL (e.g. Home, Book, Login...).
				This is what makes Layout a shared "wrapper" around every page.
			*/}
			<Outlet />
		</>
	);
}

export default Layout;

import Navigation from "./Navigation.jsx";
import { Outlet } from "react-router";

function Layout({ loggedIn, user, loggedInTotp, logout }) {
	return (
		<>
			<Navigation
				loggedIn={loggedIn}
				user={user}
				loggedInTotp={loggedInTotp}
				logout={logout}
			/>
			<Outlet />
		</>
	);
}

export default Layout;

import Navigation from "./Navigation.jsx";
import { Outlet } from "react-router";

function Layout({ loggedIn, user, loggedInTotp }) {
	return (
		<>
			<Navigation loggedIn={loggedIn} user={user} loggedInTotp={loggedInTotp} />
			{/* Outlet renders the matched child route here; unlike children, it's set by the router, not passed by the parent */}
			<Outlet />
		</>
	);
}

export default Layout;

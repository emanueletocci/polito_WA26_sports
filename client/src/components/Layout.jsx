import Navigation from "./Navigation.jsx";

function Layout({ children }) {
	return (
		<>
			<Navigation />
			{children}
		</>
	);
}

export default Layout;
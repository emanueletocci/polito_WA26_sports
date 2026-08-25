import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap-icons/font/bootstrap-icons.css";
import "./App.css";

import Layout from "./components/Layout.jsx";
import Home from "./components/Home.jsx";

function App() {
	return (
		<Layout>
			<Home />
		</Layout>
	);
}

export default App;

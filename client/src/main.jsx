import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { BrowserRouter } from "react-router";
import App from "./App.jsx";

// This is the entry point of the app
//
// - document.getElementById('root') finds the empty <div id="root"> in index.html,
//   the real DOM node where the whole React app will be mounted.
// - createRoot(...) creates a React root attached to that DOM node.
// - .render(...) tells React what to draw inside it, for the first time.
createRoot(document.getElementById("root")).render(
	<StrictMode>
		<BrowserRouter>
			<App />
		</BrowserRouter>
	</StrictMode>,
);

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
	// StrictMode: a development-only wrapper that doesn't render any visible UI.
	// It helps catch mistakes by intentionally double-invoking some functions
	// (like component bodies and effects) during development, to surface
	// side effects that aren't properly cleaned up. It has no effect in production.
	<StrictMode>
		{/*
      BrowserRouter: provides routing capabilities  to every component inside it.
      This is what makes <Routes>, <Route>, <Link>, useNavigate(), etc.
      work correctly inside <App />.
    */}
		<BrowserRouter>
			<App />
		</BrowserRouter>
	</StrictMode>,
);

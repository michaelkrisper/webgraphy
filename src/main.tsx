import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import "./components/components.css";

void import("./deferredStartup").then((m) => m.runDeferredStartup());

const rootElement = document.getElementById("root");
if (rootElement) {
	ReactDOM.createRoot(rootElement).render(
		<React.StrictMode>
			<App />
		</React.StrictMode>,
	);
}

import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./app/App";
import { registerPwaServiceWorker } from "./lib/pwaRegistration";
import "./index.css";

void registerPwaServiceWorker();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

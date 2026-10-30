import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { connect } from "./hass";
import { loadTheme } from "./theme";
import "./styles.css";

loadTheme();
connect();
// A long press on a touchscreen also asks for the browser's menu; on the panel it's for details.
document.addEventListener("contextmenu", (event) => event.preventDefault());

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

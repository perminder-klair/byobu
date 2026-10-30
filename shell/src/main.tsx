import "@fontsource/jetbrains-mono/300.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/jetbrains-mono/700.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { startPower } from "./power";
import { Shell } from "./Shell";
import { connect } from "./store";
import { loadTheme } from "./theme";
import "./styles.css";

loadTheme();
connect();
startPower();
// A long press on a touchscreen also asks for the browser's menu; here it's for details.
document.addEventListener("contextmenu", (event) => event.preventDefault());

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Shell />
  </StrictMode>,
);

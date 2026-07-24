import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { Popup } from "./Popup.js";

const container = document.getElementById("root");
if (!container) throw new Error("#root element not found in popup.html");

createRoot(container).render(
  <StrictMode>
    <Popup />
  </StrictMode>,
);

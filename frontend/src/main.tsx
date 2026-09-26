import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./app.css";
import App from "./App.tsx";
import { AuthProvider } from "./auth/AuthContext.tsx";
import { DialogProvider } from "./ui/DialogContext.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <DialogProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </DialogProvider>
    </BrowserRouter>
  </StrictMode>,
);

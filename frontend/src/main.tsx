import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./app.css";
import App from "./App.tsx";
import { AuthProvider } from "./auth/AuthContext.tsx";
import { DialogProvider } from "./ui/DialogContext.tsx";
import { backendEndpoint } from "./endpoints.ts";

function BackendConfigurationFailure({ message }: { message: string }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas p-6">
      <div className="flex max-w-md flex-col gap-3 text-center">
        <h1>Backend configuration required</h1>
        <p className="m-0 text-muted" role="alert">
          {message}
        </p>
      </div>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {backendEndpoint.error ? (
      <BackendConfigurationFailure message={backendEndpoint.error} />
    ) : (
      <BrowserRouter>
        <DialogProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </DialogProvider>
      </BrowserRouter>
    )}
  </StrictMode>,
);

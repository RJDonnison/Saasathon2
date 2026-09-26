const approvedProductionFrontendOrigin =
  "https://saasathon2-5plpmnqdj-reuben19.vercel.app";
const approvedProductionBackendOrigin =
  "https://loop-classroom-api.onrender.com";

type BackendEndpoint =
  { origin: string; error?: never } | { origin: null; error: string };

function configuredBackendOrigin() {
  return import.meta.env.VITE_BACKEND_ORIGIN?.trim().replace(/\/+$/, "");
}

function resolveBackendEndpoint(): BackendEndpoint {
  // Vite's development server proxies both REST and Socket.io requests.
  if (import.meta.env.DEV) return { origin: "" };

  if (window.location.origin === approvedProductionFrontendOrigin) {
    return { origin: approvedProductionBackendOrigin };
  }

  const origin = configuredBackendOrigin();
  if (origin) return { origin };

  return {
    origin: null,
    error:
      "Backend configuration is missing for this deployment. Set VITE_BACKEND_ORIGIN to the backend origin and redeploy.",
  };
}

/** The single browser endpoint configuration for REST and Socket.io traffic. */
export const backendEndpoint = resolveBackendEndpoint();

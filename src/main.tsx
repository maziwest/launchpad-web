import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import AdminClaimPage from "./AdminClaimPage";
import AdminDashboardPage from "./AdminDashboardPage";
import { Providers } from "./Providers";

const path = window.location.pathname;
const page = path === "/admin" ? <AdminClaimPage /> : path === "/admin/dashboard" ? <AdminDashboardPage /> : <App />;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Providers>{page}</Providers>
  </React.StrictMode>
);

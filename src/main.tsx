import ReactDOM from "react-dom/client";
import { App } from "@/app/App";
import "@/index.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Failed to find root DOM element '#root'.");
}

ReactDOM.createRoot(rootElement).render(<App />);

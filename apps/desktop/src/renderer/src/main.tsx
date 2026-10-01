import { createRoot } from "react-dom/client";
import { CompletedCourses } from "./components/CompletedCourses.js";
import "./styles.css";

const root = document.getElementById("root");

if (!root) throw new Error("Missing React root element");

createRoot(root).render(<CompletedCourses />);

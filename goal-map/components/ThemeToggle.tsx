"use client";

import { useDispatch, useSelector } from "react-redux";
import { toggleTheme } from "@/store/slices/themeSlice";
import { RootState } from "@/store";
import { FiSun, FiMoon } from "react-icons/fi";

export default function ThemeToggle() {
  const dispatch = useDispatch();
  const theme = useSelector((state: RootState) => state.theme.mode);

  const handleToggle = () => {
    dispatch(toggleTheme());
  };

  return (
    <button
      onClick={handleToggle}
      className={`p-2 rounded-lg transition-colors duration-200 ${
        theme === "dark"
        ? "bg-slate-800 text-amber-300 hover:bg-slate-700"
          : "bg-blue-50 text-blue-700 hover:bg-blue-100"
      }`}
      aria-label="Toggle theme"
      title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
    >
      {theme === "dark" ? (
        <FiSun className="w-5 h-5" />
      ) : (
        <FiMoon className="w-5 h-5" />
      )}
    </button>
  );
}

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
          ? "bg-slate-700 hover:bg-slate-600 text-yellow-400"
          : "bg-gray-200 hover:bg-gray-300 text-gray-600"
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

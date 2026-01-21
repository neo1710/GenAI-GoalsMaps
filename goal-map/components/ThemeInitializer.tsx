"use client";

import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { initializeTheme } from "@/store/slices/themeSlice";
import { RootState } from "@/store";
import type { Theme } from "@/store/slices/themeSlice";

export default function ThemeInitializer() {
  const dispatch = useDispatch();
  const theme = useSelector((state: RootState) => state.theme.mode);

  useEffect(() => {
    // Initialize theme from localStorage or system preference
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("theme") as Theme | null;
      const prefersDark = window.matchMedia(
        "(prefers-color-scheme: dark)"
      ).matches;

      const initialTheme = stored || (prefersDark ? "dark" : "light");
      dispatch(initializeTheme(initialTheme));
    }
  }, [dispatch]);

  useEffect(() => {
    // Update DOM and localStorage when theme changes
    if (typeof window !== "undefined") {
      const htmlElement = document.documentElement;
      const isDark = theme === "dark";
      htmlElement.classList.toggle("dark", isDark);
      localStorage.setItem("theme", theme);
      console.log("Theme changed to:", theme, "Dark class added:", isDark);
    }
  }, [theme]);

  return null;
}

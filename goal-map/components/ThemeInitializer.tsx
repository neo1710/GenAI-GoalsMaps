"use client";

import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { initializeTheme } from "@/store/slices/themeSlice";
import { RootState } from "@/store";
import type { Theme } from "@/store/slices/themeSlice";

export default function ThemeInitializer() {
  const dispatch = useDispatch();
  const theme = useSelector((state: RootState) => state.theme.mode);
  const initialized = useSelector((state: RootState) => state.theme.initialized);

  useEffect(() => {
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
    if (typeof window !== "undefined" && initialized) {
      const htmlElement = document.documentElement;
      const isDark = theme === "dark";
      htmlElement.classList.toggle("dark", isDark);
      localStorage.setItem("theme", theme);
    }
  }, [theme, initialized]);

  return null;
}

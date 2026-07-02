# Memory: index.md
Updated: now

# Project Memory

## Core
App is Arabic RTL. Primary UI font: Vazirmatn.
Fully offline PWA, optimized for Xiaomi/Redmi devices.
All state (employees, attendance, settings) must persist to LocalStorage.
Highlight Friday ONLY (light green bg). Do NOT highlight Saturday.
Shift Picker: Anchored to RIGHT edge (right-3, vertically centered), max 300px width. NEVER use a bottom sheet or center modal.

## Memories
- [Customizable Shifts](mem://features/customizable-shifts) — Shift properties (code, name, hours, color) and editing behavior
- [Schedule Export](mem://features/export-functionality) — Excel and PDF export specs (A3 landscape, Amiri font for Arabic)
- [Data Clearing](mem://features/data-clearing) — Clearing schedule data preserves employee list

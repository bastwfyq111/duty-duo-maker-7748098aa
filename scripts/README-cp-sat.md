# CP-SAT model example (OR-Tools)

This Python script demonstrates how to model the "N-run must be followed by R" constraint using
OR-Tools CP-SAT. It also shows how to add cross-employee coverage constraints (e.g., at least M employees on duty per day).

Install OR-Tools (Python):
  pip install ortools

Run:
  python3 scripts/cp_sat_model.py

This is only an example; adapt number of employees, days, and required per-day coverage as needed.

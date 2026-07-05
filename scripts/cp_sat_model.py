"""
scripts/cp_sat_model.py
A small CP-SAT example that models employees x days with shifts {0:O,1:N,2:R}.
Constraint: any N that is the end of a run must be followed by R.
Also includes an example daily coverage constraint.
"""
from ortools.sat.python import cp_model

def solve(num_employees=5, days=31, required_per_day=2, wrap=False):
    model = cp_model.CpModel()
    # vars: shift[e,d] in {0,1,2}
    shift = {}
    for e in range(num_employees):
        for d in range(days):
            shift[(e,d)] = model.NewIntVar(0,2,f's_{e}_{d}')

    # helper booleans
    isN = {}
    isR = {}
    for e in range(num_employees):
        for d in range(days):
            isN[(e,d)] = model.NewBoolVar(f'isN_{e}_{d}')
            isR[(e,d)] = model.NewBoolVar(f'isR_{e}_{d}')
            model.Add(shift[(e,d)] == 1).OnlyEnforceIf(isN[(e,d)])
            model.Add(shift[(e,d)] != 1).OnlyEnforceIf(isN[(e,d)].Not())
            model.Add(shift[(e,d)] == 2).OnlyEnforceIf(isR[(e,d)])
            model.Add(shift[(e,d)] != 2).OnlyEnforceIf(isR[(e,d)].Not())
            # ensure exclusive: if not N and not R then O
            # (implicit since domain 0..2)

    # Constraint: if day d is N and day d+1 is not N, then day d+1 must be R.
    for e in range(num_employees):
        for d in range(days):
            next_d = (d+1) % days if wrap else d+1
            if next_d >= days:
                # no next day, forbid N on last day if not wrap
                # shift != 1
                model.Add(shift[(e,d)] != 1)
            else:
                # if isN[e,d] and not isN[e,next_d] then isR[e,next_d]
                # isN -> (isN_next OR isR_next)
                model.AddBoolOr([isN[(e,next_d)], isR[(e,next_d)]]).OnlyEnforceIf(isN[(e,d)])

    # Example daily coverage: count employees not O (shift != 0) >= required_per_day
    for d in range(days):
        works = []
        for e in range(num_employees):
            w = model.NewBoolVar(f'work_{e}_{d}')
            model.Add(shift[(e,d)] != 0).OnlyEnforceIf(w)
            model.Add(shift[(e,d)] == 0).OnlyEnforceIf(w.Not())
            works.append(w)
        model.Add(sum(works) >= required_per_day)

    # Objective (optional): minimize number of R's (or any objective). Here minimize total R's.
    totalR = []
    for e in range(num_employees):
        for d in range(days):
            totalR.append(isR[(e,d)])
    model.Minimize(sum(totalR))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 10
    solver.parameters.num_search_workers = 8
    res = solver.Solve(model)
    if res in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        for e in range(num_employees):
            line = []
            for d in range(days):
                val = solver.Value(shift[(e,d)])
                line.append('N' if val==1 else ('R' if val==2 else 'O'))
            print(f'Emp {e}:', ' '.join(line))
    else:
        print('No solution found')

if __name__ == '__main__':
    solve()

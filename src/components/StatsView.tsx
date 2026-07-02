import { useMemo } from "react";
import type { Employee } from "@/hooks/useRosterData";
import type { ShiftType } from "@/lib/roster";
import { computeStats } from "@/lib/stats";
import { hslStringToCss } from "@/lib/color-utils";
import { Card } from "@/components/ui/card";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, CartesianGrid, Legend,
} from "recharts";

interface StatsViewProps {
  employees: Employee[];
  shifts: Record<string, ShiftType>;
  month: number;
  year: number;
}

export default function StatsView({ employees, shifts, month, year }: StatsViewProps) {
  const stats = useMemo(() => computeStats(employees, shifts, year, month), [employees, shifts, year, month]);

  if (employees.length === 0) {
    return (
      <Card className="p-6 text-center text-muted-foreground text-sm">
        لا توجد بيانات لعرضها. أضف موظفين وورديات أولاً.
      </Card>
    );
  }

  const pieColors = stats.shiftDistribution.map(s =>
    s.color ? hslStringToCss(s.color) : "hsl(var(--primary))"
  );

  return (
    <div className="space-y-4">
      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-2">
        <Card className="p-3">
          <div className="text-[0.65rem] text-muted-foreground">متوسط الساعات / موظف</div>
          <div className="text-lg font-bold text-foreground">{stats.avgHoursPerEmployee.toFixed(1)}</div>
        </Card>
        <Card className="p-3">
          <div className="text-[0.65rem] text-muted-foreground">أيام التغطية الكاملة</div>
          <div className="text-lg font-bold text-foreground">{stats.fullCoverageDays}</div>
        </Card>
        <Card className="p-3 col-span-2">
          <div className="text-[0.65rem] text-muted-foreground">الموظف الأكثر عملاً</div>
          <div className="text-sm font-bold text-foreground">
            {stats.topEmployee?.name ?? "—"}{" "}
            <span className="text-primary">({stats.topEmployee?.hours ?? 0} ساعة)</span>
          </div>
        </Card>
      </div>

      {/* Hours per employee */}
      <Card className="p-3">
        <h3 className="text-xs font-semibold text-foreground mb-2">إجمالي الساعات لكل موظف</h3>
        <div style={{ width: "100%", height: 200 }}>
          <ResponsiveContainer>
            <BarChart data={stats.employeeHours} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="name" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} />
              <YAxis tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 11 }} />
              <Bar dataKey="hours" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Shift distribution pie */}
      <Card className="p-3">
        <h3 className="text-xs font-semibold text-foreground mb-2">توزيع أنواع الورديات</h3>
        <div style={{ width: "100%", height: 220 }}>
          <ResponsiveContainer>
            <PieChart>
              <Pie
                data={stats.shiftDistribution}
                dataKey="count"
                nameKey="label"
                cx="50%"
                cy="50%"
                outerRadius={70}
                label={(e) => `${e.label}: ${e.count}`}
                labelLine={false}
                style={{ fontSize: 10 }}
              >
                {stats.shiftDistribution.map((_, i) => (
                  <Cell key={i} fill={pieColors[i]} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Daily coverage */}
      <Card className="p-3">
        <h3 className="text-xs font-semibold text-foreground mb-2">عدد الموظفين العاملين يومياً</h3>
        <div style={{ width: "100%", height: 200 }}>
          <ResponsiveContainer>
            <LineChart data={stats.dailyCoverage} margin={{ top: 5, right: 5, left: -25, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="day" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} />
              <YAxis tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} allowDecimals={false} />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 11 }} />
              <Line type="monotone" dataKey="count" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 2 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Per-employee shift breakdown table */}
      <Card className="p-3">
        <h3 className="text-xs font-semibold text-foreground mb-2">تفصيل الورديات لكل موظف</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-[0.7rem]">
            <thead>
              <tr className="border-b border-border">
                <th className="text-right p-1.5 text-muted-foreground">الموظف</th>
                {Object.keys(shifts).map(code => (
                  <th key={code} className="p-1.5 text-muted-foreground">{code}</th>
                ))}
                <th className="p-1.5 text-muted-foreground">إجمالي</th>
              </tr>
            </thead>
            <tbody>
              {stats.shiftCountPerEmployee.map((row, i) => (
                <tr key={i} className="border-b border-border/50">
                  <td className="p-1.5 text-right text-foreground font-medium">{row.name}</td>
                  {Object.keys(shifts).map(code => (
                    <td key={code} className="p-1.5 text-center text-foreground">{row.counts[code] || 0}</td>
                  ))}
                  <td className="p-1.5 text-center text-primary font-bold">{row.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

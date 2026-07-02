import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";

import { cn } from "@/lib/utils";

const Tabs = TabsPrimitive.Root;

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      // نستخدم grid ليصبح التنقّل واضحاً ومتساوياً، مع تباعد وظل بسيط
      "grid grid-cols-3 gap-2 items-center w-full rounded-md bg-muted p-2 text-muted-foreground",
      className,
    )}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

type Variant = "emerald" | "blue" | "amber" | "pink" | "violet" | "slate";

const variantClasses: Record<Variant, string> = {
  emerald: "data-[state=active]:bg-emerald-500 data-[state=active]:text-white data-[state=active]:shadow-md hover:bg-emerald-100",
  blue: "data-[state=active]:bg-sky-500 data-[state=active]:text-white data-[state=active]:shadow-md hover:bg-sky-100",
  amber: "data-[state=active]:bg-amber-500 data-[state=active]:text-white data-[state=active]:shadow-md hover:bg-amber-100",
  pink: "data-[state=active]:bg-pink-500 data-[state=active]:text-white data-[state=active]:shadow-md hover:bg-pink-100",
  violet: "data-[state=active]:bg-violet-600 data-[state=active]:text-white data-[state=active]:shadow-md hover:bg-violet-100",
  slate: "data-[state=active]:bg-slate-700 data-[state=active]:text-white data-[state=active]:shadow-md hover:bg-slate-100",
};

interface TabsTriggerProps extends React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger> {
  variant?: Variant;
}

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  TabsTriggerProps
>(({ className, variant = "slate", ...props }, ref) => {
  const vcls = variantClasses[variant] ?? variantClasses.slate;
  return (
    <TabsPrimitive.Trigger
      ref={ref}
      className={cn(
        // زر أكبر وواضح مع انتقال سلس، وميزة تمييز للحالة النشطة عبر variantClasses
        "inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-2 text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
        "data-[state=active]:scale-105",
        vcls,
        className,
      )}
      {...props}
    />
  );
});
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-3 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      className,
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };

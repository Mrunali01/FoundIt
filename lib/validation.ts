import { z } from "zod";
import { categories, locations } from "./types";
export const reportSchema = z.object({
  type: z.enum(["lost", "found"]),
  title: z.string().trim().min(3).max(100),
  description: z.string().trim().min(15).max(2000),
  category: z.enum(categories),
  location_label: z.enum(locations as [string, ...string[]]),
  event_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine(
      (v) => !isNaN(Date.parse(v)) && Date.parse(v) <= Date.now(),
      "Choose a valid past date",
    ),
  color: z.string().trim().max(40).default(""),
  brand: z.string().trim().max(60).default(""),
});
export const claimSchema = z.object({
  report_id: z.uuid(),
  message: z.string().trim().min(15).max(2000),
});

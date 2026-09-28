"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

type Dept = { id: string; name: string };
type Cycle = { id: string; name: string };

// Module-level cache: fetched once per browser session, shared across all dashboards.
let deptsPromise: Promise<Dept[]> | null = null;
let cyclesPromise: Promise<Cycle[]> | null = null;

function getDepts(): Promise<Dept[]> {
  if (!deptsPromise) {
    deptsPromise = api.departments
      .list()
      .then((r) => r.data ?? [])
      .catch(() => { deptsPromise = null; return []; });
  }
  return deptsPromise;
}

function getCycles(): Promise<Cycle[]> {
  if (!cyclesPromise) {
    cyclesPromise = api.appraisals
      .getCycles()
      .then((r) => r.data ?? [])
      .catch(() => { cyclesPromise = null; return []; });
  }
  return cyclesPromise;
}

/** Returns departments and cycles from a shared module-level cache. */
export function useFilterData() {
  const [departments, setDepartments] = useState<Dept[]>([]);
  const [cycles, setCycles] = useState<Cycle[]>([]);

  useEffect(() => {
    let active = true;
    void Promise.all([getDepts(), getCycles()]).then(([d, c]) => {
      if (active) { setDepartments(d); setCycles(c); }
    });
    return () => { active = false; };
  }, []);

  return { departments, cycles };
}

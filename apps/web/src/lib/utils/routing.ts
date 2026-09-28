// apps/web/src/lib/utils/routing.ts
export type UiRole =
  | "EMPLOYEE"
  | "HOD"
  | "COMMITTEE"
  | "COMMITTEE_ACADEMIC"
  | "COMMITTEE_RESEARCH"
  | "COMMITTEE_OTHER"
  | "HR"
  | "ADMIN"
  | "SUPER_ADMIN"
  | "FACULTY"
  | "MANAGEMENT";

export function getRoleHomePath(role: UiRole): string {
  switch (role) {
    case "FACULTY":
      return "/faculty-dashboard";
    case "EMPLOYEE":
      return "/employee-dashboard";
    case "HOD":
      return "/hod-review";
    case "COMMITTEE":
    case "COMMITTEE_ACADEMIC":
    case "COMMITTEE_RESEARCH":
    case "COMMITTEE_OTHER":
      return "/committee-review";
    case "SUPER_ADMIN":
      return "/super-admin-dashboard";
    case "HR":
    case "ADMIN":
      return "/hr-dashboard";
    case "MANAGEMENT":
      return "/admin-review";
    default:
      return "/appraisals";
  }
}

export function getPrimaryRole(roles: string[] = []): UiRole {
  const priority: UiRole[] = [
    "SUPER_ADMIN",
    "ADMIN",
    "HR",
    "HOD",
    "COMMITTEE",
    "COMMITTEE_ACADEMIC",
    "COMMITTEE_RESEARCH",
    "COMMITTEE_OTHER",
    "FACULTY",
    "EMPLOYEE",
    "MANAGEMENT",
  ];
  return priority.find((role) => roles.includes(role)) ?? "EMPLOYEE";
}

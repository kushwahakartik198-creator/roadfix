/**
 * RoadFix - Core TypeScript Definitions
 * Phase 0: Technical Foundation
 */

export interface NavItem {
  readonly title: string;
  readonly href: string;
}

export interface EnvValidationResult {
  readonly isValid: boolean;
  readonly supabaseUrl?: string;
  readonly supabaseAnonKey?: string;
  readonly errors: readonly string[];
}

/**
 * Civic Road Maintenance Domain Types (Stubs for future phases)
 */
export type ReportStatus = "reported" | "verified" | "in_progress" | "resolved" | "rejected";

export type ReportSeverity = "low" | "medium" | "high" | "critical";

export interface PotholeReportStub {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly status: ReportStatus;
  readonly severity: ReportSeverity;
  readonly latitude: number;
  readonly longitude: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

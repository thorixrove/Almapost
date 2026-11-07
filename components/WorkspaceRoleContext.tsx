"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { WorkspaceAccessLevel } from "@/lib/workspace-role";

const WorkspaceRoleContext = createContext<WorkspaceAccessLevel>("VIEWER")

export function WorkspaceRoleProvider({ role, children }: { role: WorkspaceAccessLevel; children: ReactNode }) {
    return <WorkspaceRoleContext.Provider value={role}>{children}</WorkspaceRoleContext.Provider>
}

export function useWorkspaceRole() {
    const role = useContext(WorkspaceRoleContext)
    return { role, canEdit: role !== "VIEWER", readOnly: role === "VIEWER" }
}
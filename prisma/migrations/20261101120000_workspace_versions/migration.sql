-- CreateEnum
CREATE TYPE "VersionKind" AS ENUM ('MANUAL', 'AUTO', 'BEFORE_RESTORE');

-- CreateTable
CREATE TABLE "WorkspaceVersion" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "kind" "VersionKind" NOT NULL,
    "label" TEXT,
    "preview" TEXT,
    "shapeCount" INTEGER NOT NULL DEFAULT 0,
    "docContent" JSONB,
    "canvasContent" JSONB,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkspaceVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkspaceVersion_workspaceId_createdAt_idx" ON "WorkspaceVersion"("workspaceId", "createdAt");

-- AddForeignKey
ALTER TABLE "WorkspaceVersion" ADD CONSTRAINT "WorkspaceVersion_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceVersion" ADD CONSTRAINT "WorkspaceVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
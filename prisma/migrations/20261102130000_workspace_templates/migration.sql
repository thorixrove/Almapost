-- CreateTable
CREATE TABLE "WorkspaceTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "clerkOrgId" TEXT,
    "creatorId" TEXT NOT NULL,
    "docContent" JSONB,
    "canvasContent" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkspaceTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkspaceTemplate_clerkOrgId_idx" ON "WorkspaceTemplate"("clerkOrgId");

-- CreateIndex
CREATE INDEX "WorkspaceTemplate_creatorId_idx" ON "WorkspaceTemplate"("creatorId");

-- AddForeignKey
ALTER TABLE "WorkspaceTemplate" ADD CONSTRAINT "WorkspaceTemplate_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
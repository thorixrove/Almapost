-- CreateEnum
CREATE TYPE "WorkspaceRole" AS ENUM ('EDITOR', 'VIEWER');

-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN     "memberRole" "WorkspaceRole" NOT NULL DEFAULT 'EDITOR';

-- CreateTable
CREATE TABLE "WorkspaceAccess" (
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "WorkspaceRole" NOT NULL,

    CONSTRAINT "WorkspaceAccess_pkey" PRIMARY KEY ("workspaceId","userId")
);

-- CreateIndex
CREATE INDEX "WorkspaceAccess_userId_idx" ON "WorkspaceAccess"("userId");

-- AddForeignKey
ALTER TABLE "WorkspaceAccess" ADD CONSTRAINT "WorkspaceAccess_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceAccess" ADD CONSTRAINT "WorkspaceAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
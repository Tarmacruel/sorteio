-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Giveaway" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "title" TEXT NOT NULL,
    "instagramPostUrl" TEXT NOT NULL,
    "organizerUsername" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "winnersCount" INTEGER NOT NULL DEFAULT 1,
    "alternatesCount" INTEGER NOT NULL DEFAULT 0,
    "oneChancePerUser" BOOLEAN NOT NULL DEFAULT true,
    "allowMultipleEntries" BOOLEAN NOT NULL DEFAULT false,
    "commentDeadline" TIMESTAMP(3),
    "drawSeed" TEXT,
    "participantsHash" TEXT,
    "capturedAt" TIMESTAMP(3),
    "drawnAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Giveaway_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GiveawayRule" (
    "id" TEXT NOT NULL,
    "giveawayId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "config" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GiveawayRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstagramCaptureJob" (
    "id" TEXT NOT NULL,
    "giveawayId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "commentsFound" INTEGER NOT NULL DEFAULT 0,
    "commentsSaved" INTEGER NOT NULL DEFAULT 0,
    "currentStep" TEXT NOT NULL DEFAULT 'Aguardando captura...',
    "logs" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstagramCaptureJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comment" (
    "id" TEXT NOT NULL,
    "giveawayId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "instagramCommentId" TEXT,
    "commentedAt" TIMESTAMP(3),
    "rawData" JSONB,
    "isValid" BOOLEAN NOT NULL DEFAULT false,
    "invalidReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DrawResult" (
    "id" TEXT NOT NULL,
    "giveawayId" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DrawResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "giveawayId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Giveaway_status_idx" ON "Giveaway"("status");

-- CreateIndex
CREATE INDEX "Giveaway_createdAt_idx" ON "Giveaway"("createdAt");

-- CreateIndex
CREATE INDEX "GiveawayRule_giveawayId_idx" ON "GiveawayRule"("giveawayId");

-- CreateIndex
CREATE UNIQUE INDEX "GiveawayRule_giveawayId_type_key" ON "GiveawayRule"("giveawayId", "type");

-- CreateIndex
CREATE INDEX "InstagramCaptureJob_giveawayId_idx" ON "InstagramCaptureJob"("giveawayId");

-- CreateIndex
CREATE INDEX "InstagramCaptureJob_status_idx" ON "InstagramCaptureJob"("status");

-- CreateIndex
CREATE INDEX "Comment_giveawayId_idx" ON "Comment"("giveawayId");

-- CreateIndex
CREATE INDEX "Comment_username_idx" ON "Comment"("username");

-- CreateIndex
CREATE INDEX "Comment_isValid_idx" ON "Comment"("isValid");

-- CreateIndex
CREATE UNIQUE INDEX "Comment_giveawayId_instagramCommentId_key" ON "Comment"("giveawayId", "instagramCommentId");

-- CreateIndex
CREATE INDEX "DrawResult_giveawayId_idx" ON "DrawResult"("giveawayId");

-- CreateIndex
CREATE UNIQUE INDEX "DrawResult_giveawayId_position_type_key" ON "DrawResult"("giveawayId", "position", "type");

-- CreateIndex
CREATE INDEX "AuditLog_giveawayId_idx" ON "AuditLog"("giveawayId");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- AddForeignKey
ALTER TABLE "Giveaway" ADD CONSTRAINT "Giveaway_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiveawayRule" ADD CONSTRAINT "GiveawayRule_giveawayId_fkey" FOREIGN KEY ("giveawayId") REFERENCES "Giveaway"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstagramCaptureJob" ADD CONSTRAINT "InstagramCaptureJob_giveawayId_fkey" FOREIGN KEY ("giveawayId") REFERENCES "Giveaway"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_giveawayId_fkey" FOREIGN KEY ("giveawayId") REFERENCES "Giveaway"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrawResult" ADD CONSTRAINT "DrawResult_giveawayId_fkey" FOREIGN KEY ("giveawayId") REFERENCES "Giveaway"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrawResult" ADD CONSTRAINT "DrawResult_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "Comment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_giveawayId_fkey" FOREIGN KEY ("giveawayId") REFERENCES "Giveaway"("id") ON DELETE CASCADE ON UPDATE CASCADE;

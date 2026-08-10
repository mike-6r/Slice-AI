-- Document 006: catalogue identity and non-economic reference data only.
CREATE TYPE "CatalogueStatus" AS ENUM ('ACTIVE', 'ARCHIVED');
CREATE TYPE "AssetCatalogueStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'VERIFIED', 'PUBLISHED', 'ARCHIVED');

CREATE TABLE "Category" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "iconKey" TEXT,
  "description" TEXT,
  "status" "CatalogueStatus" NOT NULL DEFAULT 'ACTIVE',
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Category_slug_key" ON "Category"("slug");
CREATE INDEX "Category_status_sortOrder_id_idx" ON "Category"("status", "sortOrder", "id");

CREATE TABLE "CollectibleSet" (
  "id" TEXT NOT NULL,
  "categoryId" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "manufacturer" TEXT,
  "releaseYear" INTEGER,
  "edition" TEXT,
  "status" "CatalogueStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CollectibleSet_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CollectibleSet_slug_key" ON "CollectibleSet"("slug");
CREATE INDEX "CollectibleSet_categoryId_status_id_idx" ON "CollectibleSet"("categoryId", "status", "id");
ALTER TABLE "CollectibleSet" ADD CONSTRAINT "CollectibleSet_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "GradingCompany" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" "CatalogueStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GradingCompany_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "GradingCompany_code_key" ON "GradingCompany"("code");
CREATE INDEX "GradingCompany_status_code_idx" ON "GradingCompany"("status", "code");

CREATE TABLE "GradeScaleEntry" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "grade" DECIMAL(4,2) NOT NULL,
  "label" TEXT NOT NULL,
  "conditionLabel" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "GradeScaleEntry_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "GradeScaleEntry_companyId_grade_key" ON "GradeScaleEntry"("companyId", "grade");
CREATE INDEX "GradeScaleEntry_companyId_active_sortOrder_id_idx" ON "GradeScaleEntry"("companyId", "active", "sortOrder", "id");
ALTER TABLE "GradeScaleEntry" ADD CONSTRAINT "GradeScaleEntry_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "GradingCompany"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "Asset" (
  "id" TEXT NOT NULL,
  "publicId" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "categoryId" TEXT NOT NULL,
  "setId" TEXT,
  "title" TEXT NOT NULL,
  "shortName" TEXT,
  "year" INTEGER,
  "manufacturer" TEXT,
  "edition" TEXT,
  "cardNumber" TEXT,
  "description" TEXT,
  "gradingCompanyId" TEXT,
  "grade" DECIMAL(4,2),
  "certificationNumber" TEXT,
  "status" "AssetCatalogueStatus" NOT NULL DEFAULT 'DRAFT',
  "heroMediaId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "publishedAt" TIMESTAMP(3),
  CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Asset_publicId_key" ON "Asset"("publicId");
CREATE UNIQUE INDEX "Asset_slug_key" ON "Asset"("slug");
CREATE UNIQUE INDEX "Asset_gradingCompanyId_certificationNumber_key" ON "Asset"("gradingCompanyId", "certificationNumber");
CREATE INDEX "Asset_status_categoryId_id_idx" ON "Asset"("status", "categoryId", "id");
CREATE INDEX "Asset_setId_status_id_idx" ON "Asset"("setId", "status", "id");
CREATE INDEX "Asset_title_id_idx" ON "Asset"("title", "id");
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_setId_fkey" FOREIGN KEY ("setId") REFERENCES "CollectibleSet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_gradingCompanyId_fkey" FOREIGN KEY ("gradingCompanyId") REFERENCES "GradingCompany"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

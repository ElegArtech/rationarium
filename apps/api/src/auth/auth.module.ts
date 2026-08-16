import { Module } from "@nestjs/common";
import { AuthService } from "./auth.service.js";
import { AuthController } from "./auth.controller.js";
import { PrismaService } from "../prisma.service.js";
import { AuditService } from "../commun/audit.service.js";

@Module({
  controllers: [AuthController],
  providers: [AuthService, PrismaService, AuditService],
  exports: [AuthService],
})
export class AuthModule {}

import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Prisma, type NotificationDelivery } from '@prisma/client';
import { PrismaService } from '../../../database/prisma.service';
export type DeliveryClaim = NotificationDelivery & { claimToken: string };
@Injectable()
export class NotificationDeliveryWorkerRepository {
  constructor(private readonly db: PrismaService) {}
  async claimBatch(workerId: string, batchSize: number, leaseMs: number, now: Date): Promise<DeliveryClaim[]> {
    return this.db.$transaction(async (tx) => {
      const ids = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT "id" FROM "NotificationDelivery" WHERE ("status"='PENDING'::"NotificationDeliveryStatus" AND "availableAt"<=${now}) OR ("status"='PROCESSING'::"NotificationDeliveryStatus" AND "leaseExpiresAt"<=${now}) ORDER BY "availableAt","createdAt","id" LIMIT ${Math.min(Math.max(batchSize,1),100)} FOR UPDATE SKIP LOCKED`);
      const tokens = new Map<string,string>(); const expires = new Date(now.getTime()+leaseMs);
      for (const { id } of ids) { const claimToken=randomUUID(); tokens.set(id,claimToken); await tx.notificationDelivery.update({where:{id},data:{status:'PROCESSING',lockedBy:workerId,lockedAt:now,claimToken,leaseExpiresAt:expires}}); }
      const rows=await tx.notificationDelivery.findMany({where:{id:{in:ids.map((x)=>x.id)}}}); const byId=new Map(rows.map((r)=>[r.id,r]));
      return ids.map(({id})=>({...byId.get(id)!,claimToken:tokens.get(id)!}));
    });
  }
  async begin(id:string, token:string, now:Date) { const updated=await this.db.notificationDelivery.updateMany({where:{id,status:'PROCESSING',claimToken:token},data:{attempts:{increment:1},lastAttemptAt:now}}); return updated.count ? this.db.notificationDelivery.findUnique({where:{id}}) : null; }
  async success(id:string,token:string,now:Date) { return (await this.db.notificationDelivery.updateMany({where:{id,status:'PROCESSING',claimToken:token},data:{status:'DELIVERED',deliveredAt:now,lockedAt:null,lockedBy:null,claimToken:null,leaseExpiresAt:null}})).count===1; }
  async failure(id:string,token:string,now:Date,code:string,terminal:boolean,retryAt?:Date) { return (await this.db.notificationDelivery.updateMany({where:{id,status:'PROCESSING',claimToken:token},data:terminal?{status:'DEAD_LETTER',deadLetteredAt:now,lastErrorSafe:code,lockedAt:null,lockedBy:null,claimToken:null,leaseExpiresAt:null}:{status:'PENDING',availableAt:retryAt!,lastErrorSafe:code,lockedAt:null,lockedBy:null,claimToken:null,leaseExpiresAt:null}})).count===1; }
}

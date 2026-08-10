import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../database/prisma.service';
import type { Actor } from '../../identity/auth/auth.service';
import { createIdentityTransaction } from '../../identity/persistence/prisma-identity.repositories';

@Injectable()
export class CommunityService {
  constructor(private readonly db: PrismaService) {}

  async follow(actor: Actor, followedUserId: string, requestId: string) {
    if (actor.userId === followedUserId)
      throw new BadRequestException({ code: 'SELF_FOLLOW_FORBIDDEN', message: 'You cannot follow yourself.' });
    await this.db.$transaction(async (db) => {
      const relation = await db.collectorFollow.upsert({
        where: { followerUserId_followedUserId: { followerUserId: actor.userId, followedUserId } },
        create: { followerUserId: actor.userId, followedUserId },
        update: {},
      });
      await createIdentityTransaction(db).audit.append({
        id: randomUUID(), actorUserId: actor.userId, actorType: 'USER', action: 'COMMUNITY_COLLECTOR_FOLLOWED', resourceType: 'collector-follow', resourceId: `${relation.followerUserId}:${relation.followedUserId}`, requestId, sessionId: actor.sessionId as never, result: 'SUCCESS', metadata: {}, createdAt: new Date(),
      });
    });
    return { followed: true };
  }

  async unfollow(actor: Actor, followedUserId: string) {
    await this.db.collectorFollow.deleteMany({ where: { followerUserId: actor.userId, followedUserId } });
    return { followed: false };
  }

  async createPost(actor: Actor, assetId: string, body: string, parentId: string | undefined, requestId: string) {
    const text = this.validBody(body);
    return this.db.$transaction(async (db) => {
      const asset = await db.asset.findUnique({ where: { id: assetId }, select: { id: true, status: true } });
      if (!asset || asset.status !== 'PUBLISHED') throw new NotFoundException({ code: 'ASSET_NOT_FOUND', message: 'Resource not found.' });
      if (parentId) {
        const parent = await db.discussionPost.findFirst({ where: { id: parentId, assetId } });
        if (!parent || parent.status !== 'VISIBLE') throw new ConflictException({ code: 'CONTENT_LOCKED', message: 'The parent post cannot receive replies.' });
      }
      const post = await db.discussionPost.create({ data: { id: randomUUID(), assetId, userId: actor.userId, parentId, body: text } });
      await createIdentityTransaction(db).audit.append({
        id: randomUUID(), actorUserId: actor.userId, actorType: 'USER', action: 'COMMUNITY_POST_CREATED', resourceType: 'discussion-post', resourceId: post.id, requestId, sessionId: actor.sessionId as never, result: 'SUCCESS', metadata: { assetId }, createdAt: new Date(),
      });
      return this.publicPost(post);
    });
  }

  async listPosts(assetId: string, cursor?: string, limit = 20) {
    const rows = await this.db.discussionPost.findMany({
      where: { assetId, status: 'VISIBLE', ...(cursor ? { id: { lt: cursor } } : {}) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limit + 1,
    });
    const page = rows.slice(0, limit);
    return { items: page.map((post) => this.publicPost(post)), nextCursor: rows.length > limit ? page.at(-1)?.id ?? null : null };
  }

  async editPost(actor: Actor, postId: string, body: string, requestId: string) {
    const text = this.validBody(body);
    return this.db.$transaction(async (db) => {
      const post = await db.discussionPost.findFirst({ where: { id: postId, userId: actor.userId } });
      if (!post) throw new NotFoundException({ code: 'CONTENT_NOT_FOUND', message: 'Content was not found.' });
      if (post.status !== 'VISIBLE') throw new ConflictException({ code: 'CONTENT_LOCKED', message: 'Content cannot be edited.' });
      const updated = await db.discussionPost.update({ where: { id: post.id }, data: { body: text, editedAt: new Date() } });
      await createIdentityTransaction(db).audit.append({ id: randomUUID(), actorUserId: actor.userId, actorType: 'USER', action: 'COMMUNITY_POST_EDITED', resourceType: 'discussion-post', resourceId: post.id, requestId, sessionId: actor.sessionId as never, result: 'SUCCESS', metadata: {}, createdAt: new Date() });
      return this.publicPost(updated);
    });
  }

  async removePost(actor: Actor, postId: string, requestId: string) {
    return this.db.$transaction(async (db) => {
      const post = await db.discussionPost.findFirst({ where: { id: postId, userId: actor.userId } });
      if (!post) throw new NotFoundException({ code: 'CONTENT_NOT_FOUND', message: 'Content was not found.' });
      if (post.status !== 'VISIBLE') throw new ConflictException({ code: 'CONTENT_LOCKED', message: 'Content cannot be removed.' });
      const updated = await db.discussionPost.update({ where: { id: post.id }, data: { status: 'REMOVED' } });
      await createIdentityTransaction(db).audit.append({ id: randomUUID(), actorUserId: actor.userId, actorType: 'USER', action: 'COMMUNITY_POST_REMOVED', resourceType: 'discussion-post', resourceId: post.id, requestId, sessionId: actor.sessionId as never, result: 'SUCCESS', metadata: {}, createdAt: new Date() });
      return this.publicPost(updated);
    });
  }

  async report(actor: Actor, postId: string, reasonCode: string, requestId: string) {
    if (!/^[A-Z0-9_]{3,64}$/.test(reasonCode)) throw new BadRequestException({ code: 'CONTENT_INVALID', message: 'Report reason is invalid.' });
    return this.db.$transaction(async (db) => {
      const post = await db.discussionPost.findUnique({ where: { id: postId } });
      if (!post || post.status === 'REMOVED') throw new NotFoundException({ code: 'CONTENT_NOT_FOUND', message: 'Content was not found.' });
      const report = await db.contentReport.upsert({
        where: { postId_reporterUserId: { postId, reporterUserId: actor.userId } },
        create: { id: randomUUID(), postId, reporterUserId: actor.userId, reasonCode },
        update: {},
      });
      await createIdentityTransaction(db).audit.append({ id: randomUUID(), actorUserId: actor.userId, actorType: 'USER', action: 'COMMUNITY_CONTENT_REPORTED', resourceType: 'content-report', resourceId: report.id, requestId, sessionId: actor.sessionId as never, result: 'SUCCESS', metadata: { postId }, createdAt: new Date() });
      return { reportId: report.id, status: report.status };
    });
  }

  async moderate(actor: Actor, postId: string, action: 'HIDE' | 'REMOVE' | 'LOCK' | 'UNHIDE', reasonCode: string, requestId: string) {
    if (!/^[A-Z0-9_]{3,64}$/.test(reasonCode)) throw new BadRequestException({ code: 'CONTENT_INVALID', message: 'Moderation reason is invalid.' });
    return this.db.$transaction(async (db) => {
      const post = await db.discussionPost.findUnique({ where: { id: postId } });
      if (!post) throw new NotFoundException({ code: 'CONTENT_NOT_FOUND', message: 'Content was not found.' });
      const status = action === 'HIDE' ? 'HIDDEN' : action === 'REMOVE' ? 'REMOVED' : action === 'LOCK' ? 'LOCKED' : 'VISIBLE';
      const updated = await db.discussionPost.update({ where: { id: postId }, data: { status } });
      const moderation = await db.moderationAction.create({ data: { id: randomUUID(), postId, moderatorId: actor.userId, action, reasonCode } });
      await createIdentityTransaction(db).audit.append({ id: randomUUID(), actorUserId: actor.userId, actorType: 'USER', action: 'COMMUNITY_CONTENT_MODERATED', resourceType: 'moderation-action', resourceId: moderation.id, requestId, sessionId: actor.sessionId as never, result: 'SUCCESS', metadata: { action, postId }, createdAt: new Date() });
      return this.publicPost(updated);
    });
  }

  async reviewReport(actor: Actor, reportId: string, status: 'UNDER_REVIEW' | 'RESOLVED' | 'DISMISSED', reasonCode: string, requestId: string) {
    if (!/^[A-Z0-9_]{3,64}$/.test(reasonCode)) throw new BadRequestException({ code: 'CONTENT_INVALID', message: 'Moderation reason is invalid.' });
    return this.db.$transaction(async (db) => {
      const report = await db.contentReport.findUnique({ where: { id: reportId } });
      if (!report) throw new NotFoundException({ code: 'CONTENT_NOT_FOUND', message: 'Content was not found.' });
      if ((report.status === 'RESOLVED' || report.status === 'DISMISSED') && report.status !== status) throw new ConflictException({ code: 'CONTENT_LOCKED', message: 'Report is terminal.' });
      const updated = await db.contentReport.update({ where: { id: reportId }, data: { status } });
      await db.moderationAction.create({ data: { id: randomUUID(), postId: report.postId, reportId, moderatorId: actor.userId, action: 'HIDE', reasonCode, internalNotes: null } });
      await createIdentityTransaction(db).audit.append({ id: randomUUID(), actorUserId: actor.userId, actorType: 'USER', action: 'COMMUNITY_REPORT_REVIEWED', resourceType: 'content-report', resourceId: reportId, requestId, sessionId: actor.sessionId as never, result: 'SUCCESS', metadata: { status }, createdAt: new Date() });
      return { reportId: updated.id, status: updated.status };
    });
  }

  private validBody(body: string) {
    const normalized = body.trim();
    if (!normalized || normalized.length > 2_000 || /<\/?[a-z][\s\S]*>/i.test(normalized)) throw new BadRequestException({ code: 'CONTENT_INVALID', message: 'Content is invalid.' });
    return normalized;
  }
  private publicPost(post: { id: string; assetId: string; parentId: string | null; body: string; editedAt: Date | null; createdAt: Date }) {
    return { id: post.id, assetId: post.assetId, parentId: post.parentId, body: post.body, editedAt: post.editedAt?.toISOString() ?? null, createdAt: post.createdAt.toISOString() };
  }
}

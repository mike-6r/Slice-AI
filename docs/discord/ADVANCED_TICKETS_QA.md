# Advanced Tickets

## Architecture

Tickets are guild-scoped Prisma records. The existing lifecycle, optimistic
concurrency, private-channel authorization, category routing, forms, tags,
internal notes, staff transcript separation, SLA, and inactivity services are
preserved. Discord channels are an interface; ticket status is never inferred
from a channel name.

## Operations

- Members use the managed support panel and its modal/form intake.
- Staff use `/ticket` for claim, unclaim, status, priority, transfer,
  escalation, private notes, tags, resolve, close, and transcript actions.
- `/tickets` provides queue, search, record view, and statistics; queue and
  search filters are guild-scoped.
- `/ticket-config` manages versioned forms, category routing, SLA, tags, and
  inactivity policy. No Discord channel IDs are hardcoded.

## Safety

Intake copy warns users not to submit passwords, payment details, identity
documents, or other sensitive data. Ticket creators, participants, and scoped
staff access are enforced by the existing authorization boundary. Escalations
record a private reason and target managed team.

## Persistence and recovery

Lifecycle changes, assignment history, tags, notes, transcript metadata, SLA
alerts, and inactivity state are durable. The worker resumes inactivity and
SLA scans after restart. Escalated tickets are protected from automatic close
unless their category policy explicitly allows it.

## Validation

Unit coverage includes ticket creation, routing, forms/SLA, transcript and
inactivity behavior. Prisma lifecycle integration coverage requires the
isolated `slice_test` database.

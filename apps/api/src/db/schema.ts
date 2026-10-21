import { pgTable, timestamp, uuid, varchar, text, index, uniqueIndex, jsonb, integer } from 'drizzle-orm/pg-core';

export type Role = 'owner' | 'member';

export const users = pgTable('users', {
  id: uuid('id').primaryKey(),
  email: varchar('email', { length: 254 }).notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: varchar('role', { length: 16 }).notNull().default('member'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  familyId: uuid('family_id').notNull(),
  refreshTokenHash: text('refresh_token_hash').notNull().unique(),
  userAgent: varchar('user_agent', { length: 300 }),
  ip: varchar('ip', { length: 64 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  revokedReason: varchar('revoked_reason', { length: 40 }),
}, (t) => [
  index('sessions_user_active_idx').on(t.userId, t.revokedAt, t.expiresAt),
  index('sessions_family_idx').on(t.familyId),
]);

export const invites = pgTable('invites', {
  id: uuid('id').primaryKey(),
  email: varchar('email', { length: 254 }),
  tokenHash: text('token_hash').notNull().unique(),
  createdBy: uuid('created_by').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  usedBy: uuid('used_by').references(() => users.id, { onDelete: 'set null' }),
});

export const auditEvents = pgTable('audit_events', {
  id: uuid('id').primaryKey(),
  actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
  action: varchar('action', { length: 64 }).notNull(),
  target: varchar('target', { length: 200 }),
  ip: varchar('ip', { length: 64 }),
  userAgent: varchar('user_agent', { length: 300 }),
  metadata: jsonb('metadata').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('audit_events_created_idx').on(t.createdAt),
  index('audit_events_actor_idx').on(t.actorUserId, t.createdAt),
]);

export const playlists = pgTable('playlists', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 80 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('playlists_user_created_idx').on(t.userId, t.createdAt)]);

export const externalLibraryItems = pgTable('external_library_items', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  provider: varchar('provider', { length: 20 }).notNull(),
  externalId: varchar('external_id', { length: 160 }).notNull(),
  title: varchar('title', { length: 200 }).notNull(),
  artist: varchar('artist', { length: 200 }).notNull(),
  artworkUrl: text('artwork_url'),
  sourceUrl: text('source_url').notNull(),
  licenseUrl: text('license_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('external_library_unique_owner_provider_track_idx').on(t.userId, t.provider, t.externalId),
  index('external_library_user_created_idx').on(t.userId, t.createdAt),
]);

export const cloudTracks = pgTable('cloud_tracks', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  objectKey: text('object_key').notNull().unique(),
  title: varchar('title', { length: 200 }).notNull(),
  artist: varchar('artist', { length: 200 }).notNull().default('Mi música'),
  mimeType: varchar('mime_type', { length: 80 }).notNull(),
  byteSize: integer('byte_size').notNull(),
  status: varchar('status', { length: 16 }).notNull().default('pending'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('cloud_tracks_user_created_idx').on(t.userId, t.createdAt)]);

export const playlistItems = pgTable('playlist_items', {
  id: uuid('id').primaryKey(),
  playlistId: uuid('playlist_id').notNull().references(() => playlists.id, { onDelete: 'cascade' }),
  cloudTrackId: uuid('cloud_track_id').references(() => cloudTracks.id, { onDelete: 'cascade' }),
  externalItemId: uuid('external_item_id').references(() => externalLibraryItems.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('playlist_items_playlist_created').on(t.playlistId, t.createdAt, t.id)]);

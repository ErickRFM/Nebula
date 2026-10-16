import { pgTable, timestamp, uuid, varchar, text, index, uniqueIndex } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey(),
  email: varchar('email',{length:254}).notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at',{withTimezone:true}).notNull().defaultNow(),
});
export const playlists = pgTable('playlists', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id').notNull().references(()=>users.id,{onDelete:'cascade'}),
  name: varchar('name',{length:80}).notNull(),
  createdAt: timestamp('created_at',{withTimezone:true}).notNull().defaultNow(),
},(t)=>[index('playlists_user_created_idx').on(t.userId,t.createdAt)]);

export const externalLibraryItems=pgTable('external_library_items',{
  id:uuid('id').primaryKey(),
  userId:uuid('user_id').notNull().references(()=>users.id,{onDelete:'cascade'}),
  provider:varchar('provider',{length:20}).notNull(),
  externalId:varchar('external_id',{length:160}).notNull(),
  title:varchar('title',{length:200}).notNull(),
  artist:varchar('artist',{length:200}).notNull(),
  artworkUrl:text('artwork_url'),
  sourceUrl:text('source_url').notNull(),
  licenseUrl:text('license_url'),
  createdAt:timestamp('created_at',{withTimezone:true}).notNull().defaultNow(),
},t=>[
  uniqueIndex('external_library_unique_owner_provider_track_idx').on(t.userId,t.provider,t.externalId),
  index('external_library_user_created_idx').on(t.userId,t.createdAt),
]);

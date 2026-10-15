import { pgTable, timestamp, uuid, varchar, text, index } from 'drizzle-orm/pg-core';

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

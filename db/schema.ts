import { relations,sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { locales } from '@/i18n/config';

import { enumToPgEnum } from './utils/enum-to-pg-enum';

// Define MCP Message structure for typing JSONB columns
type McpMessageContent =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string }
  | { type: "audio"; data: string; mimeType: string }
  | { type: "resource"; resource: { uri: string; mimeType?: string; text?: string; blob?: string } };

type McpMessage = {
  role: "user" | "assistant" | "system";
  content: McpMessageContent | McpMessageContent[];
};


export const languageEnum = pgEnum('language', locales);

export enum McpServerStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  SUGGESTED = 'SUGGESTED',
  DECLINED = 'DECLINED',
}

export enum McpServerType {
  STDIO = 'STDIO',
  SSE = 'SSE',
  STREAMABLE_HTTP = 'STREAMABLE_HTTP',
}

export enum McpServerSource {
  PLUGGEDIN = 'PLUGGEDIN',
  SMITHERY = 'SMITHERY',
  NPM = 'NPM',
  GITHUB = 'GITHUB',
  COMMUNITY = 'COMMUNITY',
}

export const mcpServerStatusEnum = pgEnum(
  'mcp_server_status',
  enumToPgEnum(McpServerStatus)
);

export const mcpServerTypeEnum = pgEnum(
  'mcp_server_type',
   enumToPgEnum(McpServerType)
 );
 
 export const mcpServerSourceEnum = pgEnum(
   'mcp_server_source',
   enumToPgEnum(McpServerSource)
 );
 
 export enum ToggleStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}
export const toggleStatusEnum = pgEnum(
  'toggle_status',
  enumToPgEnum(ToggleStatus)
);

export enum ProfileCapability {
  TOOLS_MANAGEMENT = 'TOOLS_MANAGEMENT',
}
export const profileCapabilityEnum = pgEnum(
  'profile_capability',
  enumToPgEnum(ProfileCapability)
);


// Auth.js / NextAuth.js schema
export const users = pgTable('users', {
  id: text('id').notNull().primaryKey(),
  name: text('name'),
  email: text('email').notNull(),
  password: text('password'),
  emailVerified: timestamp('email_verified', { mode: 'date' }),
  image: text('image'),
  created_at: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  username: text('username').unique(),
  // Add social fields to users table
  bio: text('bio'),
  is_public: boolean('is_public').default(false).notNull(),
  language: languageEnum('language').default('en'),
  avatar_url: text('avatar_url'),
},
(table) => ({
  usersUsernameIdx: index('users_username_idx').on(table.username),
  usersEmailIdx: index('users_email_idx').on(table.email),
}));


export const accounts = pgTable(
  'accounts',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    provider: text('provider').notNull(),
    providerAccountId: text('provider_account_id').notNull(),
    refresh_token: text('refresh_token'),
    access_token: text('access_token'),
    expires_at: integer('expires_at'),
    token_type: text('token_type'),
    scope: text('scope'),
    id_token: text('id_token'),
    session_state: text('session_state'),
  },
  (account) => ({
    compoundKey: primaryKey({
      columns: [account.provider, account.providerAccountId],
    }),
    userIdIdx: index('accounts_user_id_idx').on(account.userId),
  })
);

export const sessions = pgTable(
  'sessions',
  {
    sessionToken: text('session_token').notNull().primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expires: timestamp('expires', { mode: 'date' }).notNull(),
  },
  (session) => ({
    userIdIdx: index('sessions_user_id_idx').on(session.userId),
  })
);

export const verificationTokens = pgTable(
  'verification_tokens',
  {
    identifier: text('identifier').notNull(),
    token: text('token').notNull(),
    expires: timestamp('expires', { mode: 'date' }).notNull(),
  },
  (vt) => ({
    compoundKey: primaryKey({
      columns: [vt.identifier, vt.token],
    }),
  })
);

// Declare tables in an order that avoids circular references
export const projectsTable = pgTable(
  'projects', 
  {
    uuid: uuid('uuid').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    active_profile_uuid: uuid('active_profile_uuid'),
    user_id: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (table) => ({ // Use object syntax for indexes
    projectsUserIdIdx: index('projects_user_id_idx').on(table.user_id),
  })
);

export const profilesTable = pgTable(
  'profiles',
  {
    uuid: uuid('uuid').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    project_uuid: uuid('project_uuid')
      .notNull()
      .references(() => projectsTable.uuid, { onDelete: 'cascade' }),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    language: languageEnum('language').default('en'),
    enabled_capabilities: profileCapabilityEnum('enabled_capabilities')
      .array()
    .notNull()
    .default(sql`'{}'::profile_capability[]`),
  // Removed bio, is_public, avatar_url, language from profiles
},
(table) => ({ // Use object syntax for indexes
  profilesProjectUuidIdx: index('profiles_project_uuid_idx').on(table.project_uuid),
  })
);

// Relations for projectsTable
export const projectsRelations = relations(projectsTable, ({ one, many }) => ({
  user: one(users, {
    fields: [projectsTable.user_id],
    references: [users.id],
  }),
  profiles: many(profilesTable),
  apiKeys: many(apiKeysTable),
  activeProfile: one(profilesTable, {
    fields: [projectsTable.active_profile_uuid],
    references: [profilesTable.uuid],
    relationName: 'activeProfile',
  }),
}));

// Relations for profilesTable
export const profilesRelations = relations(profilesTable, ({ one, many }) => ({
  project: one(projectsTable, {
    fields: [profilesTable.project_uuid],
    references: [projectsTable.uuid],
  }),
  mcpServers: many(mcpServersTable),
  customMcpServers: many(customMcpServersTable),
  docs: many(docsTable),
  playgroundSettings: one(playgroundSettingsTable, {
    fields: [profilesTable.uuid],
    references: [playgroundSettingsTable.profile_uuid],
  }),
  serverInstallations: many(serverInstallationsTable),
  // serverRatings: many(serverRatingsTable), // Removed relation
  auditLogs: many(auditLogsTable),
  notifications: many(notificationsTable),
  logRetentionPolicies: many(logRetentionPoliciesTable),
  // Removed followers/following relations from profiles
  sharedMcpServers: many(sharedMcpServersTable),
  sharedCollections: many(sharedCollectionsTable),
  embeddedChats: many(embeddedChatsTable),
}));


// Define the foreign key relationship after both tables are defined
export const projectsToProfilesRelation = {
  addActiveProfileForeignKey: () => sql`
    ALTER TABLE "projects" ADD CONSTRAINT "projects_active_profile_uuid_profiles_uuid_fk" 
    FOREIGN KEY ("active_profile_uuid") REFERENCES "profiles"("uuid") ON DELETE set null;
  `,
};

export const codesTable = pgTable(
  'codes', 
  {
    uuid: uuid('uuid').primaryKey().defaultRandom(),
    fileName: text('file_name').notNull(),
    code: text('code').notNull(),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    user_id: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (table) => ({ // Use object syntax for indexes
    codesUserIdIdx: index('codes_user_id_idx').on(table.user_id),
  })
);

export const codesRelations = relations(codesTable, ({ one }) => ({
  user: one(users, {
    fields: [codesTable.user_id],
    references: [users.id],
    relationName: 'codes',
  }),
}));

export const apiKeysTable = pgTable(
  'api_keys',
  {
    uuid: uuid('uuid').primaryKey().defaultRandom(),
    project_uuid: uuid('project_uuid')
      .notNull()
      .references(() => projectsTable.uuid, { onDelete: 'cascade' }),
    api_key: text('api_key').notNull().unique(),
    name: text('name').default('API Key'),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({ // Use object syntax for indexes
    apiKeysProjectUuidIdx: index('api_keys_project_uuid_idx').on(table.project_uuid),
  })
);

export const apiKeysRelations = relations(apiKeysTable, ({ one }) => ({
  project: one(projectsTable, {
    fields: [apiKeysTable.project_uuid],
    references: [projectsTable.uuid],
    relationName: 'apiKeys',
  }),
}));

export const mcpServersTable = pgTable(
  'mcp_servers',
  {
    uuid: uuid('uuid').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    description: text('description'),
    type: mcpServerTypeEnum('type').notNull().default(McpServerType.STDIO),
    command: text('command'),
    args: text('args')
      .array(),
    env: jsonb('env')
      .$type<{ [key: string]: string }>(),
    url: text('url'),
    // Encrypted fields
    command_encrypted: text('command_encrypted'),
    args_encrypted: text('args_encrypted'),
    env_encrypted: text('env_encrypted'),
    url_encrypted: text('url_encrypted'),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    profile_uuid: uuid('profile_uuid')
      .notNull()
      .references(() => profilesTable.uuid, { onDelete: 'cascade' }),
    status: mcpServerStatusEnum('status')
      .notNull()
      .default(McpServerStatus.ACTIVE),
    source: mcpServerSourceEnum('source')
      .notNull()
      .default(McpServerSource.PLUGGEDIN),
    external_id: text('external_id'),
    notes: text('notes'),
  },
  (table) => ({ // Use object syntax for indexes
    mcpServersStatusIdx: index('mcp_servers_status_idx').on(table.status),
    mcpServersProfileUuidIdx: index('mcp_servers_profile_uuid_idx').on(table.profile_uuid),
    mcpServersTypeIdx: index('mcp_servers_type_idx').on(table.type),
  })
);

export const mcpServersRelations = relations(mcpServersTable, ({ one, many }) => ({
  profile: one(profilesTable, {
    fields: [mcpServersTable.profile_uuid],
    references: [profilesTable.uuid],
  }),
  resourceTemplates: many(resourceTemplatesTable),
  serverInstallations: many(serverInstallationsTable),
  // serverRatings: many(serverRatingsTable), // Removed relation
  auditLogs: many(auditLogsTable),
  tools: many(toolsTable),
  resources: many(resourcesTable),
  prompts: many(promptsTable),
  customInstructions: one(customInstructionsTable, {
     fields: [mcpServersTable.uuid],
     references: [customInstructionsTable.mcp_server_uuid],
  }),
}));


export const customMcpServersTable = pgTable(
  'custom_mcp_servers',
  {
    uuid: uuid('uuid').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    description: text('description'),
    code_uuid: uuid('code_uuid')
      .notNull()
      .references(() => codesTable.uuid, { onDelete: 'cascade' }),
    additionalArgs: text('additional_args')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    env: jsonb('env')
      .$type<{ [key: string]: string }>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    profile_uuid: uuid('profile_uuid')
      .notNull()
      .references(() => profilesTable.uuid, { onDelete: 'cascade' }),
    status: mcpServerStatusEnum('status')
      .notNull()
      .default(McpServerStatus.ACTIVE),
  },
  (table) => ({ // Use object syntax for indexes
    customMcpServersStatusIdx: index('custom_mcp_servers_status_idx').on(table.status),
    customMcpServersProfileUuidIdx: index('custom_mcp_servers_profile_uuid_idx').on(table.profile_uuid),
  })
);

export const customMcpServersRelations = relations(customMcpServersTable, ({ one }) => ({
  profile: one(profilesTable, {
    fields: [customMcpServersTable.profile_uuid],
    references: [profilesTable.uuid],
  }),
  code: one(codesTable, {
    fields: [customMcpServersTable.code_uuid],
    references: [codesTable.uuid],
  }),
}));

export const passwordResetTokens = pgTable("password_reset_tokens", {
  identifier: text("identifier").notNull(),
  token: text("token").notNull().primaryKey(),
  expires: timestamp("expires", { mode: 'date' }).notNull(),
});

export const playgroundSettingsTable = pgTable(
  'playground_settings',
  {
    uuid: uuid('uuid').primaryKey().defaultRandom(),
    profile_uuid: uuid('profile_uuid')
      .notNull()
      .references(() => profilesTable.uuid, { onDelete: 'cascade' })
      .unique(),
    provider: text('provider').notNull().default('anthropic'),
    model: text('model').notNull().default('claude-3-7-sonnet-20250219'),
    temperature: integer('temperature').notNull().default(0),
    max_tokens: integer('max_tokens').notNull().default(1000),
    log_level: text('log_level').notNull().default('info'),
    rag_enabled: boolean('rag_enabled').notNull().default(false),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({ // Use object syntax for indexes
    playgroundSettingsProfileUuidIdx: index('playground_settings_profile_uuid_idx').on(table.profile_uuid),
  })
);

export const searchCacheTable = pgTable(
  'search_cache',
  {
     uuid: uuid('uuid').primaryKey().defaultRandom(),
     source: mcpServerSourceEnum('source').notNull(),
     query: text('query').notNull(),
     results: jsonb('results').notNull(),
     created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    expires_at: timestamp('expires_at', { withTimezone: true })
      .notNull(),
  },
  (table) => ({ // Use object syntax for indexes
    searchCacheSourceQueryIdx: index('search_cache_source_query_idx').on(table.source, table.query),
    searchCacheExpiresAtIdx: index('search_cache_expires_at_idx').on(table.expires_at),
  })
);

export const serverInstallationsTable = pgTable(
  'server_installations',
  {
    uuid: uuid('uuid').primaryKey().defaultRandom(),
    server_uuid: uuid('server_uuid')
       .references(() => mcpServersTable.uuid, { onDelete: 'cascade' }),
     external_id: text('external_id'),
     source: mcpServerSourceEnum('source').notNull(),
     profile_uuid: uuid('profile_uuid')
       .notNull()
       .references(() => profilesTable.uuid, { onDelete: 'cascade' }),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({ // Use object syntax for indexes
    serverInstallationsServerUuidIdx: index('server_installations_server_uuid_idx').on(table.server_uuid),
    serverInstallationsExternalIdSourceIdx: index('server_installations_external_id_source_idx').on(table.external_id, table.source),
    serverInstallationsProfileUuidIdx: index('server_installations_profile_uuid_idx').on(table.profile_uuid),
  })
);

export const serverInstallationsRelations = relations(serverInstallationsTable, ({ one }) => ({
  mcpServer: one(mcpServersTable, {
    fields: [serverInstallationsTable.server_uuid],
    references: [mcpServersTable.uuid],
  }),
  profile: one(profilesTable, {
    fields: [serverInstallationsTable.profile_uuid],
    references: [profilesTable.uuid],
  }),
}));

// --- Server Reviews Table ---
// Removed serverRatingsTable definition and relations
export const serverReviews = pgTable(
  'server_reviews',
  {
    uuid: uuid('uuid').primaryKey().defaultRandom(),
    server_source: mcpServerSourceEnum('server_source').notNull(),
    server_external_id: text('server_external_id').notNull(),
    user_id: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    rating: integer('rating').notNull(), // Assuming 1-5 rating
    comment: text('comment'),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    serverReviewsSourceExternalIdIdx: index('server_reviews_source_external_id_idx').on(table.server_source, table.server_external_id),
    serverReviewsUserIdIdx: index('server_reviews_user_id_idx').on(table.user_id),
    // Unique constraint per user per server (identified by source+external_id)
    serverReviewsUniqueUserServerIdx: unique('server_reviews_unique_user_server_idx').on(
      table.user_id,
      table.server_source,
      table.server_external_id
    ),
  })
);

export const serverReviewsRelations = relations(serverReviews, ({ one }) => ({
  user: one(users, {
    fields: [serverReviews.user_id],
    references: [users.id],
  }),
  // Optional: Add relation back to mcpServers if needed, though linking via source/external_id might be sufficient
  // mcpServer: one(mcpServersTable, { ... }) // This would require adding a server_uuid FK potentially
}));


export const auditLogsTable = pgTable("audit_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  profile_uuid: uuid("profile_uuid").references(() => profilesTable.uuid, { onDelete: "cascade" }),
  type: text("type").notNull(),
  action: text("action").notNull(),
  request_path: text("request_path"),
  request_method: text("request_method"),
  request_body: jsonb("request_body"),
  response_status: integer("response_status"),
  response_time_ms: integer("response_time_ms"),
  user_agent: text("user_agent"),
  ip_address: text("ip_address"),
  server_uuid: uuid("server_uuid").references(() => mcpServersTable.uuid),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  metadata: jsonb("metadata"),
},
(table) => ({ // Use object syntax for indexes
  auditLogsProfileUuidIdx: index('audit_logs_profile_uuid_idx').on(table.profile_uuid),
  auditLogsTypeIdx: index('audit_logs_type_idx').on(table.type),
  auditLogsCreatedAtIdx: index('audit_logs_created_at_idx').on(table.created_at),
}));

export const auditLogsRelations = relations(auditLogsTable, ({ one }) => ({
  profile: one(profilesTable, {
    fields: [auditLogsTable.profile_uuid],
    references: [profilesTable.uuid],
  }),
  mcpServer: one(mcpServersTable, {
    fields: [auditLogsTable.server_uuid],
    references: [mcpServersTable.uuid],
  }),
}));

export const notificationsTable = pgTable("notifications", {
  id: uuid("id").defaultRandom().primaryKey(),
  profile_uuid: uuid("profile_uuid").references(() => profilesTable.uuid, { onDelete: "cascade" }),
  type: text("type").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  read: boolean("read").default(false).notNull(),
  link: text("link"),
  severity: text("severity"), // For MCP notifications: INFO, SUCCESS, WARNING, ALERT
  completed: boolean("completed").default(false).notNull(), // For todo-style checkmarks on custom notifications
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  expires_at: timestamp("expires_at", { withTimezone: true }),
},
(table) => ({ // Use object syntax for indexes
  notificationsProfileUuidIdx: index('notifications_profile_uuid_idx').on(table.profile_uuid),
  notificationsReadIdx: index('notifications_read_idx').on(table.read),
  notificationsCreatedAtIdx: index('notifications_created_at_idx').on(table.created_at),
}));

export const notificationsRelations = relations(notificationsTable, ({ one }) => ({
  profile: one(profilesTable, {
    fields: [notificationsTable.profile_uuid],
    references: [profilesTable.uuid],
  }),
}));

export const systemLogsTable = pgTable("system_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  level: text("level").notNull(),
  source: text("source").notNull(),
  message: text("message").notNull(),
  details: jsonb("details"),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
},
(table) => ({ // Use object syntax for indexes
  systemLogsLevelIdx: index('system_logs_level_idx').on(table.level),
  systemLogsSourceIdx: index('system_logs_source_idx').on(table.source),
  systemLogsCreatedAtIdx: index('system_logs_created_at_idx').on(table.created_at),
}));

export const logRetentionPoliciesTable = pgTable("log_retention_policies", {
  id: uuid("id").defaultRandom().primaryKey(),
  profile_uuid: uuid("profile_uuid").references(() => profilesTable.uuid, { onDelete: "cascade" }),
  retention_days: integer("retention_days").default(7).notNull(),
  is_active: boolean("is_active").default(true).notNull(),
  created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
},
(table) => ({ // Use object syntax for indexes
  logRetentionPoliciesProfileUuidIdx: index('log_retention_policies_profile_uuid_idx').on(table.profile_uuid),
}));

export const logRetentionPoliciesRelations = relations(logRetentionPoliciesTable, ({ one }) => ({
  profile: one(profilesTable, {
    fields: [logRetentionPoliciesTable.profile_uuid],
    references: [profilesTable.uuid],
  }),
}));

export const toolsTable = pgTable(
  'tools',
  {
    uuid: uuid('uuid').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    description: text('description'),
    toolSchema: jsonb('tool_schema')
      .$type<{
        type: 'object';
        properties?: Record<string, any>;
        required?: string[];
      }>()
      .notNull(),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    mcp_server_uuid: uuid('mcp_server_uuid')
      .notNull()
      .references(() => mcpServersTable.uuid, { onDelete: 'cascade' }),
    status: toggleStatusEnum('status').notNull().default(ToggleStatus.ACTIVE),
  },
  (table) => ({ // Use object syntax for indexes
    toolsMcpServerUuidIdx: index('tools_mcp_server_uuid_idx').on(table.mcp_server_uuid),
    toolsUniqueToolNamePerServerIdx: unique('tools_unique_tool_name_per_server_idx').on(
      table.mcp_server_uuid,
      table.name
    ),
    toolsStatusIdx: index('tools_status_idx').on(table.status),
  })
);

export const resourceTemplatesTable = pgTable(
  'resource_templates',
  {
    uuid: uuid('uuid').primaryKey().defaultRandom(),
    mcp_server_uuid: uuid('mcp_server_uuid')
      .notNull()
      .references(() => mcpServersTable.uuid, { onDelete: 'cascade' }),
    uri_template: text('uri_template').notNull(),
    name: text('name'),
    description: text('description'),
    mime_type: text('mime_type'),
    template_variables: jsonb('template_variables')
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({ // Use object syntax for indexes
    resourceTemplatesMcpServerUuidIdx: index('resource_templates_mcp_server_uuid_idx').on(table.mcp_server_uuid),
  })
);

export const resourceTemplatesRelations = relations(resourceTemplatesTable, ({ one }) => ({
  mcpServer: one(mcpServersTable, {
    fields: [resourceTemplatesTable.mcp_server_uuid],
    references: [mcpServersTable.uuid],
  }),
}));

export const resourcesTable = pgTable(
  'resources',
  {
    uuid: uuid('uuid').primaryKey().defaultRandom(),
    mcp_server_uuid: uuid('mcp_server_uuid')
      .notNull()
      .references(() => mcpServersTable.uuid, { onDelete: 'cascade' }),
    uri: text('uri').notNull(),
    name: text('name'),
    description: text('description'),
    mime_type: text('mime_type'),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    status: toggleStatusEnum('status').notNull().default(ToggleStatus.ACTIVE), 
  },
  (table) => ({ // Use object syntax for indexes
    resourcesMcpServerUuidIdx: index('resources_mcp_server_uuid_idx').on(table.mcp_server_uuid),
    resourcesUniqueUriPerServerIdx: unique('resources_unique_uri_per_server_idx').on(
      table.mcp_server_uuid,
      table.uri
    ),
    resourcesStatusIdx: index('resources_status_idx').on(table.status),
  })
);

export const resourcesRelations = relations(resourcesTable, ({ one }) => ({
  mcpServer: one(mcpServersTable, {
    fields: [resourcesTable.mcp_server_uuid],
    references: [mcpServersTable.uuid],
  }),
}));

export const toolsRelations = relations(toolsTable, ({ one }) => ({
  mcpServer: one(mcpServersTable, {
    fields: [toolsTable.mcp_server_uuid],
    references: [mcpServersTable.uuid],
  }),
}));

export const promptsTable = pgTable(
  'prompts',
  {
    uuid: uuid('uuid').primaryKey().defaultRandom(),
    mcp_server_uuid: uuid('mcp_server_uuid')
      .notNull()
      .references(() => mcpServersTable.uuid, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    arguments_schema: jsonb('arguments_schema')
      .$type<Array<{ name: string; description?: string; required?: boolean }>>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({ // Use object syntax for indexes
    promptsMcpServerUuidIdx: index('prompts_mcp_server_uuid_idx').on(table.mcp_server_uuid),
    promptsUniquePromptNamePerServerIdx: unique('prompts_unique_prompt_name_per_server_idx').on(
      table.mcp_server_uuid,
      table.name
    ),
  })
);

export const promptsRelations = relations(promptsTable, ({ one }) => ({
  mcpServer: one(mcpServersTable, {
    fields: [promptsTable.mcp_server_uuid],
    references: [mcpServersTable.uuid],
  }),
}));

export const customInstructionsTable = pgTable(
  'custom_instructions',
  {
    uuid: uuid('uuid').primaryKey().defaultRandom(),
    mcp_server_uuid: uuid('mcp_server_uuid')
      .notNull()
      .references(() => mcpServersTable.uuid, { onDelete: 'cascade' })
      .unique(),
    description: text('description').default('Custom instructions for this server'),
    messages: jsonb('messages')
      .$type<McpMessage[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({ // Use object syntax for indexes
    // Index handled by unique constraint on mcp_server_uuid
  })
);

export const customInstructionsRelations = relations(customInstructionsTable, ({ one }) => ({
  mcpServer: one(mcpServersTable, {
    fields: [customInstructionsTable.mcp_server_uuid],
    references: [mcpServersTable.uuid],
  }),
}));

export const docsTable = pgTable(
  'docs',
  {
    uuid: uuid('uuid').primaryKey().defaultRandom(),
    user_id: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    project_uuid: uuid('project_uuid')
      .references(() => projectsTable.uuid, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    file_name: text('file_name').notNull(),
    file_size: integer('file_size').notNull(),
    mime_type: text('mime_type').notNull(),
    file_path: text('file_path').notNull(),
    tags: text('tags').array().default(sql`'{}'::text[]`),
    rag_document_id: text('rag_document_id'),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    docsUserIdIdx: index('docs_user_id_idx').on(table.user_id),
    docsProjectUuidIdx: index('docs_project_uuid_idx').on(table.project_uuid),
    docsNameIdx: index('docs_name_idx').on(table.name),
    docsCreatedAtIdx: index('docs_created_at_idx').on(table.created_at),
  })
);

export const docsRelations = relations(docsTable, ({ one }) => ({
  user: one(users, {
    fields: [docsTable.user_id],
    references: [users.id],
  }),
  project: one(projectsTable, {
    fields: [docsTable.project_uuid],
    references: [projectsTable.uuid],
  }),
}));

export const releaseNotes = pgTable('release_notes', {
  id: serial('id').primaryKey(),
  repository: text('repository').notNull(),
  version: text('version').notNull(),
  releaseDate: timestamp('release_date', { withTimezone: true }).notNull(),
  content: jsonb('content').notNull(),
  commitSha: text('commit_sha').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const usersRelations = relations(users, ({ many }) => ({
	accounts: many(accounts),
  sessions: many(sessions),
  projects: many(projectsTable),
  codes: many(codesTable),
  docs: many(docsTable),
  // Add followers/following relations to users
  followers: many(followersTable, { relationName: 'followers' }), 
  following: many(followersTable, { relationName: 'following' }), 
}));

export const mcpServersPromptsRelations = relations(mcpServersTable, ({ one, many }) => ({
  prompts: many(promptsTable),
  customInstructions: one(customInstructionsTable, {
     fields: [mcpServersTable.uuid],
     references: [customInstructionsTable.mcp_server_uuid],
  }),
}));


export const accountsRelations = relations(accounts, ({ one }) => ({
	user: one(users, {
		fields: [accounts.userId],
		references: [users.id],
	}),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));

// ===== Social Feature Tables =====

export const followersTable = pgTable(
  'followers',
  {
    uuid: uuid('uuid').primaryKey().defaultRandom(),
    // Change to reference users table
    follower_user_id: text('follower_user_id') 
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    followed_user_id: text('followed_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({ // Use object syntax for indexes and update names
    followersFollowerUserIdIdx: index('followers_follower_user_id_idx').on(table.follower_user_id),
    followersFollowedUserIdIdx: index('followers_followed_user_id_idx').on(table.followed_user_id),
    followersUniqueUserRelationshipIdx: unique('followers_unique_user_relationship_idx').on(
      table.follower_user_id,
      table.followed_user_id
    ),
  })
);

export const followersRelations = relations(followersTable, ({ one }) => ({
  // Update relations to point to users table
  followerUser: one(users, { 
    fields: [followersTable.follower_user_id],
    references: [users.id],
    relationName: 'following' // User is following others
  }),
  followedUser: one(users, { 
    fields: [followersTable.followed_user_id],
    references: [users.id],
    relationName: 'followers' // User is followed by others
  }),
}));

export const sharedMcpServersTable = pgTable(
  'shared_mcp_servers',
  {
    uuid: uuid('uuid').primaryKey().defaultRandom(),
    profile_uuid: uuid('profile_uuid')
      .notNull()
      .references(() => profilesTable.uuid, { onDelete: 'cascade' }),
    server_uuid: uuid('server_uuid')
      .notNull()
      .references(() => mcpServersTable.uuid, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    is_public: boolean('is_public').default(true).notNull(),
    template: jsonb('template')
      .$type<any>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    requires_credentials: boolean('requires_credentials').default(false).notNull(),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({ // Use object syntax for indexes
    sharedMcpServersProfileUuidIdx: index('shared_mcp_servers_profile_uuid_idx').on(table.profile_uuid),
    sharedMcpServersServerUuidIdx: index('shared_mcp_servers_server_uuid_idx').on(table.server_uuid),
    sharedMcpServersIsPublicIdx: index('shared_mcp_servers_is_public_idx').on(table.is_public),
  })
);

export const sharedMcpServersRelations = relations(sharedMcpServersTable, ({ one }) => ({
  profile: one(profilesTable, {
    fields: [sharedMcpServersTable.profile_uuid],
    references: [profilesTable.uuid],
  }),
  server: one(mcpServersTable, {
    fields: [sharedMcpServersTable.server_uuid],
    references: [mcpServersTable.uuid],
  }),
}));

export const sharedCollectionsTable = pgTable(
  'shared_collections',
  {
    uuid: uuid('uuid').primaryKey().defaultRandom(),
    profile_uuid: uuid('profile_uuid')
      .notNull()
      .references(() => profilesTable.uuid, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    content: jsonb('content').notNull(),
    is_public: boolean('is_public').default(true).notNull(),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({ // Use object syntax for indexes
    sharedCollectionsProfileUuidIdx: index('shared_collections_profile_uuid_idx').on(table.profile_uuid),
    sharedCollectionsIsPublicIdx: index('shared_collections_is_public_idx').on(table.is_public),
  })
);

export const sharedCollectionsRelations = relations(sharedCollectionsTable, ({ one }) => ({
  profile: one(profilesTable, {
    fields: [sharedCollectionsTable.profile_uuid],
    references: [profilesTable.uuid],
  }),
}));

export const embeddedChatsTable = pgTable(
  'embedded_chats',
  {
    uuid: uuid('uuid').primaryKey().defaultRandom(),
    profile_uuid: uuid('profile_uuid')
      .notNull()
      .references(() => profilesTable.uuid, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    settings: jsonb('settings')
      .$type<{ [key: string]: any }>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    is_public: boolean('is_public').default(true).notNull(),
    is_active: boolean('is_active').default(true).notNull(),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({ // Use object syntax for indexes
    embeddedChatsProfileUuidIdx: index('embedded_chats_profile_uuid_idx').on(table.profile_uuid),
    embeddedChatsIsPublicIdx: index('embedded_chats_is_public_idx').on(table.is_public),
    embeddedChatsIsActiveIdx: index('embedded_chats_is_active_idx').on(table.is_active),
  })
);

export const embeddedChatsRelations = relations(embeddedChatsTable, ({ one }) => ({
  profile: one(profilesTable, {
    fields: [embeddedChatsTable.profile_uuid],
    references: [profilesTable.uuid],
  }),
}));

// Removed duplicate profilesRelationsWithSocial definition

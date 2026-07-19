-- Qahramon O'qituvchilar — MVP schema
-- Enables trigram matching used by the recommendation-first teacher dedup logic.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============ ENUMS ============
CREATE TYPE user_role AS ENUM ('user', 'moderator', 'editor', 'admin');
CREATE TYPE locale AS ENUM ('uz-latn', 'uz-cyrl', 'ru', 'en');
CREATE TYPE publish_status AS ENUM ('draft', 'review', 'published', 'archived');
CREATE TYPE relationship AS ENUM (
  'student', 'former_student', 'parent', 'colleague',
  'school_leader', 'community_member', 'self'
);
CREATE TYPE submission_type AS ENUM ('self', 'nominated');
-- Moderator queue workflow: NEW -> UNDER_REVIEW -> APPROVED / REJECTED.
-- PUBLISHED is reserved for when the teacher profile is promoted by an editor.
CREATE TYPE recommendation_status AS ENUM ('new', 'under_review', 'approved', 'rejected', 'published');
CREATE TYPE media_type AS ENUM ('photo', 'video', 'document');
CREATE TYPE storage_provider AS ENUM ('telegram', 'r2');
CREATE TYPE bot_type AS ENUM ('public', 'admin');
CREATE TYPE flow_type AS ENUM ('none', 'nomination', 'self_submission', 'moderation_review');
CREATE TYPE content_type AS ENUM ('telegram_post', 'instagram_reel_script', 'article', 'documentary_script');
CREATE TYPE content_status AS ENUM ('draft', 'approved', 'published');
CREATE TYPE duplicate_status AS ENUM ('pending', 'confirmed_duplicate', 'not_duplicate');

-- ============ REFERENCE DATA ============
CREATE TABLE regions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code varchar(10) NOT NULL UNIQUE,
  name_uz_latn varchar(100) NOT NULL,
  name_uz_cyrl varchar(100),
  name_ru varchar(100),
  name_en varchar(100),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE districts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  region_id uuid NOT NULL REFERENCES regions(id),
  code varchar(10),
  name_uz_latn varchar(100) NOT NULL,
  name_uz_cyrl varchar(100),
  name_ru varchar(100),
  name_en varchar(100),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX districts_region_idx ON districts(region_id);

-- ============ USERS ============
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id bigint NOT NULL UNIQUE,
  username varchar(64),
  first_name varchar(128),
  last_name varchar(128),
  phone varchar(20),
  role user_role NOT NULL DEFAULT 'user',
  locale locale NOT NULL DEFAULT 'uz-latn',
  is_banned boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============ TEACHERS (recommendation-first: never inserted directly by end users) ============
CREATE TABLE teachers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name varchar(255) NOT NULL,
  normalized_name varchar(255) NOT NULL,
  region_id uuid REFERENCES regions(id),
  district_id uuid REFERENCES districts(id),
  school varchar(255),
  subject varchar(128),
  position varchar(128),
  years_of_experience integer,
  biography text,
  achievements text,
  educational_philosophy text,
  impact_stories text,
  publish_status publish_status NOT NULL DEFAULT 'draft',
  merged_into_teacher_id uuid REFERENCES teachers(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX teachers_normalized_name_idx ON teachers(normalized_name);
CREATE INDEX teachers_normalized_name_trgm_idx ON teachers USING gin (normalized_name gin_trgm_ops);
CREATE INDEX teachers_region_district_idx ON teachers(region_id, district_id);
CREATE INDEX teachers_publish_status_idx ON teachers(publish_status);
CREATE INDEX teachers_merged_into_idx ON teachers(merged_into_teacher_id);

-- ============ RECOMMENDATIONS ============
CREATE TABLE recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES teachers(id),
  submitted_by_user_id uuid REFERENCES users(id),

  recommender_name varchar(255),
  recommender_phone varchar(20), -- optional by design, never required in the bot flow
  relationship relationship,
  submission_type submission_type NOT NULL,
  recommendation_text text,

  achievements_text text,
  teaching_methods_text text,
  student_impact_text text,
  evidence_text text,
  additional_info text,

  status recommendation_status NOT NULL DEFAULT 'new',
  moderation_notes text,
  moderated_by uuid REFERENCES users(id),
  moderated_at timestamptz,

  consent_given boolean NOT NULL DEFAULT false,
  consent_given_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX recommendations_teacher_idx ON recommendations(teacher_id);
CREATE INDEX recommendations_status_idx ON recommendations(status);

-- ============ MEDIA ============
-- Business rule H: media attaches ONLY to a recommendation, never directly to a
-- teacher. A teacher's media set is always the union of media across all of its
-- recommendations — this makes "nothing is ever deleted or overwritten" true by
-- construction, since there's no teacher-level media row that could be replaced.
CREATE TABLE media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recommendation_id uuid NOT NULL REFERENCES recommendations(id),
  media_type media_type NOT NULL,
  storage_provider storage_provider NOT NULL DEFAULT 'telegram',
  telegram_file_id varchar(255),
  telegram_file_unique_id varchar(255),
  r2_key varchar(512),
  is_public boolean NOT NULL DEFAULT false,
  uploaded_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX media_recommendation_idx ON media(recommendation_id);

-- ============ AUDIT LOGS ============
CREATE TABLE audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES users(id),
  action varchar(128) NOT NULL,
  entity_type varchar(64) NOT NULL,
  entity_id uuid,
  before_state jsonb,
  after_state jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_entity_idx ON audit_logs(entity_type, entity_id);

-- ============ BOT SESSIONS (conversation state) ============
CREATE TABLE bot_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  bot_type bot_type NOT NULL,
  flow_type flow_type NOT NULL DEFAULT 'none',
  current_step varchar(64),
  collected_data jsonb NOT NULL DEFAULT '{}',
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX bot_sessions_user_idx ON bot_sessions(user_id, bot_type);

-- ============ FUTURE-READY (empty, unused by MVP logic) ============
CREATE TABLE generated_content (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES teachers(id),
  content_type content_type NOT NULL,
  status content_status NOT NULL DEFAULT 'draft',
  ai_model varchar(64),
  prompt_version varchar(32),
  content_text text,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE duplicate_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id_a uuid NOT NULL REFERENCES teachers(id),
  teacher_id_b uuid NOT NULL REFERENCES teachers(id),
  similarity_score numeric(5, 2),
  status duplicate_status NOT NULL DEFAULT 'pending',
  reviewed_by uuid REFERENCES users(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

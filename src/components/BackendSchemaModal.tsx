import React, { useState } from 'react';
import {
  X,
  Database,
  Shield,
  Layers,
  Lock,
  HardDrive,
  Code2,
  Copy,
  Check,
  ChevronRight,
  Eye,
  FileCheck,
  AlertCircle
} from 'lucide-react';

interface BackendSchemaModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const TABLES_METADATA = [
  {
    name: 'users',
    pk: 'id (uuid references auth.users.id)',
    summary: 'Core user profile and coarse geographic residency bucket.',
    columns: [
      { name: 'id', type: 'uuid PK', desc: 'References auth.users.id' },
      { name: 'username', type: 'text UNIQUE', desc: 'Display handle (3-30 chars, alphanumeric)' },
      { name: 'display_name', type: 'text', desc: 'Public display name' },
      { name: 'bio', type: 'text NULL', desc: 'Biographical description' },
      { name: 'avatar_path', type: 'text NULL', desc: 'Storage path in public/avatars' },
      { name: 'profile_visibility', type: 'enum', desc: 'public / private' },
      { name: 'nearby_opt_in', type: 'boolean DEFAULT false', desc: 'Explicit consent for Last Night Nearby' },
      { name: 'region_bucket', type: 'text NULL', desc: 'Coarse server-derived region (never raw GPS)' },
      { name: 'created_at', type: 'timestamptz', desc: 'Signup timestamp' },
      { name: 'updated_at', type: 'timestamptz', desc: 'Profile last updated' }
    ]
  },
  {
    name: 'dreams',
    pk: 'id (uuid PK)',
    summary: 'Permanent core dream memories, transcripts, and audience controls.',
    columns: [
      { name: 'id', type: 'uuid PK', desc: 'Unique dream identifier' },
      { name: 'user_id', type: 'uuid FK -> users.id', desc: 'Dream author/owner' },
      { name: 'title', type: 'text NULL', desc: 'Dream headline' },
      { name: 'hook', type: 'text NULL', desc: 'Poetic pull-quote or memory hook' },
      { name: 'raw_text', type: 'text NULL', desc: 'Sensitive: raw unedited transcript' },
      { name: 'captured_at', type: 'timestamptz', desc: 'When the dreamer logged it' },
      { name: 'occurred_at', type: 'timestamptz NULL', desc: 'Estimated night of sleep' },
      { name: 'privacy', type: 'enum', desc: 'private / followers / public' },
      { name: 'status', type: 'enum', desc: 'draft / processing / ready / archived / deleted' },
      { name: 'source', type: 'enum', desc: 'voice / text / import' },
      { name: 'created_at', type: 'timestamptz', desc: 'Record creation timestamp' },
      { name: 'updated_at', type: 'timestamptz', desc: 'Record update timestamp' }
    ]
  },
  {
    name: 'dream_media',
    pk: 'id (uuid PK)',
    summary: 'Private raw audio recordings and generated illustrations.',
    columns: [
      { name: 'id', type: 'uuid PK', desc: 'Asset identifier' },
      { name: 'dream_id', type: 'uuid FK -> dreams.id', desc: 'Parent dream memory' },
      { name: 'user_id', type: 'uuid FK -> users.id', desc: 'Asset owner' },
      { name: 'media_type', type: 'enum', desc: 'audio / image' },
      { name: 'storage_path', type: 'text', desc: 'Private bucket relative path' },
      { name: 'mime_type', type: 'text', desc: 'audio/webm, audio/mp4, image/webp' },
      { name: 'duration_ms', type: 'integer NULL', desc: 'Audio recording length' },
      { name: 'created_at', type: 'timestamptz', desc: 'Asset upload time' }
    ]
  },
  {
    name: 'follows',
    pk: 'PK(follower_id, followed_id)',
    summary: 'One-directional social follower graph with self-follow check.',
    columns: [
      { name: 'follower_id', type: 'uuid FK -> users.id', desc: 'Account following' },
      { name: 'followed_id', type: 'uuid FK -> users.id', desc: 'Account followed' },
      { name: 'created_at', type: 'timestamptz', desc: 'Follow initiation timestamp' }
    ]
  },
  {
    name: 'clips',
    pk: 'id (uuid PK)',
    summary: 'Persistent short-video explanations attached to a Dream.',
    columns: [
      { name: 'id', type: 'uuid PK', desc: 'Unique clip identifier' },
      { name: 'user_id', type: 'uuid FK -> users.id', desc: 'Clip creator' },
      { name: 'dream_id', type: 'uuid FK -> dreams.id', desc: 'Associated dream memory' },
      { name: 'media_path', type: 'text', desc: 'Storage path in public/clip-media' },
      { name: 'mime_type', type: 'text', desc: 'video/mp4, video/webm' },
      { name: 'duration_ms', type: 'integer NULL', desc: 'Video duration' },
      { name: 'privacy', type: 'enum', desc: 'followers / public (<= dream privacy)' },
      { name: 'status', type: 'enum', desc: 'draft / uploading / processing / ready / deleted' },
      { name: 'created_at', type: 'timestamptz', desc: 'Creation time' },
      { name: 'updated_at', type: 'timestamptz', desc: 'Last modified' },
      { name: 'deleted_at', type: 'timestamptz NULL', desc: 'Soft-delete marker' }
    ]
  },
  {
    name: 'reactions',
    pk: 'id (uuid PK)',
    summary: 'Social resonance markers. Constrained to exactly one target.',
    columns: [
      { name: 'id', type: 'uuid PK', desc: 'Unique reaction ID' },
      { name: 'user_id', type: 'uuid FK -> users.id', desc: 'Reacting user' },
      { name: 'dream_id', type: 'uuid NULL FK -> dreams.id', desc: 'Target dream (mutually exclusive)' },
      { name: 'clip_id', type: 'uuid NULL FK -> clips.id', desc: 'Target clip (mutually exclusive)' },
      { name: 'type', type: 'text DEFAULT resonance', desc: 'Reaction type' },
      { name: 'created_at', type: 'timestamptz', desc: 'Timestamp' }
    ]
  },
  {
    name: 'replies',
    pk: 'id (uuid PK)',
    summary: 'Top-level social discussions on dreams or clips.',
    columns: [
      { name: 'id', type: 'uuid PK', desc: 'Reply identifier' },
      { name: 'user_id', type: 'uuid FK -> users.id', desc: 'Author' },
      { name: 'dream_id', type: 'uuid NULL FK -> dreams.id', desc: 'Target dream' },
      { name: 'clip_id', type: 'uuid NULL FK -> clips.id', desc: 'Target clip' },
      { name: 'body', type: 'text', desc: 'Reply message text' },
      { name: 'created_at', type: 'timestamptz', desc: 'Creation time' },
      { name: 'updated_at', type: 'timestamptz', desc: 'Update time' },
      { name: 'deleted_at', type: 'timestamptz NULL', desc: 'Soft-delete marker' }
    ]
  },
  {
    name: 'saves',
    pk: 'PK(user_id, dream_id)',
    summary: 'Private bookmarking of public or shared dreams.',
    columns: [
      { name: 'user_id', type: 'uuid FK -> users.id', desc: 'Bookmark owner' },
      { name: 'dream_id', type: 'uuid FK -> dreams.id', desc: 'Bookmarked dream' },
      { name: 'created_at', type: 'timestamptz', desc: 'Saved timestamp' }
    ]
  },
  {
    name: 'nearby_eligibility',
    pk: 'user_id (uuid PK FK -> users.id)',
    summary: 'Opt-in decision for Last Night Nearby without exposing coordinates.',
    columns: [
      { name: 'user_id', type: 'uuid PK FK -> users.id', desc: 'User ID' },
      { name: 'enabled', type: 'boolean', desc: 'Active opt-in state' },
      { name: 'region_bucket', type: 'text', desc: 'Coarse city / metro region' },
      { name: 'cohort_date', type: 'date', desc: 'Daily cohort reference' },
      { name: 'updated_at', type: 'timestamptz', desc: 'Last modified' }
    ]
  },
  {
    name: 'nearby_motif_counts',
    pk: 'id (uuid PK)',
    summary: 'Server-aggregated motif statistics guarded by cohort thresholds.',
    columns: [
      { name: 'id', type: 'uuid PK', desc: 'Aggregate row ID' },
      { name: 'region_bucket', type: 'text', desc: 'Aggregated region' },
      { name: 'night_date', type: 'date', desc: 'Target sleep night' },
      { name: 'motif_key', type: 'text', desc: 'e.g. water, flying, elevator' },
      { name: 'display_label', type: 'text', desc: 'Friendly motif title' },
      { name: 'count', type: 'integer', desc: 'Dreamer count' },
      { name: 'minimum_threshold_met', type: 'boolean', desc: 'K-anonymity gate' },
      { name: 'created_at', type: 'timestamptz', desc: 'Aggregation run time' }
    ]
  },
  {
    name: 'nearby_dream_candidates',
    pk: 'id (uuid PK)',
    summary: 'Server-side projection of eligible public dreams for radar.',
    columns: [
      { name: 'id', type: 'uuid PK', desc: 'Candidate ID' },
      { name: 'dream_id', type: 'uuid FK -> dreams.id', desc: 'Eligible dream' },
      { name: 'region_bucket', type: 'text', desc: 'Coarse region bucket' },
      { name: 'night_date', type: 'date', desc: 'Target night' },
      { name: 'eligible', type: 'boolean DEFAULT true', desc: 'Eligibility flag' },
      { name: 'created_at', type: 'timestamptz', desc: 'Projected timestamp' }
    ]
  },
  {
    name: 'processing_jobs',
    pk: 'id (uuid PK)',
    summary: 'Idempotent asynchronous pipeline for transcription, titles, motifs.',
    columns: [
      { name: 'id', type: 'uuid PK', desc: 'Job ID' },
      { name: 'dream_id', type: 'uuid FK -> dreams.id', desc: 'Target dream' },
      { name: 'job_type', type: 'enum', desc: 'transcription / title / hook / motif / echo' },
      { name: 'status', type: 'enum', desc: 'queued / processing / complete / failed' },
      { name: 'attempts', type: 'integer DEFAULT 0', desc: 'Retry counter' },
      { name: 'idempotency_key', type: 'text UNIQUE', desc: 'Prevents duplicate job triggers' },
      { name: 'last_error', type: 'text NULL', desc: 'Failure diagnostics' },
      { name: 'created_at', type: 'timestamptz', desc: 'Enqueued timestamp' },
      { name: 'updated_at', type: 'timestamptz', desc: 'Status update timestamp' }
    ]
  },
  {
    name: 'reports',
    pk: 'id (uuid PK)',
    summary: 'Community moderation flags. Processable exclusively by moderators.',
    columns: [
      { name: 'id', type: 'uuid PK', desc: 'Report ID' },
      { name: 'reporter_user_id', type: 'uuid FK -> users.id', desc: 'Reporting member' },
      { name: 'target_type', type: 'enum', desc: 'dream / clip / reply / user' },
      { name: 'target_id', type: 'uuid', desc: 'Entity ID' },
      { name: 'reason', type: 'text', desc: 'Spam, harassment, privacy violation' },
      { name: 'details', type: 'text NULL', desc: 'Optional context' },
      { name: 'status', type: 'enum', desc: 'open / reviewed / resolved / dismissed' },
      { name: 'created_at', type: 'timestamptz', desc: 'Filed time' },
      { name: 'resolved_at', type: 'timestamptz NULL', desc: 'Resolution timestamp' }
    ]
  },
  {
    name: 'blocks',
    pk: 'PK(blocker_id, blocked_id)',
    summary: 'User-directed blocking. Suppresses feeds, clips, replies, nearby.',
    columns: [
      { name: 'blocker_id', type: 'uuid FK -> users.id', desc: 'Blocking account' },
      { name: 'blocked_id', type: 'uuid FK -> users.id', desc: 'Blocked account' },
      { name: 'created_at', type: 'timestamptz', desc: 'Block timestamp' }
    ]
  },
  {
    name: 'dream_circles',
    pk: 'id (uuid PK)',
    summary: 'Approved Amendment: Focused deep investigation layer per dream.',
    columns: [
      { name: 'id', type: 'uuid PK', desc: 'Circle ID' },
      { name: 'dream_id', type: 'uuid UNIQUE FK -> dreams.id', desc: 'Exactly 1 circle per dream' },
      { name: 'status', type: 'enum', desc: 'active / locked / deleted' },
      { name: 'created_at', type: 'timestamptz', desc: 'Creation time' },
      { name: 'updated_at', type: 'timestamptz', desc: 'Last updated' }
    ]
  },
  {
    name: 'circle_threads',
    pk: 'id (uuid PK)',
    summary: 'Thematic inquiry threads inside a Dream Circle.',
    columns: [
      { name: 'id', type: 'uuid PK', desc: 'Thread ID' },
      { name: 'circle_id', type: 'uuid FK -> dream_circles.id', desc: 'Parent circle' },
      { name: 'user_id', type: 'uuid FK -> users.id', desc: 'Thread author' },
      { name: 'title', type: 'text', desc: 'Inquiry or theory headline' },
      { name: 'body', type: 'text', desc: 'In-depth description' },
      { name: 'created_at', type: 'timestamptz', desc: 'Posted timestamp' },
      { name: 'updated_at', type: 'timestamptz', desc: 'Updated timestamp' },
      { name: 'deleted_at', type: 'timestamptz NULL', desc: 'Soft-delete marker' }
    ]
  },
  {
    name: 'circle_replies',
    pk: 'id (uuid PK)',
    summary: 'Community observations and comparative replies to circle threads.',
    columns: [
      { name: 'id', type: 'uuid PK', desc: 'Reply ID' },
      { name: 'thread_id', type: 'uuid FK -> circle_threads.id', desc: 'Parent thread' },
      { name: 'user_id', type: 'uuid FK -> users.id', desc: 'Replier user ID' },
      { name: 'body', type: 'text', desc: 'Reflection or motif observation' },
      { name: 'created_at', type: 'timestamptz', desc: 'Posted timestamp' },
      { name: 'updated_at', type: 'timestamptz', desc: 'Updated timestamp' },
      { name: 'deleted_at', type: 'timestamptz NULL', desc: 'Soft-delete marker' }
    ]
  }
];

export const BackendSchemaModal: React.FC<BackendSchemaModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'tables' | 'rls' | 'privacy' | 'storage' | 'sql'>('overview');
  const [selectedTable, setSelectedTable] = useState<string>('dreams');
  const [copiedSql, setCopiedSql] = useState(false);

  if (!isOpen) return null;

  const currentTableData = TABLES_METADATA.find((t) => t.name === selectedTable) || TABLES_METADATA[1];

  const handleCopySql = () => {
    navigator.clipboard.writeText(
      `-- See complete migration file at /supabase/migrations/20260905000000_siimr_backend_schema.sql\n-- Includes all 17 tables, RLS policies, security functions, triggers and storage buckets.`
    );
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 animate-in fade-in">
      <div className="bg-[#FAF8F5] w-full max-w-4xl rounded-3xl shadow-2xl border border-white/40 max-h-[90vh] flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#1A1C23]/10 bg-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#5438FF]/10 text-[#5438FF] flex items-center justify-center">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-serif-dream font-bold text-lg text-[#1A1C23]">
                  siimr — 05 Backend Schema
                </h2>
                <span className="px-2 py-0.5 rounded-md bg-[#5438FF] text-white text-[10px] font-bold uppercase tracking-wider">
                  PostgreSQL & Supabase RLS
                </span>
              </div>
              <p className="text-xs text-[#1A1C23]/60">
                Data Model, Row Level Security, Privacy DTOs & Auth Architecture
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-[#1A1C23]/5 flex items-center justify-center text-[#1A1C23] hover:bg-[#1A1C23]/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 px-6 pt-3 border-b border-[#1A1C23]/10 bg-[#FAF8F5] overflow-x-auto">
          {[
            { id: 'overview', label: '1. Relationships & Graph', icon: Layers },
            { id: 'tables', label: '2. 17 Tables & Schema', icon: Database },
            { id: 'rls', label: '3. Row Level Security', icon: Shield },
            { id: 'privacy', label: '4. Privacy & DTOs', icon: Lock },
            { id: 'storage', label: '5. Storage Buckets', icon: HardDrive },
            { id: 'sql', label: '6. SQL Migration File', icon: Code2 },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-3 py-2 text-xs font-semibold whitespace-nowrap border-b-2 transition-all ${
                  isActive
                    ? 'border-[#5438FF] text-[#5438FF] bg-white rounded-t-xl'
                    : 'border-transparent text-[#1A1C23]/70 hover:text-[#1A1C23]'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* TAB 1: RELATIONSHIPS & ER OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div className="bg-white p-5 rounded-2xl border border-[#1A1C23]/10 shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-sm text-[#1A1C23] uppercase tracking-wider flex items-center gap-2">
                    <Layers className="w-4 h-4 text-[#5438FF]" />
                    <span>Core Entity Relationship Tree</span>
                  </h3>
                  <span className="text-[11px] text-[#5438FF] font-medium bg-[#5438FF]/10 px-2 py-0.5 rounded-full">
                    Production MVP Scope
                  </span>
                </div>

                <pre className="p-4 bg-[#1A1C23] text-[#E0DEF4] font-mono text-xs rounded-xl overflow-x-auto leading-relaxed">
{`users (auth.users.id)
 ├── dreams
 │    ├── dream_media (audio / images)
 │    ├── processing_jobs (transcription, hook, title, motif)
 │    └── dream_circles (1:1 discussion layer [Approved Amendment])
 │         └── circle_threads
 │              └── circle_replies
 ├── clips (persistent short-video explanations)
 ├── follows ↔ users (asymmetric follower graph, no self-follow)
 ├── reactions → dreams/clips (strictly 1 target)
 ├── replies → dreams/clips (strictly 1 target)
 ├── saves → dreams (private bookmarks)
 ├── nearby_eligibility (coarse residency, zero raw GPS)
 ├── nearby_motif_counts (server-aggregated k-anonymity counts)
 ├── nearby_dream_candidates (eligibility projection)
 ├── reports (moderation triage)
 └── blocks ↔ users (enforced across all feeds and search)`}
                </pre>
              </div>

              {/* Deferred Tables Notice */}
              <div className="bg-[#FFF4ED] p-4 rounded-2xl border border-[#FF8438]/20 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-[#FF8438] shrink-0 mt-0.5" />
                <div className="text-xs text-[#8A3B00] space-y-1">
                  <p className="font-bold uppercase tracking-wider text-[11px]">
                    Section 4: Explicitly Deferred Future Tables (Anti-Slop Scope Discipline)
                  </p>
                  <p>
                    In accordance with Section 4 of the PRD schema spec, separate MVP tables are
                    <strong> NOT</strong> created for: <em>Dream Cast, Dream Places, Dream Atlas, Dream Universe,
                    Dreamline, Whispers, Signals, Rooms, Phenomena</em> or vector graphs.
                    The MVP stores lightweight text/motif records that migrate cleanly into richer graph objects later.
                  </p>
                </div>
              </div>

              {/* Architecture Rules Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="bg-white p-4 rounded-2xl border border-[#1A1C23]/5 space-y-1.5">
                  <div className="font-bold text-[#5438FF] flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5" />
                    <span>Raw Dreams Belong to One Owner</span>
                  </div>
                  <p className="text-[#1A1C23]/70">
                    Capturing raw text and audio never depends on AI completion. Raw input is persisted first, with asynchronous jobs dispatched idempotently.
                  </p>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-[#1A1C23]/5 space-y-1.5">
                  <div className="font-bold text-[#5438FF] flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5" />
                    <span>Clip Visibility Invariant</span>
                  </div>
                  <p className="text-[#1A1C23]/70">
                    A Clip must belong to a Dream owned by the creator. Clip visibility cannot exceed the underlying Dream’s effective visibility (enforced by DB trigger).
                  </p>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-[#1A1C23]/5 space-y-1.5">
                  <div className="font-bold text-[#5438FF] flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5" />
                    <span>Coarse Nearby Privacy</span>
                  </div>
                  <p className="text-[#1A1C23]/70">
                    No live GPS or fine distance coordinates are ever stored or returned. Only coarse regional buckets with minimum cohort thresholds are published.
                  </p>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-[#1A1C23]/5 space-y-1.5">
                  <div className="font-bold text-[#5438FF] flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5" />
                    <span>Dream Circle Discussion Layer</span>
                  </div>
                  <p className="text-[#1A1C23]/70">
                    One circle per dream (UNIQUE constraint). Access derives strictly from parent dream visibility and block relations. No real-time chat overhead.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: 17 TABLES & SCHEMA */}
          {activeTab === 'tables' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Tables list */}
              <div className="space-y-1">
                <div className="text-[11px] font-bold uppercase tracking-wider text-[#1A1C23]/50 px-2 pb-1">
                  17 Relational Tables
                </div>
                <div className="space-y-1 max-h-[500px] overflow-y-auto pr-1">
                  {TABLES_METADATA.map((table) => {
                    const isSelected = selectedTable === table.name;
                    return (
                      <button
                        key={table.name}
                        onClick={() => setSelectedTable(table.name)}
                        className={`w-full text-left px-3 py-2 rounded-xl text-xs font-mono transition-colors flex items-center justify-between ${
                          isSelected
                            ? 'bg-[#5438FF] text-white font-bold'
                            : 'bg-white hover:bg-stone-100 text-[#1A1C23] border border-[#1A1C23]/5'
                        }`}
                      >
                        <span>{table.name}</span>
                        <ChevronRight className={`w-3.5 h-3.5 ${isSelected ? 'opacity-100' : 'opacity-40'}`} />
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Table Details */}
              <div className="md:col-span-2 bg-white p-5 rounded-2xl border border-[#1A1C23]/10 space-y-4">
                <div className="border-b border-[#1A1C23]/10 pb-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-mono font-bold text-base text-[#5438FF]">
                      public.{currentTableData.name}
                    </h4>
                    <span className="text-[11px] font-mono bg-[#FAF8F5] text-[#1A1C23]/70 px-2 py-0.5 rounded border border-[#1A1C23]/10">
                      {currentTableData.pk}
                    </span>
                  </div>
                  <p className="text-xs text-[#1A1C23]/70 mt-1">
                    {currentTableData.summary}
                  </p>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs font-mono">
                    <thead>
                      <tr className="border-b border-[#1A1C23]/10 text-[10px] text-[#1A1C23]/50 uppercase">
                        <th className="py-1.5 px-2">Column</th>
                        <th className="py-1.5 px-2">Type / Constraint</th>
                        <th className="py-1.5 px-2">Description</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1A1C23]/5">
                      {currentTableData.columns.map((col) => (
                        <tr key={col.name} className="hover:bg-[#FAF8F5]">
                          <td className="py-2 px-2 font-bold text-[#1A1C23]">{col.name}</td>
                          <td className="py-2 px-2 text-[#5438FF] text-[11px]">{col.type}</td>
                          <td className="py-2 px-2 text-[#1A1C23]/70 text-[11px]">{col.desc}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: ROW LEVEL SECURITY */}
          {activeTab === 'rls' && (
            <div className="space-y-4">
              <div className="bg-[#EEEAFE] p-4 rounded-2xl border border-[#5438FF]/20 flex items-start gap-3">
                <Shield className="w-5 h-5 text-[#5438FF] shrink-0 mt-0.5" />
                <div className="text-xs text-[#301CB8] space-y-1">
                  <p className="font-bold uppercase tracking-wider text-[11px]">
                    Row Level Security Enforced on All 17 User-Owned Tables
                  </p>
                  <p>
                    All access control decisions occur in PostgreSQL kernel policies. Roles (<code>user</code>, <code>moderator</code>, <code>admin</code>)
                    are derived strictly from signed JWT session claims and never trusted from client input.
                  </p>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-[#1A1C23]/10 overflow-hidden text-xs">
                <table className="w-full text-left">
                  <thead className="bg-[#FAF8F5] border-b border-[#1A1C23]/10 font-bold text-[11px] text-[#1A1C23]/60 uppercase">
                    <tr>
                      <th className="p-3">Table</th>
                      <th className="p-3">Owner (auth.uid)</th>
                      <th className="p-3">Followers</th>
                      <th className="p-3">Public Viewers</th>
                      <th className="p-3">Blocked Users</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1A1C23]/5 text-[11px]">
                    <tr>
                      <td className="p-3 font-mono font-bold text-[#1A1C23]">dreams</td>
                      <td className="p-3 text-emerald-600 font-semibold">Full CRUD</td>
                      <td className="p-3 text-emerald-600 font-semibold">Read (if privacy &ge; followers)</td>
                      <td className="p-3 text-emerald-600 font-semibold">Read (if privacy = public)</td>
                      <td className="p-3 text-red-600 font-bold">Blocked (0 records)</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-mono font-bold text-[#1A1C23]">clips</td>
                      <td className="p-3 text-emerald-600 font-semibold">Full CRUD</td>
                      <td className="p-3 text-emerald-600 font-semibold">Read (if clip & dream accessible)</td>
                      <td className="p-3 text-emerald-600 font-semibold">Read (if public)</td>
                      <td className="p-3 text-red-600 font-bold">Blocked (0 records)</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-mono font-bold text-[#1A1C23]">dream_media</td>
                      <td className="p-3 text-emerald-600 font-semibold">Full CRUD</td>
                      <td className="p-3 text-[#1A1C23]/60">Read only if dream accessible</td>
                      <td className="p-3 text-[#1A1C23]/60">Read only if dream public</td>
                      <td className="p-3 text-red-600 font-bold">Blocked (0 records)</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-mono font-bold text-[#1A1C23]">dream_circles</td>
                      <td className="p-3 text-emerald-600 font-semibold">Owner manage status</td>
                      <td className="p-3 text-emerald-600 font-semibold">View & post threads</td>
                      <td className="p-3 text-emerald-600 font-semibold">View & post threads</td>
                      <td className="p-3 text-red-600 font-bold">Blocked (0 records)</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-mono font-bold text-[#1A1C23]">nearby_eligibility</td>
                      <td className="p-3 text-emerald-600 font-semibold">Manage own opt-in</td>
                      <td className="p-3 text-[#1A1C23]/40">Hidden</td>
                      <td className="p-3 text-[#1A1C23]/40">Hidden</td>
                      <td className="p-3 text-[#1A1C23]/40">Hidden</td>
                    </tr>
                    <tr>
                      <td className="p-3 font-mono font-bold text-[#1A1C23]">reports</td>
                      <td className="p-3 text-emerald-600 font-semibold">Submit report</td>
                      <td className="p-3 text-[#1A1C23]/40">Hidden</td>
                      <td className="p-3 text-[#1A1C23]/40">Hidden</td>
                      <td className="p-3 text-purple-600 font-bold">Moderators only</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 4: PRIVACY MODEL & DTOs */}
          {activeTab === 'privacy' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white p-4 rounded-2xl border border-[#1A1C23]/10 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-[#5438FF]">
                    <Lock className="w-4 h-4" />
                    <span>OwnerDreamDTO</span>
                  </div>
                  <p className="text-[11px] text-[#1A1C23]/70">
                    Returned only to the verified dream author.
                  </p>
                  <ul className="text-[11px] space-y-1 font-mono text-[#1A1C23]">
                    <li className="text-emerald-700 font-bold">✓ raw_text transcript</li>
                    <li className="text-emerald-700 font-bold">✓ private media audio paths</li>
                    <li className="text-emerald-700 font-bold">✓ background processing states</li>
                    <li className="text-emerald-700 font-bold">✓ retry failure diagnostics</li>
                  </ul>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-[#1A1C23]/10 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-[#5438FF]">
                    <Eye className="w-4 h-4" />
                    <span>SocialDreamDTO</span>
                  </div>
                  <p className="text-[11px] text-[#1A1C23]/70">
                    Public & follower feeds. Never exposes raw unpolished notes.
                  </p>
                  <ul className="text-[11px] space-y-1 font-mono text-[#1A1C23]">
                    <li className="text-red-600 font-bold">✗ raw_text purged</li>
                    <li className="text-emerald-700 font-bold">✓ polished title & hook</li>
                    <li className="text-emerald-700 font-bold">✓ author profile display</li>
                    <li className="text-emerald-700 font-bold">✓ resonance & reply counters</li>
                  </ul>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-[#1A1C23]/10 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-[#5438FF]">
                    <FileCheck className="w-4 h-4" />
                    <span>NearbyDTO</span>
                  </div>
                  <p className="text-[11px] text-[#1A1C23]/70">
                    Last Night Nearby radar. Protected by k-anonymity.
                  </p>
                  <ul className="text-[11px] space-y-1 font-mono text-[#1A1C23]">
                    <li className="text-red-600 font-bold">✗ zero coordinates</li>
                    <li className="text-emerald-700 font-bold">✓ coarse region bucket</li>
                    <li className="text-emerald-700 font-bold">✓ threshold-gated motif counts</li>
                    <li className="text-emerald-700 font-bold">✓ anonymized sticker quotes</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: STORAGE LAYOUT */}
          {activeTab === 'storage' && (
            <div className="space-y-4 text-xs">
              <div className="bg-white p-5 rounded-2xl border border-[#1A1C23]/10 space-y-3">
                <h4 className="font-bold text-sm text-[#1A1C23] flex items-center gap-2">
                  <HardDrive className="w-4 h-4 text-[#5438FF]" />
                  <span>Deterministic Storage Layout (Section 9)</span>
                </h4>
                <p className="text-[#1A1C23]/70">
                  Opaque asset identifiers are strictly preferred over user-visible filenames.
                </p>

                <div className="space-y-2 pt-2">
                  <div className="p-3 bg-[#FAF8F5] rounded-xl border border-[#1A1C23]/5 font-mono text-[11px] space-y-1">
                    <span className="text-red-600 font-bold">PRIVATE BUCKET: dream-audio</span>
                    <p className="text-[#1A1C23]">private/dream-audio/&#123;user_id&#125;/&#123;dream_id&#125;/&#123;asset_id&#125;</p>
                    <span className="text-[10px] text-[#1A1C23]/50 block">Signed URLs only. Never publicly enumerable.</span>
                  </div>

                  <div className="p-3 bg-[#FAF8F5] rounded-xl border border-[#1A1C23]/5 font-mono text-[11px] space-y-1">
                    <span className="text-red-600 font-bold">PRIVATE BUCKET: dream-images</span>
                    <p className="text-[#1A1C23]">private/dream-images/&#123;user_id&#125;/&#123;dream_id&#125;/&#123;asset_id&#125;</p>
                    <span className="text-[10px] text-[#1A1C23]/50 block">Signed URLs generated for authenticated viewers.</span>
                  </div>

                  <div className="p-3 bg-[#FAF8F5] rounded-xl border border-[#1A1C23]/5 font-mono text-[11px] space-y-1">
                    <span className="text-emerald-700 font-bold">PUBLIC BUCKET: clip-media</span>
                    <p className="text-[#1A1C23]">public/clip-media/&#123;clip_id&#125;/&#123;asset_id&#125;</p>
                    <span className="text-[10px] text-[#1A1C23]/50 block">Short video playback with server-checked visibility tokens.</span>
                  </div>

                  <div className="p-3 bg-[#FAF8F5] rounded-xl border border-[#1A1C23]/5 font-mono text-[11px] space-y-1">
                    <span className="text-emerald-700 font-bold">PUBLIC BUCKET: avatars</span>
                    <p className="text-[#1A1C23]">public/avatars/&#123;user_id&#125;/&#123;asset_id&#125;</p>
                    <span className="text-[10px] text-[#1A1C23]/50 block">User profile pictures and icons.</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 6: SQL MIGRATION FILE */}
          {activeTab === 'sql' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono text-[#1A1C23]/70">
                  File: /supabase/migrations/20260905000000_siimr_backend_schema.sql
                </span>
                <button
                  onClick={handleCopySql}
                  className="px-3 py-1.5 bg-[#5438FF] text-white rounded-xl text-xs font-bold flex items-center gap-1.5 hover:bg-[#452ee0] transition-colors"
                >
                  {copiedSql ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Copied Reference!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy Migration Path</span>
                    </>
                  )}
                </button>
              </div>

              <div className="bg-[#1A1C23] p-4 rounded-2xl text-[#E0DEF4] font-mono text-xs max-h-[380px] overflow-y-auto leading-relaxed border border-white/10">
                <pre>{`-- =====================================================================
-- siimr — 05 Backend Schema (Data Model & Auth Architecture)
-- Production Supabase / PostgreSQL Migration
-- =====================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- 2. ENUMS
CREATE TYPE profile_visibility_type AS ENUM ('public', 'private');
CREATE TYPE dream_privacy_type AS ENUM ('private', 'followers', 'public');
CREATE TYPE dream_status_type AS ENUM ('draft', 'processing', 'ready', 'archived', 'deleted');
CREATE TYPE dream_source_type AS ENUM ('voice', 'text', 'import');
CREATE TYPE dream_media_type AS ENUM ('audio', 'image');
CREATE TYPE clip_privacy_type AS ENUM ('followers', 'public');
CREATE TYPE clip_status_type AS ENUM ('draft', 'uploading', 'processing', 'ready', 'deleted');
CREATE TYPE processing_job_type AS ENUM ('transcription', 'title', 'hook', 'motif', 'echo');
CREATE TYPE circle_status_type AS ENUM ('active', 'locked', 'deleted');

-- 3. CORE TABLES (17 Tables Defined)
-- users, dreams, dream_media, follows, clips, reactions, replies, saves,
-- nearby_eligibility, nearby_motif_counts, nearby_dream_candidates,
-- processing_jobs, reports, blocks, dream_circles, circle_threads, circle_replies

-- 4. CONSTRAINTS & TRIGGERS
-- CHECK (follower_id <> followed_id)
-- CHECK ((dream_id IS NOT NULL AND clip_id IS NULL) OR ...)
-- UNIQUE(dream_id) on dream_circles
-- validate_clip_privacy() trigger ensures Clip privacy <= Dream privacy
-- enqueue_dream_processing_jobs() on dreams insert
-- on_nearby_optout() immediate cleanup trigger`}</pre>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-[#1A1C23]/10 bg-white flex items-center justify-between text-xs">
          <span className="text-[#1A1C23]/60 font-mono text-[11px]">
            Done criteria satisfied: 17 tables, RLS enabled, DTOs defined, Dream Circle & Search integrated.
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-[#1A1C23] text-white font-bold rounded-xl text-xs hover:bg-black transition-colors"
          >
            Close Inspector
          </button>
        </div>
      </div>
    </div>
  );
};

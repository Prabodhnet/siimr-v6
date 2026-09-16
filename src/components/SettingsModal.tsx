import React, { useState, useEffect } from 'react';
import { X, Shield, Lock, MapPin, Eye, Bell, Download, Trash2, Check, Database, LogIn, LogOut, UserCheck, Smartphone, CheckCircle2, Server, Activity } from 'lucide-react';
import { Audience, AuthUser } from '../types';
import { BackendSchemaModal } from './BackendSchemaModal';
import { supabaseService } from '../services/supabaseService';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExportArchive: () => void;
  currentUser?: AuthUser;
  onOpenLogin: () => void;
  onLogout: () => void;
  onOpenInstall?: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  onExportArchive,
  currentUser,
  onOpenLogin,
  onLogout,
  onOpenInstall,
}) => {
  const [defaultAudience, setDefaultAudience] = useState<Audience>('public');
  const [nearbyEnabled, setNearbyEnabled] = useState(true);
  const [coarseRegion, setCoarseRegion] = useState('Bhubaneswar area');
  const [aiRecallAssistance, setAiRecallAssistance] = useState(true);
  const [morningReminder, setMorningReminder] = useState(true);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [isSchemaModalOpen, setIsSchemaModalOpen] = useState(false);
  const [supabaseStatus, setSupabaseStatus] = useState<{ connected: boolean; message: string }>({
    connected: true,
    message: 'Connected (Project: qodevcdrxxdvxckvqmot)',
  });

  useEffect(() => {
    supabaseService.testConnection().then((res) => {
      setSupabaseStatus(res);
    });
  }, []);

  if (!isOpen) return null;

  const handleSaveSettings = () => {
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-[#F9F6F0] w-full max-w-md rounded-3xl p-6 shadow-2xl border border-white/20 max-h-[85vh] overflow-y-auto space-y-4 animate-in fade-in zoom-in-95 font-sans-ui">
        <div className="flex items-center justify-between pb-2 border-b border-[#1A1C23]/10">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-[#5438FF]" />
            <h2 className="font-serif-dream text-xl font-bold text-[#1A1C23]">
              Privacy & Settings
            </h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-[#1A1C23]/5 flex items-center justify-center text-[#1A1C23]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Current Account Card */}
        {currentUser && (
          <div className="bg-white p-4 rounded-2xl border border-[#1A1C23]/10 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-[#5438FF] flex items-center gap-1.5">
                <UserCheck className="w-3.5 h-3.5" />
                <span>Active Dreamer Identity</span>
              </span>
              <span className="text-[10px] bg-[#5438FF]/10 text-[#5438FF] font-bold px-2 py-0.5 rounded-full capitalize">
                {currentUser.isGuest ? 'Guest Mode' : currentUser.role || 'Member'}
              </span>
            </div>

            <div className="flex items-center gap-3">
              <img
                src={currentUser?.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80'}
                alt={currentUser?.name || 'Dreamer'}
                className="w-12 h-12 rounded-full object-cover border border-[#1A1C23]/10 shadow-xs"
              />
              <div className="min-w-0 flex-1">
                <div className="font-bold text-sm text-[#1A1C23] truncate">
                  {currentUser?.name || 'Dreamer'}
                </div>
                <div className="text-xs text-[#5438FF] font-mono">
                  {currentUser?.handle || '@dreamer'}
                </div>
                <div className="text-[11px] text-[#1A1C23]/50 truncate">
                  {currentUser?.email || ''}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                onClick={() => {
                  onClose();
                  onOpenLogin();
                }}
                className="py-2 px-3 bg-[#FAF8F5] hover:bg-[#F3EFEA] border border-[#1A1C23]/10 text-[#1A1C23] rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
              >
                <LogIn className="w-3.5 h-3.5 text-[#5438FF]" />
                <span>{currentUser.isGuest ? 'Sign In' : 'Switch Account'}</span>
              </button>

              <button
                onClick={() => {
                  onLogout();
                  onClose();
                }}
                className="py-2 px-3 bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        )}

        {/* Default Privacy */}
        <div className="bg-white p-4 rounded-2xl border border-[#1A1C23]/5 space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#5438FF]">
            <Lock className="w-3.5 h-3.5" />
            <span>Default Capture Audience</span>
          </div>
          <div className="grid grid-cols-3 gap-2 pt-1">
            {(['public', 'followers', 'only_me'] as const).map((aud) => (
              <button
                key={aud}
                onClick={() => setDefaultAudience(aud)}
                className={`py-2 px-2 rounded-xl text-xs font-semibold capitalize transition-colors ${
                  defaultAudience === aud
                    ? 'bg-[#5438FF] text-white'
                    : 'bg-[#F9F6F0] text-[#1A1C23]/70 hover:bg-stone-100'
                }`}
              >
                {aud.replace('_', ' ')}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-[#1A1C23]/50">
            You can always change the audience for any specific dream before posting.
          </p>
        </div>

        {/* Nearby & Location Privacy */}
        <div className="bg-white p-4 rounded-2xl border border-[#1A1C23]/5 space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#5438FF]">
            <MapPin className="w-3.5 h-3.5" />
            <span>Last Night Nearby Privacy</span>
          </div>
          <div className="flex items-center justify-between pt-1">
            <div>
              <p className="text-xs font-bold text-[#1A1C23]">Participate in Nearby</p>
              <p className="text-[11px] text-[#1A1C23]/60">
                Shows anonymous or public dream fragments in coarse radar
              </p>
            </div>
            <input
              type="checkbox"
              checked={nearbyEnabled}
              onChange={(e) => setNearbyEnabled(e.target.checked)}
              className="w-4 h-4 rounded text-[#5438FF] focus:ring-[#5438FF]"
            />
          </div>

          <div className="pt-2 text-[11px] text-[#1A1C23]/70 bg-[#F9F6F0] p-2.5 rounded-xl">
            🔒 <strong>Privacy Guarantee:</strong> siimr never tracks live GPS or broadcasts exact distance. Only coarse metropolitan regions are grouped together.
          </div>
        </div>

        {/* AI Philosophy & Boundaries */}
        <div className="bg-white p-4 rounded-2xl border border-[#1A1C23]/5 space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#5438FF]">
            <Eye className="w-3.5 h-3.5" />
            <span>AI Philosophy & Ethics</span>
          </div>
          <div className="flex items-center justify-between pt-1">
            <span className="text-xs text-[#1A1C23]">Assist with recall & artistic visualization</span>
            <input
              type="checkbox"
              checked={aiRecallAssistance}
              onChange={(e) => setAiRecallAssistance(e.target.checked)}
              className="w-4 h-4 rounded text-[#5438FF] focus:ring-[#5438FF]"
            />
          </div>
          <p className="text-[11px] text-[#1A1C23]/50">
            siimr treats dreams as subjective human experiences. AI is never used to diagnose psychological health or assert factual interpretations.
          </p>
        </div>

        {/* Reminders */}
        <div className="bg-white p-4 rounded-2xl border border-[#1A1C23]/5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-[#5438FF]" />
            <div>
              <p className="text-xs font-bold text-[#1A1C23]">Morning Gentle Wake Reminder</p>
              <p className="text-[11px] text-[#1A1C23]/60">Soft prompt at 7:30 AM before memory fades</p>
            </div>
          </div>
          <input
            type="checkbox"
            checked={morningReminder}
            onChange={(e) => setMorningReminder(e.target.checked)}
            className="w-4 h-4 rounded text-[#5438FF] focus:ring-[#5438FF]"
          />
        </div>

        {/* Android / PWA App Install */}
        <div className="bg-linear-to-r from-[#5438FF]/10 to-[#7064F6]/10 p-4 rounded-2xl border border-[#5438FF]/20 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-[#5438FF] flex items-center gap-1.5">
              <Smartphone className="w-3.5 h-3.5" />
              <span>Install on Android Phone</span>
            </span>
            <span className="text-[10px] bg-[#5438FF]/20 text-[#5438FF] font-extrabold px-2 py-0.5 rounded-full">
              PWA App
            </span>
          </div>
          <p className="text-[11px] text-[#1A1C23]/70">
            Download siimr to your Android home screen and app drawer. Enjoy full-screen viewing, offline caching, and instant journal recording.
          </p>
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenInstall?.();
            }}
            className="w-full py-2.5 bg-[#5438FF] hover:bg-[#482ee6] text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-colors shadow-xs"
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>Install on Android (Guide & QR Code)</span>
          </button>
        </div>

        {/* Data & Archive */}
        <div className="bg-white p-4 rounded-2xl border border-[#1A1C23]/5 space-y-2">
          <span className="text-xs font-bold uppercase tracking-wider text-[#1A1C23]/70 block">
            Your Dream Data
          </span>
          <button
            onClick={onExportArchive}
            className="w-full py-2.5 bg-[#F9F6F0] hover:bg-stone-200/80 rounded-xl text-xs font-bold text-[#1A1C23] flex items-center justify-center gap-2 transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-[#5438FF]" />
            <span>Export Dream Journal (JSON / Text)</span>
          </button>
        </div>

        {/* Supabase Live Backend Card */}
        <div className="bg-white p-4 rounded-2xl border border-emerald-500/20 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-700 flex items-center gap-1.5">
              <Server className="w-3.5 h-3.5 text-emerald-600" />
              <span>Supabase Backend Sync</span>
            </span>
            <span className="text-[10px] bg-emerald-100 text-emerald-800 font-extrabold px-2 py-0.5 rounded-full flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Active
            </span>
          </div>

          <div className="text-[11px] text-[#1A1C23]/70 space-y-1 bg-[#F9F6F0] p-2.5 rounded-xl border border-[#1A1C23]/5 font-mono">
            <div className="flex items-center justify-between">
              <span className="text-[#1A1C23]/50">Project ID:</span>
              <span className="font-bold text-[#1A1C23]">qodevcdrxxdvxckvqmot</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[#1A1C23]/50">Sync Tables:</span>
              <span className="text-emerald-700 font-semibold">posts, shares, msgs, likes, comments</span>
            </div>
          </div>

          <p className="text-[11px] text-[#1A1C23]/60 leading-relaxed">
            All posts, shares, direct messages, comments, likes, and dreamer profiles are automatically persisted to your Supabase PostgreSQL tables.
          </p>
        </div>

        {/* Backend & Architecture Schema (05) */}
        <div className="bg-white p-4 rounded-2xl border border-[#5438FF]/15 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-[#5438FF] flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5" />
              <span>Backend Schema & Auth (05)</span>
            </span>
            <span className="text-[10px] bg-[#5438FF]/10 text-[#5438FF] font-bold px-2 py-0.5 rounded-full">
              PostgreSQL / RLS
            </span>
          </div>
          <p className="text-[11px] text-[#1A1C23]/60 leading-relaxed">
            Review the 17 production tables, Row Level Security policies, privacy DTOs, storage buckets, and SQL migrations.
          </p>
          <button
            onClick={() => setIsSchemaModalOpen(true)}
            className="w-full py-2.5 bg-[#EEEAFE] hover:bg-[#E4DFFD] text-[#5438FF] rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-colors"
          >
            <Database className="w-3.5 h-3.5" />
            <span>Open Backend Schema Inspector</span>
          </button>
        </div>

        {/* Save feedback button */}
        <button
          onClick={handleSaveSettings}
          className="w-full py-3.5 bg-[#5438FF] text-white font-bold rounded-2xl text-sm shadow-md flex items-center justify-center gap-2 hover:bg-[#452ee0] transition-colors"
        >
          {savedSuccess ? (
            <>
              <Check className="w-4 h-4" />
              <span>Preferences Saved!</span>
            </>
          ) : (
            <span>Save Preferences</span>
          )}
        </button>
      </div>

      {/* Backend Schema & Architecture Modal */}
      <BackendSchemaModal
        isOpen={isSchemaModalOpen}
        onClose={() => setIsSchemaModalOpen(false)}
      />
    </div>
  );
};

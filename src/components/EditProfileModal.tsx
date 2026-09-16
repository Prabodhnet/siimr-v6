import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Check,
  Upload,
  Camera,
  Image as ImageIcon,
  AlertCircle,
  Loader2,
  Trash2,
  Shield,
  Eye,
  ArrowLeft,
  Sparkles,
  RefreshCw,
} from 'lucide-react';
import { AuthUser } from '../types';
import { supabaseService } from '../services/supabaseService';

interface EditProfileModalProps {
  isOpen: boolean;
  currentUser: AuthUser;
  onClose: () => void;
  onSaveSuccess: (updatedUser: AuthUser) => void;
}

export const EditProfileModal: React.FC<EditProfileModalProps> = ({
  isOpen,
  currentUser,
  onClose,
  onSaveSuccess,
}) => {
  // Form State
  const [displayName, setDisplayName] = useState(currentUser.name || '');
  const [username, setUsername] = useState(
    (currentUser.username || currentUser.handle || '').replace(/^@/, '')
  );
  const [bio, setBio] = useState(currentUser.bio || '');
  const [bannerQuote, setBannerQuote] = useState(
    currentUser.bannerQuote || 'How to go for a little walk and never return'
  );
  const [discoverableInSearch, setDiscoverableInSearch] = useState(
    currentUser.discoverableInSearch ?? true
  );
  const [nearbyOptIn, setNearbyOptIn] = useState(currentUser.nearbyOptIn ?? true);

  // Media States
  const [avatarPreview, setAvatarPreview] = useState(currentUser.avatar || '');
  const [avatarFile, setAvatarFile] = useState<Blob | null>(null);
  const [avatarRemoved, setAvatarRemoved] = useState(false);

  const [bannerPreview, setBannerPreview] = useState(
    currentUser.bannerUrl || currentUser.coverUrl || ''
  );
  const [bannerFile, setBannerFile] = useState<Blob | null>(null);
  const [bannerRemoved, setBannerRemoved] = useState(false);

  // Avatar framing / zoom adjustment (1, 1.25, 1.5)
  const [avatarZoom, setAvatarZoom] = useState<number>(1);
  const [avatarPosition, setAvatarPosition] = useState<'center' | 'top' | 'bottom'>('center');

  // Username validation & availability
  const [usernameStatus, setUsernameStatus] = useState<
    'idle' | 'checking' | 'available' | 'taken' | 'invalid'
  >('idle');
  const [usernameMessage, setUsernameMessage] = useState<string>('');

  // UI state
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [activeTab, setActiveTab] = useState<'edit' | 'preview'>('edit');

  // Hidden file inputs
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  // Track if dirty
  const isDirty =
    displayName.trim() !== (currentUser.name || '').trim() ||
    username.trim().toLowerCase() !==
      (currentUser.username || currentUser.handle || '')
        .replace(/^@/, '')
        .toLowerCase() ||
    bio.trim() !== (currentUser.bio || '').trim() ||
    bannerQuote.trim() !==
      (currentUser.bannerQuote || 'How to go for a little walk and never return').trim() ||
    discoverableInSearch !== (currentUser.discoverableInSearch ?? true) ||
    nearbyOptIn !== (currentUser.nearbyOptIn ?? true) ||
    avatarFile !== null ||
    avatarRemoved ||
    bannerFile !== null ||
    bannerRemoved;

  // Reset form when modal opens or user changes
  useEffect(() => {
    if (isOpen) {
      setDisplayName(currentUser.name || '');
      setUsername((currentUser.username || currentUser.handle || '').replace(/^@/, ''));
      setBio(currentUser.bio || '');
      setBannerQuote(
        currentUser.bannerQuote || 'How to go for a little walk and never return'
      );
      setDiscoverableInSearch(currentUser.discoverableInSearch ?? true);
      setNearbyOptIn(currentUser.nearbyOptIn ?? true);
      setAvatarPreview(currentUser.avatar || '');
      setAvatarFile(null);
      setAvatarRemoved(false);
      setBannerPreview(currentUser.bannerUrl || currentUser.coverUrl || '');
      setBannerFile(null);
      setBannerRemoved(false);
      setAvatarZoom(1);
      setAvatarPosition('center');
      setUsernameStatus('idle');
      setUsernameMessage('');
      setErrorMessage(null);
      setShowDiscardConfirm(false);
      setActiveTab('edit');
    }
  }, [isOpen, currentUser]);

  // Real-time username availability debounce
  useEffect(() => {
    const clean = username.trim().toLowerCase();
    const currentClean = (currentUser.username || currentUser.handle || '')
      .replace(/^@/, '')
      .toLowerCase();

    if (!clean) {
      setUsernameStatus('invalid');
      setUsernameMessage('Username cannot be empty');
      return;
    }

    if (clean.length < 3) {
      setUsernameStatus('invalid');
      setUsernameMessage('Must be at least 3 characters');
      return;
    }

    if (clean.length > 30) {
      setUsernameStatus('invalid');
      setUsernameMessage('Maximum 30 characters allowed');
      return;
    }

    if (!/^[a-z0-9_]+$/.test(clean)) {
      setUsernameStatus('invalid');
      setUsernameMessage('Only letters, numbers, and underscores');
      return;
    }

    // If unchanged, it's immediately valid
    if (clean === currentClean) {
      setUsernameStatus('available');
      setUsernameMessage('Current username');
      return;
    }

    setUsernameStatus('checking');
    setUsernameMessage('Checking availability...');

    const timer = setTimeout(async () => {
      try {
        const result = await supabaseService.checkUsernameAvailability(
          clean,
          currentUser.id
        );
        if (result.available) {
          setUsernameStatus('available');
          setUsernameMessage('Username available');
        } else {
          setUsernameStatus('taken');
          setUsernameMessage(result.error || 'Username already taken');
        }
      } catch (err) {
        setUsernameStatus('available');
        setUsernameMessage('Username available');
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [username, currentUser.id, currentUser.handle, currentUser.username]);

  if (!isOpen) return null;

  // Handle client-side canvas compression for responsive images
  const compressImage = (
    file: File,
    maxWidth: number,
    maxHeight: number,
    quality: number = 0.88
  ): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > maxWidth) {
              height = Math.round((height * maxWidth) / width);
              width = maxWidth;
            }
          } else {
            if (height > maxHeight) {
              width = Math.round((width * maxHeight) / height);
              height = maxHeight;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(file);
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          canvas.toBlob(
            (blob) => {
              if (blob) {
                resolve(blob);
              } else {
                resolve(file);
              }
            },
            'image/jpeg',
            quality
          );
        };
        img.onerror = (err) => reject(err);
      };
      reader.onerror = (err) => reject(err);
    });
  };

  // Avatar file selection
  const handleAvatarSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.match(/^image\/(jpeg|png|webp|jpg)$/i)) {
      setErrorMessage('Please choose a valid image file (JPG, PNG, or WEBP).');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setErrorMessage('Image is too large. Please select an image under 10MB.');
      return;
    }

    try {
      // Compress avatar to 600x600 max
      const compressedBlob = await compressImage(file, 600, 600, 0.9);
      const previewUrl = URL.createObjectURL(compressedBlob);
      setAvatarPreview(previewUrl);
      setAvatarFile(compressedBlob);
      setAvatarRemoved(false);
      setErrorMessage(null);
    } catch (err) {
      console.warn('Image processing error:', err);
      const previewUrl = URL.createObjectURL(file);
      setAvatarPreview(previewUrl);
      setAvatarFile(file);
      setAvatarRemoved(false);
    }
  };

  // Banner file selection
  const handleBannerSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.match(/^image\/(jpeg|png|webp|jpg)$/i)) {
      setErrorMessage('Please choose a valid image file (JPG, PNG, or WEBP).');
      return;
    }

    if (file.size > 12 * 1024 * 1024) {
      setErrorMessage('Banner image is too large. Please select an image under 12MB.');
      return;
    }

    try {
      // Compress banner to 1400x500 max
      const compressedBlob = await compressImage(file, 1400, 500, 0.88);
      const previewUrl = URL.createObjectURL(compressedBlob);
      setBannerPreview(previewUrl);
      setBannerFile(compressedBlob);
      setBannerRemoved(false);
      setErrorMessage(null);
    } catch (err) {
      console.warn('Banner processing error:', err);
      const previewUrl = URL.createObjectURL(file);
      setBannerPreview(previewUrl);
      setBannerFile(file);
      setBannerRemoved(false);
    }
  };

  const handleRemoveAvatar = () => {
    setAvatarPreview('');
    setAvatarFile(null);
    setAvatarRemoved(true);
  };

  const handleRemoveBanner = () => {
    setBannerPreview('');
    setBannerFile(null);
    setBannerRemoved(true);
  };

  const handleAttemptClose = () => {
    if (isDirty) {
      setShowDiscardConfirm(true);
    } else {
      onClose();
    }
  };

  const handleConfirmDiscard = () => {
    setShowDiscardConfirm(false);
    onClose();
  };

  // Save changes handler
  const handleSaveChanges = async () => {
    const cleanName = displayName.trim();
    if (!cleanName || cleanName.length < 2) {
      setErrorMessage('Display name must be at least 2 characters.');
      return;
    }
    if (cleanName.length > 50) {
      setErrorMessage('Display name cannot exceed 50 characters.');
      return;
    }

    const cleanUser = username.trim().toLowerCase();
    if (usernameStatus === 'taken' || usernameStatus === 'invalid') {
      setErrorMessage(usernameMessage || 'Please choose a valid and available username.');
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);

    try {
      let finalAvatarUrl = avatarPreview;
      let finalBannerUrl = bannerPreview;

      // 1. Upload avatar if changed
      if (avatarFile) {
        const uploadRes = await supabaseService.uploadProfileMedia(
          currentUser.id,
          avatarFile,
          'avatar'
        );
        if (uploadRes.url) {
          finalAvatarUrl = uploadRes.url;
        }
      } else if (avatarRemoved) {
        finalAvatarUrl = 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80';
      }

      // 2. Upload banner if changed
      if (bannerFile) {
        const uploadRes = await supabaseService.uploadProfileMedia(
          currentUser.id,
          bannerFile,
          'banner'
        );
        if (uploadRes.url) {
          finalBannerUrl = uploadRes.url;
        }
      } else if (bannerRemoved) {
        finalBannerUrl = '';
      }

      // 3. Save to Supabase profiles database
      const updateResult = await supabaseService.updateUserProfile(currentUser.id, {
        name: cleanName,
        username: cleanUser,
        bio: bio.trim(),
        avatar: finalAvatarUrl,
        bannerUrl: finalBannerUrl,
        bannerQuote: bannerQuote.trim(),
        nearbyOptIn,
        discoverableInSearch,
      });

      if (!updateResult.success || !updateResult.user) {
        throw new Error(updateResult.error || 'Failed to update profile.');
      }

      // 4. Notify parent & update real-time state
      onSaveSuccess(updateResult.user);
      onClose();
    } catch (err: any) {
      console.error('Error saving profile:', err);
      setErrorMessage(
        err.message || 'Unable to save profile changes. Please try again.'
      );
    } finally {
      setIsSaving(false);
    }
  };

  const defaultAvatar =
    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80';

  return (
    <div
      id="edit-profile-backdrop"
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto"
    >
      {/* Hidden file inputs */}
      <input
        ref={avatarInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/jpg"
        className="hidden"
        onChange={handleAvatarSelect}
      />
      <input
        ref={bannerInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/jpg"
        className="hidden"
        onChange={handleBannerSelect}
      />

      {/* Main Container */}
      <div
        id="edit-profile-modal-card"
        className="bg-[#F9F6F0] w-full max-w-xl rounded-[32px] shadow-2xl border border-black/10 overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 font-sans-ui"
      >
        {/* Modal Top Header */}
        <header className="px-6 py-4 border-b border-[#1A1C23]/10 flex items-center justify-between bg-[#F9F6F0]/90 backdrop-blur-xs sticky top-0 z-20">
          <div className="flex items-center gap-3">
            <button
              id="edit-profile-back-btn"
              onClick={handleAttemptClose}
              className="w-9 h-9 rounded-full bg-black/5 hover:bg-black/10 flex items-center justify-center text-[#1A1C23] transition-colors"
              title="Close"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="font-serif-dream text-xl font-bold text-[#1A1C23] leading-tight">
                Edit Profile
              </h1>
              <p className="text-xs text-[#1A1C23]/60">Customize your Dream World presence</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* View switcher (Edit vs Preview) */}
            <div className="hidden sm:flex bg-black/5 p-0.5 rounded-full text-xs font-medium">
              <button
                type="button"
                onClick={() => setActiveTab('edit')}
                className={`px-3 py-1 rounded-full transition-all ${
                  activeTab === 'edit'
                    ? 'bg-white text-[#1A1C23] shadow-xs'
                    : 'text-[#1A1C23]/60 hover:text-[#1A1C23]'
                }`}
              >
                Editor
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('preview')}
                className={`px-3 py-1 rounded-full flex items-center gap-1 transition-all ${
                  activeTab === 'preview'
                    ? 'bg-white text-[#1A1C23] shadow-xs'
                    : 'text-[#1A1C23]/60 hover:text-[#1A1C23]'
                }`}
              >
                <Eye className="w-3.5 h-3.5 text-[#5438FF]" />
                Preview
              </button>
            </div>

            {/* Save Button */}
            <button
              id="save-profile-btn"
              onClick={handleSaveChanges}
              disabled={
                isSaving ||
                !displayName.trim() ||
                usernameStatus === 'taken' ||
                usernameStatus === 'invalid'
              }
              className={`px-5 py-2 rounded-full font-medium text-sm transition-all flex items-center gap-2 ${
                isSaving ||
                !displayName.trim() ||
                usernameStatus === 'taken' ||
                usernameStatus === 'invalid'
                  ? 'bg-[#5438FF]/40 text-white cursor-not-allowed'
                  : 'bg-[#5438FF] hover:bg-[#4326ea] text-white shadow-md active:scale-95'
              }`}
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>Save Changes</span>
                </>
              )}
            </button>
          </div>
        </header>

        {/* Error Notification Banner */}
        {errorMessage && (
          <div className="bg-red-50 border-b border-red-200 px-6 py-3 flex items-start justify-between gap-3 text-red-700 text-sm">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-red-600" />
              <span>{errorMessage}</span>
            </div>
            <button
              onClick={() => setErrorMessage(null)}
              className="text-red-500 hover:text-red-700 p-0.5"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Scrollable Body */}
        <div className="p-6 overflow-y-auto space-y-8 flex-1">
          {/* TAB 1: EDIT FORM */}
          {activeTab === 'edit' && (
            <>
              {/* SECTION 1: PROFILE APPEARANCE */}
              <section id="section-appearance" className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#5438FF]" />
                    <h2 className="text-xs font-bold uppercase tracking-wider text-[#1A1C23]/60">
                      Profile Appearance
                    </h2>
                  </div>
                  <span className="text-xs text-[#1A1C23]/40">Photos & Cover</span>
                </div>

                {/* Banner & Avatar Composite Preview Area */}
                <div className="bg-white rounded-[24px] p-4 border border-black/5 shadow-xs space-y-4">
                  {/* Banner Box */}
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-[#1A1C23] flex items-center justify-between">
                      <span>Cover Banner</span>
                      <span className="text-[11px] font-normal text-[#1A1C23]/50">
                        16:9 or panoramic banner
                      </span>
                    </label>

                    <div
                      className="relative h-36 sm:h-40 rounded-[20px] overflow-hidden shadow-inner flex flex-col justify-end p-4 group transition-all"
                      style={{
                        backgroundImage: bannerPreview ? `url(${bannerPreview})` : undefined,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                        background: !bannerPreview
                          ? 'linear-gradient(135deg, #C2B8FF 0%, #DCD6FE 45%, #B4A4FF 100%)'
                          : undefined,
                      }}
                    >
                      {bannerPreview ? (
                        <div className="absolute inset-0 bg-black/25 backdrop-blur-[0.5px]" />
                      ) : (
                        <div className="absolute inset-0 pointer-events-none">
                          <div className="absolute right-4 -top-2 w-24 h-24 rounded-full bg-[#5438FF]/20 blur-xs" />
                          <div className="absolute right-8 top-2 w-16 h-16 rounded-full bg-[#5438FF]/30" />
                        </div>
                      )}

                      {/* Display banner quote in preview */}
                      <div className="relative z-10 max-w-[260px] ml-auto text-right">
                        <p
                          className={`font-serif-dream italic font-bold text-sm leading-tight ${
                            bannerPreview ? 'text-white drop-shadow-sm' : 'text-[#1A1C23]'
                          }`}
                        >
                          "{bannerQuote || 'How to go for a little walk and never return'}"
                        </p>
                      </div>

                      {/* Action buttons on banner */}
                      <div className="absolute top-3 left-3 z-10 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => bannerInputRef.current?.click()}
                          className="px-3 py-1.5 rounded-full bg-white/90 hover:bg-white text-[#1A1C23] text-xs font-medium shadow-md flex items-center gap-1.5 transition-transform active:scale-95"
                        >
                          <Camera className="w-3.5 h-3.5 text-[#5438FF]" />
                          {bannerPreview ? 'Change Banner' : 'Upload Banner'}
                        </button>

                        {bannerPreview && (
                          <button
                            type="button"
                            onClick={handleRemoveBanner}
                            className="p-1.5 rounded-full bg-white/90 hover:bg-red-50 text-red-600 shadow-md transition-colors"
                            title="Revert to default signature gradient"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Banner Quote Inscription Field */}
                    <div className="pt-2">
                      <label className="text-xs font-medium text-[#1A1C23]/70 mb-1 flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-[#5438FF]" />
                        <span>Banner Poetic Inscription</span>
                      </label>
                      <input
                        type="text"
                        value={bannerQuote}
                        onChange={(e) => setBannerQuote(e.target.value)}
                        placeholder="How to go for a little walk and never return"
                        maxLength={80}
                        className="w-full px-3.5 py-2 text-xs rounded-xl bg-[#F9F6F0] border border-black/10 focus:border-[#5438FF] focus:outline-hidden font-serif-dream italic text-[#1A1C23]"
                      />
                    </div>
                  </div>

                  <hr className="border-black/5" />

                  {/* Profile Photo Row */}
                  <div className="flex flex-col sm:flex-row sm:items-center gap-4 pt-1">
                    {/* Avatar Preview circle */}
                    <div className="relative shrink-0">
                      <div className="w-20 h-20 rounded-full p-[3px] bg-[#F9F6F0] border border-black/10 shadow-md overflow-hidden relative group">
                        <img
                          src={avatarPreview || defaultAvatar}
                          alt="Avatar preview"
                          className="w-full h-full rounded-full object-cover transition-transform"
                          style={{
                            transform: `scale(${avatarZoom})`,
                            objectPosition: avatarPosition,
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => avatarInputRef.current?.click()}
                          className="absolute inset-0 bg-black/40 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-full"
                          title="Upload new photo"
                        >
                          <Camera className="w-5 h-5" />
                        </button>
                      </div>
                      <span className="absolute bottom-1 right-1 w-3.5 h-3.5 rounded-full bg-[#5438FF] border-2 border-white" />
                    </div>

                    {/* Avatar Controls */}
                    <div className="space-y-2 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => avatarInputRef.current?.click()}
                          className="px-4 py-2 rounded-xl bg-[#5438FF]/10 hover:bg-[#5438FF]/15 text-[#5438FF] text-xs font-semibold flex items-center gap-1.5 transition-colors"
                        >
                          <Upload className="w-3.5 h-3.5" />
                          <span>Upload Photo</span>
                        </button>

                        {avatarPreview && avatarPreview !== defaultAvatar && (
                          <button
                            type="button"
                            onClick={handleRemoveAvatar}
                            className="px-3 py-2 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 text-xs font-medium flex items-center gap-1.5 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Remove</span>
                          </button>
                        )}
                      </div>

                      {/* Position & Zoom Controls */}
                      <div className="flex items-center gap-3 text-[11px] text-[#1A1C23]/60 pt-1">
                        <span>Framing:</span>
                        <div className="inline-flex rounded-lg border border-black/10 p-0.5 bg-[#F9F6F0]">
                          <button
                            type="button"
                            onClick={() => setAvatarPosition('top')}
                            className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                              avatarPosition === 'top'
                                ? 'bg-white shadow-xs text-[#5438FF]'
                                : 'text-[#1A1C23]/60'
                            }`}
                          >
                            Top
                          </button>
                          <button
                            type="button"
                            onClick={() => setAvatarPosition('center')}
                            className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                              avatarPosition === 'center'
                                ? 'bg-white shadow-xs text-[#5438FF]'
                                : 'text-[#1A1C23]/60'
                            }`}
                          >
                            Center
                          </button>
                          <button
                            type="button"
                            onClick={() => setAvatarPosition('bottom')}
                            className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                              avatarPosition === 'bottom'
                                ? 'bg-white shadow-xs text-[#5438FF]'
                                : 'text-[#1A1C23]/60'
                            }`}
                          >
                            Bottom
                          </button>
                        </div>

                        <div className="inline-flex rounded-lg border border-black/10 p-0.5 bg-[#F9F6F0]">
                          <button
                            type="button"
                            onClick={() => setAvatarZoom(1)}
                            className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                              avatarZoom === 1
                                ? 'bg-white shadow-xs text-[#5438FF]'
                                : 'text-[#1A1C23]/60'
                            }`}
                          >
                            1x
                          </button>
                          <button
                            type="button"
                            onClick={() => setAvatarZoom(1.25)}
                            className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                              avatarZoom === 1.25
                                ? 'bg-white shadow-xs text-[#5438FF]'
                                : 'text-[#1A1C23]/60'
                            }`}
                          >
                            1.25x
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              {/* SECTION 2: PROFILE INFORMATION */}
              <section id="section-information" className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#5438FF]" />
                    <h2 className="text-xs font-bold uppercase tracking-wider text-[#1A1C23]/60">
                      Profile Information
                    </h2>
                  </div>
                  <span className="text-xs text-[#1A1C23]/40">Identity & Bio</span>
                </div>

                <div className="bg-white rounded-[24px] p-5 border border-black/5 shadow-xs space-y-4">
                  {/* Display Name Field */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-[#1A1C23]">
                        Display Name <span className="text-red-500">*</span>
                      </label>
                      <span className="text-[11px] text-[#1A1C23]/50">
                        {displayName.trim().length} / 50
                      </span>
                    </div>
                    <input
                      id="input-display-name"
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="e.g. Isha Patel"
                      maxLength={50}
                      className="w-full px-4 py-2.5 rounded-xl bg-[#F9F6F0] border border-black/10 focus:border-[#5438FF] focus:bg-white focus:outline-hidden text-sm text-[#1A1C23] font-medium transition-all"
                    />
                    {displayName.trim().length > 0 && displayName.trim().length < 2 && (
                      <p className="text-[11px] text-red-500">
                        Display name must be at least 2 characters.
                      </p>
                    )}
                  </div>

                  {/* Username Field */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-[#1A1C23]">
                        Username <span className="text-red-500">*</span>
                      </label>
                      <span className="text-[11px] text-[#1A1C23]/50">
                        @{username.trim().toLowerCase()}
                      </span>
                    </div>

                    <div className="relative flex items-center">
                      <span className="absolute left-4 text-sm font-semibold text-[#5438FF] pointer-events-none">
                        @
                      </span>
                      <input
                        id="input-username"
                        type="text"
                        value={username}
                        onChange={(e) =>
                          setUsername(
                            e.target.value
                              .replace(/^@/, '')
                              .replace(/[^a-zA-Z0-9_]/g, '')
                              .toLowerCase()
                          )
                        }
                        placeholder="dreamer_handle"
                        maxLength={30}
                        className="w-full pl-8 pr-10 py-2.5 rounded-xl bg-[#F9F6F0] border border-black/10 focus:border-[#5438FF] focus:bg-white focus:outline-hidden text-sm text-[#1A1C23] font-medium transition-all"
                      />

                      {/* Username Status Icon */}
                      <div className="absolute right-3">
                        {usernameStatus === 'checking' && (
                          <Loader2 className="w-4 h-4 text-[#5438FF] animate-spin" />
                        )}
                        {usernameStatus === 'available' && (
                          <span
                            className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center"
                            title="Username available"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </span>
                        )}
                        {(usernameStatus === 'taken' || usernameStatus === 'invalid') && (
                          <span
                            className="w-5 h-5 rounded-full bg-red-100 text-red-700 flex items-center justify-center"
                            title={usernameMessage}
                          >
                            <AlertCircle className="w-3.5 h-3.5" />
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Availability message */}
                    <div className="flex items-center justify-between text-[11px]">
                      <p
                        className={`transition-colors ${
                          usernameStatus === 'available'
                            ? 'text-emerald-600 font-medium'
                            : usernameStatus === 'taken' || usernameStatus === 'invalid'
                            ? 'text-red-600 font-medium'
                            : 'text-[#1A1C23]/50'
                        }`}
                      >
                        {usernameMessage || '3-30 letters, numbers, and underscores'}
                      </p>
                      <span className="text-[#1A1C23]/40">Permanent URL handle</span>
                    </div>
                  </div>

                  {/* Bio Field */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-[#1A1C23]">Bio</label>
                      <span
                        className={`text-[11px] ${
                          bio.length > 180 ? 'text-amber-600 font-bold' : 'text-[#1A1C23]/50'
                        }`}
                      >
                        {bio.length} / 200
                      </span>
                    </div>
                    <textarea
                      id="input-bio"
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                      placeholder="Share a glimpse into your dreams, recurring symbols, or nighttime psyche..."
                      rows={3}
                      maxLength={200}
                      className="w-full px-4 py-2.5 rounded-xl bg-[#F9F6F0] border border-black/10 focus:border-[#5438FF] focus:bg-white focus:outline-hidden text-sm text-[#1A1C23] font-normal resize-none transition-all leading-relaxed"
                    />
                    <p className="text-[11px] text-[#1A1C23]/50">
                      Appears on your public profile and dream card headers.
                    </p>
                  </div>
                </div>
              </section>

              {/* SECTION 3: ACCOUNT & DISCOVERY */}
              <section id="section-discovery" className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#5438FF]" />
                    <h2 className="text-xs font-bold uppercase tracking-wider text-[#1A1C23]/60">
                      Discovery & Privacy
                    </h2>
                  </div>
                  <span className="text-xs text-[#1A1C23]/40">Audience controls</span>
                </div>

                <div className="bg-white rounded-[24px] p-5 border border-black/5 shadow-xs space-y-4">
                  {/* Search Discoverability Toggle */}
                  <div className="flex items-center justify-between gap-4">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <Eye className="w-4 h-4 text-[#5438FF]" />
                        <h3 className="text-xs font-semibold text-[#1A1C23]">
                          Discoverable in Search
                        </h3>
                      </div>
                      <p className="text-[11px] text-[#1A1C23]/60">
                        Allow other dreamers to find your profile by name or @handle in Search.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setDiscoverableInSearch(!discoverableInSearch)}
                      className={`w-11 h-6 rounded-full transition-colors relative p-0.5 shrink-0 ${
                        discoverableInSearch ? 'bg-[#5438FF]' : 'bg-black/15'
                      }`}
                    >
                      <span
                        className={`block w-5 h-5 rounded-full bg-white shadow-xs transition-transform ${
                          discoverableInSearch ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                  <hr className="border-black/5" />

                  {/* Nearby Opt-In Toggle */}
                  <div className="flex items-center justify-between gap-4">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <Shield className="w-4 h-4 text-[#5438FF]" />
                        <h3 className="text-xs font-semibold text-[#1A1C23]">
                          Nearby Dream Echoes
                        </h3>
                      </div>
                      <p className="text-[11px] text-[#1A1C23]/60">
                        Opt in to localized anonymous dream exchange within your region.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setNearbyOptIn(!nearbyOptIn)}
                      className={`w-11 h-6 rounded-full transition-colors relative p-0.5 shrink-0 ${
                        nearbyOptIn ? 'bg-[#5438FF]' : 'bg-black/15'
                      }`}
                    >
                      <span
                        className={`block w-5 h-5 rounded-full bg-white shadow-xs transition-transform ${
                          nearbyOptIn ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </section>
            </>
          )}

          {/* TAB 2: LIVE PROFILE PREVIEW */}
          {activeTab === 'preview' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-[#1A1C23]/60">
                  Live Profile Appearance
                </span>
                <span className="text-xs text-[#5438FF] font-medium flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5" /> What others will see
                </span>
              </div>

              {/* Exact Mock Profile Card */}
              <div className="bg-[#F9F6F0] rounded-[28px] border border-black/10 overflow-hidden shadow-md">
                {/* Banner */}
                <div
                  className="h-36 relative overflow-hidden px-6 pt-5 shadow-xs"
                  style={{
                    backgroundImage: bannerPreview ? `url(${bannerPreview})` : undefined,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    background: !bannerPreview
                      ? 'linear-gradient(135deg, #C2B8FF 0%, #DCD6FE 45%, #B4A4FF 100%)'
                      : undefined,
                  }}
                >
                  {bannerPreview && (
                    <div className="absolute inset-0 bg-black/25 backdrop-blur-[0.5px]" />
                  )}

                  <div className="relative z-10 max-w-[220px] ml-auto text-right pr-1">
                    <h2
                      className={`font-serif-dream italic font-bold text-[17px] leading-[1.22] tracking-tight ${
                        bannerPreview ? 'text-white drop-shadow-sm' : 'text-[#1A1C23]'
                      }`}
                    >
                      {bannerQuote || 'How to go for a little walk and never return'}
                    </h2>
                    <svg
                      className={`w-20 ml-auto mt-1 fill-none ${
                        bannerPreview ? 'stroke-white/90' : 'stroke-[#5438FF] opacity-80'
                      }`}
                      height="6"
                      viewBox="0 0 80 6"
                    >
                      <path d="M2 3.5 C 20 1, 50 6, 78 2" strokeLinecap="round" strokeWidth="2" />
                    </svg>
                  </div>
                </div>

                {/* Profile Identity Details */}
                <div className="px-6 pt-0 pb-6 relative">
                  {/* Floating Avatar */}
                  <div className="-mt-10 mb-3">
                    <div className="w-[88px] h-[88px] rounded-full p-[3.5px] bg-[#F9F6F0] shadow-md border border-black/5 relative">
                      <img
                        src={avatarPreview || defaultAvatar}
                        alt="Avatar preview"
                        className="w-full h-full rounded-full object-cover"
                        style={{
                          transform: `scale(${avatarZoom})`,
                          objectPosition: avatarPosition,
                        }}
                      />
                      <span className="absolute bottom-1 right-1 w-4 h-4 rounded-full bg-[#5438FF] border-2 border-white shadow-xs" />
                    </div>
                  </div>

                  {/* Name and Handle */}
                  <div className="space-y-1">
                    <h3 className="font-serif-dream text-2xl font-bold text-[#1A1C23]">
                      {displayName.trim() || 'Your Name'}
                    </h3>
                    <p className="text-xs font-semibold text-[#5438FF]">
                      @{username.trim().toLowerCase() || 'username'}
                    </p>
                  </div>

                  {/* Bio */}
                  <p className="text-xs text-[#1A1C23]/80 mt-3 leading-relaxed max-w-md font-sans-ui">
                    {bio.trim() || 'No bio entered yet.'}
                  </p>

                  {/* Stats sample */}
                  <div className="flex items-center gap-6 mt-5 pt-4 border-t border-black/5">
                    <div>
                      <span className="font-bold text-sm text-[#1A1C23]">
                        {currentUser.followersCount || 0}
                      </span>
                      <span className="text-[11px] text-[#1A1C23]/50 ml-1">Followers</span>
                    </div>
                    <div>
                      <span className="font-bold text-sm text-[#1A1C23]">
                        {currentUser.followingCount || 0}
                      </span>
                      <span className="text-[11px] text-[#1A1C23]/50 ml-1">Following</span>
                    </div>
                    <div>
                      <span className="font-bold text-sm text-[#1A1C23]">
                        {currentUser.dreamsCount || 0}
                      </span>
                      <span className="text-[11px] text-[#1A1C23]/50 ml-1">Dreams</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Bottom Footer */}
        <footer className="px-6 py-4 border-t border-[#1A1C23]/10 bg-white/70 backdrop-blur-xs flex items-center justify-between">
          <button
            type="button"
            onClick={handleAttemptClose}
            className="text-xs font-medium text-[#1A1C23]/60 hover:text-[#1A1C23] px-3 py-2 rounded-xl hover:bg-black/5 transition-colors"
          >
            Cancel
          </button>

          <div className="flex items-center gap-3">
            {isDirty && (
              <span className="text-[11px] text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200">
                Unsaved changes
              </span>
            )}
            <button
              type="button"
              onClick={handleSaveChanges}
              disabled={
                isSaving ||
                !displayName.trim() ||
                usernameStatus === 'taken' ||
                usernameStatus === 'invalid'
              }
              className={`px-6 py-2.5 rounded-full font-medium text-sm transition-all flex items-center gap-2 ${
                isSaving ||
                !displayName.trim() ||
                usernameStatus === 'taken' ||
                usernameStatus === 'invalid'
                  ? 'bg-[#5438FF]/40 text-white cursor-not-allowed'
                  : 'bg-[#5438FF] hover:bg-[#4326ea] text-white shadow-md active:scale-95'
              }`}
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Saving to Supabase...</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>Save Changes</span>
                </>
              )}
            </button>
          </div>
        </footer>
      </div>

      {/* Discard Confirmation Dialog */}
      {showDiscardConfirm && (
        <div className="fixed inset-0 z-60 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-5 max-w-sm w-full shadow-2xl border border-black/10 space-y-4 animate-in fade-in zoom-in-95 font-sans-ui">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="font-serif-dream text-base font-bold text-[#1A1C23]">
                  Discard changes?
                </h3>
                <p className="text-xs text-[#1A1C23]/70 leading-relaxed">
                  You have unsaved changes to your profile identity. If you leave now, these changes
                  will be lost.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowDiscardConfirm(false)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-[#1A1C23]/80 hover:bg-black/5 transition-colors"
              >
                Keep Editing
              </button>
              <button
                type="button"
                onClick={handleConfirmDiscard}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-red-600 hover:bg-red-700 text-white shadow-xs transition-colors"
              >
                Discard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

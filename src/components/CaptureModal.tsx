import React, { useState, useEffect, useRef } from 'react';
import {
  Mic,
  MicOff,
  Edit3,
  X,
  Check,
  Globe,
  Lock,
  Users,
  Sparkles,
  Video,
  Clock,
  Compass,
  BookOpen,
  Image as ImageIcon,
  Film,
  Upload,
  Link2,
  Trash2,
  Layers,
  Play,
  Info,
  Palette,
  Loader2,
  AlertCircle,
  LogIn
} from 'lucide-react';
import { Audience, Dream, PublishingSurfaces, AuthUser } from '../types';
import {
  CARD_COLOR_PRESETS,
  DEFAULT_CARD_PRESET,
  CardColorPreset,
  deriveCardTheme,
  isColorDark,
  adjustColor,
} from '../utils/cardColors';
import { getSupportedAudioMimeType } from '../utils/voiceCapture';
import { saveVoiceNote } from '../services/voiceNoteService';
import { supabase } from '../services/supabase';

interface CaptureModalProps {
  isOpen: boolean;
  initialDream?: Dream | null;
  currentUser?: AuthUser | null;
  onClose: () => void;
  onSaveDream: (
    newDream: Omit<Dream, 'id' | 'likes' | 'commentsCount' | 'viewsCount' | 'comments' | 'circleThreads'> & { id?: string },
    createClipPrompt?: boolean,
    surfaces?: PublishingSurfaces,
    mediaFile?: File | null,
    voiceNotePath?: string | null
  ) => void | Promise<void>;
  onOpenLogin?: () => void;
}

interface MediaPreset {
  id: string;
  name: string;
  kind: 'image' | 'video';
  url: string;
  tag: string;
}

const ATMOSPHERIC_PRESETS: MediaPreset[] = [
  {
    id: 'p-water-door',
    name: 'Door of Water',
    kind: 'image',
    url: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=800&q=80',
    tag: 'Surreal',
  },
  {
    id: 'p-violet-nebula',
    name: 'Violet Twilight',
    kind: 'image',
    url: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=800&q=80',
    tag: 'Lucid',
  },
  {
    id: 'p-misty-forest',
    name: 'Submerged Pines',
    kind: 'image',
    url: 'https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=800&q=80',
    tag: 'Recurring',
  },
  {
    id: 'p-infinite-hall',
    name: 'Luminous Corridor',
    kind: 'image',
    url: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=800&q=80',
    tag: 'Architecture',
  },
  {
    id: 'p-golden-clouds',
    name: 'Cloud Pavilion',
    kind: 'image',
    url: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=800&q=80',
    tag: 'Atmosphere',
  },
  {
    id: 'p-dream-river-loop',
    name: 'Atmospheric Loop',
    kind: 'video',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    tag: 'Video',
  },
];

export const CaptureModal: React.FC<CaptureModalProps> = ({
  isOpen,
  initialDream,
  currentUser,
  onClose,
  onSaveDream,
  onOpenLogin,
}) => {
  const [hasActiveSession, setHasActiveSession] = useState<boolean>(false);

  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    const verifySession = async () => {
      // Reject missing, guest, demo, or u- prefixed IDs immediately
      if (
        !currentUser ||
        currentUser.isGuest ||
        currentUser.isDemo ||
        !currentUser.id ||
        currentUser.id.startsWith('u-')
      ) {
        if (isMounted) setHasActiveSession(false);
        return;
      }

      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (isMounted) {
          if (error || !session?.user || session.user.id !== currentUser.id) {
            setHasActiveSession(false);
          } else {
            setHasActiveSession(true);
          }
        }
      } catch {
        if (isMounted) setHasActiveSession(false);
      }
    };

    verifySession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (isMounted) {
        const isValid = Boolean(
          session?.user &&
          currentUser &&
          !currentUser.isGuest &&
          !currentUser.isDemo &&
          !currentUser.id.startsWith('u-') &&
          session.user.id === currentUser.id
        );
        setHasActiveSession(isValid);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [isOpen, currentUser]);

  const isUserAuthenticated = Boolean(
    hasActiveSession &&
    currentUser &&
    !currentUser.isGuest &&
    !currentUser.isDemo &&
    currentUser.id &&
    !currentUser.id.startsWith('u-')
  );

  const [step, setStep] = useState<'record' | 'review'>('record');
  const [isRecording, setIsRecording] = useState(false);
  const [secondsElapsed, setSecondsElapsed] = useState(0);
  const [transcript, setTranscript] = useState('');
  const [captureError, setCaptureError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [publishError, setPublishError] = useState('');
  const [title, setTitle] = useState('');
  const [hook, setHook] = useState('');
  const [audience, setAudience] = useState<Audience>('public');
  const [category, setCategory] = useState<'Surreal' | 'Recurring' | 'Lucid' | 'Nightmares'>('Surreal');

  // Media Attachment State (Bound directly to the Canonical Dream)
  const [mediaKind, setMediaKind] = useState<'none' | 'image' | 'video' | 'preset'>('none');
  const [mediaUrl, setMediaUrl] = useState<string>('');
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaCaption, setMediaCaption] = useState<string>('');
  const [mediaTab, setMediaTab] = useState<'presets' | 'upload' | 'url'>('presets');
  const [customUrlInput, setCustomUrlInput] = useState<string>('');
  const [customUrlKind, setCustomUrlKind] = useState<'image' | 'video'>('image');

  // The 4 Publishing Surfaces attached to the 1 Canonical Dream
  const [publishNormalPost, setPublishNormalPost] = useState(true);
  const [publishLastNightStory, setPublishLastNightStory] = useState(true);
  const [publishNearby, setPublishNearby] = useState(true);
  const [publishClip, setPublishClip] = useState(false);

  // Card Color Customization State
  const [selectedPresetId, setSelectedPresetId] = useState<string>(DEFAULT_CARD_PRESET.id);
  const [cardColor, setCardColor] = useState<string>(DEFAULT_CARD_PRESET.cardColor);
  const [cardBorderColor, setCardBorderColor] = useState<string>(DEFAULT_CARD_PRESET.cardBorderColor);
  const [cardTextColor, setCardTextColor] = useState<string>(DEFAULT_CARD_PRESET.cardTextColor);
  const [isCustomColorMode, setIsCustomColorMode] = useState<boolean>(false);
  const [customHexInput, setCustomHexInput] = useState<string>(DEFAULT_CARD_PRESET.cardColor);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<any>(null);
  const voiceNotePathRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const sampleVoicePrompts = [
    "I was walking along the beach at dusk, but when I took off my shoes, the sand was entirely made of tiny brass clock gears that ticked against my toes...",
    "Every flight of stairs led directly onto a rooftop in a city of blue tiles. I met an old friend who told me the clouds were made of spun sugar...",
    "The library books had empty pages, but when I held them up to the sunlight, voices read them aloud in languages I understood without thinking...",
  ];

  useEffect(() => {
    if (!isOpen) {
      setStep('record');
      setIsRecording(false);
      setSecondsElapsed(0);
      setTranscript('');
      setCaptureError('');
      setIsSubmitting(false);
      setPublishError('');
      voiceNotePathRef.current = null;
      audioChunksRef.current = [];
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
      mediaRecorderRef.current = null;
      setTitle('');
      setHook('');
      setMediaKind('none');
      setMediaUrl('');
      setMediaFile(null);
      setMediaCaption('');
      setCustomUrlInput('');
      setSelectedPresetId(DEFAULT_CARD_PRESET.id);
      setCardColor(DEFAULT_CARD_PRESET.cardColor);
      setCardBorderColor(DEFAULT_CARD_PRESET.cardBorderColor);
      setCardTextColor(DEFAULT_CARD_PRESET.cardTextColor);
      setIsCustomColorMode(false);
      setCustomHexInput(DEFAULT_CARD_PRESET.cardColor);
      if (timerRef.current) clearInterval(timerRef.current);
    } else if (initialDream) {
      setStep('customize');
      setIsRecording(false);
      setTitle(initialDream.title || '');
      setHook(initialDream.hook || '');
      setTranscript(initialDream.content || initialDream.rawTranscript || '');
      setCategory(initialDream.category || 'Surreal');
      setAudience(initialDream.audience || 'public');
      setPublishNormalPost(initialDream.surfaces?.isNormalPost ?? true);
      setPublishLastNightStory(initialDream.surfaces?.isStory ?? true);
      setPublishNearby(initialDream.surfaces?.isNearby ?? true);
      setPublishClip(initialDream.surfaces?.hasClip ?? Boolean(initialDream.hasClip));
      setMediaUrl(initialDream.mediaUrl || initialDream.imageUrl || initialDream.clipVideoUrl || '');
      setMediaKind(initialDream.mediaKind || (initialDream.clipVideoUrl ? 'video' : (initialDream.imageUrl ? 'image' : 'none')));
      setMediaCaption(initialDream.mediaCaption || '');
      setCustomUrlInput(initialDream.mediaUrl || initialDream.imageUrl || initialDream.clipVideoUrl || '');

      const currentCardColor = initialDream.cardColor || DEFAULT_CARD_PRESET.cardColor;
      const matchedPreset = CARD_COLOR_PRESETS.find(
        (p) => p.cardColor.toLowerCase() === currentCardColor.toLowerCase()
      );
      if (matchedPreset) {
        setSelectedPresetId(matchedPreset.id);
        setCardColor(matchedPreset.cardColor);
        setCardBorderColor(initialDream.cardBorderColor || matchedPreset.cardBorderColor);
        setCardTextColor(initialDream.cardTextColor || matchedPreset.cardTextColor);
        setIsCustomColorMode(false);
        setCustomHexInput(matchedPreset.cardColor);
      } else {
        const theme = deriveCardTheme(currentCardColor);
        setSelectedPresetId('custom');
        setCardColor(currentCardColor);
        setCardBorderColor(initialDream.cardBorderColor || theme.cardBorderColor);
        setCardTextColor(initialDream.cardTextColor || theme.cardTextColor);
        setIsCustomColorMode(true);
        setCustomHexInput(currentCardColor);
      }
    }
  }, [isOpen, initialDream]);

  const handleSelectCardPreset = (preset: CardColorPreset) => {
    setSelectedPresetId(preset.id);
    setCardColor(preset.cardColor);
    setCardBorderColor(preset.cardBorderColor);
    setCardTextColor(preset.cardTextColor);
    setIsCustomColorMode(false);
    setCustomHexInput(preset.cardColor);
  };

  const handleCustomColorChange = (hexValue: string) => {
    setCustomHexInput(hexValue);
    const theme = deriveCardTheme(hexValue);
    setSelectedPresetId('custom');
    setCardColor(theme.cardColor);
    setCardBorderColor(theme.cardBorderColor);
    setCardTextColor(theme.cardTextColor);
    setIsCustomColorMode(true);
  };

  const clearRecordingResources = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    mediaRecorderRef.current = null;
    audioChunksRef.current = [];
    setIsRecording(false);
  };

  const moveToTranscriptReview = (finalTranscript: string, savedVoicePath?: string) => {
    const normalizedTranscript = finalTranscript.trim();

    setCaptureError('');
    setTranscript(normalizedTranscript);
    if (savedVoicePath) {
      voiceNotePathRef.current = savedVoicePath;
    }

    const words = normalizedTranscript ? normalizedTranscript.split(/\s+/) : [];
    const generatedTitle =
      words.slice(0, 5).join(' ').toUpperCase().replace(/[^A-Z0-9\s]/gi, '') || 'VOICE DREAM FRAGMENT';
    const generatedHook = normalizedTranscript ? `"${words.slice(0, 8).join(' ')}..."` : '"Add a hook to this voice memory..."';

    setTitle(generatedTitle);
    setHook(generatedHook);
    setStep('review');
  };

  const handleRecordingStopped = async () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    mediaRecorderRef.current = null;
    setIsRecording(false);

    const chunks = audioChunksRef.current;
    audioChunksRef.current = [];
    const audioBlob = new Blob(chunks, { type: chunks[0]?.type || 'audio/webm' });

    if (!audioBlob.size) {
      setCaptureError('No audio was captured. Please try again.');
      return;
    }

    if (!currentUser?.id || currentUser.isGuest) {
      setCaptureError('Sign in to preserve a voice Dream.');
      return;
    }

    setCaptureError('Saving your voice memory…');
    const captureId = crypto.randomUUID();

    try {
      const result = await saveVoiceNote(audioBlob, currentUser.id, captureId);
      voiceNotePathRef.current = result.path;
      moveToTranscriptReview('', result.path);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Voice recording could not be saved. Please try again.';
      setCaptureError(message);
    }
  };

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setCaptureError('This browser cannot record microphone audio. Please use a current Chrome, Edge, or Safari browser.');
      return;
    }

    try {
      setCaptureError('');
      setTranscript('');
      setSecondsElapsed(0);
      audioChunksRef.current = [];

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const supportedMimeType = getSupportedAudioMimeType(MediaRecorder.isTypeSupported.bind(MediaRecorder));
      const recorder = supportedMimeType
        ? new MediaRecorder(stream, { mimeType: supportedMimeType })
        : new MediaRecorder(stream);

      recorder.ondataavailable = (event) => {
        if (event.data?.size) {
          audioChunksRef.current.push(event.data);
        }
      };
      recorder.onerror = () => {
        setCaptureError('The microphone recording failed. Please try again.');
        clearRecordingResources();
      };
      recorder.onstop = () => {
        void handleRecordingStopped();
      };

      mediaRecorderRef.current = recorder;
      recorder.start(250);
      setIsRecording(true);

      timerRef.current = setInterval(() => {
        setSecondsElapsed((prev) => prev + 1);
      }, 1000);
    } catch (error) {
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
      const message = error instanceof DOMException && error.name === 'NotAllowedError'
        ? 'Microphone permission was denied. Please allow microphone access and try again.'
        : 'Could not start microphone recording. Please try again.';
      setCaptureError(message);
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') {
      clearRecordingResources();
      return;
    }

    recorder.stop();
  };

  const handleManualType = () => {
    setCaptureError('');
    setTranscript(sampleVoicePrompts[0]);
    setTitle('A WALK THROUGH TICKING GEARS');
    setHook('"The sand was entirely made of tiny brass clock gears..."');
    setStep('review');
  };

  // Handle Preset selection
  const handleSelectPreset = (preset: MediaPreset) => {
    setMediaFile(null);
    setMediaUrl(preset.url);
    setMediaKind(preset.kind);
    // If user picks a video preset, automatically suggest enabling the Clip surface
    if (preset.kind === 'video') {
      setPublishClip(true);
    }
  };

  // Handle File Upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isVideo = file.type.startsWith('video/');
    setMediaFile(file);
    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      if (result) {
        setMediaUrl(result);
        setMediaKind(isVideo ? 'video' : 'image');
        if (isVideo) {
          setPublishClip(true);
        }
      }
    };
    reader.readAsDataURL(file);
  };

  // Handle Custom URL attachment
  const handleApplyCustomUrl = () => {
    if (!customUrlInput.trim()) return;
    setMediaFile(null);
    setMediaUrl(customUrlInput.trim());
    setMediaKind(customUrlKind);
    if (customUrlKind === 'video') {
      setPublishClip(true);
    }
  };

  // Handle Clear Media
  const handleRemoveMedia = () => {
    setMediaUrl('');
    setMediaFile(null);
    setMediaKind('none');
    setMediaCaption('');
  };

  const handleSave = async () => {
    if (!isUserAuthenticated || !currentUser) {
      const errorMsg = 'Please log in to publish your Dream.';
      setCaptureError(errorMsg);
      setPublishError(errorMsg);
      return;
    }

    // Authoritative check: verify active Supabase session
    const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
    if (sessionErr || !sessionData?.session?.user || sessionData.session.user.id !== currentUser.id) {
      const errorMsg = 'Please log in to publish your Dream. An active Supabase Auth session is required.';
      setCaptureError(errorMsg);
      setPublishError(errorMsg);
      setHasActiveSession(false);
      return;
    }

    if (!transcript.trim()) {
      const errorMsg = 'Add the dream transcript before publishing.';
      setCaptureError(errorMsg);
      setPublishError(errorMsg);
      return;
    }

    setPublishError('');
    setIsSubmitting(true);

    try {
      const surfaces: PublishingSurfaces = {
        normalPost: publishNormalPost,
        lastNightStory: publishLastNightStory,
        nearbyShare: publishNearby,
        clip: publishClip,
      };

      const hasMedia = Boolean(mediaUrl);
      const isVideo = mediaKind === 'video';

      const authorObj = {
        id: currentUser.id,
        name: currentUser.name,
        handle: currentUser.handle,
        avatar: currentUser.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
        initials: currentUser.initials || currentUser.name[0] || 'D',
        color: currentUser.color || '#5438FF',
      };

      const rawDream: Omit<Dream, 'id' | 'likes' | 'commentsCount' | 'viewsCount' | 'comments' | 'circleThreads'> & { id?: string } = {
        ...(initialDream?.id ? { id: initialDream.id } : {}),
        title: title.trim() || 'UNTITLED DREAM',
        hook: hook.trim() || `"${transcript.slice(0, 45)}..."`,
        content: transcript.trim(),
        rawTranscript: transcript.trim(),
        author: authorObj,
        timeAgo: initialDream?.timeAgo || 'Just now',
        capturedTime: initialDream?.capturedTime || `captured ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
        category,
        tags: initialDream?.tags || [category, 'DreamWorld', 'Canonical'],
        audience,
        isNearbyEligible: publishNearby,
        region: initialDream?.region || 'Bhubaneswar area',
        isLiked: initialDream?.isLiked || false,
        isSaved: initialDream?.isSaved || false,
        hasClip: publishClip || isVideo,
        clipDuration: isVideo ? (initialDream?.clipDuration || '00:30') : undefined,
        clipVideoUrl: isVideo ? mediaUrl : undefined,
        imageUrl: (!isVideo && hasMedia) ? mediaUrl : undefined,
        mediaUrl: hasMedia ? mediaUrl : undefined,
        mediaKind: hasMedia ? mediaKind : 'none',
        mediaCaption: mediaCaption.trim() || undefined,
        mediaType: isVideo ? 'video' : (hasMedia ? 'image' : 'illustration'),
        cardColor,
        cardBorderColor,
        cardTextColor,
        surfaces: {
          isNormalPost: publishNormalPost,
          isStory: publishLastNightStory,
          isNearby: publishNearby,
          hasClip: publishClip || isVideo,
        },
      };

      await onSaveDream(rawDream, publishClip || isVideo, surfaces, mediaFile, voiceNotePathRef.current);
      onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to publish dream. Please try again.';
      setPublishError(message);
      setCaptureError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const formatTimer = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-end sm:items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-[#F9F6F0] w-full max-w-[460px] max-h-[92vh] rounded-[32px] sm:rounded-[36px] p-5 sm:p-6 shadow-2xl border border-white/20 flex flex-col relative animate-in fade-in slide-in-from-bottom-6 duration-200 overflow-y-auto no-scrollbar">
        {/* Close button */}
        <button
          onClick={onClose}
          disabled={isSubmitting}
          aria-label="Close capture"
          className="absolute top-5 right-5 w-8 h-8 rounded-full bg-[#1A1C23]/5 hover:bg-[#1A1C23]/10 flex items-center justify-center text-[#1A1C23] z-10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <X className="w-4 h-4" />
        </button>

        {step === 'record' ? (
          /* Voice-first recording screen */
          <div className="flex flex-col items-center text-center pt-3 pb-2">
            <span className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-[#5438FF] mb-1">
              + Capture Dream Memory
            </span>
            <h2 className="font-serif-dream text-[32px] font-bold text-[#1A1C23] leading-tight">
              What happened?
            </h2>
            <p className="font-editorial italic text-[16px] text-[#5438FF] mt-1">
              Speak it before it fades into the waking world.
            </p>

            {/* Live Audio Visualizer / Pulse Orb */}
            <div className="relative my-8 flex items-center justify-center">
              {isRecording && (
                <>
                  <div className="absolute w-44 h-44 rounded-full bg-[#5438FF]/15 animate-ping" />
                  <div className="absolute w-36 h-36 rounded-full bg-[#5438FF]/25 animate-pulse" />
                </>
              )}

              <button
                onClick={isRecording ? stopRecording : startRecording}
                className={`w-28 h-28 rounded-full flex flex-col items-center justify-center shadow-xl transition-all duration-300 relative z-10 ${
                  isRecording
                    ? 'bg-rose-500 text-white scale-105 shadow-rose-500/40'
                    : 'bg-[#5438FF] text-white hover:scale-105 active:scale-95 shadow-[#5438FF]/40'
                }`}
              >
                {isRecording ? (
                  <>
                    <MicOff className="w-8 h-8 stroke-[2.2] animate-bounce" />
                    <span className="text-[10px] font-bold tracking-wider uppercase mt-1">
                      Tap to Stop
                    </span>
                  </>
                ) : (
                  <>
                    <Mic className="w-8 h-8 stroke-[2.2]" />
                    <span className="text-[10px] font-bold tracking-wider uppercase mt-1">
                      Tap to Speak
                    </span>
                  </>
                )}
              </button>
            </div>

            {captureError && (
              <div role="alert" className="w-full rounded-xl bg-rose-50 border border-rose-200 px-3 py-2 text-xs font-medium text-rose-700">
                {captureError}
              </div>
            )}

            {/* Timer or Status */}
            <div className="h-8 flex items-center justify-center">
              {isRecording ? (
                <div className="flex items-center gap-2 text-rose-600 font-mono font-bold text-sm tracking-wider">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping" />
                  <span>{formatTimer(secondsElapsed)}</span>
                </div>
              ) : (
                <span className="text-xs text-[#1A1C23]/50 font-medium">
                  Microphone ready · Audio will be preserved
                </span>
              )}
            </div>

            {/* Manual fallback option */}
            <div className="mt-4 pt-4 border-t border-[#1A1C23]/10 w-full flex items-center justify-center">
              <button
                onClick={handleManualType}
                className="text-xs font-semibold text-[#1A1C23]/70 hover:text-[#5438FF] flex items-center gap-1.5 transition-colors"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Or write dream transcript directly</span>
              </button>
            </div>
          </div>
        ) : (
          /* Review transcript, attach media, configure surfaces */
          <div className="flex flex-col space-y-3.5 pt-1">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#5438FF] block">
                  {initialDream ? 'Edit Dream & Atmosphere' : 'Canonical Dream Form'}
                </span>
                <span className="text-[10px] text-[#1A1C23]/50">
                  {initialDream ? 'Update dream atmosphere, styling, and details' : 'One unified dream powering all chosen views'}
                </span>
              </div>
              {!initialDream && (
                <button
                  onClick={() => setStep('record')}
                  className="text-xs font-semibold text-[#1A1C23]/50 hover:text-[#1A1C23] px-2 py-1 rounded-lg hover:bg-[#1A1C23]/5"
                >
                  Re-record
                </button>
              )}
            </div>

            {/* Title & Hook */}
            <div>
              <label className="text-[10px] font-bold text-[#1A1C23]/60 uppercase">Title</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="TITLE OF YOUR DREAM"
                className="w-full bg-white border border-[#1A1C23]/15 rounded-xl px-3 py-2 text-sm font-bold uppercase text-[#1A1C23] focus:ring-1 focus:ring-[#5438FF]"
              />
            </div>

            <div>
              <label className="text-[10px] font-bold text-[#1A1C23]/60 uppercase">Hook line</label>
              <input
                value={hook}
                onChange={(e) => setHook(e.target.value)}
                placeholder='"The memory began when..."'
                className="w-full bg-white border border-[#1A1C23]/15 rounded-xl px-3 py-1.5 text-xs font-editorial italic text-[#1A1C23] focus:ring-1 focus:ring-[#5438FF]"
              />
            </div>

            {/* Full Transcript */}
            <div>
              <label className="text-[10px] font-bold text-[#1A1C23]/60 uppercase">
                Raw Memory Transcript
              </label>
              <textarea
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                rows={3}
                placeholder="Details of the dream experience..."
                className="w-full bg-white border border-[#1A1C23]/15 rounded-xl p-3 text-xs text-[#1A1C23] leading-relaxed focus:ring-1 focus:ring-[#5438FF]"
              />
            </div>

            {/* Category selection */}
            <div>
              <label className="text-[10px] font-bold text-[#1A1C23]/60 uppercase block mb-1">
                Category
              </label>
              <div className="flex gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                {(['Surreal', 'Recurring', 'Lucid', 'Nightmares'] as const).map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategory(cat)}
                    className={`px-3 py-1 rounded-full text-[11px] font-bold transition-colors ${
                      category === cat
                        ? 'bg-[#5438FF] text-white'
                        : 'bg-white border border-[#1A1C23]/10 text-[#1A1C23]/70'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* CARD COLOR & ATMOSPHERE CUSTOMIZATION */}
            <div className="bg-white p-3.5 rounded-2xl border border-[#1A1C23]/10 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Palette className="w-3.5 h-3.5 text-[#5438FF]" />
                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#1A1C23]">
                    Card Atmosphere & Color
                  </span>
                </div>
                <span
                  className="text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase transition-all shadow-xs"
                  style={{
                    backgroundColor: cardColor,
                    color: cardTextColor,
                    borderBottom: `2px solid ${cardBorderColor}`,
                  }}
                >
                  {selectedPresetId === 'custom' ? 'Custom' : CARD_COLOR_PRESETS.find(p => p.id === selectedPresetId)?.name || 'Custom'}
                </span>
              </div>

              <p className="text-[11px] text-[#1A1C23]/60">
                Choose the background tint for your dream card in the feed, stories, and profile.
              </p>

              {/* Swatches Grid */}
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                {CARD_COLOR_PRESETS.map((preset) => {
                  const isSelected = !isCustomColorMode && selectedPresetId === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => handleSelectCardPreset(preset)}
                      className={`flex flex-col items-center p-2 rounded-xl border text-center transition-all cursor-pointer ${
                        isSelected
                          ? 'border-[#5438FF] bg-[#5438FF]/5 ring-2 ring-[#5438FF]/30 shadow-xs'
                          : 'border-[#1A1C23]/10 hover:border-[#1A1C23]/30 bg-[#F9F6F0]/40'
                      }`}
                    >
                      <div
                        className="w-7 h-7 rounded-full shadow-inner border border-black/10 flex items-center justify-center mb-1 shrink-0"
                        style={{ backgroundColor: preset.cardColor }}
                      >
                        {isSelected && (
                          <Check
                            className="w-3.5 h-3.5"
                            style={{ color: preset.cardTextColor }}
                          />
                        )}
                      </div>
                      <span className="text-[11px] font-bold text-[#1A1C23] truncate w-full">
                        {preset.name}
                      </span>
                      <span className="text-[9px] text-[#1A1C23]/50 truncate w-full">
                        {preset.label}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Custom Color Selector & Live Input */}
              <div className="pt-2 border-t border-[#1A1C23]/10 flex flex-wrap sm:flex-nowrap items-center justify-between gap-2.5">
                <div className="flex items-center gap-2">
                  <label
                    className={`relative flex items-center gap-2 px-2.5 py-1.5 rounded-xl border cursor-pointer transition-all ${
                      isCustomColorMode
                        ? 'border-[#5438FF] bg-[#5438FF]/10 ring-1 ring-[#5438FF]'
                        : 'border-[#1A1C23]/15 bg-[#F9F6F0] hover:border-[#1A1C23]/30'
                    }`}
                  >
                    <input
                      type="color"
                      value={cardColor.startsWith('#') && cardColor.length === 7 ? cardColor : '#D8D4FF'}
                      onChange={(e) => handleCustomColorChange(e.target.value)}
                      className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    />
                    <div
                      className="w-4 h-4 rounded-full border border-black/15 shrink-0"
                      style={{ backgroundColor: cardColor }}
                    />
                    <span className="text-[11px] font-bold text-[#1A1C23]">
                      Custom Swatch
                    </span>
                  </label>

                  <div className="flex items-center gap-1 bg-[#F9F6F0] border border-[#1A1C23]/15 rounded-xl px-2 py-1">
                    <span className="text-[10px] font-mono text-[#1A1C23]/50">HEX</span>
                    <input
                      type="text"
                      value={customHexInput}
                      onChange={(e) => handleCustomColorChange(e.target.value)}
                      placeholder="#D8D4FF"
                      maxLength={7}
                      className="w-18 text-[11px] font-mono font-bold text-[#1A1C23] bg-transparent outline-none uppercase"
                    />
                  </div>
                </div>

                <div className="text-[10px] text-[#1A1C23]/50 font-medium ml-auto">
                  {cardTextColor === '#FFFFFF' ? 'Dark theme card' : 'Light theme card'}
                </div>
              </div>

              {/* Interactive Live Mini-Preview of the Card */}
              <div className="pt-2">
                <div className="text-[10px] font-bold text-[#1A1C23]/60 uppercase mb-1.5 flex items-center justify-between">
                  <span>Live Feed Card Preview</span>
                  <span className="text-[9px] font-normal text-[#1A1C23]/40">Updates in real-time</span>
                </div>

                <div
                  className="rounded-[1.4rem] p-3.5 shadow-md border-b-4 transition-all duration-300"
                  style={{
                    backgroundColor: cardColor,
                    borderBottomColor: cardBorderColor,
                    color: cardTextColor,
                  }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span
                      className="text-[9px] font-extrabold tracking-widest py-0.5 px-2 rounded-full uppercase"
                      style={{
                        backgroundColor: cardTextColor === '#FFFFFF' ? 'rgba(255,255,255,0.20)' : 'rgba(255,255,255,0.65)',
                        color: cardTextColor,
                      }}
                    >
                      {category.toUpperCase()} · JUST NOW
                    </span>
                    <div
                      className="text-[9px] font-bold py-0.5 px-2 rounded-full shadow-xs"
                      style={{
                        backgroundColor: cardTextColor === '#FFFFFF' ? '#FFFFFF' : '#1A1C23',
                        color: cardTextColor === '#FFFFFF' ? '#1A1C23' : '#FFFFFF',
                      }}
                    >
                      + LIVE PREVIEW
                    </div>
                  </div>

                  <h4
                    className="font-sans-ui font-extrabold text-[15px] leading-tight uppercase mb-1 line-clamp-1"
                    style={{ color: cardTextColor }}
                  >
                    {title.trim() || 'UNTITLED DREAM'}
                  </h4>
                  <p
                    className="font-editorial italic text-[12px] leading-snug line-clamp-2 mb-2.5"
                    style={{ color: cardTextColor === '#FFFFFF' ? 'rgba(255,255,255,0.90)' : 'rgba(26,28,35,0.85)' }}
                  >
                    {hook.trim() || (transcript.trim() ? `"${transcript.slice(0, 50)}..."` : '"Speak it before it fades into the morning light..."')}
                  </p>

                  <div
                    className="border-t border-dashed pt-2 flex items-center justify-between text-[10px]"
                    style={{ borderColor: cardTextColor === '#FFFFFF' ? 'rgba(255,255,255,0.20)' : 'rgba(26,28,35,0.20)' }}
                  >
                    <div className="flex items-center gap-1.5">
                      <div
                        className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold overflow-hidden"
                        style={{
                          backgroundColor: cardTextColor === '#FFFFFF' ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.7)',
                          color: cardTextColor,
                        }}
                      >
                        {currentUser?.avatar ? (
                          <img src={currentUser.avatar} alt="You" className="w-full h-full object-cover" />
                        ) : (
                          currentUser?.name?.[0] || 'D'
                        )}
                      </div>
                      <span className="font-bold">{currentUser?.name || 'You'}</span>
                    </div>
                    <span className="opacity-60 font-medium">Bhubaneswar area</span>
                  </div>
                </div>
              </div>
            </div>

            {/* UNIFIED DREAM MEDIA ATTACHMENT SUITE */}
            <div className="bg-white p-3.5 rounded-2xl border border-[#1A1C23]/10 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-[#5438FF]" />
                  <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#1A1C23]">
                    Dream Media Visual (Optional)
                  </span>
                </div>
                {mediaUrl && (
                  <button
                    onClick={handleRemoveMedia}
                    className="text-[11px] text-rose-500 hover:text-rose-600 font-semibold flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Remove</span>
                  </button>
                )}
              </div>

              {/* Sub-explanation emphasizing unification */}
              <div className="text-[11px] text-[#1A1C23]/60 flex items-start gap-1 bg-[#5438FF]/5 p-2 rounded-xl">
                <Info className="w-3.5 h-3.5 text-[#5438FF] shrink-0 mt-0.5" />
                <span>
                  Adding media enriches this canonical dream across Feed, Story, Nearby radar, and Clips simultaneously without creating competing post silos.
                </span>
              </div>

              {/* Active Media Preview if attached */}
              {mediaUrl ? (
                <div className="space-y-2">
                  <div className="relative rounded-xl overflow-hidden bg-black/80 aspect-video border border-[#1A1C23]/10 group">
                    {mediaKind === 'video' ? (
                      <video
                        src={mediaUrl}
                        controls
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <img
                        src={mediaUrl}
                        alt="Attached dream visual"
                        className="w-full h-full object-cover"
                      />
                    )}
                    <div className="absolute top-2 left-2 bg-black/70 backdrop-blur-sm text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                      {mediaKind === 'video' ? <Film className="w-3 h-3 text-indigo-400" /> : <ImageIcon className="w-3 h-3 text-emerald-400" />}
                      <span className="capitalize">{mediaKind} Attached</span>
                    </div>
                  </div>

                  <input
                    value={mediaCaption}
                    onChange={(e) => setMediaCaption(e.target.value)}
                    placeholder="Add a visual caption or atmosphere note (optional)..."
                    className="w-full bg-[#F9F6F0] border border-[#1A1C23]/10 rounded-xl px-3 py-1.5 text-xs text-[#1A1C23] placeholder-[#1A1C23]/40"
                  />
                </div>
              ) : (
                /* Media Selection Tabs: Presets | Upload | URL */
                <div className="space-y-2">
                  <div className="flex bg-[#F9F6F0] p-1 rounded-xl gap-1">
                    <button
                      type="button"
                      onClick={() => setMediaTab('presets')}
                      className={`flex-1 py-1 text-[11px] font-bold rounded-lg transition-colors flex items-center justify-center gap-1 ${
                        mediaTab === 'presets'
                          ? 'bg-white shadow-2xs text-[#1A1C23]'
                          : 'text-[#1A1C23]/60'
                      }`}
                    >
                      <Sparkles className="w-3 h-3" />
                      <span>Atmospheric Presets</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setMediaTab('upload')}
                      className={`flex-1 py-1 text-[11px] font-bold rounded-lg transition-colors flex items-center justify-center gap-1 ${
                        mediaTab === 'upload'
                          ? 'bg-white shadow-2xs text-[#1A1C23]'
                          : 'text-[#1A1C23]/60'
                      }`}
                    >
                      <Upload className="w-3 h-3" />
                      <span>Upload File</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setMediaTab('url')}
                      className={`flex-1 py-1 text-[11px] font-bold rounded-lg transition-colors flex items-center justify-center gap-1 ${
                        mediaTab === 'url'
                          ? 'bg-white shadow-2xs text-[#1A1C23]'
                          : 'text-[#1A1C23]/60'
                      }`}
                    >
                      <Link2 className="w-3 h-3" />
                      <span>URL</span>
                    </button>
                  </div>

                  {/* Presets Gallery */}
                  {mediaTab === 'presets' && (
                    <div className="grid grid-cols-3 gap-1.5 max-h-[140px] overflow-y-auto no-scrollbar pt-1">
                      {ATMOSPHERIC_PRESETS.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => handleSelectPreset(p)}
                          className="group relative rounded-xl overflow-hidden aspect-video bg-black text-left border border-black/10 hover:ring-2 hover:ring-[#5438FF] transition-all"
                        >
                          <img
                            src={p.url}
                            alt={p.name}
                            className="w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-105 transition-all"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex flex-col justify-end p-1">
                            <span className="text-[9px] font-bold text-white truncate leading-tight">
                              {p.name}
                            </span>
                            <span className="text-[8px] text-white/70">
                              {p.kind === 'video' ? '🎬 Loop' : '🖼️ Image'}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Upload Tab */}
                  {mediaTab === 'upload' && (
                    <div className="pt-1">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*,video/*"
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full border-2 border-dashed border-[#1A1C23]/20 hover:border-[#5438FF] rounded-xl p-4 flex flex-col items-center justify-center gap-1 bg-[#F9F6F0]/50 hover:bg-[#5438FF]/5 transition-colors cursor-pointer"
                      >
                        <Upload className="w-5 h-5 text-[#5438FF]" />
                        <span className="text-xs font-bold text-[#1A1C23]">
                          Choose Image or Video
                        </span>
                        <span className="text-[10px] text-[#1A1C23]/50">
                          PNG, JPG, MP4, WebM (up to 20MB)
                        </span>
                      </button>
                    </div>
                  )}

                  {/* URL Tab */}
                  {mediaTab === 'url' && (
                    <div className="space-y-1.5 pt-1">
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => setCustomUrlKind('image')}
                          className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                            customUrlKind === 'image'
                              ? 'bg-[#1A1C23] text-white'
                              : 'bg-[#F9F6F0] text-[#1A1C23]/70'
                          }`}
                        >
                          Image URL
                        </button>
                        <button
                          type="button"
                          onClick={() => setCustomUrlKind('video')}
                          className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                            customUrlKind === 'video'
                              ? 'bg-[#1A1C23] text-white'
                              : 'bg-[#F9F6F0] text-[#1A1C23]/70'
                          }`}
                        >
                          Video URL
                        </button>
                      </div>
                      <div className="flex gap-1">
                        <input
                          value={customUrlInput}
                          onChange={(e) => setCustomUrlInput(e.target.value)}
                          placeholder="https://example.com/dream-media.jpg"
                          className="flex-1 bg-[#F9F6F0] border border-[#1A1C23]/15 rounded-xl px-2.5 py-1 text-xs text-[#1A1C23]"
                        />
                        <button
                          type="button"
                          onClick={handleApplyCustomUrl}
                          className="px-3 py-1 bg-[#5438FF] text-white rounded-xl text-xs font-bold hover:bg-[#4327e0]"
                        >
                          Attach
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Audience selector */}
            <div className="bg-white p-3 rounded-2xl border border-[#1A1C23]/10 space-y-2">
              <span className="text-[10px] font-bold text-[#1A1C23]/60 uppercase block">
                Audience & Privacy
              </span>
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  onClick={() => setAudience('public')}
                  className={`py-1.5 px-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1 transition-colors ${
                    audience === 'public'
                      ? 'bg-[#1A1C23] text-white'
                      : 'bg-[#F9F6F0] text-[#1A1C23]/70'
                  }`}
                >
                  <Globe className="w-3 h-3" />
                  <span>Public</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAudience('followers')}
                  className={`py-1.5 px-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1 transition-colors ${
                    audience === 'followers'
                      ? 'bg-[#1A1C23] text-white'
                      : 'bg-[#F9F6F0] text-[#1A1C23]/70'
                  }`}
                >
                  <Users className="w-3 h-3" />
                  <span>Followers</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAudience('only_me')}
                  className={`py-1.5 px-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1 transition-colors ${
                    audience === 'only_me'
                      ? 'bg-[#1A1C23] text-white'
                      : 'bg-[#F9F6F0] text-[#1A1C23]/70'
                  }`}
                >
                  <Lock className="w-3 h-3" />
                  <span>Only me</span>
                </button>
              </div>

              {/* The 4 Publishing Surfaces attached to Canonical Dream */}
              <div className="pt-2 border-t border-[#1A1C23]/10 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-[#5438FF] uppercase block tracking-wider">
                    Publishing Surfaces
                  </span>
                  <span className="text-[9px] text-[#1A1C23]/50 font-medium">
                    (1 Canonical Dream Object)
                  </span>
                </div>

                {/* Surface 1: Normal Feed Post */}
                <div className="flex items-center justify-between text-xs py-0.5">
                  <div className="flex items-center gap-1.5 text-[#1A1C23]">
                    <BookOpen className="w-3.5 h-3.5 text-[#5438FF]" />
                    <span className="font-semibold">Normal Dream Post</span>
                    <span className="text-[10px] text-[#1A1C23]/50">(Permanent feed)</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={publishNormalPost}
                    onChange={(e) => setPublishNormalPost(e.target.checked)}
                    className="rounded text-[#5438FF] focus:ring-[#5438FF] h-4 w-4 cursor-pointer"
                  />
                </div>

                {/* Surface 2: Last Night Story */}
                <div className="flex items-center justify-between text-xs py-0.5">
                  <div className="flex items-center gap-1.5 text-[#1A1C23]">
                    <Clock className="w-3.5 h-3.5 text-amber-500" />
                    <span className="font-semibold">Last Night Story</span>
                    <span className="text-[10px] text-amber-600/80 font-medium">(24h temporary fragment)</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={publishLastNightStory}
                    onChange={(e) => setPublishLastNightStory(e.target.checked)}
                    className="rounded text-[#5438FF] focus:ring-[#5438FF] h-4 w-4 cursor-pointer"
                  />
                </div>

                {/* Surface 3: Last Night Nearby */}
                <div className="flex items-center justify-between text-xs py-0.5">
                  <div className="flex items-center gap-1.5 text-[#1A1C23]">
                    <Compass className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="font-semibold">Last Night Nearby</span>
                    <span className="text-[10px] text-[#1A1C23]/50">(Bhubaneswar area)</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={publishNearby}
                    onChange={(e) => setPublishNearby(e.target.checked)}
                    className="rounded text-[#5438FF] focus:ring-[#5438FF] h-4 w-4 cursor-pointer"
                  />
                </div>

                {/* Surface 4: Video Clip Explanation */}
                <div className="flex items-center justify-between text-xs py-0.5">
                  <div className="flex items-center gap-1.5 text-[#1A1C23]">
                    <Video className="w-3.5 h-3.5 text-indigo-600" />
                    <span className="font-semibold">Clip Player Surface</span>
                    <span className="text-[10px] text-[#1A1C23]/50">
                      {mediaKind === 'video' ? '(Video attached)' : '(Visual clip stream)'}
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={publishClip}
                    onChange={(e) => setPublishClip(e.target.checked)}
                    className="rounded text-[#5438FF] focus:ring-[#5438FF] h-4 w-4 cursor-pointer"
                  />
                </div>
              </div>
            </div>

            {/* Save Button & Publish Error Area */}
            <div className="pt-2 flex flex-col gap-2">
              {!isUserAuthenticated && (
                <div
                  id="capture-login-required-notice"
                  role="status"
                  className="p-3.5 bg-amber-500/10 border border-amber-500/25 rounded-2xl flex items-start gap-3 text-left animate-in fade-in duration-200"
                >
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <h4 className="text-xs font-bold text-amber-900">Please log in to publish your Dream</h4>
                    <p className="text-[11px] text-amber-800/90 mt-0.5 leading-relaxed">
                      Publishing to the collective dream archive requires an active, verified Supabase account.
                    </p>
                    {onOpenLogin && (
                      <button
                        id="open-login-from-capture-btn"
                        type="button"
                        onClick={() => {
                          onClose();
                          onOpenLogin();
                        }}
                        className="mt-2.5 inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#5438FF] hover:bg-[#4327e0] text-[#F9F6F0] rounded-xl text-xs font-bold shadow-sm transition-all cursor-pointer"
                      >
                        <LogIn className="w-3.5 h-3.5" />
                        <span>Log In / Sign Up</span>
                      </button>
                    )}
                  </div>
                </div>
              )}

              {publishError && (
                <div
                  id="capture-publish-error"
                  role="alert"
                  className="flex items-start gap-2.5 p-3 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-700 font-medium animate-in fade-in slide-in-from-bottom-2 duration-150"
                >
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div className="flex-1 leading-relaxed">
                    <span className="font-semibold block text-rose-800">Publish Error</span>
                    {publishError}
                  </div>
                  <button
                    type="button"
                    onClick={() => setPublishError('')}
                    className="text-rose-400 hover:text-rose-600 p-0.5 rounded transition-colors"
                    aria-label="Dismiss error"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {!isUserAuthenticated ? (
                <button
                  id="publish-canonical-dream-btn"
                  type="button"
                  onClick={() => {
                    if (onOpenLogin) {
                      onClose();
                      onOpenLogin();
                    } else {
                      setPublishError('Please log in to publish your Dream.');
                    }
                  }}
                  className="w-full py-3.5 bg-amber-600 hover:bg-amber-700 active:scale-98 text-white font-bold rounded-2xl text-sm shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Lock className="w-4 h-4" />
                  <span>Please log in to publish your Dream</span>
                </button>
              ) : (
                <button
                  id="publish-canonical-dream-btn"
                  type="button"
                  onClick={handleSave}
                  disabled={isSubmitting}
                  className={`w-full py-3.5 ${
                    isSubmitting
                      ? 'bg-[#5438FF]/70 cursor-wait opacity-90'
                      : 'bg-[#5438FF] hover:bg-[#4327e0] active:scale-98 cursor-pointer'
                  } text-[#F9F6F0] font-bold rounded-2xl text-sm shadow-md transition-all flex items-center justify-center gap-2`}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>{initialDream ? 'Saving Dream & Atmosphere...' : 'Publishing Canonical Dream...'}</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>{initialDream ? 'Save Dream & Atmosphere' : 'Publish Canonical Dream'}</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
